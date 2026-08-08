# Java 泛型学习梳理

> 本文系统梳理 Java 泛型的核心概念：类级泛型与方法级泛型的区别、类型推断机制、通配符与 PECS 原则、类型擦除，以及在统一响应类和集合框架中的实际应用。适合已掌握 Java 基础语法、希望深入理解泛型类型系统的开发者。

## 1. 一句话定位

Java 泛型在编译期对类型进行参数化约束，将运行时的 `ClassCastException` 提前到编译期报错，同时用一份代码适配多种类型。

## 2. 整体地图

泛型知识围绕四条主线展开：

| 主线 | 核心问题 | 关键概念 |
|---|---|---|
| 声明 | 在哪里声明类型参数？ | 类级泛型、方法级泛型 |
| 推断 | 使用时要不要写具体类型？ | 类型推断、钻石操作符 |
| 灵活性 | 不同泛型实例之间能否赋值？ | 不变性、通配符、PECS |
| 运行时 | 泛型在 JVM 中还存在吗？ | 类型擦除 |

学习依赖：先理解"声明"（类级 vs 方法级），再理解"推断"（连接声明和使用的桥梁），然后理解"不变性"带来的限制和"通配符"如何解决，最后理解"类型擦除"解释运行时行为。

## 3. 核心知识

### 3.1 类级泛型

**是什么**：在类名后用尖括号声明的类型参数，绑定到类的实例。

**如何工作**：类型参数在实例化时确定，此后该实例的字段和方法都使用这个具体类型。

```java
public class R<T> {           // 类级泛型 T
    private T data;            // 字段使用 T
    public T getData() {      // 实例方法使用 T
        return data;
    }
}

public class List<E> {        // 类级泛型 E
    private E[] elements;
    public boolean add(E e) { ... }
    public E get(int index) { ... }
}

public class Map<K, V> {      // 两个类级泛型 K 和 V
    public V put(K key, V value) { ... }
    public V get(Object key) { ... }
}
```

**绑定时机**：`new R<String>()` 实例化那一刻，T 被确定为 String。

**适用范围**：实例字段、实例方法、非静态内部类。静态方法**不能**使用类级泛型。

**命名惯例**：T（Type）、E（Element）、K（Key）、V（Value）。名字只是惯例，叫什么都行，不影响语义。

### 3.2 方法级泛型

**是什么**：在方法返回类型之前用尖括号声明的类型参数，只在该方法内部有效。

**如何工作**：`<T>` 出现在返回类型之前是声明，之后所有的 `T` 都在引用这个被声明的 T。

```java
public static <T> R<T> ok(T data) { ... }
//            ─┬─  ─┬─    ─┬─
//              │     │      └─ 参数类型：使用 T
//              │     └──────── 返回类型：使用 T
//              └────────────── 声明 T
```

**一个声明，多次引用**——和变量声明与使用的关系一样：

```java
int x;        // 声明
x = 10;       // 使用

public static <T> R<T> ok(T data)
//               ↑ 声明
//                  ↑ 使用    ↑ 使用
```

**绑定时机**：方法调用时确定。`R.ok("hello")` 调用时，编译器从实参推断 T=String。

**适用范围**：仅该方法签名和方法体内。方法返回后 T 就"消亡"。

### 3.3 为什么静态方法不能用类级泛型

核心原因：**类级泛型在实例化时才确定，而静态方法不依赖任何实例。**

```java
R<String>  r1 = new R<>(...);   // 实例1：T = String
R<Integer> r2 = new R<>(...);   // 实例2：T = Integer
```

同一个类 `R` 可以同时存在 T=String 和 T=Integer 的实例。静态方法 `R.ok()` 属于类本身，没有 `this`，不携带任何实例的类型信息。如果它试图使用"类上的 T"，编译器无法选择——该选 String 还是 Integer？

Java 编译器的规则：

```java
// 编译错误：静态方法不能引用类级泛型参数
public class R<T> {
    public static R<T> ok(T data) { ... }
    // error: non-static type T cannot be referenced from a static context
}

// 正确：静态方法自己声明一个新的 <T>
public class R<T> {
    public static <T> R<T> ok(T data) { ... }
}
```

### 3.4 "同名 T"不等于"同一个 T"

类级 `<T>` 和方法级 `<T>` 是完全独立的类型变量，只是恰好都叫 T。把方法级的泛型换个名字，语义完全不变：

```java
public class R<T> {                    // 类级 T
    public static <U> R<U> ok(U data) { // 方法级 U —— 和类级 T 毫无关系
        return new R<>(200, "success", data);
    }
}
```

之所以都写 T，纯粹是命名惯例（T / E / K / V），不代表关联。

### 3.5 类型推断与钻石操作符

**类型推断**：编译器从上下文（实参类型、目标类型、链式调用）自动推断类型参数，大多数时候不需要显式指定。

```java
// 方法级泛型推断
R<String> r = R.ok("hello");
// 编译器看到 "hello" 是 String → 推断 T = String
// → ok(String data) → 返回 R<String>

// 类级泛型推断（钻石操作符）
List<String> list = new ArrayList<>();
//            ↑ 指定 E=String    ↑ <> 编译器从左边推断
```

**需要显式指定的场景**：

| 场景 | 原因 | 写法 |
|---|---|---|
| 推断结果不符合预期 | 编译器取最具体类型，但你想要父类 | `R.<Object>ok("hello")` |
| 传入 null | null 无法推断类型 | `R.<String>ok(null)` |
| 链式调用推断链断裂 | 后续步骤依赖类型信息 | `R.<String>ok(null).getData()` |
| 公共 API 可读性 | 虽然能推断，但显式更清晰 | `R.<UserVO>ok(userVO)` |

### 3.6 裸类型

不带泛型参数的用法，是 JDK 1.5 之前的历史遗留：

```java
List list = new ArrayList();     // 没有指定 E
list.add("hello");
list.add(123);                   // 编译通过！什么都能塞
list.add(new User());

String s = (String) list.get(1); // 必须强转
// 运行时：ClassCastException —— 实际是 Integer
```

| | 带泛型 `List<String>` | 裸类型 `List` |
|---|---|---|
| 编译期检查 | 只能放 String | 什么都能放 |
| 取值 | 直接拿到 String | 必须强转 |
| 运行时安全 | 保证 | 可能 ClassCastException |
| 编译警告 | 无 | unchecked 警告 |

新代码永远不要用裸类型。

### 3.7 泛型不变性

泛型是**不变的**（invariant）：`List<String>` 不是 `List<Object>` 的子类。

```java
List<String> strList = new ArrayList<>();
List<Object> objList = new ArrayList<>();
objList = strList;   // 编译报错
```

原因：如果允许赋值，可以往"声明为 `List<Object>`"的引用中塞入非 String 类型，而实际存储的是 String 列表，取值时就会爆炸：

```java
// 假设允许赋值
List<Object> objList = strList;
objList.add(123);           // 往里面塞了 Integer
String s = strList.get(0);  // ClassCastException！
```

对比：Java 数组是**协变的**（covariant），`String[]` 是 `Object[]` 的子类。但数组在运行时检查元素类型（ArrayStoreException），泛型在编译期检查（编译错误）。泛型选择编译期检查更安全。

### 3.8 通配符与 PECS

通配符解决不变性带来的灵活性不足。

#### 无界通配符 `?`

```java
List<?> list = new ArrayList<String>();
list = new ArrayList<Integer>();
// 只知道是个 List，不关心元素类型
Object o = list.get(0);  // 能读（一定是 Object）
list.add("x");           // 不能写
```

#### 上界通配符 `? extends T`（只读）

```java
List<? extends Number> list = new ArrayList<Integer>();
list = new ArrayList<Double>();
list = new ArrayList<Number>();

Number n = list.get(0);   // 能读（一定是 Number 或子类）
list.add(123);            // 不能写（编译器不知道具体类型）
```

用途：只需要**读取**集合内容时使用。

#### 下界通配符 `? super T`（只写）

```java
List<? super Integer> list = new ArrayList<Integer>();
list = new ArrayList<Object>();

list.add(123);             // 能写（一定是 Integer 或父类容器，能安全放入）
Object o = list.get(0);    // 只能拿到 Object
```

用途：只需要**写入**集合时使用。

#### PECS 原则

**Producer Extends, Consumer Super**：

- 读数据（生产者）→ `? extends T`
- 写数据（消费者）→ `? super T`

```java
// 经典例子：把 src 的元素复制到 dest
public static <T> void copy(List<? super T> dest,    // dest 只写 → super
                            List<? extends T> src) {  // src 只读 → extends
    for (int i = 0; i < src.size(); i++) {
        dest.set(i, src.get(i));
    }
}
```

通配符总览：

| 写法 | 能读 | 能写 | 典型场景 |
|---|---|---|---|
| `List<String>` | String | String | 普通使用 |
| `List<?>` | Object | 不能写 | 只关心"是个 List" |
| `List<? extends Number>` | Number | 不能写 | 只读，元素是 Number 子类 |
| `List<? super Integer>` | Object | Integer | 只写，容器能装 Integer |

### 3.9 类型擦除

Java 泛型在编译后会被**擦除**（type erasure）：类型参数 T 变成 Object（或上界），编译器在需要的地方自动插入 `checkcast` 指令保证类型安全。

```java
// 你写的代码
List<String> list = new ArrayList<>();
list.add("hello");
String s = list.get(0);

// 编译后（擦除后）
List list = new ArrayList();
list.add("hello");
String s = (String) list.get(0);  // 编译器插入 checkcast
```

后果：

- 运行时无法获取泛型类型信息（`list.getClass()` 返回 `ArrayList.class`，不是 `ArrayList<String>.class`）
- 不能 `new T()`、`new T[]`、`instanceof T`
- 不能创建泛型数组：`new List<String>[10]`（编译错误）
- 静态方法 `toArray(T[] a)` 需要传入数组而非直接创建，正是因为擦除导致方法内部无法知道 T 的具体类型

## 4. 贯穿示例：R&lt;T&gt; 统一响应类

```java
public class R<T> {                    // 类级泛型 T：绑定到实例

    private int code;
    private String msg;
    private T data;                    // 字段使用类级 T

    private R(int code, String msg, T data) {
        this.code = code;
        this.msg  = msg;
        this.data = data;
    }

    // 静态工厂方法：自己声明方法级泛型 &lt;T&gt;
    public static &lt;T&gt; R&lt;T&gt; ok(T data) {
        return new R&lt;&gt;(200, "success", data);
    }

    public static &lt;T&gt; R&lt;T&gt; fail(int code, String msg) {
        return new R&lt;&gt;(code, msg, null);
    }
}
```

**两个 T 的角色对比**：

| | 类级 `T`（`class R<T>`） | 方法级 `T`（`static <T> ...`） |
|---|---|---|
| 绑定时机 | `new R<String>()` 实例化时 | `R.ok("hello")` 调用时 |
| 生命周期 | 绑在整个实例上 | 只在那一次方法调用中有效 |
| 谁能用 | 实例字段、实例方法 | 仅该方法签名和方法体内 |
| 静态方法能用吗 | 不能 | 必须自己声明 |
| 相互关系 | 独立 | 独立 |

**调用时的类型推断过程**：

```java
R<String> r = R.ok("hello");
```

1. 编译器看到 `R.ok("hello")`，实参 `"hello"` 类型是 `String`
2. 推断方法级 `<T>` → `T = String`
3. 方法签名展开为 `static R<String> ok(String data)`
4. 返回 `R<String>`，赋给左边
5. 整个过程完全不涉及类级 `T`

**去掉方法级 `<T>` 的危险**：

```java
// 危险写法：去掉 <T>，返回裸类型 R
public static R ok(Object data) { ... }

R<String> r = R.ok(123);  // 编译通过但类型撒谎
String s = r.getData();    // ClassCastException 运行时爆炸
```

而正确写法在编译期就能拦住：

```java
R<String> r = R.ok(123);  // 编译错误：ok(Integer) 无法赋给 R<String>
```

## 5. 集合中的泛型：List、Map、Set

### 5.1 JDK 源码中的泛型声明

```java
public interface List<E> extends Collection<E> {       // 类级泛型 E
    boolean add(E e);                                  // 使用 E
    E get(int index);                                  // 使用 E
    <T> T[] toArray(T[] a);                            // 方法级泛型 T —— 和类级 E 独立
    static <E> List<E> of(E... elements) { ... }       // 方法级泛型 E
}

public interface Map<K, V> {                           // 两个类级泛型
    V put(K key, V value);
    V get(Object key);                                 // 参数是 Object 不是 K
    Set<K> keySet();
    Collection<V> values();
    Set<Map.Entry<K, V>> entrySet();                   // 嵌套泛型
}

public interface Set<E> extends Collection<E> {
    boolean add(E e);
    boolean addAll(Collection<? extends E> c);         // 通配符
}
```

### 5.2 List 的方法级泛型：toArray

```java
// JDK 签名
<T> T[] toArray(T[] a);
//  ↑ 声明     ↑ 使用
```

这个 `<T>` 和 `List<E>` 的 `E` 完全独立。因为 `toArray` 需要返回具体类型的数组，而 E 在运行时已擦除为 Object，必须通过方法级泛型让调用者告诉它"我要什么类型的数组"：

```java
List<String> list = new ArrayList<>();
list.add("a"); list.add("b");

String[] arr = list.toArray(new String[0]);    // T 推断为 String
Object[] objArr = list.toArray(new Object[0]); // T 推断为 Object
```

### 5.3 List.of 的方法级泛型

```java
// JDK 签名
static <E> List<E> of(E... elements) { ... }
```

```java
List<String>  strs = List.of("a", "b", "c");    // E 推断为 String
List<Integer> nums = List.of(1, 2, 3);          // E 推断为 Integer
```

### 5.4 Map 的嵌套泛型

```java
Map<String, List<User>> map = new HashMap<>();
//     ↑      ↑     ↑
//     K      │     │ V = List<User>
//            │ List 的 E = User
//            └ 嵌套泛型

map.put("admins", Arrays.asList(
    new User("admin1"),
    new User("admin2")
));

List<User> admins = map.get("admins");

// entrySet 的返回类型
Set<Map.Entry<K, V>> entrySet();
//  ↑      ↑         ↑
//  Set的E  Map内部类  Map的两个泛型

for (Map.Entry<String, List<User>> entry : map.entrySet()) {
    String key = entry.getKey();          // String
    List<User> value = entry.getValue();  // List<User>
}
```

### 5.5 集合泛型对比

| | `List<E>` | `Map<K,V>` | `Set<E>` |
|---|---|---|---|
| 类级泛型 | E（元素类型） | K, V（键、值类型） | E（元素类型） |
| 方法级泛型 | `toArray(T[])`, `of(E...)` | 无典型 | 继承自 Collection |
| 通配符使用 | `List<? extends Number>` | `Map<?, ?>` | `Set<? extends E>` |

## 6. 易混概念

| 概念 A | 概念 B | 核心区别 | 选择依据 |
|---|---|---|---|
| 类级泛型 `T` | 方法级泛型 `T` | 绑定时机不同（实例化 vs 调用），作用域不同 | 静态方法必须用方法级；实例方法可用类级 |
| `? extends T` | `? super T` | extends 只读，super 只写 | 读用 extends，写用 super（PECS） |
| 裸类型 `List` | 泛型 `List<String>` | 裸类型无编译期检查，运行时可能爆炸 | 永远用泛型 |
| 数组协变 | 泛型不变 | 数组 `String[]` 是 `Object[]` 子类；泛型 `List<String>` 不是 `List<Object>` 子类 | 泛型更安全（编译期检查） |
| 类型参数 `T` | 通配符 `?` | T 是声明一个可使用的类型变量；? 是引用一个未知类型 | 需要多次引用同一类型用 T；只接受任意类型用 ? |

## 7. 常见误区与边界

1. **误区**：类级 T 和方法级 T 是同一个类型变量。
   **正确理解**：它们是完全独立的类型变量，只是恰好同名。换名后语义不变。

2. **误区**：静态方法可以使用类上的泛型参数。
   **正确理解**：静态方法没有实例，无法获取实例携带的类型信息。必须自己声明方法级泛型。

3. **误区**：`List<String>` 是 `List<Object>` 的子类。
   **正确理解**：泛型是不变的，两者没有父子关系。这是为了保证类型安全。

4. **误区**：泛型类型信息在运行时仍然存在。
   **正确理解**：类型擦除后 T 变成 Object，运行时无法获取泛型类型信息。`new T()`、`instanceof T` 都不允许。

5. **误区**：使用泛型时必须显式指定类型参数。
   **正确理解**：大多数时候编译器会自动推断。只有在推断不出或需要精确控制时才显式指定。

6. **边界**：`Map.get(Object key)` 的参数是 `Object` 而不是 `K`。
   **原因**：这是有意设计——允许传入任何对象作为 key 查找，找不到返回 null 即可。如果参数是 K，则只能传入声明类型的 key，灵活性不足。

## 8. 速查

| 目标 | 做法 | 关键条件 |
|---|---|---|
| 声明类级泛型 | `class R<T>` | T 绑定到实例 |
| 声明方法级泛型 | `static <T> R<T> ok(T data)` | T 绑定到方法调用 |
| 使用泛型不写类型 | 依赖编译器推断 | 实参类型可推断时 |
| 钻石操作符 | `new ArrayList<>()` | 编译器从左边推断 |
| 只读集合 | `List<? extends T>` | PECS: Producer Extends |
| 只写集合 | `List<? super T>` | PECS: Consumer Super |
| 避免裸类型 | 永远带泛型参数 | 新代码不要用裸类型 |
| 运行时获取泛型类型 | 不可能 | 类型擦除 |

## 9. 记忆主线

1. **类级泛型跟实例走，方法级泛型跟调用走**——静态方法必须自声明。
2. **同名只是命名惯例**——类级 T 和方法级 T 是独立变量，换名语义不变。
3. **一个声明，多次引用**——`<T>` 是声明，`R<T>` 和 `T data` 是使用。
4. **编译器推断，通常不用写**——钻石操作符 `<>` 和方法调用推断。
5. **泛型不变**——`List<String>` 不是 `List<Object>` 的子类。
6. **PECS**——读用 extends，写用 super。
7. **类型擦除**——运行时 T 变成 Object，编译器插入 checkcast。

## 10. 自测问题

1. 为什么静态方法不能使用类级泛型参数？请从实例化时机和 `this` 的角度解释。
2. `public static <T> R<T> ok(T data)` 中出现了三个 T，它们分别是什么角色？
3. 以下代码能否编译通过？为什么？
   ```java
   List<Object> list = new ArrayList<String>();
   ```
4. PECS 原则中，"Producer" 和 "Consumer" 分别指什么？请用一个 `copy` 方法说明。
5. 类型擦除会带来哪些限制？列举至少三个。
6. `Map.get(Object key)` 的参数为什么是 `Object` 而不是 `K`？
