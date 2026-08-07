---
name: db-schema-visualization
description: 将数据库表结构（表、字段、关联关系）可视化为可交互的单 HTML 文件。包含 Mermaid ER 图（svg-pan-zoom 缩放拖拽）、表详情卡片、关联关系四分类详解、辐射图、总结表。当用户要求可视化数据库表结构、画 ER 图、生成数据库关系文档、表关系图时使用。
---

# 数据库表结构可视化

## 适用场景
- 用户要求"可视化表结构""画 ER 图""生成数据库关系文档""表关系图"
- 已有 DDL / 表结构文档 / 口头描述的表结构，需转化为可视化 HTML
- 表数量 ≥ 3 张且存在关联关系

## 不适用场景
- 仅 1-2 张表且无关联 → 用 Markdown 表格即可，不要强行可视化
- 用户明确要求纯文本输出
- 仅需 SQL DDL 脚本，不需可视化

## 前置条件
需先掌握以下信息（从 DDL / 文档 / 用户描述获取，缺失时用 deepchat_question 确认）：
1. 每张表的：表名、功能描述
2. 每个字段的：字段名、类型、约束（PK/FK/UK/NOT NULL/DEFAULT）、说明
3. 每张表的索引清单
4. 表间关联关系（见下方四分类）

## 工作流程

### 步骤 1：收集表结构
- 从 SQL DDL（CREATE TABLE 语句）解析字段和约束
- 从已有文档（Markdown/Word）读取表结构
- 从用户口头描述提取
- 缺失信息时用 `deepchat_question` 向用户确认（一次只问一个问题）

### 步骤 2：分析关联关系（四分类）
将所有表间关系分为四类，这是本 skill 的核心分析框架：

| 分类 | 特征 | 标识色 | 示例 |
|------|------|--------|------|
| **强外键关联** | 物理 FK 约束，子表字段引用父表 PK | 🟢 翠绿 `#7ab58a` | `mission.case_id → case_record.id` |
| **弱关联** | 无 FK 约束，靠业务字段（非 PK）匹配 | 🔴 暗红 `#b85450` | `review.case_title ↔ case_record.title` |
| **冗余字段** | 反范式优化，子表冗余存储父表字段值 | 🟡 琥珀 `#c9985a` | `mission.case_title` 冗余自 `case_record.title` |
| **逻辑关联** | 无字段引用，纯业务逻辑上的关联 | 🔵 灰蓝 `#a0a0c0` | `sys_user → Caffeine token_blacklist` |

> **分析要点**：逐表检查每个字段，判断它是否引用了其他表。有 FK 约束→强外键；无 FK 但语义指向其他表→弱关联；同名字段在多表出现且来源是父表→冗余字段；无字段但业务上有关系→逻辑关联。

### 步骤 3：生成 HTML
生成单 HTML 文件，结构为六大区块（见下方）。技术要点：
- 引入 Mermaid.js + svg-pan-zoom 两个 CDN（仅此两个外部依赖）
- 内嵌所有 CSS，无外部样式文件
- 深色主题配色（见下方配色方案）
- 字体 16px（Mermaid 默认 13px 太小）

完整 HTML 模板参见 `references/html-template.html`。

### 步骤 4：浏览器验证
1. 用 `load_url` 打开生成的 HTML（`file:///` 协议）
2. 等待 Mermaid 渲染（`Start-Sleep -Seconds 6`）
3. 截图确认 ER 图、表卡片、辐射图渲染正常
4. 用 `cdp_send Runtime.evaluate` 检查 svg-pan-zoom 初始化：
   ```javascript
   var svg = document.querySelector('#er-mermaid svg');
   JSON.stringify({svgFound: !!svg, panZoomReady: !!window.erPanZoom})
   ```
5. 测试缩放：`erZoomIn(); erPanZoom.getZoom()` 应 > 1.3
6. 测试拖拽：模拟 `Input.dispatchMouseEvent`（mousePressed→mouseMoved→mouseReleased），检查 `erPanZoom.getPan()` 坐标变化
7. 滚动到页面各区块分别截图，确认全部渲染正常

## HTML 六大区块结构

### 区块 1：标题区 + 图例
- 项目名 + 副标题
- 技术栈标签（如 MySQL 8.0 / MyBatis-Plus 等）
- 颜色图例（PK/FK/强外键/弱关联/冗余字段，五色圆点）

### 区块 2：整体 ER 关系图
- Mermaid `erDiagram`，包含**所有表的所有字段**
- 字段格式：`TYPE name PK "注释"`
  - TYPE 中不能有空格/括号 → `VARCHAR(32)` 写成 `VARCHAR_32`
  - PK/FK/UK 关键字放在 name 后
  - 注释用双引号包裹，避免特殊字符
- 关系格式：`TABLE_A ||--o{ TABLE_B : "标签"`
  - `||--o{` = 1:N（一对多，强外键）
  - `}o--o|` = 0或1:N（弱关联）
- **svg-pan-zoom 缩放拖拽**（见下方技术要点）
- 右上角缩放按钮（＋/－/⟲）
- 底部操作提示"鼠标滚轮缩放 · 按住拖拽平移"

### 区块 3：表清单导航
- 每张表一个卡片，显示表名 + 中文说明 + 分类标签
- 分类标签颜色：核心表(金) / 强FK子表(绿) / 弱关联(红) / 缓存(灰蓝)
- 点击锚点跳转到对应表详情（`href="#table_name"`）

### 区块 4：各表详情卡片
每张表一个卡片，包含：
- **表头**：表名 + 中文名 + 分类标签
- **功能描述**：背景色块，说明表的用途和特点
- **字段表格**（字段名/类型/约束 badge/说明）
  - PK → 金色 badge `badge-pk`
  - FK → 绿色 badge `badge-fk`
  - UK → 紫色 badge `badge-uk`
  - NOT NULL → 棕色 badge `badge-notnull`
  - 冗余字段 → 琥珀 badge `badge-redundant`
  - 弱关联 → 暗红 badge `badge-weak`
- **索引清单**：虚线边框块，每行 `idx_name (columns) — 说明`
- **关联标注**（三色块，按表实际情况选择显示哪些）：
  - 🟢 `rel-strong`：作为父表/子表的强外键关联
  - 🔴 `rel-weak`：弱关联（标注关联字段和风险）
  - 🟡 `rel-redundant`：冗余字段来源

### 区块 5：关联关系分类详解
三张分类表格（按关联数量从多到少排列）：
1. **强外键关联表**：父表/子表/基数/外键字段/索引/说明
2. **弱关联表**：父表/子表/关联字段/风险/建议
3. **冗余字段表**：冗余字段/所在表/来源/目的

### 区块 6：核心实体辐射图 + 总结表
- 每个核心实体（辐射 ≥ 2 条关联的表）一张 Mermaid `graph LR` 辐射图
  - 强外键用实线：`linkStyle 0 stroke:#7ab58a,stroke-width:2px`
  - 弱关联用红虚线：`stroke-dasharray:5,5`
  - 逻辑关联用蓝点线：`stroke-dasharray:3,3`
  - 节点样式用 `style` 指定填充色和边框
- **关联关系总结表**：序号/类型/父→子/基数/外键字段/物理FK(✅/❌)/删除策略
- **统计信息**：共 N 条关联 — 强 X / 弱 Y / 逻辑 Z，两个中心表是 A 和 B

## svg-pan-zoom 技术要点

### 为什么需要
Mermaid 渲染的 ER 图字体小（默认 13px）、字段多时密集难辨，且 SVG 被 Mermaid 设了固定尺寸，无法缩放拖拽。

### 引入
```html
<script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.2/dist/svg-pan-zoom.min.js"></script>
```

### CSS（关键）
```css
.er-diagram { position:relative; overflow:hidden; }  /* 必须 overflow:hidden，不能 auto */
.er-diagram .mermaid { height:680px; cursor:grab; overflow:hidden; }  /* 固定高度 */
.er-diagram .mermaid:active { cursor:grabbing; }
.er-diagram .mermaid svg {
  width:100%!important; height:100%!important; max-width:none!important;  /* 覆盖 Mermaid 固定尺寸 */
}
```

### JS 初始化（轮询重试机制）
```javascript
var erPanZoom = null;
function initErPanZoom(){
  var svg = document.querySelector('#er-mermaid svg');
  if(!svg){ setTimeout(initErPanZoom, 200); return; }  // Mermaid 异步渲染，SVG 未生成则重试
  svg.removeAttribute('style');           // 清除 Mermaid 设的固定尺寸
  svg.setAttribute('width','100%');
  svg.setAttribute('height','100%');
  erPanZoom = svgPanZoom(svg, {
    zoomEnabled: true, panEnabled: true,
    minZoom: 0.2, maxZoom: 8,             // 缩放范围：0.2 看全局，8 看单字段
    zoomScaleSensitivity: 0.3             // 每次滚轮缩放幅度
  });
  erPanZoom.zoom(1.3);                    // 初始 1.3 倍，字体更清晰
}
window.addEventListener('load', function(){ setTimeout(initErPanZoom, 800); });

function erZoomIn(){ if(erPanZoom) erPanZoom.zoomBy(1.3); }
function erZoomOut(){ if(erPanZoom) erPanZoom.zoomBy(0.77); }  // 1/1.3 ≈ 0.77
function erZoomReset(){ if(erPanZoom) erPanZoom.resetZoom(); }
```

### 关键决策记录
- **轮询重试而非 Mermaid 回调**：Mermaid 10.x 无稳定渲染完成回调 API，轮询最可靠
- **清除 SVG style 属性**：Mermaid 给 SVG 设 `max-width` 和固定 `width`，不清除则 viewBox 缩放被 CSS 限制
- **初始 1.3 倍而非 1.0**：16px 字体在 680px 容器中 1.0 倍仍偏小
- **缩放范围 0.2~8**：下限看全局拓扑，上限看单字段注释
- **zoomBy(0.77) 而非 0.7**：0.77 = 1/1.3，保证放大缩小可逆

## 配色方案（深色主题）

| 元素 | 颜色 | CSS 变量 |
|------|------|---------|
| 主背景 | 深墨绿渐变 `#0f1a16` → `#1a2a24` | `--bg-deep` / `--bg-mid` |
| 卡片背景 | `#1e2e28` | `--bg-card` |
| 卡片悬停 | `#243530` | `--bg-card-hover` |
| 边框 | 古铜 `#8b6914` / 暗铜 `#5a4410` | `--border-bronze` / `--border-bronze-dim` |
| 标题 | 金色 `#c9a961` / 亮金 `#e8c878` | `--gold` / `--gold-bright` |
| 正文 | 羊皮纸 `#e8dcc4` / 暗羊皮 `#c4b896` | `--parchment` / `--parchment-dim` |
| 弱化文字 | `#8a7e62` | `--text-muted` |
| 强外键 | 翠绿 `#7ab58a` | `--strong-fk` |
| 弱关联 | 暗红 `#b85450` | `--weak-link` |
| 冗余字段 | 琥珀 `#c9985a` | `--redundant` |

## 字体
- 正文：`Georgia, STSong, SimSun, serif`（衬线体，古典气质）
- 代码/字段名/类型：`Consolas, monospace`

## 输出
- 单 HTML 文件，双击即可打开
- 需联网加载 Mermaid + svg-pan-zoom 两个 CDN
- 文件命名建议：`数据库表关系图谱.html` 或 `db-schema-<项目名>.html`
- 存放位置：项目 `docs/` 目录下

## 完整 HTML 模板
参见 `references/html-template.html`，包含全部 CSS + JS + 六大区块骨架，用 `<!-- PLACEHOLDER -->` 注释标记需要填充的数据位置。
