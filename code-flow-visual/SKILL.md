---
name: code-flow-visual
description: "Visually explains a requested feature, module, API, or whole project by tracing real code from the frontend request URL through Controller and Service methods (including parameters and call-site arguments), data access, and the concrete database, then tracing the returned data back to the final HTTP/frontend result. Produces a validated interactive single-file HTML walkthrough. Use whenever the user asks for a visual call chain, request lifecycle, project flow, or a visual introduction to a feature/module/project, even if they do not name this skill."
---

# Code Flow Visual

把真实源码转换为可审计的交互式单文件 HTML：请求沿调用方向下行，数据沿返回方向上行。图中既要回答“调用了谁”，也要回答“传了什么、做了什么、从哪里返回了什么”。

## Input

```text
$ARGUMENTS
```

## Deliverable

默认在项目根目录生成 `flow-{name}.html`，用户指定路径时遵循用户要求。`{name}` 从目标功能、模块或项目名转换为 kebab-case。

成品必须来自统一的 `FLOW_DATA`，并通过本 skill 的校验器和浏览器验证。不要每次临时手写另一套页面实现。

## Workflow

### 1. 确定范围与覆盖方式

从请求中判断范围。只有不同解释会改变入口集合时才询问用户。

| 范围 | 分析方式 | 覆盖标识 |
|---|---|---|
| `feature` | 追踪用户指定入口的完整静态可分析链路及关键分支 | 通常为 `complete`；遇不可读边界为 `partial` |
| `module` | 先盘点模块全部对外入口，再选 2-5 条能够代表读、写、跨服务或关键异常的链路 | 未全量追踪时必须为 `sampled` |
| `project` | 先盘点模块和入口，再展示分层总览，选 1-3 条跨不同业务能力的代表链路 | 未全量追踪时必须为 `sampled` |

`module` 和 `project` 不得用“完整模块流程”或“全项目完整调用链”描述抽样结果。HTML 头部必须显示：已发现数量、已追踪数量、选择依据、遗漏入口；代码根本身不完整时还要显示“仅限当前可读代码根”。

### 2. 探测代码与证据边界

识别当前目录、父目录和兄弟目录中的前端与后端代码根。用配置文件和框架特征确定技术栈，例如 `package.json`、`pom.xml`、`build.gradle`、`pyproject.toml`、`@RestController`、路由注册和 ORM 配置。

把实际读取到的代码根写入 `FLOW_DATA.meta.roots`。找不到某一侧时不要补全想象中的代码，只追到最后一个有证据的位置并插入断链节点。

### 3. 追踪请求和返回

开始分析前读取：

- [`references/call-chain-analysis.md`](references/call-chain-analysis.md)：如何定位入口、逐层下钻和回溯返回数据
- [`references/flow-data-schema.md`](references/flow-data-schema.md)：唯一的数据结构和完整性规则

在选定链路中，把以下静态可追且会改变路由、校验、业务行为、数据结构或 I/O 的位置作为独立节点：

- 前端事件/API 封装、请求与响应拦截器
- 后端过滤器、中间件、Controller/Handler
- Service 以及 Service-to-Service 调用
- Mapper/Repository/DAO、SQL/ORM 操作与具体数据库表
- 实体、DTO/VO、响应包装和前端解包/消费转换
- 可读的缓存、消息、外部 API 或文件 I/O 边界

纯日志、简单 getter/setter 和不改变数据或控制流的转发可合并进所属节点说明，避免制造噪声。

对每个方法节点记录方法签名与形参。对每条调用边记录调用点的实参表达式如何对应下一方法的形参，例如 `orderService.create(currentUser.id, form)` 对应 `userId <- currentUser.id`、`command <- form`。

数据库节点必须来自代码证据，并记录数据源/库名（可确定时）、表名、操作类型和关键条件/字段。真实流程没有数据库时，如实展示内存、缓存、队列或外部 API 终点，禁止为了满足图形结构虚构数据库。

返回边必须逐跳记录：转换前结构、转换后结构、关键转换动作。至少追到最终 HTTP 状态和 JSON 结构；若前端响应拦截器、store 更新或页面消费位置可读，则继续追到用户请求对应的前端结果。

### 4. 处理断链

只展示静态证据支持的链路。跨仓不可读、动态 URL 无法解析、反射/动态分发、运行时代理、不可读 MQ 消费者等情况统一使用 `kind: "break"` 节点，记录：

- 最后可确认的位置、HTTP 方法/URL/参数等已知信息
- `break.phase`、`break.reason`、`break.knownNext`
- 支持该判断的源码位置

断链节点是该分支的终点，不能有任何出向边。可以列候选目标，但不得选择一个候选继续画下游。

### 5. 生成并校验 `FLOW_DATA`

按 schema 生成 JSON 文件（临时文件可在交付后删除），然后运行：

```bash
node <skill-dir>/scripts/validate-flow-data.mjs <flow-data.json>
node <skill-dir>/scripts/render-flow.mjs <flow-data.json> <output.html>
node <skill-dir>/scripts/validate-rendered-html.mjs <output.html>
```

校验失败时先修正分析数据，不要绕过校验器或直接修改生成后的 HTML。`render-flow.mjs` 会再次校验数据、安全注入模板并自动运行 HTML 校验。`validate-rendered-html.mjs` 提取嵌入 JSON 再次校验，并检查 HTML 结构完整性。模板使用方法见 [`references/html-boilerplate.md`](references/html-boilerplate.md)。

### 6. 浏览器验证

实际打开 HTML，在桌面和窄屏视口检查：

- 页面与所有流程 Tab 正常渲染，控制台无错误
- 路径选择控件可用，切换路径后播放序列更新为选中路径的 `steps`
- 请求轨和返回轨方向清晰，数据库/真实终点与最终响应均可见
- 方法签名、参数、实参映射、功能说明、数据库信息和返回转换可展开查看
- 播放、上一步、下一步、重置、轨道开关、主题切换和键盘操作可用
- 展开节点、切换 Tab 或改变视口后连线会重算，不穿过卡片；标注不压住正文
- `sampled`/`partial` 覆盖信息和遗漏清单显著可见
- 断链后无节点或连线，且原因与已知下一跳可读
- `window.__flowDiagnostics()` 返回 `linesCrossingCards`、`labelsOverlappingCards` 和 `pathIssues` 均为空

发现问题就修复数据、模板或生成器后重新验证，不交付未经浏览器检查的成品。

### 7. 交付说明

告诉用户生成文件的路径，并简述：范围、覆盖比例、完整链路数、断链数和断链原因。若结果是抽样或部分完成，必须直接说明，不用“完整”修饰它。

## Completion Gate

交付前逐项确认：

- [ ] 请求从前端 URL 或明确标注的外部调用方开始
- [ ] Controller/Handler、每个 Service、数据访问方法均展示签名、形参和主要功能
- [ ] 调用边展示实参与下一方法形参的对应关系
- [ ] 同一 Mapper 方法执行多次使用独立节点；禁止合并多 DAO/DB 操作
- [ ] 数据库节点展示真实表、操作类型和关键条件；没有数据库时未虚构
- [ ] DML 默认 `result.source` 为 `affected-row-count`；声称返回行需 `returnsRows` 证据
- [ ] 返回边逐层展示实体/DTO/包装/JSON 等数据转换
- [ ] 完整链路以最终响应结束；不可追链路以断链节点结束
- [ ] 每个 flow 至少一条显式 path；path steps 连续且引用有效
- [ ] 所有节点和边至少属于一条 path
- [ ] 事务边界正确标注；事务外操作独立节点
- [ ] spawn 边不出现在父路径同步返回序列中
- [ ] 所有节点和边有源码证据，拼写与代码一致
- [ ] 断链节点没有出向边，没有臆造下游
- [ ] 模块/项目抽样结果披露发现、追踪和遗漏数量
- [ ] validator、renderer、HTML validator 和浏览器检查均通过
