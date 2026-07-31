# Vue 前端知识梳理：从界面操作到后端请求

> 本文基于“报价审批页产品名称筛选”代码整理，目标是建立一套可迁移的 Vue 阅读框架，而不是逐条记忆语法。

## 一、先记住一条主线

Vue 页面可以理解为一个持续循环的数据系统：

```text
JavaScript 提供数据
  → template 根据数据渲染界面
  → 用户操作界面
  → v-model 更新数据，事件调用函数
  → 函数请求后端
  → 后端结果写回数据
  → Vue 自动刷新界面
```

在本次产品筛选功能中，这条主线具体是：

```text
加载全部产品
  → 用户按名称或编码过滤候选项
  → 选择具体产品
  → productCode 写入查询条件
  → 请求审批列表
  → tableData 更新
  → 表格自动刷新
```

---

## 二、Vue 单文件组件的三个部分

一个 `.vue` 文件通常分为：

```vue
<template>
  页面结构和事件连接
</template>

<script>
  页面数据和业务逻辑
</script>

<style>
  页面样式
</style>
```

可以这样记忆：

| 部分 | 职责 | 类比 |
|---|---|---|
| `template` | 展示什么、监听什么操作 | 界面说明书 |
| `script` | 数据从哪里来、操作后做什么 | 控制中心 |
| `style` | 元素如何排列和显示 | 装修规则 |

阅读页面时，不建议从第一行逐行读到底。更有效的顺序是：

1. 在 `template` 中找到用户入口；
2. 找到入口绑定的字段和函数；
3. 到 `data/props/methods` 中追踪；
4. 最后追踪 API 和返回数据。

---

## 三、template 与 JavaScript 的四条核心连接线

### 1. `{{ value }}`：把数据展示为文字

```vue
待我审批({{ toDoNum }})
```

当 JavaScript 执行：

```javascript
this.toDoNum = 25
```

页面会自动变为：

```text
待我审批(25)
```

记忆：**双花括号负责显示文字。**

### 2. `:属性="value"`：把 JavaScript 数据交给组件

```vue
<avue-crud :data="tableData" :table-loading="loading" />
```

- `tableData` 决定表格显示哪些记录；
- `loading` 决定是否显示加载状态。

冒号是 `v-bind:` 的简写。区别如下：

```vue
data="tableData"   <!-- 普通字符串 -->
:data="tableData"  <!-- JavaScript 变量的值 -->
```

记忆：**冒号负责向组件传入动态数据或函数。**

### 3. `v-model="value"`：控件值与数据双向同步

```vue
<el-select v-model="searchForm.productCode" />
```

双向同步意味着：

```text
用户选择产品
  → searchForm.productCode 自动更新

代码修改 productCode
  → 下拉框选择状态自动更新
```

`v-model` 主要负责保存值，本身不等于“发起查询”。查询通常由事件绑定触发。

记忆：**v-model 负责界面值和状态之间的双向连接。**

### 4. `@事件="method"`：事件发生时调用函数

```vue
<el-button @click="search">查询</el-button>
<el-select @change="search" />
<avue-crud @current-change="getTableData" />
```

分别表示：

```text
点击按钮       → search()
下拉值改变     → search()
当前页码改变   → getTableData()
```

`@` 是 `v-on:` 的简写。

记忆：**@ 负责把用户操作连接到函数。**

### 四条连接线总结

| 模板语法 | 作用 |
|---|---|
| `{{ value }}` | 显示数据 |
| `:prop="value"` | 给组件传动态数据或函数 |
| `v-model="value"` | 控件值与状态双向同步 |
| `@event="method"` | 事件发生时调用函数 |

---

## 四、template 中的数据来自哪里

模板可直接使用以下四类内容，不需要写 `this`：

| 来源 | 作用 | 示例 |
|---|---|---|
| `data()` | 组件自己的可变状态 | `searchForm`、`tableData` |
| `props` | 父组件传入的数据 | `searchType`、`areaOptions` |
| `computed` | 根据其他状态计算的值 | `jobNo` |
| `methods` | 可被事件或其他函数调用的方法 | `search()` |

JavaScript 方法内部要写：

```javascript
this.productOptions
```

模板中则直接写：

```vue
<el-option v-for="item in productOptions" />
```

因为模板天然处在当前组件的作用域中。

### `data()`：组件自身状态

```javascript
data() {
  return {
    allProductList: [],
    productOptions: [],
    searchForm: {
      productCode: ''
    },
    tableData: []
  }
}
```

其中：

- `allProductList` 保存完整产品列表；
- `productOptions` 保存当前展示的候选项；
- `searchForm.productCode` 保存用户选中的产品编码；
- `tableData` 保存审批表格记录。

### `props`：父组件传入的数据

父组件：

```vue
<to-approval :searchType="1" :areaOptions="areaOptions" />
```

子组件：

```javascript
props: {
  searchType: Number,
  areaOptions: Array
}
```

数据流为：

```text
父组件数据 → 标签属性 → 子组件 props → 子组件 template/methods
```

有冒号的 `:searchType="1"` 传入数字 `1`；没有冒号的 `searchType="1"` 传入字符串 `'1'`。

### 临时变量：`v-for` 与插槽

```vue
<el-option v-for="item in productOptions" />
```

`item` 是循环中的当前元素，只在这一段模板中有效。

```vue
<template slot-scope="{ row }">
  <el-button @click="handle(row)">处理</el-button>
</template>
```

`row` 是表格组件提供的当前行数据，并非来自 `data()`。

---

## 五、函数在什么时候被触发

Vue 页面中的函数主要通过四种方式触发。

### 1. 生命周期自动触发

```javascript
created() {
  this.getTableData()
}

mounted() {
  this.getAllProductList()
}
```

- `created`：组件数据和方法准备好后，由 Vue 自动调用；
- `mounted`：组件已经放到页面后，由 Vue 自动调用。

本页面中：

```text
created → 查询审批列表
mounted → 加载产品候选项
```

### 2. 界面事件触发

```vue
@click="search"
@change="search"
@current-change="getTableData"
```

用户点击、选择或翻页后，组件发出事件，Vue 按模板绑定调用对应方法。

### 3. 组件按约定调用回调

```vue
<el-select :remote-method="productProductData" />
```

这里是把函数交给 Element UI。用户输入搜索文字时，`el-select` 按组件约定调用：

```javascript
productProductData(当前输入文字)
```

例如输入“肉丝”：

```javascript
productProductData('肉丝')
```

### 4. JavaScript 方法之间主动调用

```javascript
search() {
  this.getTableData()
}
```

这里不是 Vue 自动触发，而是 `search()` 主动调用另一个方法。

### 产品筛选的完整触发链

```text
用户输入“肉丝”
  → remote-method
  → productProductData('肉丝')
  → productOptions 改变
  → 下拉候选项自动刷新

用户选择“冻猪肉丝”
  → v-model 写入 productCode
  → change 事件
  → search()
  → getTableData()
  → 审批接口
  → tableData 改变
  → 表格自动刷新
```

需要特别区分：

- **输入文字**只过滤产品候选项；
- **选择具体产品**才查询审批列表。

---

## 六、函数参数是如何获得值的

核心规则：**谁调用函数，通常就由谁提供实参；函数形参按位置接收。**

### 1. 模板显式传入

```vue
@click="handle(row)"
```

```javascript
handle(row) {
  // row 是当前表格行
}
```

模板中的当前行 `row` 成为函数的第一个参数。

### 2. 组件自动传入

```vue
:remote-method="productProductData"
```

Element UI 自动传入当前搜索文字：

```javascript
productProductData(val) {
  // val 例如为“肉丝”
}
```

事件也可能自动携带值。例如 `change` 事件会携带新值，但下面的函数可以不接收：

```vue
@change="search"
```

```javascript
search() {
  // 事件值被忽略，改为从 this.searchForm 读取统一状态
}
```

### 3. JavaScript 数组方法传入

```javascript
data.data.map((item) => ({
  label: item.productName,
  value: item.productCode
}))
```

`map` 每次把当前数组元素赋给 `item`。

```javascript
allProductList.filter((item) => item.label.includes(val))
```

`filter` 每次把当前被检查的元素赋给 `item`。

### 4. Promise 传入接口响应

```javascript
apiGetApprovalPage(params).then((res) => {
  this.tableData = res.data.data.records
})
```

接口请求成功后，Promise 把响应对象传给 `res`。

### 5. 对象解构参数

```javascript
headerCellClassName({ columnIndex }) {
  return columnIndex === 12 ? 'no-right-border' : ''
}
```

组件实际传入一个上下文对象，函数直接从中取出 `columnIndex`。它等价于：

```javascript
headerCellClassName(context) {
  const columnIndex = context.columnIndex
}
```

### 6. 不使用参数，读取组件状态

```javascript
getTableData() {
  const params = {
    ...this.searchForm,
    searchType: this.searchType,
    page: this.page.currentPage
  }
}
```

函数没有参数，但它仍有输入，这些输入来自当前组件状态：

- `this.searchForm` 来自 `data()`；
- `this.searchType` 来自 `props`；
- `this.page` 来自 `data()`。

这解释了为什么选择产品后，`search()` 即使不接收 `productCode` 参数，也能查询到正确结果：`v-model` 已经提前把值写入 `this.searchForm.productCode`。

---

## 七、列表和表单中的两个关键机制

### 1. `v-for`：数组驱动界面

```vue
<el-option
  v-for="item in productOptions"
  :key="item.value"
  :label="item.label"
  :value="item.value"
/>
```

如果 `productOptions` 有三个元素，Vue 就生成三个选项。数组过滤后只剩一个元素，界面也自动只剩一个选项。

```text
productOptions 改变 → v-for 重新计算 → 下拉选项更新
```

### 2. 展示值和实际值分离

产品数据转换为：

```javascript
{
  label: '冻猪肉丝H（10kg）',
  value: 'PRD001'
}
```

- `label` 给用户看；
- `value` 给程序和后端使用。

用户选择名称后：

```javascript
searchForm.productCode = 'PRD001'
```

因此本功能是：

```text
用户按名称寻找产品，但后端按编码精确查询。
```

---

## 八、响应式更新：数据为什么能自动刷新界面

Vue 会追踪模板使用了哪些状态。

例如：

```vue
<avue-crud :data="tableData" />
```

接口返回后：

```javascript
this.tableData = res.data.data.records
```

Vue 检测到 `tableData` 变化，就会更新表格，不需要手工调用“刷新表格”。

同理：

```text
toDoNum 改变       → 标题数量更新
productOptions 改变 → 产品候选项更新
loading 改变        → 加载状态更新
page.total 改变     → 分页总数更新
```

这就是 Vue 的核心思路：**开发者修改状态，Vue 负责同步界面。**

---

## 九、分页为何要区分筛选与翻页

筛选函数：

```javascript
search() {
  this.page.currentPage = 1
  this.getTableData()
}
```

翻页事件：

```vue
@current-change="getTableData"
```

两者不能混用：

| 操作 | 调用 | 原因 |
|---|---|---|
| 修改筛选条件 | `search()` | 新结果应从第一页开始 |
| 修改每页条数 | `search()` | 页数结构改变，应回第一页 |
| 点击第 2 页 | `getTableData()` | 必须保留用户选择的新页码 |

如果翻页也调用 `search()`，第 2 页会立即被重置为第 1 页。

---

## 十、父子组件的两种通信方向

### 1. 父组件向子组件传数据：`props`

```vue
<to-approval :searchType="1" />
```

```text
父组件 → props → 子组件
```

### 2. 子组件向父组件发事件：`$emit`

子组件：

```javascript
this.$emit('handle', row)
```

父组件：

```vue
<to-approval @handle="handle" />
```

```text
子组件当前行 row
  → $emit
  → 父组件 handle(row)
```

父组件还可以通过 `ref` 主动调用子组件方法：

```javascript
this.$refs.toApproval.search()
```

当前场景用于审批处理成功后刷新列表。

---

## 十一、如何阅读一个陌生的 Vue 页面

建议按以下步骤追踪：

### 第一步：找界面入口

搜索：

```text
@click
@change
v-model
:remote-method
```

确定用户操作会触发什么。

### 第二步：找到绑定的数据

例如：

```vue
v-model="searchForm.productCode"
```

到 `data()` 中查看初始结构，并搜索谁会修改、读取它。

### 第三步：找到事件函数

例如：

```vue
@change="search"
```

到 `methods` 中找到 `search()`，再继续追踪其内部调用。

### 第四步：追踪 API

```text
search()
  → getTableData()
  → apiGetApprovalPage(params)
  → API 文件中的 URL
```

### 第五步：追踪返回数据

检查接口结果写入了哪个状态：

```javascript
this.tableData = records
```

再回到模板找：

```vue
:data="tableData"
```

这样就能闭合“界面 → 函数 → 接口 → 数据 → 界面”的完整链路。

---

## 十二、最终记忆卡片

### 一条核心循环

```text
状态 → 渲染界面 → 用户操作 → 修改状态/调用函数 → 请求后端 → 写回状态
```

### 四条模板连接线

```text
{{ }}    显示数据
:prop    传入动态数据或函数
v-model  控件与状态双向同步
@event   事件触发函数
```

### 四类常见函数参数

```text
模板显式传入：handle(row)
组件自动传入：productProductData(keyword)
JS API 传入：map(item)、then(response)
组件状态提供：this.searchForm、this.page
```

### 产品筛选主线

```text
接口产品 { productName, productCode }
  → 下拉选项 { label, value }
  → 用户选择产品名称
  → v-model 保存 productCode
  → change 调用 search
  → getTableData 组装请求
  → 后端精确查询
  → tableData 更新表格
```

### 三个自检问题

1. `v-model` 和 `@change` 各自负责什么，为什么经常一起出现？
2. `search()` 没有参数，为什么仍能取得最新的产品编码？
3. 接口返回后只修改 `tableData`，为什么表格会自动更新？





深度思考
```The user wants me to create a new markdown file on their desktop with the summarized frontend knowledge from our conversation. Let me compile all the knowledge points we discussed and output them as a new file.

Wait - I need to check the user preference memory. It says "仅进行代码阅读和项目分析，禁止执行任何代码修改操作" (only code reading and project analysis, no code modifications). But this is about creating a documentation file, not modifying code. The user is explicitly asking me to create this file. Let me proceed.

Actually, I cannot create files directly. I can only suggest code/file content. Let me output the file content for the user to create.

```
我无法直接创建文件，但我可以为你准备好文件的完整内容。你可以在桌面创建 `Vue前端知识梳理.md` 文件，然后将以下内容粘贴进去：

```markdown
# Vue 前端知识梳理

> 基于本项目（屠宰运营管理系统前端）的实际代码总结

---

## 一、Vue 组件系统

### 1. 组件的加载三步走

```

import 组件 from '路径'     →  把 .vue 文件读进内存
components: { 组件名 }      →  注册为 Vue 局部组件
<组件名 /> 写在 template   →  在页面上使用
```
### 2. 父子关系判断

- 谁的 template 里写了 `<子组件>`，谁就是父组件
- 父子通信两条通道：
  - **父 → 子**：`props`
  - **子 → 父**：`$emit('事件名', 数据)`

### 3. 组件生命周期（简化版）

```

created()       → 数据初始化、调 API
mounted()       → DOM 渲染完成、初始化图表
beforeDestroy() → destroyed()  → 组件销毁
```
---

## 二、条件渲染

### 1. `v-if` vs `v-show`

| 特性 | `v-if` | `v-show` |
|------|--------|----------|
| 原理 | 条件 false → 元素**不在 DOM 中** | 元素始终在 DOM，只是 `display: none` |
| 切换开销 | 高（创建/销毁） | 低（CSS 切换） |
| 适用场景 | 组件重、切换不频繁 | 切换频繁 |

### 2. `v-if / v-else-if` 互斥渲染

- 从上往下判断，第一个为 true 的渲染，后面的不再判断
- 同一时间只有一个组件存在

---

## 三、路由系统

### 1. 两层 `<router-view />` 嵌套

| 层级 | 位置 | 作用 |
|------|------|------|
| 第一层 | App.vue | 切换"登录页"与"主布局框架" |
| 第二层 | page/index/index.vue | 在主布局内切换具体业务页面 |

### 2. 动态路由

- 路由不是写死的，而是登录后从后端拉取菜单数据，动态注册
- `Router.$avueRouter.formatRoutes(menuAll, true)` 是核心方法

### 3. `<keep-alive>` 缓存

- 包裹 `<router-view />` 时，切走的页面不销毁，切回来直接恢复

---

## 四、Flex 布局

### 核心属性

```
css
display: flex;                    /* 开启 flex 布局 */
justify-content: space-between;   /* 子元素两端对齐 */
align-items: center;              /* 子元素垂直居中 */
flex: 1;                          /* 占满剩余空间 */
flex: none;                       /* 不伸缩，保持原始宽度 */
min-width: 0;                     /* 防止 flex 子项内容撑开溢出 */
```
---

## 五、avue-crud 表格组件

### 1. 三个核心输入

| 属性 | 作用 | 类比 |
|------|------|------|
| `:option="tableOption"` | 定义表格结构（有哪些列、样式等） | 骨架 |
| `:data="tableData"` | 表格数据（数组，每条数据是一行） | 血肉 |
| `:page.sync="page"` | 分页信息（当前页、每页条数、总数） | 翻页器 |

### 2. `prop` 与数据字段的映射

- `column` 中的 `prop` 必须和数据对象的字段名**严格一致**（包括大小写）
- 不一致不会报错，但该列显示空白

### 3. `slot` 插槽

- 当某列需要特殊展示（颜色、按钮、条件渲染）时，用 `slot: true` 标记
- 在 template 中用 `<template slot="prop名">` 覆盖默认渲染

### 4. 数据流链路

```

created() → 调用 API → 赋值 tableData → Vue 响应式 → 表格自动刷新
```
---

## 六、前端应用启动链路

```

① index.html     → 浏览器入口，加载 CDN 脚本，提供 #app 挂载点
② main.js        → Vue 入口，注册全局插件/组件/工具，new Vue() 创建实例
③ App.vue        → 根组件，包含 <router-view /> 路由出口
④ router         → 根据 URL 匹配页面组件
⑤ 页面组件        → 业务页面（如 orderDepartmentManagement.vue）
⑥ 子组件          → 页面内的 Tab/弹窗等（如 frozenFoodOrderCollect.vue）
```
- HTML 加载 JS → JS 创建 Vue 实例 → `$mount('#app')` 替换 loading 动画 → Vue 接管页面

---

## 七、弹窗（el-dialog）

| 属性 | 作用 |
|------|------|
| `:visible.sync` | 双向绑定控制弹窗显隐 |
| `:append-to-body` | 把弹窗 DOM 插入 `<body>` 下，避免被 `overflow: hidden` 裁切 |
| `:destroy-on-close` | 关闭时销毁内部组件，下次打开重新创建 |
| `:before-close` | 关闭前的回调，常用于设置 `visible = false` |

---

## 八、`::v-deep` 样式穿透

- Vue 的 `<style scoped>` 只影响当前组件
- `::v-deep` 告诉 Vue："穿透作用域，去修改子组件内部的样式"
- 常用于覆盖 Element UI 组件的默认样式

---

## 九、`v-model` 双向绑定

```

用户输入 "张三"
    ↓
el-input 触发 input 事件
    ↓
v-model 自动更新绑定的变量
    ↓
searchForm.customerKey = "张三"
```
反过来，代码修改变量值，输入框也会自动更新显示。

---

## 十、其他知识点

| 知识点 | 说明 |
|--------|------|
| `@/` 路径别名 | 指向 `src/` 目录，在 jsconfig.json 中配置 |
| `computed` 计算属性 | 依赖的数据变化时自动重新计算，有缓存 |
| `$bus.$emit` | 事件总线，跨组件通信（不经过父子关系） |
| `mapGetters` | Vuex 辅助函数，把 store 中的 getter 映射为组件的 computed |
| `ref` | 给子组件一个引用，父组件可通过 `this.$refs.xxx` 直接访问子组件实例 |
| `lazy`（el-tab-pane） | 懒加载，第一次切到该 Tab 时才渲染内容 |
| 防竞态（fetchFlag） | 用时间戳标记最新请求，丢弃过期的响应数据 |

---

## 十一、组件树结构总览

```

new Vue()（根实例）
│
└── App.vue（根组件）
    ├── <router-view />  ← 第一层路由出口
    │   │
    │   └── page/index/index.vue（主布局框架，登录后进入）
    │       ├── <top />（顶部导航栏）
    │       ├── <sidebar />（左侧菜单栏）
    │       ├── <tags />（标签页导航栏）
    │       │
    │       └── <router-view />  ← 第二层路由出口（业务页面）
    │           ├── orderDepartmentManagement.vue（订单管理）
    │           │   ├── productAllocation.vue
    │           │   ├── orderAllocation.vue
    │           │   └── ...（12个Tab子组件）
    │           │
    │           ├── orderDetail/index.vue（订单详情/审批）
    │           │   ├── toApproval.vue
    │           │   └── OrderApprovalDetail/index.vue
    │           │
    │           └── 其他业务页面...
    │
    ├── <ai-assistant-float />（AI 助理浮层，登录后显示）
    └── <ai-sidebar />（AI 助理侧边栏，登录后显示）


---

**使用方式：** 在桌面右键 → 新建文本文档 → 重命名为 `Vue前端知识梳理.md` → 打开后粘贴上面的全部内容即可。

