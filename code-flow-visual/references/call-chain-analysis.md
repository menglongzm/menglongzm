# 调用链分析方法

本方法产出 [`flow-data-schema.md`](flow-data-schema.md) 定义的 `FLOW_DATA`（version 2）。不要先写 HTML；先形成有证据、可校验的请求图和返回图，再定义显式路径和事务边界。

## 1. 证据优先

每个节点和每条边都附源码证据：相对可读代码根的路径、起始行号、符号名和证据类型。

- `confirmed`：源码直接声明，例如路由、方法签名、调用表达式、SQL、映射代码。
- `static-inference`：由多个静态声明组合得出，例如 `baseURL + route constant` 或 ORM 实体到表名的映射。必须在说明中写出组合依据。
- `framework-derived`：框架机制推导，例如 Spring `@Transactional` 的提交时机、MyBatis 动态 SQL 生成、Spring Security 过滤链顺序。必须写出推导依据。不得标成源码直接事实。
- `config-scoped`：受配置限定的推断，例如环境变量值、profile、proxy/rewrite 规则。需说明限定条件。
- `runtime-unknown`：目标取决于运行时。只能用于断链说明，不能据此继续创建下游节点。

不要用"通常""应该"补齐缺失层。找不到证据就断链。

## 2. 定义需要展示的节点

选定链路上，凡是会改变以下任一内容的位置都应成为节点：

- 路由目标或执行分支
- 认证、校验、事务或核心业务决策
- 调用的业务模块或 I/O 边界
- 参数形状、领域对象、DTO/VO 或响应结构
- 数据持久化位置或外部系统状态

Controller 内部纯赋值、简单 getter、日志等不必拆成卡片，可写入该 Controller 的 `role` 或边的 `transform.action`。Service 调用另一个 Service、Mapper 或 Repository 时必须继续下钻并单独展示。

### 独立操作实例原则

**同一 Mapper 方法执行多次也用不同节点 ID**（如 `order-mapper-select-1`、`order-mapper-update-1`）。**禁止把 `selectById + updateById` 合并成一个 DAO 节点，或把 SELECT/UPDATE/INSERT 合并成一个数据库节点。** 每个真实调用实例使用独立节点，确保 I/O、DB 操作数、事务结果和响应路径可审计。

只拆分会改变 I/O、DB 操作数、事务结果、响应或派生工作的控制分支，避免把每个普通 `if` 都画成噪声。

## 3. 盘点代码根和入口

先读取构建配置、路由注册和目录结构，记录前后端代码根。当前仓库只有一侧时，在父/兄弟目录尽力寻找另一侧；仍不可读则建立断链。

### 前端或调用方入口

搜索 `axios`、`fetch(`、`request(`、`http.get/post`、GraphQL client、API 封装和 `baseURL`。记录：

- HTTP 方法、可解析的最终 URL、path/query/header/body 参数
- 页面/组件/事件或 API 封装的调用位置
- URL 的组合来源；环境变量值不可确定时保留表达式并说明动态部分

项目无前端时，用 Controller 路由或接口契约创建"外部调用方"入口，并明确该范围不包含前端实现。

### URL 映射契约

当 URL 涉及代理、重写或环境差异时，在 `http.urlMapping` 中分别记录：

- `browserPath`: 浏览器地址栏路径
- `axiosBaseURL`: Axios/fetch baseURL 来源（变量名或字面值）
- `proxyRewrite`: 开发代理重写规则（如 Vite/webpack proxy）
- `upstreamPath`: 代理后的上游路径
- `controllerRoute`: Controller 路由声明

不可确定的字段省略。不要把开发代理路径当成生产事实。

### 模块和项目入口清单

`module` 先枚举目标模块全部公开路由。`project` 先按模块枚举公开入口组。清单写入 `scope.counts` 和 `scope.omitted`，之后才选择代表链路。

选择时优先覆盖不同的读、写、跨模块协作、外部集成和关键异常路径。`selectionBasis` 要说明为什么这些链路具有代表性，不能只写"核心接口"。

## 4. 追踪请求下行

### 前端拦截器

静态可读的请求拦截器作为节点，记录 header 注入、序列化、URL 重写等动作。响应拦截器放在返回轨。

拦截器发起刷新 token 等新请求时使用 `spawn` 边建立条件支线。可读代码继续追踪；运行时去向不可确定时以断链结束。重放原请求可用 `branch` 边回指入口，但不得把未知后端画成已确认节点。

### Controller / Handler

按框架路由声明把 URL 映射到入口方法。记录：

- 类名、方法名和完整签名
- `@RequestParam`、`@PathVariable`、`@RequestBody` 等绑定来源
- 每个参数的名称、类型、来源和业务含义
- 返回类型、校验和分支

常见入口包括 Spring Controller、Express router、NestJS Controller、Flask/FastAPI route、Django URL/view、Go router 等。框架不在列表中时依据真实路由注册追踪，不套用 Spring 分层名称。

### Service 与调用实参

从调用表达式跳到真实实现。每个 Service 节点记录方法签名、形参、关键业务逻辑、返回结构和事务/校验。Service-to-Service 调用继续追踪。

每条进入 Controller、Service、Mapper/Repository 的 `request` 边记录调用点实参映射：

```json
{
  "call": {
    "arguments": [
      { "parameter": "userId", "expression": "currentUser.id" },
      { "parameter": "command", "expression": "form" }
    ]
  }
}
```

形参来自被调方法，`expression` 来自调用点。发生默认值、构造对象、字段提取或格式化时在 `meaning` 中说明。

### 数据访问和数据库

继续追踪 Mapper/Repository/DAO 到 SQL 或 ORM 表映射。至少记录：

- 数据访问方法签名和参数
- 数据源/库名（静态可确定时）
- 具体表名；多表操作拆成多个数据库节点或在一条明确的事务支线中分别展示
- `SELECT/INSERT/UPDATE/DELETE/UPSERT` 等操作
- 关键 WHERE/JOIN 条件、写入字段或 ORM 查询条件

MyBatis 同时读取 Mapper 接口、XML/注解 SQL 与实体映射；JPA/Hibernate 读取 Repository 方法、`@Query` 和实体表注解；其他 ORM 读取 model/schema 和调用表达式。不要仅凭类名猜表名。

### 结果来源语义

每个节点的 `result.source` 标明返回值的真实来源：

- `query-result`: 数据库查询返回的行集（SELECT 后 ORM 映射的 Entity）
- `affected-row-count`: DML 影响的行数（INSERT/UPDATE/DELETE 返回的 int）
- `in-memory-object`: 内存中构造或修改的对象（Service 组装的 DTO/VO）
- `generated-value`: 数据库生成的主键/序列（INSERT 后回填的 id）
- `response-body`: HTTP 响应体
- `unknown`: 静态分析无法确定

**关键规则**：DML 操作（INSERT/UPDATE/DELETE）默认只产生 `affected-row-count`。MyBatis `insert` 返回 `int` 是影响行数，不是插入后的行。如果声称 DML 返回数据库行（`query-result`），必须在该节点的 `database.returnsRows` 中提供 RETURNING 子句或二次查询的证据。

`result.consumed` 记录该结果被哪个节点或边消费，形成数据流可追溯链。

## 5. 回溯数据返回路径

从每个真实终点沿代码返回方向逐层创建 `return` 节点与边。返回边必须记录：

```json
{
  "transform": {
    "before": "orders row + generated id",
    "after": "OrderEntity",
    "action": "ORM 映射列并回填主键"
  }
}
```

典型路径为：

```text
数据库结果/写入结果
  -> 实体或聚合
  -> Service 组装、过滤、脱敏或格式化后的 DTO/VO
  -> Controller 响应包装
  -> HTTP 状态、Content-Type 与 JSON body
  -> 响应拦截器解包
  -> store/组件接收结果（静态可读时）
```

每一跳分别写 `before`、`after`、`action`，不能只在摘要里写一次"实体转 DTO"。字段没有转换时也写明"原样返回"及结构名。异常返回使用带 `condition` 的返回支线，并追到全局异常处理和最终响应（可读时）。

**注意**：DML 后的结果不是"更新后的行"。如果最终 VO 来自先前查询后在内存中修改的 Entity，应如实标注 `result.source: "in-memory-object"`，不要虚构二次 SELECT 或 RETURNING。

## 6. 事务边界

在 Service 方法上标注 `@Transactional` 时，创建 `transactions` 条目：

- `entryNodeId`: 事务入口 Service 节点
- `memberNodeIds`: 事务内的 DAO/数据库操作节点
- `outsideTxNodeIds`: 同一调用链中但事务外的操作（如鉴权查询 `SysUserMapper.selectById`）
- `commitPointNodeId`: 正常提交点（通常在返回轨）
- `rollbackConditions`: 触发回滚的异常类型

Spring `@Transactional` 提交时机标为 `framework-derived`，不得标成 `confirmed`。事务外的鉴权查询必须独立节点，不能藏在说明文字中。

## 7. 定义显式路径

分析完节点和边后，为每条可独立播放的执行序列创建 `path`：

- **主路径**：正常成功流程，`condition` 为 `null`
- **条件路径**：校验失败、业务异常、回滚、401 刷新等，`condition` 标明触发条件
- **spawn 路径**：异步派生请求（如登录后角标刷新、成功后列表重载），使用 `spawn` 边

每条 path 的 `steps` 必须连续：每步的 `edgeId` 从上一步的 `nodeId` 出发，到达本步的 `nodeId`。`terminalNodeId` 必须与最后一步的 `nodeId` 一致。`dbOperationCount` 必须等于该路径中经过的数据库节点数。

**先建路径和操作实例，再渲染。** 禁止通过节点说明文字隐藏真实 I/O。

## 8. 断链规则

以下情况在最后可确认位置之后创建 `kind: "break"` 节点：

- 后端或消费者位于不可读仓库
- 动态 URL、依赖注入、反射或配置分发无法确定唯一目标
- 运行时 mock、代理、网关或服务发现决定去向
- 外部 API 只知道契约，不知道其内部实现

断链节点记录 `break.phase`、`break.reason`、`break.knownNext` 和最后一份证据。候选目标可以写进 `knownNext`，但断链节点的出度必须为 0。

如果调用的是仓库内可读 mock executor，则继续追到 `memory` 终点，并明确"未落库"；它不是断链，也不应出现数据库节点。

## 9. 完整性检查

对每条选中链路确认：

1. 入口节点能沿 `request`/`branch` 边到达真实终点或断链。
2. 完整链路能从真实终点沿 `return` 边到达最终响应。
3. Controller、Service、数据访问节点都有签名和参数数组；调用边有实参映射。
4. 数据库节点有真实表、操作和条件；所有转换有前后结构与动作。
5. 断链没有出向边，且图中没有断链之后的推测节点。
6. 抽样范围的发现数、追踪数和遗漏清单相互一致。
7. 每个 flow 至少一条 path；path steps 连续且引用有效。
8. 所有节点和边至少属于一条 path。
9. DML 默认 `result.source` 为 `affected-row-count`；声称返回行需 `returnsRows` 证据。
10. `spawn` 边不出现在父路径的同步返回序列中。
11. 事务成员不与事务外操作重叠。

完成分析后再运行 validator。校验器通过不代表事实正确；仍需逐项核对源码证据。
