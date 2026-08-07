# HTML 模板使用说明

调用链页面使用 [`../assets/flow-template.html`](../assets/flow-template.html)。该模板是可执行的完整页面，不是让 agent 补写实现的伪代码骨架。

## 标准生成方式

先把分析结果保存为符合 [`flow-data-schema.md`](flow-data-schema.md) 的 JSON（version 2），再运行：

```bash
node <skill-dir>/scripts/validate-flow-data.mjs <flow-data.json>
node <skill-dir>/scripts/render-flow.mjs <flow-data.json> <flow-name.html>
node <skill-dir>/scripts/validate-rendered-html.mjs <flow-name.html>
```

`render-flow.mjs` 会再次校验数据，然后把 JSON 注入模板中唯一的 `__FLOW_DATA_JSON__` 占位符。`validate-rendered-html.mjs` 会提取嵌入 JSON 再次校验，并检查 HTML 结构完整性。不要通过字符串拼接自行生成重复 DOM，也不要绕过校验器直接把不完整数据塞入模板。

## 模板已经实现的能力

- 多链路 Tab：一个 traced endpoint 对应一个 flow；Tab 有 `aria-selected`、`aria-controls` 和 `role="tabpanel"` 关联
- 覆盖范围：显示 `feature/module/project`、`complete/sampled/partial`、发现/追踪数量和代码根边界
- 路径选择：当 `flow.paths` 存在时，显示路径选择控件；播放严格使用当前 `path.steps`
- 双轨泳道：请求/调用使用实线下行，数据返回使用虚线上行，`spawn` 边使用点线
- 显式折返点：数据库、缓存、外部 API、队列、文件、内存或断链节点
- 节点详情：签名、参数、功能、返回值（含 `result.source` 来源语义）、数据库/响应/断链信息和源码证据
- 边详情：调用实参到形参的映射、返回结构转换、分支条件和 spawn 条件
- 交互：Tab、路径选择、节点展开、播放/暂停、上一步/下一步、重置、轨道开关、主题切换
- 自适应连线：使用 `ResizeObserver` 和当前 `getBoundingClientRect()` 重算
- 窄屏降级：保持稳定图宽并允许横向滚动，不压缩方法签名和参数表
- 浏览器诊断：`window.__flowDiagnostics()` 返回渲染数量、断链出度、横向溢出、连线穿卡片、标签压卡片和路径播放连续性

## 数据注入安全

生成器在嵌入 JSON 时会转义 `<`、U+2028 和 U+2029，避免源码内容意外结束 `<script>` 标签。模板使用 DOM API 和 `textContent` 渲染项目数据；只有固定 SVG marker 使用静态 `innerHTML`。

## 可调整与不可破坏的边界

可按项目语境调整标题、摘要和 `FLOW_DATA` 内容。若用户明确要求品牌配色，可调整模板 CSS token，但必须保留请求色与返回色的明显差异以及警示色。

以下结构属于交付契约，不应在单次生成时删改：

- `<script type="application/json" id="flow-data">__FLOW_DATA_JSON__</script>`
- `data-theme` 主题机制
- `nodes/edges/paths/transactions` 数据驱动渲染
- 请求、返回、分支、spawn 四类边
- 路径选择控件和 `path.steps` 驱动播放
- 覆盖信息与遗漏入口区
- 断链节点零出向边的呈现
- `ResizeObserver` 触发连线重算
- Tab `aria-controls`/`tabpanel` 关联
- `window.__flowData` 和 `window.__flowDiagnostics`

## 浏览器验收

打开生成后的 HTML，至少检查桌面和 390px 宽窄屏：

1. 控制台无错误，`window.__flowDiagnostics().renderedNodes` 等于当前 flow 节点数。
2. `renderedEdges` 等于当前 flow 边数。
3. `breakOutDegree` 中所有值为 0。
4. `linesCrossingCards` 为空（连线不穿过卡片）。
5. `labelsOverlappingCards` 为空（标签不压住正文）。
6. `pathIssues` 为空（路径播放连续）。
7. 展开最长参数节点后，连线仍连接当前卡片边缘。
8. 切换请求/返回轨后，对应节点和边一起隐藏。
9. 播放顺序先请求后返回，断链流程停在断链节点。
10. 路径选择切换后，播放序列更新为选中路径的 `steps`。
11. `overflow` 为空；窄屏通过整体横向滚动查看，不让卡片内文字溢出。
12. 抽样结果能看到选择依据和每个遗漏入口。

validator 通过只说明数据结构自洽；浏览器验收也不能替代源码事实核对。
