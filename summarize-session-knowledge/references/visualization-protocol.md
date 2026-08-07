# 可视化决策与呈现协议

本协议决定知识点是否适合可视化、应使用哪种图，以及 HTML 如何可靠渲染和验收。核心原则：**图必须比等量文字更容易理解；可视化是教学手段，不是交付装饰。**

## 1. 先判断是否应该画图

### 强候选

以下内容的关系本身通常就是知识，应优先评估可视化：

| 内容本质 | 观众要回答的问题 | 推荐 Mermaid 图型 |
|---|---|---|
| 调用链、请求响应、组件交互 | 事件按什么顺序发生，谁与谁交互？ | `sequenceDiagram` |
| 数据模型、实体、外键和基数 | 有哪些实体，它们怎样连接？ | `erDiagram` |
| 对象状态与转换 | 有哪些状态，由什么触发和约束转换？ | `stateDiagram-v2` |
| 条件与决策分支 | 遇到什么条件走哪条路径？ | `flowchart` |
| 模块层级、包含和依赖 | 谁包含谁，谁依赖谁？ | `flowchart` 子图或 `mindmap` |
| 概念关系网和分类层级 | 概念怎样分组和关联？ | `mindmap` 或 `flowchart` |
| 类继承、实现和组合 | 类型之间是什么结构关系？ | `classDiagram` |
| 阶段、时间和任务依赖 | 任务怎样安排，谁先谁后？ | `gantt` |
| Git 分支与提交演进 | 分支如何分叉和汇合？ | `gitGraph` |

### 弱候选

只有同时满足“复杂度足够”和“图比文字更清晰”时才画：

| 内容 | 适合画图 | 改用文字/表格 |
|---|---|---|
| 操作步骤 | 有分支、循环或并行路径 | 纯线性步骤用编号列表 |
| 对比关系 | 多维且关系呈网状 | 二三项对比用表格 |
| 数据流 | 包含多阶段变换、过滤、聚合 | 单一输入输出用一句话 |
| 概念分类 | 多层分类且关系重要 | 平铺分类用列表 |

### 不应可视化

以下内容用精确文本更好：单一概念定义、只有两三个节点的线性步骤、精确代码、API 参数、配置清单、简单二选一、数学公式、只有两个节点的关系。代码用代码块，参数和对比用表格，步骤用编号列表。

## 2. 四步决策

对每个候选知识点依次判断；任一步不通过就改用文字：

```text
1. 它是关系、流程、状态、层级或时序，或复杂度足够的弱候选吗？
2. 图是否比等量文字更易理解，并带来新的结构信息？
3. 能否明确写出“读者看完这张图应回答的问题”？
4. 图能否保持可读；过大时能否拆成多个“一图一问”的图？
```

“一句话检验”只用于判断信息增量：如果一句话已经完整表达关系，通常无需画图；如果一句话只能描述目标、无法表达结构，图可能有价值。一般每图不超过约 15 个节点；超过时优先按问题拆图，而不是依赖缩放掩盖结构过载。

## 3. 图型匹配与一图一问

先命名问题，再选专门表达该问题的图型：

- 调用顺序不能用 ER 图；
- 静态实体关系不能用时序图；
- 状态及转换优先用状态图，不用普通流程图冒充；
- 决策分支用流程图，纯线性步骤不用流程图；
- 一张图不要同时回答“实体如何连接”“调用何时发生”“条件如何分支”。

一个主题确有三个不同问题时，拆为三张图。例如电商系统可以分别使用：

1. `erDiagram`：订单、商品、用户如何连接；
2. `sequenceDiagram`：下单到支付的交互顺序；
3. `flowchart`：库存是否足够时如何决策。

同一实体在全文使用一致名称和别名。一般全文不超过 5～7 张图；更多时重新评估拆文档或删掉低信息量图。

## 4. 每张图使用“问题—图—补充”

```html
<section aria-labelledby="login-flow-title">
  <h3 id="login-flow-title">登录调用链</h3>
  <p>下图回答：登录请求从入口到令牌生成，组件按什么顺序交互？</p>
  <figure>
    <div class="mermaid">
sequenceDiagram
    participant UI as Web Client
    participant C as AuthController
    participant S as AuthService
    participant R as UserRepository
    participant T as TokenService
    UI->>C: POST /login
    C->>S: login(credentials)
    S->>R: findByUsername(name)
    R-->>S: user
    S->>T: issue(userId)
    T-->>S: tokens
    S-->>C: login result
    C-->>UI: 200 + tokens
    </div>
    <figcaption>图 1：登录调用时序</figcaption>
  </figure>
  <p>图未展开无用户、密码错误和令牌签发失败；这些异常应在边界说明中单列。</p>
</section>
```

图前明确问题和阅读重点；图承载结构；图后补充异常、适用范围或图不适合表达的细节。图已完整表达且确无补充时可省略图后段，但不能只放一张无上下文的图。

## 5. 输出格式路由

| 内容 | 格式 |
|---|---|
| 无图或一张辅助图，文字/代码/表格是主干 | Markdown |
| 一张图是核心知识载体 | HTML + Mermaid |
| 两张或以上适合教学的图 | HTML + Mermaid |
| 用户指定格式 | 服从用户，并如实说明渲染或验收限制 |

Markdown 中确需一张辅助图时可使用 `mermaid` 围栏。多主题知识集对每个子文档独立路由，README 保持 Markdown。

## 6. HTML 依赖和安全基线

从 `../assets/knowledge-document.html` 复制骨架并按内容裁剪。依赖使用固定版本：

| 能力 | 固定资源 | 何时保留 |
|---|---|---|
| Mermaid | `mermaid@11.12.0/dist/mermaid.min.js` | HTML 中有 Mermaid 图 |
| svg-pan-zoom | `svg-pan-zoom@3.6.2/dist/svg-pan-zoom.min.js` | 至少一张复杂图需要缩放拖拽 |
| Prism 核心 | `prismjs@1.29.0/components/prism-core.min.js` | HTML 中有多行代码块 |
| Prism autoloader | `prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js` | 同上 |
| Prism 主题 | `prismjs@1.29.0/themes/prism.css` 与 `prism-tomorrow.css` | 同上 |

不要使用无版本包根路径、`latest` 或动态不明来源。无代码时删除全部 Prism 标签和脚本；无复杂图时删除 svg-pan-zoom 脚本和相关控制逻辑。

默认 Mermaid 使用 `securityLevel: 'strict'` 和 `htmlLabels: false`。来自会话、附件或项目的文本必须作为数据处理：

- 普通 HTML 文本转义 `& < > " '`；
- 代码示例转义后放入 `<pre><code class="language-*">`；
- Mermaid 标签避免 HTML 和事件属性；不把输入中的 `<script>`、`onclick` 或原始标签直接拼入 DOM；
- 只有内容确实依赖 Mermaid HTML 标签、已确认输入可信且记录原因时才放宽安全级别。

## 7. Mermaid 渲染生命周期

Mermaid 当前 API 支持等待渲染完成，不使用猜测延时或无限轮询。标准流程：

```javascript
var mermaidSources = new Map();
var panZoomInstances = new Map();

function rememberMermaidSources() {
  document.querySelectorAll('.mermaid').forEach(function (element, index) {
    if (!element.id) element.id = 'diagram-' + (index + 1);
    mermaidSources.set(element.id, element.textContent.trim());
  });
}

function destroyPanZoom() {
  panZoomInstances.forEach(function (instance) { instance.destroy(); });
  panZoomInstances.clear();
}

async function renderMermaid() {
  destroyPanZoom();
  document.querySelectorAll('.mermaid').forEach(function (element) {
    element.removeAttribute('data-processed');
    element.textContent = mermaidSources.get(element.id) || '';
  });
  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
    securityLevel: 'strict',
    themeVariables: { fontSize: '16px' },
    flowchart: { useMaxWidth: true, htmlLabels: false, curve: 'basis' },
    sequence: { useMaxWidth: true, actorMargin: 50 }
  });
  await mermaid.run({ nodes: document.querySelectorAll('.mermaid') });
  initPanZoom();
}
```

初始化时先保存 Mermaid 源码，再 `await renderMermaid()`。主题切换必须等待完整生命周期：销毁旧 pan/zoom → 恢复源码 → 使用新主题重渲染 SVG → 重建 pan/zoom。渲染失败要显示可读错误状态并让浏览器控制台保留错误，不能静默交付空图。

## 8. 复杂图的缩放拖拽

缩放不能代替拆图，只用于结构合理但默认尺寸仍难阅读的图。

### 启用条件

- ER 图实体不少于 5 且字段密集；
- 架构图节点不少于 8 且多层嵌套；
- 时序图参与者不少于 6 且消息密集；
- 其他图节点不少于 12，且按问题继续拆分会丢失必要全景。

3～5 节点的流程图、2～3 表 ER 图、简单状态机不启用。

复杂图使用稳定容器和显式控件：

```html
<div class="diagram-shell pan-zoom-container" data-pan-zoom>
  <div class="pan-zoom-controls" aria-label="图表缩放控件">
    <button type="button" data-zoom-action="in" aria-label="放大图表">+</button>
    <button type="button" data-zoom-action="out" aria-label="缩小图表">-</button>
    <button type="button" data-zoom-action="reset" aria-label="重置图表">Reset</button>
  </div>
  <div class="mermaid" id="database-map">...</div>
</div>
```

`initPanZoom()` 只在 `await mermaid.run(...)` 返回后执行，并且：

- 找到新生成的 SVG，移除限制 viewBox 的内联尺寸；
- 设置 `width`、`height` 为 `100%`，`max-width: none`；
- 初始化范围建议 `minZoom: 0.25`、`maxZoom: 8`；
- 保存实例供按钮调用和主题切换销毁；
- reset 同时执行 `resetZoom()`、`center()`；
- 窗口尺寸变化时调用 `resize()`、`fit()`、`center()`；
- 控件可键盘聚焦，有可读 `aria-label`，拖拽光标清晰。

浏览器验证要实际观察缩放值变化和拖拽后的平移变化，不能只检查脚本存在。

## 9. Prism 代码高亮

HTML 中存在 `<pre><code>` 多行代码时默认启用 Prism；只有行内代码或没有代码时不加载。每个多行代码块使用准确语言类，例如：

```html
<pre><code class="language-java">...</code></pre>
<pre><code class="language-yaml">...</code></pre>
```

代码内容必须 HTML 转义。Prism 主题跟随页面亮暗主题，通过两个固定版本 CSS `<link>` 的 `disabled` 属性切换。切换后检查代码包含 `.token` 标记且对比度可读；语法高亮不能改变可复制文本。

## 10. 固定目录、ScrollSpy 和响应式行为

HTML 使用 `aside.sidebar > nav.toc` 和 `main.content`。桌面端目录在正文滚动时始终可见，可用 `position: sticky` 配合双栏布局，也可使用不会遮挡正文的等价实现；验收的是行为而不是某个 CSS 关键字。窄屏不超过 768px 时目录移到正文上方，取消常驻高度并保证无横向溢出。

每个目录链接必须指向真实且唯一的标题 ID。ScrollSpy 根据当前阅读位置只高亮一个最相关链接；点击目录后目标标题不能被顶部控件遮住。内容太短时允许首项保持高亮。

## 11. 浏览器实际验收

写完 HTML 后必须用浏览器工具打开最终文件或服务 URL。至少验证一个宽屏视口（宽度不小于 1200px）和一个窄屏视口（宽度不大于 768px）。

### 结构和渲染

- 所有 `.mermaid` 都包含真实 SVG，不显示原始语法、不为空；
- 标签、节点、连线和图注可读，无明显重叠、截断或线穿文字；
- 页面、表格、代码和图在窄屏无页面级横向溢出；
- CDN 资源成功加载，控制台没有语法、网络、Mermaid、Prism 或交互错误。

### 交互

- 目录滚动时保持可见，目录点击跳转正确；
- ScrollSpy 随滚动只高亮当前章节；
- 主题切换后页面、Mermaid 和 Prism 均切换且仍可读；
- 复杂图的按钮缩放、滚轮缩放、拖拽和重置实际改变 SVG 视图；
- 主题切换后复杂图仍可缩放拖拽，控制台无重复实例错误。

### 证据和失败处理

记录检查过的视口、图数量、交互和控制台结果。发现问题先修复再复测。浏览器工具、网络或 CDN 不可用时：

- 静态校验仍要运行；
- 最终结果只能是“部分完成”；
- 明确列出未验证项和阻塞原因；
- 不得使用“脑中模拟”“看起来应该可以”冒充实际验收。

## 12. 反模式检查

- 为了每章有图而强行画图；
- 图型错配、空洞小图、节点爆炸或一图多问；
- 图和文字完整重复，没有信息增量；
- 同一实体多张图命名不一致；
- 依赖缩放掩盖本应拆分的过载结构；
- 简单图也添加 pan/zoom；
- 无代码仍加载 Prism；
- 使用无版本 CDN、`securityLevel: 'loose'` 却不说明可信边界；
- 主题重渲染后未销毁和重建 pan/zoom；
- 只检查源码，不实际打开浏览器。

最终还做“主题替换检查”：若把主题换成相邻主题后图仍几乎不用改，说明图过于泛化，需要增加真正属于该主题的结构信息，或删除该图。
