# MCP 服务器两种实现方式对比分析

> 基于两个真实项目分析：`mcp-demo/server.js`（底层 API）与 `github-trending-mcp/src/index.ts`（高层 API）

## 一、背景

两个项目都是基于 `@modelcontextprotocol/sdk` 实现的 MCP 服务器，但采用了 SDK 的**两种不同封装层级**：

| 项目 | 使用的类 | 文件 | 工具 |
|---|---|---|---|
| mcp-demo | `Server`（底层类） | `server.js`（纯 JS，144 行 / 3 个工具） | `get_time`、`echo`、`take_screenshot` |
| github-trending-mcp | `McpServer`（高层封装类） | `src/index.ts`（TS + zod，60 行 / 1 个工具） | `get_trending_repos` |

核心结论：**两个都是 MCP 协议的正确实现，协议没变，只是脚手架自动化程度不同。**

---

## 二、底层 API：`Server`（mcp-demo 方式）

### 2.1 完整流程

```js
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ① 创建 Server 实例（手动声明能力）
const server = new Server(
  { name: "mcp-demo", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ② 工具元数据：集中声明说明书（手写 JSON Schema）
const TOOLS = [
  {
    name: "echo",
    description: "原样返回传入的文本",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
];

// ③ 工具实现：单独定义功能函数
function echo({ message }) {
  return message;
}

// ④ 注册 tools/list handler：把说明书返回给客户端
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// ⑤ 注册 tools/call handler：手动解析参数 + switch 分发 + 返回信封
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let text;
  switch (name) {
    case "echo":
      // 注意：底层 Server 不校验 inputSchema 的 required！
      // 必须手动校验参数，否则缺参会踩 -32602 的坑
      if (typeof args?.message !== "string") {
        return { content: [{ type: "text", text: "缺少必填参数 message" }], isError: true };
      }
      text = echo(args);
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
  return { content: [{ type: "text", text }] };
});

// ⑥ 接上 stdio 传输，开始监听
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 2.2 底层方式的关键特征

1. **协议两条核心请求需要亲手处理**：
   - `ListToolsRequestSchema`（客户端问"你有啥工具"）
   - `CallToolRequestSchema`（客户端说"帮我调工具"）
2. **工具元数据与实现分离**：`TOOLS` 数组 + 独立功能函数 + `switch` 手动接线
3. **JSON Schema 只当"说明书"**：发给客户端展示用，**不做运行时校验**，`required` 必须自己 `typeof` 检查
4. **能力声明手动**：`capabilities: { tools: {} }`
5. **灵活性高**：可自定义 resources / prompts 等任意协议方法，可返回 `image` 类型内容

---

## 三、高层 API：`McpServer`（github-trending 方式）

### 3.1 完整流程

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ① 创建 McpServer 实例（能力由 registerTool 自动声明）
const server = new McpServer({ name: "github-trending-mcp", version: "0.1.0" });

// ② 注册工具：schema + 实现内联在一个调用里
server.registerTool(
  "get_trending_repos",           // 工具名
  {                               // 说明书（zod 格式）
    title: "查询 GitHub 热门仓库榜单",
    description: "查询 GitHub 热门仓库（对应 github.com/trending）...",
    inputSchema: {
      language: z.string().optional().describe("编程语言过滤，如 typescript"),
      since: z.enum(["daily", "weekly", "monthly"]).default("daily"),
      limit: z.number().int().min(0).max(50).default(10),
    },
  },
  async ({ language, since, limit }) => {   // 实现：收到的一定是合法参数
    const result = await getTrending(language, since);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// ③ 接上 stdio 传输
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 3.2 高层方式的关键特征

1. **协议样板代码全部隐藏**：`registerTool` 内部自动完成注册、分发、校验、能力声明
2. **zod 真校验**：非法参数（类型错、超范围、枚举外）在进入 handler 前就被拦截；`.default()` 自动补默认值
3. **声明即注册**：一个工具一个块，schema 与实现内联，无手动接线
4. **handler 无需防御性检查**：收到的一定是合法参数
5. **适合工具型服务器**：代码量减少约一半，不易踩协议坑

---

## 四、核心差异对照表

| 维度 | 底层 `Server` | 高层 `McpServer` |
|---|---|---|
| 导入路径 | `server/index.js` | `server/mcp.js` |
| 能力声明 | 手动 `capabilities: { tools: {} }` | `registerTool` 自动声明 |
| 工具元数据 | 手写 `TOOLS` 数组 | `registerTool` 参数自动收集 |
| 参数 schema | 手写 JSON Schema 对象 | zod 链式（自动转 JSON Schema 发给客户端） |
| 运行时参数校验 | **不校验**，handler 自己 `typeof` 检查 | zod 自动校验，非法参数直接拦截 |
| 默认值处理 | 手动实现 | `.default()` 自动补 |
| 请求分发 | 手写 `switch (name)` | SDK 自动分发到对应 handler |
| 代码量 | 每个工具约 40+ 行样板 | 一个 `registerTool` 块搞定 |
| 协议扩展 | 自由（resources/prompts/自定义方法） | 仅工具场景，扩展受限 |
| 内容类型 | 支持 `text` / `image` 等全类型 | 同样支持（通过返回对象控制） |
| 适合场景 | 需要精细控制协议细节 | 90% 的工具型服务器 |

---

## 五、对应关系图：底层手写代码 → 高层内部做了什么

```
你的 demo 里手写的                           McpServer.registerTool 内部（隐藏）
────────────────────────────────────────────────────────────────────────────
new Server({ name, version },               new McpServer({ name, version })
  { capabilities: { tools: {} } })            ← 首次 registerTool 自动声明能力

const TOOLS = [...]                           ← schema 参数自动收集进内部列表

server.setRequestHandler(                     ← 自动注册
  ListToolsRequestSchema, ...)                  （客户端 tools/list 时自动响应）

server.setRequestHandler(                     ← 自动注册
  CallToolRequestSchema,                      ① 按 name 找到对应工具
  switch(name){...})                          ② zod 校验参数（非法直接拒）
                                              ③ 调用你的 handler
                                              ④ 包装结果信封返回
```

**一句话**：你在底层手写的 4 段代码（能力声明、TOOLS 数组、list handler、call handler + switch），在高层里全被 `registerTool` 一个调用替代。

---

## 六、校验机制对比（踩坑重点）

### 6.1 底层 Server：JSON Schema 只是说明书

```js
inputSchema: {
  type: "object",
  properties: { message: { type: "string" } },
  required: ["message"],   // ← 只给客户端看，SDK 不校验！
}
```

- SDK 只校验请求**结构**（params 格式），不校验 `required` 语义
- 缺参时 handler 返回 `undefined` 会导致结果信封校验失败（错误码 -32602）
- 正确做法：handler 内显式校验 + 返回 `isError: true` 标记业务错误

### 6.2 高层 McpServer：zod 是真正的校验器

```ts
inputSchema: {
  since: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  limit: z.number().int().min(0).max(50).default(10),
}
```

| zod 规则 | 效果 |
|---|---|
| `z.string()` / `z.number()` | 类型错误直接拦截 |
| `z.enum([...])` | 传枚举外值直接拦截 |
| `z.int()` / `z.min()` / `z.max()` | 整数、范围校验 |
| `.default()` | 缺参时自动补默认值 |
| `.optional()` | 允许省略 |
| `.describe()` | 描述同步给 AI 客户端（模型据此正确调用） |

---

## 七、应用场景建议

### 选择底层 `Server`
- 需要自定义 resources（资源）或 prompts（提示词）能力
- 需要处理自定义协议方法或精细控制握手响应
- 需要返回 `image` 等多类型内容（高层同样支持，但底层更直接）
- 想深入理解 MCP 协议底层机制（学习用途）

### 选择高层 `McpServer`
- 纯工具型服务器（90% 的常见场景）
- 追求代码量少、参数校验强、不易踩协议坑
- 配合 TypeScript + zod 获得编译期 + 运行期双重保障

---

## 八、总结

两种实现方式的本质是**同一协议（MCP）在 SDK 上的不同封装层级**：

1. **底层 `Server`** 把协议的每条消息、每个步骤暴露给你，手写样板代码但掌控一切；
2. **高层 `McpServer`** 把常用流程封装成 `registerTool`，自动完成注册、校验、分发，代价是协议细节的控制权。

**学习建议**：先用底层 `Server` 写一遍 demo（理解协议原貌：list/call 两条请求、JSON Schema、结果信封），再切换到 `McpServer` 就会明白它替你省掉了什么——协议没变，只是脚手架自动化了。
