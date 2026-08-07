# Java Stream、Lambda 与函数式接口学习梳理

> 本文根据本次学习内容，从集合处理的基本概念开始，逐步梳理 `Stream`、Lambda、函数式接口、匿名类、方法引用，以及 `collect` / `groupingBy` 的关系。

---

## 1. 先建立整体地图

一段典型的 Stream 代码：

```java
List<Integer> costs = List.of(80, 120, 90, 150);

List<Double> result = costs.stream()
        .filter(cost -> cost >= 100)
        .map(cost -> cost * 0.9)
        .toList();
```

它的主线是：

```text
List（原始数据）
    → stream()：建立处理流程
    → filter(...)：筛选元素
    → map(...)：转换元素
    → toList()：启动并收集结果
```

上述例子的结果：

```text
原始数据： [80, 120, 90, 150]
筛选后：   [120, 150]
打九折后： [108.0, 135.0]
最终结果： List<Double>
```

---

## 2. 集合、`Map` 与泛型

### 2.1 `List<T>`：一组有顺序的数据

```java
List<Integer> costs = List.of(80, 120, 90);
```

表示一个保存整数的列表：

```text
[80, 120, 90]
```

其中 `Integer` 是元素类型，表示这个 List 中每一项都是整数。

### 2.2 `Map<K, V>`：键和值的对应关系

```java
Map<String, Integer> prices;
```

表示：

```text
String 类型的键 → Integer 类型的值
```

示例：

```java
Map<String, Integer> prices = Map.of(
        "苹果", 8,
        "香蕉", 5
);
```

逻辑上为：

```text
"苹果" → 8
"香蕉" → 5
```

### 2.3 `Map<String, List<DailyCostPoint>>`

```java
Map<String, List<DailyCostPoint>> grouped;
```

表示：

```text
一个分组名称（String）
    → 该组中所有 DailyCostPoint 数据（List）
```

例如：

```text
"A01_F01" → [A01/F01 的第 1 天数据, A01/F01 的第 2 天数据]
"A01_F02" → [A01/F02 的第 1 天数据]
```

---

## 3. `stream()`：创建批量数据处理流程

### 3.1 Stream 是什么

`Stream` 可理解为：**对一批数据进行连续处理的流水线**。

```java
Stream<Integer> stream = costs.stream();
```

它表示：

> 后续准备逐个处理 `costs` 中的每个整数。

它通常不修改原始集合，也通常不会复制一个新集合。

### 3.2 哪些对象可以使用 `.stream()`

最常见的是实现了 `Collection` 接口的集合：

| 数据类型 | 用法 |
|---|---|
| `List<T>` | `list.stream()` |
| `Set<T>` | `set.stream()` |
| `Queue<T>` | `queue.stream()` |
| 数组 | `Arrays.stream(array)` |
| `Map<K, V>` | `map.entrySet().stream()`、`map.keySet().stream()`、`map.values().stream()` |

`Map` 本身不是 `Collection`，所以不能直接：

```java
map.stream(); // 错误
```

### 3.3 为什么说它“不会马上执行”

```java
Stream<Integer> filtered = costs.stream()
        .filter(cost -> {
            System.out.println("检查：" + cost);
            return cost >= 100;
        });
```

执行到这里时，通常不会打印任何内容。因为 Stream 只是记录处理步骤：

```text
未来需要结果时：逐个检查成本，只保留 >= 100 的。
```

当出现终止操作时，才真正执行：

```java
List<Integer> result = filtered.toList();
```

此时才会逐个处理元素并输出检查日志。

这种机制叫作**惰性执行（lazy evaluation）**。

---

## 4. Stream 的两类操作

### 4.1 中间操作：继续返回 Stream

中间操作用于描述处理步骤，通常仍返回一个新的 Stream，可以继续链式调用。

| 操作 | 作用 | 示例 |
|---|---|---|
| `filter` | 筛选元素 | `.filter(cost -> cost >= 100)` |
| `map` | 转换每个元素 | `.map(cost -> cost * 0.9)` |
| `sorted` | 排序 | `.sorted()` |
| `distinct` | 去重 | `.distinct()` |
| `limit` | 最多保留前 N 个 | `.limit(3)` |
| `skip` | 跳过前 N 个 | `.skip(2)` |

### 4.2 终止操作：启动流程并得到最终结果

终止操作会触发前面所有步骤执行，并消费 Stream。一个 Stream 通常只能执行一次终止操作。

| 操作 | 作用 | 常见结果类型 |
|---|---|---|
| `toList()` | 收集成列表 | `List<T>` |
| `collect(...)` | 按指定规则收集 | 由 Collector 决定 |
| `count()` | 统计数量 | `long` |
| `forEach(...)` | 对每项执行动作 | `void` |
| `findFirst()` | 查找第一项 | `Optional<T>` |
| `findAny()` | 查找任意一项 | `Optional<T>` |
| `anyMatch(...)` | 是否至少存在一个符合条件 | `boolean` |
| `allMatch(...)` | 是否全部符合条件 | `boolean` |
| `noneMatch(...)` | 是否没有元素符合条件 | `boolean` |
| `reduce(...)` | 合并多个元素 | 常为 `Optional<T>` 或指定类型 |
| `min(...)` / `max(...)` | 找最小/最大项 | `Optional<T>` |

---

## 5. Lambda 表达式：把处理规则作为参数传入

### 5.1 基本形式

```java
参数 -> 表达式
```

例如：

```java
cost -> cost >= 100
```

意思是：

```text
接收一个 cost
返回 cost 是否大于等于 100
```

等价于普通方法：

```java
private static boolean isHighCost(Integer cost) {
    return cost >= 100;
}
```

多行逻辑可使用大括号：

```java
cost -> {
    System.out.println("检查：" + cost);
    return cost >= 100;
}
```

### 5.2 参数由谁传入

对于 Stream 中常见的一元规则，**当前正在处理的 Stream 元素会自动作为 Lambda 参数传入**。

```java
costs.stream()
        .filter(cost -> cost >= 100);
```

处理过程：

```text
当前元素 80  → cost = 80  → 返回 false
当前元素 120 → cost = 120 → 返回 true
当前元素 90  → cost = 90  → 返回 false
```

Lambda 中的 `cost` 只是你自定义的局部变量名。也可以写：

```java
.filter(x -> x >= 100)
.filter(number -> number >= 100)
```

业务代码通常应选择有意义的名字：

```java
.filter(point -> point.getCost() >= 100)
```

---

## 6. `filter`、`map`、`forEach` 的规则分别是什么

假设当前元素类型是 `Integer`。

### 6.1 `filter(...)`：判断保留还是丢弃

```java
.filter(cost -> cost >= 100)
```

规则形状：

```text
Integer → boolean
```

返回：

- `true`：保留当前元素；
- `false`：丢弃当前元素。

例如：

```text
80  → false → 丢弃
120 → true  → 保留
```

### 6.2 `map(...)`：将当前元素转换为新元素

```java
.map(cost -> cost * 0.9)
```

规则形状：

```text
Integer → Double
```

这里不是将列表转换为 Java 的 `Map` 集合；`map` 的意思是“映射/转换每一个元素”。

```text
80  → 72.0
120 → 108.0
```

原本的：

```java
Stream<Integer>
```

经过该 `map` 后变为：

```java
Stream<Double>
```

**结果元素的类型，由 Lambda 的返回值类型决定。**

```java
.map(point -> point.getSpecCode())       // Stream<DailyCostPoint> → Stream<String>
.map(point -> point.getCost() * 0.9)     // Stream<DailyCostPoint> → Stream<Double>
.map(point -> new CostVO(...))           // Stream<DailyCostPoint> → Stream<CostVO>
```

### 6.3 `forEach(...)`：对每项执行动作

```java
.forEach(cost -> System.out.println(cost))
```

规则形状：

```text
Integer → 无返回值
```

它一般用于打印、写日志、发送消息等有副作用的动作。

```java
.forEach(System.out::println)
```

是上面 Lambda 的方法引用简写。

---

## 7. 函数式接口：让“规则”有统一类型

### 7.1 什么是函数式接口

函数式接口是指：**只有一个抽象方法需要实现的接口**。

它使 Java 可以将 Lambda 或方法引用作为该接口的实现使用。

常见接口位于：

```java
java.util.function
```

| 接口 | 抽象方法形状 | 常见用途 |
|---|---|---|
| `Predicate<T>` | `T → boolean` | 判断条件，例如过滤 |
| `Function<T, R>` | `T → R` | 转换元素，例如 `map` |
| `Consumer<T>` | `T → void` | 执行动作，例如 `forEach` |
| `Supplier<T>` | `() → T` | 不接收参数，提供一个对象 |
| `Comparator<T>` | `(T, T) → int` | 比较两个元素，用于排序 |

### 7.2 `Predicate<T>`

`Predicate<T>` 是 Java 标准库定义的接口，其核心可以简化为：

```java
public interface Predicate<T> {
    boolean test(T value);
}
```

因此：

```java
Predicate<Integer> rule = cost -> cost >= 100;
```

表示一个“整数 → 布尔值”的判断规则。可调用：

```java
boolean passed = rule.test(120); // true
```

`Predicate` 的作用不只是给匿名类使用。它给各种判断逻辑提供统一类型，使 `filter` 等方法能够接收不同业务规则。

### 7.3 `Function<T, R>`

核心形状：

```java
R apply(T value);
```

```java
Function<Integer, Double> discount = cost -> cost * 0.9;
Double result = discount.apply(120); // 108.0
```

### 7.4 `Consumer<T>`

核心形状：

```java
void accept(T value);
```

```java
Consumer<Integer> printer = cost -> System.out.println(cost);
printer.accept(120); // 打印 120
```

### 7.5 `Supplier<T>`

核心形状：

```java
T get();
```

```java
Supplier<LinkedHashMap<String, Integer>> factory = LinkedHashMap::new;
Map<String, Integer> map = factory.get();
```

---

## 8. `filter` 接收接口，实际传入什么？

`filter` 的方法签名可简化理解为：

```java
Stream<T> filter(Predicate<T> predicate)
```

这表示：

> `filter` 的参数类型是 `Predicate<T>` 接口。

但接口不能直接实例化：

```java
new Predicate<Integer>(); // 错误
```

实际传入的必须是一个**实现了 `Predicate<Integer>` 的对象**。可以有多种写法。

### 8.1 命名实现类

```java
class HighCostPredicate implements Predicate<Integer> {
    @Override
    public boolean test(Integer cost) {
        return cost >= 100;
    }
}

Predicate<Integer> rule = new HighCostPredicate();
```

### 8.2 匿名类

```java
Predicate<Integer> rule = new Predicate<Integer>() {
    @Override
    public boolean test(Integer cost) {
        return cost >= 100;
    }
};
```

### 8.3 Lambda

```java
Predicate<Integer> rule = cost -> cost >= 100;
```

三种方式的目标相同：提供一个能执行 `test(Integer)` 的 `Predicate<Integer>`。

---

## 9. 匿名类与匿名类实例

匿名类写法：

```java
new Predicate<Integer>() {
    @Override
    public boolean test(Integer cost) {
        return cost >= 100;
    }
}
```

含义是：

> 临时定义一个没有名字的类，它实现 `Predicate<Integer>`，并立即创建该类的一个对象。

可以概念性地理解为：

```java
class 某个临时类 implements Predicate<Integer> {
    @Override
    public boolean test(Integer cost) {
        return cost >= 100;
    }
}

Predicate<Integer> rule = new 某个临时类();
```

真实代码中没有显式类名，因此称为匿名类。它创建出来的对象就是匿名类实例。

匿名类不要求接口只有一个抽象方法；但由于写法较长，在简单规则场景中，Java 8 后通常优先使用 Lambda。

---

## 10. 为什么 Lambda 能替代简单匿名类

例如：

```java
.filter(point -> point.getCost() >= 100)
```

当前如果流类型是：

```java
Stream<DailyCostPoint>
```

则 `filter` 需要：

```java
Predicate<DailyCostPoint>
```

该接口要求实现：

```java
boolean test(DailyCostPoint point);
```

Lambda：

```java
point -> point.getCost() >= 100
```

正好满足：

```text
输入 DailyCostPoint → 输出 boolean
```

所以 Java 将它适配为 `Predicate<DailyCostPoint>` 的实现。

概念上类似：

```java
new Predicate<DailyCostPoint>() {
    @Override
    public boolean test(DailyCostPoint point) {
        return point.getCost() >= 100;
    }
}
```

### 10.1 不是任意接口都可以用 Lambda

Lambda 只能用于**函数式接口**位置，因为 Java 必须明确知道 Lambda 要对应接口中的哪一个抽象方法。

### 10.2 Lambda 不是天生就是 `Predicate`

同一个 Lambda：

```java
cost -> cost >= 100
```

不是天生固定为 `Predicate<Integer>`。它的目标类型由上下文决定。

```java
Predicate<Integer> rule = cost -> cost >= 100;
```

也可以自定义接口：

```java
@FunctionalInterface
interface CostRule {
    boolean check(Integer cost);
}

CostRule rule = cost -> cost >= 100;
```

两者都合法，因为它们的唯一抽象方法形状都符合：

```text
Integer → boolean
```

这种由使用位置推断 Lambda 类型的机制，称为**目标类型推断（target typing）**。

### 10.3 更精确的理解

学习时可近似记为：

```text
Lambda ≈ 单抽象方法匿名类的简写
```

更准确地说：

> Lambda 是为函数式接口提供实现的简洁语法，但语言语义和 JVM 运行机制不等同于传统匿名类。

例如 Lambda 中的 `this` 指向外层对象；匿名类中的 `this` 指向匿名类对象。JVM 对 Lambda 通常也不会简单地按“生成一个匿名内部类”处理。

日常编写 Stream 代码时，重点是：它们都可以向需要函数式接口的位置提供处理规则。

---

## 11. 方法引用 `::`

### 11.1 定义

当 Lambda 只是“接收参数并原样调用一个已有方法”时，可以使用方法引用，省去重复写参数。

```java
cost -> System.out.println(cost)
```

可写为：

```java
System.out::println
```

方法引用不是立即调用；它是把“将来调用哪个方法”的规则交给 Stream 或其他接收函数式接口的方法。

### 11.2 参数如何传递

```java
.forEach(System.out::println)
```

`forEach` 需要的是：

```java
Consumer<T>
```

当 Stream 中有每个元素时，`forEach` 会将其作为参数传给 `println`：

```text
108.0 → System.out.println(108.0)
135.0 → System.out.println(135.0)
```

所以可以理解为：方法引用省略了“显式写出参数名与转交动作”，但参数仍然会自动传递。

### 11.3 常见形式

| 形式 | 示例 | 等价 Lambda | 含义 |
|---|---|---|---|
| 对象实例方法 | `System.out::println` | `x -> System.out.println(x)` | 使用已有对象的方法 |
| 类的静态方法 | `Integer::parseInt` | `text -> Integer.parseInt(text)` | 调用类的静态方法 |
| 任意对象的实例方法 | `String::toUpperCase` | `text -> text.toUpperCase()` | 对流中每个对象调用该方法 |
| 构造方法引用 | `LinkedHashMap::new` | `() -> new LinkedHashMap<>()` | 需要对象时创建对象 |

### 11.4 示例

```java
List<String> texts = List.of("80", "120", "150");

List<Integer> costs = texts.stream()
        .map(Integer::parseInt)
        .toList();
```

等价于：

```java
List<Integer> costs = texts.stream()
        .map(text -> Integer.parseInt(text))
        .toList();
```

---

## 12. `collect(...)`：指定最终如何收集结果

`collect(...)` 是终止操作。它的返回类型由传入的 `Collector` 决定。

### 12.1 收集成 List

```java
List<Integer> result = costs.stream()
        .filter(cost -> cost >= 100)
        .collect(Collectors.toList());
```

结果：

```java
List<Integer>
```

Java 16+ 可写成：

```java
.toList()
```

### 12.2 收集成 Set

```java
Set<Integer> result = costs.stream()
        .collect(Collectors.toSet());
```

结果为 `Set<Integer>`，通常用于去重；但不保证顺序。

### 12.3 收集为指定集合

```java
LinkedHashSet<Integer> result = costs.stream()
        .collect(Collectors.toCollection(LinkedHashSet::new));
```

得到 `LinkedHashSet<Integer>`：去重并保留首次出现顺序。

### 12.4 收集为 Map

```java
Map<Integer, String> result = costs.stream()
        .distinct()
        .collect(Collectors.toMap(
                cost -> cost,
                cost -> "成本：" + cost
        ));
```

`toMap` 的常见参数：

```java
Collectors.toMap(
    元素 -> key,
    元素 -> value
)
```

注意：`Map` 的 key 不能重复。若可能重复，需要增加冲突处理规则：

```java
Collectors.toMap(
        cost -> cost,
        cost -> "成本：" + cost,
        (oldValue, newValue) -> oldValue
)
```

第三个参数表示 key 冲突时保留旧值。

---

## 13. `groupingBy(...)`：按规则分组

### 13.1 最简单的分组

```java
Map<String, List<Integer>> result = costs.stream()
        .collect(Collectors.groupingBy(
                cost -> cost >= 100 ? "高成本" : "低成本"
        ));
```

其中：

```java
cost -> cost >= 100 ? "高成本" : "低成本"
```

是分组规则：每个成本应归入哪个分组。

三元表达式：

```java
条件 ? 条件成立的值 : 条件不成立的值
```

等价于：

```java
cost -> {
    if (cost >= 100) {
        return "高成本";
    }
    return "低成本";
}
```

对于：

```java
List<Integer> costs = List.of(80, 120, 90, 120, 150);
```

分组过程：

| 成本 | 分组 key |
|---:|---|
| 80 | `"低成本"` |
| 120 | `"高成本"` |
| 90 | `"低成本"` |
| 120 | `"高成本"` |
| 150 | `"高成本"` |

最终结果：

```text
"低成本" → [80, 90]
"高成本" → [120, 120, 150]
```

类型为：

```java
Map<String, List<Integer>>
```

### 13.2 分组后统计每组数量

```java
Map<String, Long> result = costs.stream()
        .collect(Collectors.groupingBy(
                cost -> cost >= 100 ? "高成本" : "低成本",
                Collectors.counting()
        ));
```

结果：

```text
"低成本" → 2
"高成本" → 3
```

### 13.3 分组后求每组总和

```java
Map<String, Integer> result = costs.stream()
        .collect(Collectors.groupingBy(
                cost -> cost >= 100 ? "高成本" : "低成本",
                Collectors.summingInt(cost -> cost)
        ));
```

结果：

```text
"低成本" → 170
"高成本" → 390
```

---

## 14. 业务代码示例：按规格 + 厂区分组

```java
Map<String, List<DailyCostPoint>> grouped = dailyCosts.stream()
        .collect(Collectors.groupingBy(
            p -> key(p.getSpecCode(), p.getFactoryCode()),
            LinkedHashMap::new,
            Collectors.toList()
        ));
```

这段代码的目标：

> 将每日成本明细按“规格编码 + 厂区编码”分组。

### 14.1 三个参数的意义

`groupingBy` 的三参数形式：

```java
Collectors.groupingBy(
    元素 -> 分组 key,
    用于保存最终结果的 Map 创建规则,
    同组元素如何收集
)
```

对应到代码：

| 参数 | 作用 |
|---|---|
| `p -> key(p.getSpecCode(), p.getFactoryCode())` | 根据规格和厂区生成分组 key |
| `LinkedHashMap::new` | 使用 `LinkedHashMap` 保存整体分组结果 |
| `Collectors.toList()` | 每个组内的数据收集为 `List<DailyCostPoint>` |

### 14.2 `key(...)` 是什么

`key(...)` 不是 Java 自带方法。它通常是项目自定义的方法，用于把两个字段合成稳定的分组标识，例如：

```java
private static String key(String specCode, String factoryCode) {
    return specCode + "_" + factoryCode;
}
```

那么：

```java
key("A01", "F01")
```

返回：

```text
A01_F01
```

### 14.3 `LinkedHashMap::new` 是什么

它是构造方法引用：

```java
LinkedHashMap::new
```

等价于：

```java
() -> new LinkedHashMap<>()
```

意思是：

> 当 `groupingBy` 需要创建最终分组结果的 Map 容器时，创建一个新的 `LinkedHashMap`。

`LinkedHashMap` 的意义是：通常按 key 第一次出现的顺序保存分组结果；普通 `HashMap` 不保证这一顺序。

### 14.4 分组例子

原始数据：

```text
A01 / F01 / 成本 100
A01 / F01 / 成本 110
A01 / F02 / 成本 120
B01 / F01 / 成本 90
```

最终：

```text
A01_F01 → [成本 100, 成本 110]
A01_F02 → [成本 120]
B01_F01 → [成本 90]
```

可以把这段 Stream 写法理解为接近以下传统循环：

```java
Map<String, List<DailyCostPoint>> grouped = new LinkedHashMap<>();

for (DailyCostPoint p : dailyCosts) {
    String groupKey = key(p.getSpecCode(), p.getFactoryCode());

    grouped
            .computeIfAbsent(groupKey, k -> new ArrayList<>())
            .add(p);
}
```

---

## 15. 速查：看到代码时如何判断含义

### 15.1 看到 Lambda，先问三个问题

```java
x -> 某段逻辑
```

1. `x` 的类型是什么？——由目标函数式接口或 Stream 当前元素类型决定。
2. 这段逻辑返回什么？——决定它能否用于 `filter`、`map` 等方法。
3. 它要实现哪个函数式接口的抽象方法？——由使用位置决定。

### 15.2 按返回值判断适合什么操作

| Lambda 形状 | 常见用途 |
|---|---|
| `T -> boolean` | `filter`、`anyMatch` 等条件判断 |
| `T -> R` | `map`，转换元素 |
| `T -> void` | `forEach`，执行动作 |
| `() -> T` | `Supplier`，创建或提供对象 |
| `(T, T) -> int` | `sorted` 的比较器 |

### 15.3 按最终目标选择终止操作

| 想得到什么 | 常用选择 |
|---|---|
| 一批处理后的数据 | `toList()` |
| 去重数据 | `collect(toSet())` |
| 按 key 查询的映射 | `collect(toMap(...))` |
| 多组数据 | `collect(groupingBy(...))` |
| 条数 | `count()` |
| 是否存在符合条件的数据 | `anyMatch(...)` |
| 第一条符合条件的数据 | `findFirst()` |
| 对每项执行打印/日志等动作 | `forEach(...)` |

---

## 16. 最终记忆主线

```text
函数式接口
    → 规定“需要什么形状的处理规则”
    → Lambda：现场写出规则
    → 方法引用：复用已有方法作为规则
    → Stream：将规则应用到一批数据
    → collect / toList / count 等：启动流程并获得最终结果
```

### 必记的六句话

1. `stream()` 创建的是数据处理流程，通常要遇到终止操作才真正执行。
2. `filter` 接收“元素 → boolean”的判断规则；`true` 保留，`false` 丢弃。
3. `map` 对每一个元素做转换；转换后的元素类型由 Lambda 返回值决定。
4. `Predicate`、`Function`、`Consumer` 是函数式接口，分别描述判断、转换、动作。
5. Lambda 必须有目标函数式接口；它不是天生固定的 `Predicate` 或 `Function`。
6. 方法引用 `::` 是 Lambda 的简写：当 Lambda 只负责将参数转交给已有方法时，可以省略参数名。

---

## 17. 自测问题

1. 为什么 `.filter(cost -> cost >= 100)` 中的 `cost` 会依次拿到 Stream 中的每一个元素？
2. `map(point -> point.getSpecCode())` 之后，Stream 的元素类型是什么？
3. 为什么 `cost -> cost >= 100` 可以赋值给 `Predicate<Integer>`，却不能直接使用 `var rule = ...` 推断？
4. `System.out::println` 与 `cost -> System.out.println(cost)` 的关系是什么？
5. `groupingBy` 后得到 `Map<String, List<Integer>>` 时，`String` 和 `List<Integer>` 分别代表什么？
6. `LinkedHashMap::new` 与 `() -> new LinkedHashMap<>()` 为什么等价？
