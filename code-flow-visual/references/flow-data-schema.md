# FLOW_DATA 数据合约

`FLOW_DATA` 是分析与 HTML 之间的唯一接口。它是 JSON 兼容对象，不允许函数、注释、`undefined` 或循环引用。

## 顶层结构

```json
{
  "version": 2,
  "meta": {
    "title": "创建订单调用链",
    "summary": "订单表单经订单服务写入订单与明细，再返回 OrderView",
    "roots": [
      { "path": "apps/web", "role": "frontend" },
      { "path": "services/order", "role": "backend" }
    ]
  },
  "scope": {
    "type": "feature",
    "coverage": "complete",
    "discoveryComplete": true,
    "counts": {
      "modules": { "discovered": 1, "traced": 1 },
      "endpoints": { "discovered": 1, "traced": 1 }
    },
    "selectionBasis": "用户指定 POST /api/orders",
    "omitted": []
  },
  "flows": []
}
```

`version` 必须为 `2`。version 1 数据缺少 `paths`、`transactions` 和 result source 语义，不再接受。

### `scope`

- `type`: `feature | module | project`
- `coverage`: `complete | sampled | partial`
- `discoveryComplete`: 当前可读代码根是否足以完成入口盘点
- `counts.endpoints`: 必填，`traced <= discovered`
- `counts.modules`: 项目范围必填，其他范围可选
- `selectionBasis`: 抽样依据、用户指定入口或部分完成边界
- `omitted`: 未追踪入口；元素格式为 `{ method, url, symbol, reason }`

`sampled` 必须满足 `traced < discovered` 且 `omitted` 非空。`complete` 必须满足发现数等于追踪数。代码根不完整时使用 `partial` 或把 `discoveryComplete` 设为 `false`，并在 `selectionBasis` 说明边界。

## Flow

```json
{
  "id": "create-order",
  "title": "POST /api/orders",
  "status": "complete",
  "entryNodeId": "ui-submit",
  "responseNodeId": "http-response",
  "selectionReason": "代表模块写入主流程",
  "nodes": [],
  "edges": [],
  "paths": [],
  "transactions": []
}
```

- `status`: `complete | broken`
- `entryNodeId`: 请求起点
- `responseNodeId`: 完整链路必填；断链且未知响应时省略
- `nodes`、`edges`: 至少各有一个元素
- `paths`: 至少一条路径；每条路径定义一条可播放的执行序列
- `transactions`: 可选；有事务边界时必填

## Node

```json
{
  "id": "order-service",
  "depth": 2,
  "lane": "request",
  "kind": "service",
  "layer": "Service",
  "symbol": "OrderService.create",
  "signature": "OrderView create(long userId, CreateOrderCommand command)",
  "role": "校验商品并在事务中创建订单",
  "params": [
    { "name": "userId", "type": "long", "source": "currentUser.id", "meaning": "当前用户 ID" },
    { "name": "command", "type": "CreateOrderCommand", "source": "request body", "meaning": "下单内容" }
  ],
  "result": {
    "type": "OrderView",
    "shape": "{id, status, total}",
    "source": "in-memory-object",
    "consumed": "order-controller-return"
  },
  "evidence": [
    { "path": "src/OrderService.java", "line": 34, "symbol": "OrderService.create", "basis": "confirmed" }
  ]
}
```

### Node 通用字段

- `id`: flow 内唯一 ID
- `depth`: 从入口层 `0` 开始的非负整数，用于双轨对齐
- `lane`: `request | turnaround | return`
- `kind`: `frontend | interceptor | middleware | controller | service | data-access | database | cache | queue | external-api | filesystem | memory | transform | response | break`
- `layer`: 给读者看的层名称
- `symbol`: URL、类方法、表或转换名称
- `signature`: Controller、Service、数据访问节点必填
- `role`: 一句话说明主要功能
- `params`: 方法节点必填数组；无参数时为 `[]`
- `result`: `{ type, shape?, source?, consumed? }`；未知时用明确的 `type: "unknown"`
- `evidence`: 至少一项 `{ path, line, symbol?, basis }`

### result.source（结果来源语义）

每个节点的 `result.source` 标明返回值的真实来源：

| 值 | 含义 | 典型场景 |
|---|---|---|
| `query-result` | 数据库查询返回的行集 | SELECT 后 ORM 映射的 Entity |
| `affected-row-count` | DML 影响的行数（int） | INSERT/UPDATE/DELETE 返回值 |
| `in-memory-object` | 内存中构造或修改的对象 | Service 组装的 DTO/VO |
| `generated-value` | 数据库生成的主键/序列 | INSERT 后回填的 id |
| `response-body` | HTTP 响应体 | Controller 返回的包装结果 |
| `unknown` | 静态分析无法确定 | 断链或动态分发 |

**关键规则**：DML 操作（INSERT/UPDATE/DELETE）默认只产生 `affected-row-count`。如果声称 DML 返回数据库行（`query-result`），必须在该节点的 `database.returnsRows` 中提供 RETURNING 子句或二次查询的证据。MyBatis `insert` 返回 `int` 是影响行数，不是插入后的行。

`result.consumed` 记录该结果被哪个节点或边消费（节点 ID 或边 ID），形成数据流可追溯链。

### `basis`（证据类型）

- `confirmed`: 源码直接声明（路由、方法签名、调用表达式、SQL、映射代码）
- `static-inference`: 多个静态声明组合得出（`baseURL + route constant`、ORM 实体到表名映射）
- `framework-derived`: 框架机制推导（Spring `@Transactional` 提交时机、MyBatis 生成 SQL）。必须在说明中写出推导依据。不得标成源码直接事实。
- `config-scoped`: 受配置限定的推断（环境变量、profile、proxy/rewrite 规则）。需说明限定条件。
- `runtime-unknown`: 目标取决于运行时。只能用于断链说明，不能据此继续创建下游节点。

普通节点不得只依赖 `runtime-unknown`。

### 请求节点

`kind: "frontend"` 的入口增加：

```json
{
  "http": {
    "method": "POST",
    "url": "/api/orders",
    "params": [
      { "name": "items", "in": "body", "type": "OrderItem[]", "meaning": "订单明细" }
    ],
    "urlMapping": {
      "browserPath": "/checkout",
      "axiosBaseURL": "VITE_API_BASE_URL",
      "proxyRewrite": "/api -> http://localhost:8080",
      "upstreamPath": "/api/orders",
      "controllerRoute": "POST /api/orders"
    }
  }
}
```

`http.params` 必须是数组。每个 param 必须有 `in`（`path | query | header | body`）。`urlMapping` 可选，用于区分开发代理和生产事实：

- `browserPath`: 浏览器地址栏路径
- `axiosBaseURL`: Axios/fetch baseURL 来源（变量名或字面值）
- `proxyRewrite`: 开发代理重写规则（如 Vite/webpack proxy）
- `upstreamPath`: 代理后的上游路径
- `controllerRoute`: Controller 路由声明

不可确定的字段省略，不要猜测。

### 数据库节点

```json
{
  "lane": "turnaround",
  "kind": "database",
  "database": {
    "system": "PostgreSQL/order_db",
    "table": "orders",
    "operation": "INSERT",
    "criteria": "写入 user_id/status/total，RETURNING id",
    "returnsRows": true,
    "returnsRowsEvidence": "INSERT ... RETURNING id 在 OrderMapper.xml:23"
  }
}
```

`table`、`operation`、`criteria` 必填。多个独立表操作使用多个节点。**禁止把 `selectById + updateById` 合并成一个 DAO 节点，或把 SELECT/UPDATE/INSERT 合并成一个数据库节点。** 同一 Mapper 方法执行多次也用不同 `id`（如 `order-mapper-select-1`、`order-mapper-update-1`）。

`returnsRows` 默认 `false`。设为 `true` 时必须提供 `returnsRowsEvidence`（RETURNING 子句或二次 SELECT 的源码位置）。

### 最终响应节点

```json
{
  "lane": "return",
  "kind": "response",
  "response": {
    "status": 201,
    "contentType": "application/json",
    "bodyShape": "{code, message, data: {id, status, total}}"
  }
}
```

### 断链节点

```json
{
  "lane": "turnaround",
  "kind": "break",
  "result": { "type": "unknown", "source": "unknown" },
  "break": {
    "phase": "request",
    "reason": "Controller 位于不可读后端仓库",
    "knownNext": "POST /api/report/export，经运行时网关路由"
  }
}
```

断链节点不能有任何出向边。

## Edge

### 请求调用边

```json
{
  "id": "controller-to-service",
  "from": "order-controller",
  "to": "order-service",
  "direction": "request",
  "order": 3,
  "label": "userId + command",
  "call": {
    "arguments": [
      { "parameter": "userId", "expression": "principal.userId" },
      { "parameter": "command", "expression": "body" }
    ]
  },
  "evidence": [
    { "path": "src/OrderController.java", "line": 28, "symbol": "OrderController.create", "basis": "confirmed" }
  ]
}
```

进入 `controller`、`service`、`data-access` 或 `database` 的请求边必须包含 `call.arguments`。即使目标没有形参，也写空数组。

### 返回边

```json
{
  "id": "entity-to-view",
  "from": "order-entity-return",
  "to": "order-view-return",
  "direction": "return",
  "order": 2,
  "label": "Entity -> View",
  "transform": {
    "before": "OrderEntity",
    "after": "OrderView",
    "action": "映射公开字段并格式化金额"
  },
  "evidence": [
    { "path": "src/OrderAssembler.java", "line": 19, "symbol": "OrderAssembler.toView", "basis": "confirmed" }
  ]
}
```

每条 `return` 边必须包含非空的 `before`、`after` 和 `action`。`order` 表示播放顺序：请求从入口到终点递增，返回从终点到响应递增。

### 条件支线

`direction: "branch"` 用于校验失败、异常、异步消费或嵌套请求。增加 `condition`，并仍提供证据。若支线返回响应，其每一条返回边同样要有 `transform`。

### spawn 边（异步派生请求）

```json
{
  "id": "refresh-token-spawn",
  "from": "auth-interceptor",
  "to": "refresh-token-request",
  "direction": "spawn",
  "order": 1,
  "label": "401 刷新 token",
  "condition": "response.status === 401",
  "evidence": [
    { "path": "src/interceptor.ts", "line": 45, "basis": "confirmed" }
  ]
}
```

`spawn` 边表示父请求在某个条件下触发一个独立的异步子请求。子请求有自己的入口节点和独立路径，**不能出现在父路径的同步返回序列中**。刷新原请求可用 `branch` 边回指入口，但不得把未知后端画成已确认节点。

### 扩展边语义

边 `direction` 支持以下值，布局方向仍由 `order` 和 `lane` 决定：

| direction | 用途 |
|---|---|
| `request` | 正常调用下行 |
| `return` | 数据返回上行 |
| `branch` | 条件支线（校验失败、异常、嵌套请求） |
| `spawn` | 异步派生请求（独立子请求） |

## Path（显式执行路径）

每条 path 定义一条可独立播放的执行序列。播放不再从全图边排序猜测，而是严格使用当前选中 path 的 `steps`。

```json
{
  "id": "success-path",
  "label": "正常创建",
  "condition": null,
  "steps": [
    { "nodeId": "submit-order", "edgeId": null },
    { "nodeId": "submit-order", "edgeId": "edge-1" },
    { "nodeId": "order-controller", "edgeId": "edge-2" },
    { "nodeId": "order-service", "edgeId": "edge-3" }
  ],
  "terminalNodeId": "http-response",
  "dbOperationCount": 2
}
```

### Path 字段

- `id`: flow 内唯一
- `label`: 给读者看的路径名称（如"正常创建"、"401 刷新"、"业务异常"、"回滚"）
- `condition`: 触发该路径的条件；主路径为 `null`
- `steps`: 有序数组，每项含 `nodeId` 和到达该节点经过的 `edgeId`（第一步 `edgeId` 为 `null`）
- `terminalNodeId`: 该路径的终点节点 ID
- `dbOperationCount`: 该路径执行的数据库操作数

### Path 规则

1. 每个 flow 至少一条 path。
2. `steps` 中的 `nodeId` 和 `edgeId` 必须存在于当前 flow 的 `nodes` 和 `edges` 中。
3. `steps` 必须连续：每步的 `edgeId` 必须从上一步的 `nodeId` 出发，到达本步的 `nodeId`。
4. 所有节点和边至少属于一条 path。
5. `spawn` 边只能出现在独立的 spawn path 中，不能出现在父路径的同步序列中。
6. `dbOperationCount` 必须等于该路径 steps 中经过的 `kind: "database"` 节点数。

## Transaction（事务边界）

```json
{
  "id": "order-tx",
  "entryNodeId": "order-service",
  "memberNodeIds": ["order-repository-insert", "order-items-repository-insert", "order-log-insert"],
  "outsideTxNodeIds": ["auth-user-query"],
  "commitPointNodeId": "order-service-return",
  "rollbackConditions": ["InventoryException", "DataIntegrityViolationException"]
}
```

### Transaction 字段

- `id`: flow 内唯一
- `entryNodeId`: 事务入口（通常标 `@Transactional` 的 Service 方法）
- `memberNodeIds`: 事务内的节点（DAO/数据库操作）
- `outsideTxNodeIds`: 事务外但同一调用链中的操作（如鉴权查询）
- `commitPointNodeId`: 正常提交点
- `rollbackConditions`: 触发回滚的异常类型或条件列表

### Transaction 规则

1. 事务成员必须是同一 flow 中存在的节点 ID。
2. `commitPointNodeId` 必须是 `return` lane 的节点。
3. 有回滚路径时，应有一条对应的 path（label 如"回滚"）。
4. `outsideTxNodeIds` 中的节点不能在 `memberNodeIds` 中同时出现。
5. Spring `@Transactional` 提交时机标为 `framework-derived`，不得标成 `confirmed`。

## 图完整性规则

validator 会检查以下结构规则：

1. flow、node、edge ID 唯一，边的端点存在。
2. 入口能沿请求/支线到达至少一个 `turnaround` 终点或断链。
3. `complete` flow 有显式最终响应，且真实终点能沿返回边到达该响应。
4. Controller、Service、数据访问节点有签名、参数和功能说明。
5. 数据库节点有表、操作和条件；最终响应有状态和 body 结构。
6. 返回边有转换前结构、转换后结构和动作。
7. 断链节点出度为 0；`broken` flow 至少包含一个断链节点。
8. 节点和边均有合法源码证据。
9. 覆盖统计与 `complete/sampled/partial` 状态一致。
10. 每个 flow 至少一条 path；path steps 连续且引用有效。
11. 所有节点和边至少属于一条 path。
12. DML 默认 `result.source` 为 `affected-row-count`；声称返回行需 `returnsRows` 证据。
13. `spawn` 边不出现在父路径的同步返回序列中。
14. 事务成员不与事务外操作重叠。
15. `http.params` 必须是数组；每个 param 必须有 `in` 字段。

这些规则只验证输出自洽。方法名、参数、表和业务含义是否真实，仍要由执行 agent 对照源码核验。
