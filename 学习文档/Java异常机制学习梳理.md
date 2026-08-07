# Java 异常机制学习梳理

> 本文整理 Java 异常体系、自定义异常和 Spring Boot 统一异常处理的核心概念，适合有一定 Java 基础、想系统理解异常机制如何工作的读者。

## 1. 一句话定位

Java 异常机制是一套**带类型、会传播、能被分层接住的控制流机制**，用于表达"程序进入了不该继续正常执行的状态"，并通过 try-catch 让程序在异常发生时转入备胎路径继续运行，而不是直接崩溃。

## 2. 整体地图

```text
异常产生（JVM 自动抛 / 手动 throw）
  -> 当前方法立即中断
  -> 沿调用栈向上传播
  -> 被匹配类型的 catch 接住
  -> 处理后继续执行 try-catch 之后的代码
  -> 若无人接住，最终由 JVM 兜底（打印堆栈、终止线程）
```

异常机制贯穿三个层面：

- **语言层**：异常体系、throw/throws/try-catch 关键字
- **设计层**：自定义异常、异常分层、错误码
- **框架层**：Spring Boot 的 `@RestControllerAdvice` + `@ExceptionHandler` 统一异常处理

## 3. 必要前置知识

- Java 方法调用栈的基本概念（方法 A 调用方法 B，B 执行完返回 A）
- 面向对象的继承关系（子类、父类）

## 4. 核心知识

### 4.1 异常体系与分类

Java 所有异常的根类是 `Throwable`，它有两个分支：

```text
Throwable
  ├── Error                    系统级错误，不要 catch（如 OutOfMemoryError）
  └── Exception
       ├── RuntimeException     非受检异常（Unchecked）
       │    ├── NullPointerException
       │    ├── IllegalArgumentException
       │    ├── IndexOutOfBoundsException
       │    └── ClassCastException
       └── 其他 Exception      受检异常（Checked）
            ├── IOException
            ├── SQLException
            └── ClassNotFoundException
```

两种分类的区别：

| 类型 | 特点 | 何时用 |
|---|---|---|
| 受检异常 Checked | 编译器强制处理（try-catch 或 throws） | 外部不可控的异常，如 IO、网络、数据库连接失败 |
| 非受检异常 Unchecked | 编译器不强制处理 | 编程错误，如空指针、参数非法、业务逻辑错误 |

```java
// 受检异常：必须处理，否则编译不过
public void readFile() throws IOException { ... }

// 非受检异常：可不处理
public void checkId(Long id) {
    if (id == null) throw new IllegalArgumentException("id 不能为空");
}
```

### 4.2 异常的本质：控制流机制

异常不只是"判断后抛一个信息"，而是一套控制流机制。它有三个关键特征：

1. **带类型**：异常是一个对象，有具体类型，catch 时按类型精确匹配分流
2. **会传播**：throw 后当前方法立即中断，异常沿调用栈向上找 catch
3. **能被分层接住**：可以在不同层级 catch，处理完继续执行后续代码

异常对象携带的信息：

| 组成 | 作用 |
|---|---|
| 类型（类名） | 让 catch 方按类型精确接住 |
| message | 文字描述 |
| cause | 原始异常链（可选） |
| stack trace | 堆栈轨迹，定位哪一行抛出 |

异常的触发方式有两种：

```java
// 1. JVM 自动抛（不是你判断的）
String s = null;
s.length();   // 抛 NullPointerException
int[] arr = new int[3];
arr[5];       // 抛 ArrayIndexOutOfBoundsException

// 2. 手动 throw（判断条件后抛）
if (user == null) {
    throw new BizException("用户不存在");
}
```

### 4.3 异常传播与 try-catch 的作用

throw 一旦发生，当前方法立即中断，异常沿调用栈向上传播，直到被某个 catch 接住：

```text
方法 A 调用 方法 B 调用 方法 C
                              ↓ C 里 throw
                           C 中断
                        B 中断（除非 catch）
                     A 中断（除非 catch）
                  直到 JVM 默认处理（打印堆栈、终止线程）
```

try-catch 的核心作用：**异常发生时不让整个进程崩溃，而是转入另一条处理路径继续执行。**

```java
public void reviewCase(Long caseId) {
    log.info("1. 开始复审");              // 执行

    try {
        log.info("2. 查案件");             // 执行
        Case c = caseMapper.selectById(caseId);

        if (c == null) {
            throw new BizException("案件不存在");  // ← 抛出点
        }

        log.info("3. 案件存在，继续复审");  // ❌ 不执行！方法内中断
        doReview(c);

    } catch (BizException e) {
        log.warn("4. 接住异常：{}", e.getMessage());  // ✅ 走这条"异常路径"
    }

    log.info("5. try-catch 之后，继续往下走");  // ✅ 执行！进程没崩
}
```

执行轨迹：`1 → 2 → 抛出 → 4 → 5`

两条路径在 try-catch 之后"合流"，继续往下执行。

如果异常一直没人 catch，最终冒到 JVM 顶层，当前线程终止（如果是 main 线程，整个程序退出）。

### 4.4 五个关键字

#### throw —— 主动抛出

```java
if (user == null) {
    throw new IllegalArgumentException("用户不存在");
}
```

#### throws —— 声明抛出（方法签名上）

```java
public User findById(Long id) throws UserNotFoundException {
    ...
}
```

#### try-catch-finally

```java
FileInputStream fis = null;
try {
    fis = new FileInputStream("a.txt");
    // 读数据
} catch (FileNotFoundException e) {
    log.error("文件找不到", e);
} catch (IOException e) {
    log.error("读取失败", e);
} finally {
    // 无论是否异常都会执行（用于释放资源）
    if (fis != null) {
        try { fis.close(); } catch (IOException ignored) {}
    }
}
```

JDK 7+ 多异常合并：

```java
} catch (IOException | SQLException e) {
    log.error("失败", e);
}
```

#### try-with-resources（Java 7+，推荐）

实现了 `AutoCloseable` 的资源会自动关闭，比 finally 更简洁安全：

```java
try (FileInputStream fis = new FileInputStream("a.txt");
     BufferedReader br = new BufferedReader(new InputStreamReader(fis))) {
    String line = br.readLine();
} catch (IOException e) {
    log.error("读取失败", e);
}
// fis 和 br 自动 close，无需 finally
```

### 4.5 自定义异常

#### 为什么需要自定义异常

JDK 自带的异常只能表达"技术性错误"，表达不了业务语义。自定义异常的好处：

1. **按类型精确 catch**——不同业务错误走不同处理路径
2. **携带业务错误码**——前端能根据 code 做不同提示
3. **代码自解释**——`throw new UserNotFoundException(id)` 一眼看出含义
4. **统一异常处理器**能按类型分流处理

#### 继承谁

业务异常推荐继承 `RuntimeException`（非受检异常），原因：

- 不强制调用方 try-catch 或 throws，避免污染调用链
- Spring 的 `@Transactional` 默认只回滚 `RuntimeException`

#### 完整示例

```java
// 1. 基础业务异常
public class BizException extends RuntimeException {
    private final int code;
    private final String message;

    public BizException(int code, String message) {
        super(message);              // 必须传给父类，否则堆栈里看不到消息
        this.code = code;
        this.message = message;
    }

    // 带原始异常链的构造器
    public BizException(int code, String message, Throwable cause) {
        super(message, cause);       // 把 cause 传给父类
        this.code = code;
        this.message = message;
    }

    public int getCode() { return code; }
    @Override
    public String getMessage() { return message; }
}

// 2. 具体业务异常（继承基础异常）
public class UserNotFoundException extends BizException {
    public UserNotFoundException(Long id) {
        super(40401, "用户不存在, id=" + id);   // 带上下文
    }
}

public class InsufficientBalanceException extends BizException {
    public InsufficientBalanceException(long current, long need) {
        super(40902, "余额不足: 当前=" + current + ", 需要=" + need);
    }
}
```

#### 关键点

**构造器调用 `super(message)`**：不调的话 `e.getMessage()` 会返回 null（父类 Throwable 的 message 默认是 null）。

**异常对象携带上下文**：异常消息里带上具体数值，比单纯抛"余额不足"有用得多。

**catch 顺序：子类在前，父类在后**：

```java
try { ... }
catch (UserNotFoundException e) { ... }   // 子类先
catch (BizException e) { ... }            // 父类兜底
```

反过来的话编译报错——父类先接住，子类分支永远走不到。

**保留原始异常链**：catch 后想换一种异常抛出时，要把原异常传进去：

```java
try {
    userMapper.selectById(id);
} catch (SQLException e) {
    throw new BizException(50001, "查询用户失败", e);  // ← 保留原始异常
}
```

#### 三种变体

| 变体 | 适用场景 | 示例 |
|---|---|---|
| 最简版（只要 message） | 小项目，不需要错误码 | `new BizException("用户不存在")` |
| 带错误码（推荐） | 一般项目，前端根据 code 显示不同提示 | `new BizException(40401, "用户不存在")` |
| 枚举错误码 | 大型项目，错误码集中管理 | `new BizException(BizCode.USER_NOT_FOUND)` |

枚举错误码示例：

```java
public enum BizCode {
    USER_NOT_FOUND(40401, "用户不存在"),
    INSUFFICIENT_BALANCE(40902, "余额不足");

    private final int code;
    private final String message;
    // 构造器、getter...
}

// 用法
throw new BizException(BizCode.USER_NOT_FOUND);
```

### 4.6 Spring Boot 统一异常处理

#### 解决的问题

没有全局处理器时，每个 Controller 方法都要写一堆重复的 try-catch：

```java
@PostMapping("/cases")
public R<Long> createCase(@Valid @RequestBody CaseCreateDTO dto) {
    try {
        Long id = caseService.create(dto);
        return R.ok(id);
    } catch (CaseAlreadyReviewedException e) {
        return R.fail(40901, e.getMessage());
    } catch (UserNotFoundException e) {
        return R.fail(40401, e.getMessage());
    } catch (Exception e) {
        return R.fail(500, "服务器错误");
    }
    // 每个 Controller 方法都要重复这一坨
}
```

有了全局处理器后，Controller 干净：

```java
@PostMapping("/cases")
public R<Long> createCase(@Valid @RequestBody CaseCreateDTO dto) {
    Long id = caseService.create(dto);   // 抛异常也无所谓
    return R.ok(id);
}
```

#### 底层机制：Spring MVC 异常解析链

Spring MVC 的核心控制器 `DispatcherServlet` 在调用 Controller 方法时，外层包了一个 try-catch：

```java
// DispatcherServlet 源码（简化版）
protected void doDispatch(HttpServletRequest req, HttpServletResponse resp) {
    try {
        ModelAndView mv = handlerAdapter.handle(req, resp, handler);
        // ↑ 如果 Controller 或 Service 抛异常，会从这里冒出来
    } catch (Exception e) {
        ModelAndView mv = processHandlerException(req, resp, handler, e);
        // ↑ 异常不会让请求崩掉，而是被转交给解析器
    }
}
```

`processHandlerException` 按顺序调用一组 `HandlerExceptionResolver`：

```text
异常抛出
  ↓
DispatcherServlet 的 try-catch 接住
  ↓
依次询问解析器：
  1. ExceptionHandlerExceptionResolver   ← @ExceptionHandler 走这里
  2. ResponseStatusExceptionResolver       ← @ResponseStatus 走这里
  3. DefaultHandlerExceptionResolver       ← Spring 默认的（如 405、415）
  ↓
谁处理了，就用它的返回值作为 HTTP 响应
```

#### @ExceptionHandler 的匹配过程

当异常冒到 `ExceptionHandlerExceptionResolver`，它会：

1. 先在当前 Controller 类里找 `@ExceptionHandler` 方法
2. 再在所有 `@ControllerAdvice` / `@RestControllerAdvice` Bean 里找
3. 按异常类型匹配，**子类优先（最精确的优先）**
4. 找到就调用，找不到就用 Spring 默认处理

```text
抛出 UserNotFoundException
  ↓
查找 @ExceptionHandler(UserNotFoundException.class)  → 找到？用它
  ↓ 没找到
查找 @ExceptionHandler(BizException.class)          → 找到？用它（父类）
  ↓ 没找到
查找 @ExceptionHandler(Exception.class)             → 兜底
```

#### 完整调用链

```text
HTTP 请求: POST /cases
  ↓
DispatcherServlet.doDispatch()
  ↓
  try:
    CaseController.createCase(dto)        ← Controller 不 catch
      └─ caseService.create(dto)
           └─ caseMapper.insert(...)
                └─ 抛出 BizException!      ← 异常在这里诞生
  catch (Exception e):                    ← DispatcherServlet 接住
    processHandlerException(e)
      └─ ExceptionHandlerExceptionResolver
           └─ 扫描所有 @RestControllerAdvice
                └─ GlobalExceptionHandler
                     └─ @ExceptionHandler(BizException.class) 匹配成功！
                          ↓
                    调用 handleBiz(e)
                          ↓
                    return R.fail(...)
                          ↓
                    序列化为 JSON 写入响应
  ↓
HTTP 响应: {"code":40401,"msg":"案件不存在","data":null}
```

#### 完整代码示例

统一响应包装：

```java
@Data
public class R<T> {
    private int code;
    private String msg;
    private T data;

    public static <T> R<T> ok(T data) {
        R<T> r = new R<>();
        r.code = 200; r.msg = "success"; r.data = data;
        return r;
    }

    public static <T> R<T> fail(int code, String msg) {
        R<T> r = new R<>();
        r.code = code; r.msg = msg; r.data = null;
        return r;
    }
}
```

全局异常处理器：

```java
@RestControllerAdvice   // = @ControllerAdvice + @ResponseBody
@Slf4j
public class GlobalExceptionHandler {

    // 1. 业务异常
    @ExceptionHandler(BizException.class)
    public R<Void> handleBiz(BizException e) {
        log.warn("业务异常 code={}, msg={}", e.getCode(), e.getMessage());
        return R.fail(e.getCode(), e.getMessage());
    }

    // 2. 参数校验异常（@Valid 触发）
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public R<Void> handleValid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return R.fail(400, msg);
    }

    // 3. 兜底：所有未捕获的异常
    @ExceptionHandler(Exception.class)
    public R<Void> handleAll(Exception e) {
        log.error("未知异常", e);
        return R.fail(500, "服务器内部错误");
    }
}
```

Controller（清爽版）：

```java
@RestController
@RequestMapping("/cases")
public class CaseController {

    @Autowired
    private CaseService caseService;

    @PostMapping
    public R<Long> createCase(@Valid @RequestBody CaseCreateDTO dto) {
        // 没有任何 try-catch！
        Long id = caseService.create(dto);
        return R.ok(id);
    }
}
```

Service（正常抛异常就行）：

```java
@Service
public class CaseService {

    @Autowired
    private CaseMapper caseMapper;

    public Long create(CaseCreateDTO dto) {
        Case exist = caseMapper.findByTitle(dto.getTitle());
        if (exist != null) {
            throw new BizException(40901, "案件标题已存在");  // ← 抛就完事
        }
        Case c = new Case();
        c.setTitle(dto.getTitle());
        caseMapper.insert(c);
        return c.getId();
    }
}
```

#### 关键细节

**`@RestControllerAdvice` = `@ControllerAdvice` + `@ResponseBody`**：

- `@ControllerAdvice`：声明这是一个全局组件，能拦截所有 Controller 的异常
- `@ResponseBody`：返回值直接作为响应体（被 Jackson 序列化）

**只能拦截 Controller 调用链上的异常**：

```java
// ✅ 能拦截：Service 抛的异常冒到 Controller 再到 DispatcherServlet
@PostMapping
public R<Void> create() {
    service.doSomething();  // 抛 BizException → 能被全局处理器接住
}

// ❌ 不能拦截：Filter / Interceptor 里的异常
// 因为这些在 DispatcherServlet 之前执行，不走 @ExceptionHandler
```

Filter 里的异常得用 Filter 自己的 `response.getWriter().write(...)` 返回，全局处理器接不住。

**`@Valid` 的异常也是这么接住的**：`@Valid` 校验失败时，Spring 抛 `MethodArgumentNotValidException`，同样冒到 DispatcherServlet 被全局处理器接住。

## 5. 贯穿示例

以"用户转账"为例，串起异常的产生、传播、自定义和统一处理：

```java
// === 定义异常 ===
public class BizException extends RuntimeException {
    private final int code;
    public BizException(int code, String msg) { super(msg); this.code = code; }
    public int getCode() { return code; }
}

public class UserNotFoundException extends BizException {
    public UserNotFoundException(Long id) { super(40401, "用户不存在, id=" + id); }
}

public class InsufficientBalanceException extends BizException {
    public InsufficientBalanceException(long cur, long need) {
        super(40902, "余额不足: 当前=" + cur + ", 需要=" + need);
    }
}

// === Service 层：抛异常 ===
@Service
public class TransferService {
    public void transfer(Long fromId, Long toId, long amount) {
        User from = findById(fromId);   // 可能抛 UserNotFoundException
        User to = findById(toId);       // 可能抛 UserNotFoundException
        if (from.getBalance() < amount) {
            throw new InsufficientBalanceException(from.getBalance(), amount);
        }
        // 转账逻辑...
    }

    public User findById(Long id) {
        User user = mockQuery(id);
        if (user == null) throw new UserNotFoundException(id);
        return user;
    }

    private User mockQuery(Long id) {
        return id == 1L ? new User(1L, 1000) : null;
    }
}

// === Controller 层：不写 try-catch ===
@RestController
public class TransferController {
    @Autowired private TransferService service;

    @PostMapping("/transfer")
    public R<Void> transfer(@RequestBody TransferDTO dto) {
        service.transfer(dto.getFrom(), dto.getTo(), dto.getAmount());
        return R.ok(null);
    }
}

// === 全局处理器：统一接住 ===
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    @ExceptionHandler(BizException.class)
    public R<Void> handleBiz(BizException e) {
        log.warn("业务异常: code={}, msg={}", e.getCode(), e.getMessage());
        return R.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public R<Void> handleAll(Exception e) {
        log.error("未知异常", e);
        return R.fail(500, "服务器内部错误");
    }
}
```

调用 `POST /transfer` 传入 `from=1, to=999, amount=100` 时：

```text
TransferController.transfer()
  └─ TransferService.transfer(1, 999, 100)
       └─ findById(1)  → 成功，返回 User(1, 1000)
       └─ findById(999) → 抛 UserNotFoundException
            ↑ transfer 没 catch，继续向上传
  ↑ Controller 没 catch，继续向上传
  ↑ DispatcherServlet 接住
  ↑ GlobalExceptionHandler.handleBiz() 匹配
  ↑ 返回 R.fail(40401, "用户不存在, id=999")
  ↑ 序列化为 JSON
```

HTTP 响应：`{"code":40401,"msg":"用户不存在, id=999","data":null}`

## 6. 易混概念

| 概念 A | 概念 B | 核心区别 | 选择依据 |
|---|---|---|---|
| `throw` | `throws` | throw 是语句，主动抛出异常对象；throws 是方法签名声明，告诉调用方可能抛出 | throw 在方法体内用；throws 在方法参数列表后用 |
| 受检异常 | 非受检异常 | 编译器是否强制处理 | 外部不可控用受检；编程错误/业务错误用非受检 |
| `Error` | `Exception` | Error 是系统级错误（OOM 等），不该 catch；Exception 是程序可处理的 | 业务代码只处理 Exception |
| 异常 | 错误码返回值 | 异常会传播、强制处理；错误码可能被忽略 | 异常情况用异常；预期内的正常分支用返回值 |
| `try-with-resources` | `try-finally` | 前者自动关闭 AutoCloseable 资源；后者需手动关闭 | 有资源要关闭时优先用前者 |
| `@ControllerAdvice` | `@RestControllerAdvice` | 后者 = 前者 + @ResponseBody，返回值直接作为响应体 | REST API 用后者 |

## 7. 常见误区与边界

1. **误区**：异常就是"判断后抛一个信息"
   **正确理解**：异常是带类型、会传播、能被分层接住的控制流机制。"判断后抛"只是其中一种触发方式，JVM 也会自动抛。

2. **误区**：try-catch 让程序"不中断"
   **正确理解**：try-catch 让**进程**不崩溃，但**当前方法会中断**（throw 之后的代码不执行）。catch 处理完后，从 try-catch 块**之后**的代码继续执行。

3. **误区**：吞异常没关系
   **正确理解**：`catch (Exception e) {}` 是大忌，至少记日志。吞掉的异常会让问题无法定位。

4. **误区**：用异常控制流程
   **正确理解**：异常性能差且可读性差。预期内的分支（如查询为空）用返回值/Optional，不要用异常。

5. **误区**：catch 一把梭 `catch (Exception e)`
   **正确理解**：把 NPE、IO、业务异常全混在一起，无法定位。应精确捕获具体类型。

6. **误区**：自定义异常继承 `Exception`
   **正确理解**：业务异常应继承 `RuntimeException`，避免强制 throws 污染调用链，且 Spring 事务默认只回滚 RuntimeException。

7. **误区**：全局异常处理器能拦截所有异常
   **正确理解**：`@ExceptionHandler` 只能拦截 Controller 调用链上的异常。Filter / Interceptor 里的异常在 DispatcherServlet 之前执行，接不住。

8. **边界**：catch 顺序必须子类在前、父类在后，否则编译报错。

9. **边界**：换抛异常时要保留原始异常链（传 cause），否则堆栈丢失。

## 8. 速查

| 想完成的目标 | 使用的概念或操作 | 关键条件 |
|---|---|---|
| 主动抛出业务异常 | `throw new BizException(code, msg)` | 继承 RuntimeException |
| 声明方法可能抛异常 | `throws XxxException` 在方法签名 | 受检异常必须声明 |
| 自动关闭资源 | `try-with-resources` | 资源需实现 AutoCloseable |
| 按类型分流处理异常 | 多个 catch 块，子类在前 | 父类兜底放最后 |
| 保留原始异常链 | `new BizException(code, msg, e)` | e 作为 cause 传入 |
| 统一处理所有 Controller 异常 | `@RestControllerAdvice` + `@ExceptionHandler` | 只对 Controller 调用链有效 |
| 兜底未知异常 | `@ExceptionHandler(Exception.class)` | 放在处理器最后 |
| 参数校验异常处理 | `@ExceptionHandler(MethodArgumentNotValidException.class)` | 由 @Valid 触发 |
| 自定义异常携带错误码 | 在异常类里加 `int code` 字段 | 构造器调用 super(message) |

## 9. 最终记忆主线

```text
异常产生（throw / JVM 自动）
  -> 当前方法中断，沿调用栈传播
  -> try-catch 接住 → 走异常路径 → 之后继续执行
  -> 无人接住 → JVM 兜底，线程终止

自定义异常：继承 RuntimeException，带 code 和 message
Spring Boot：@RestControllerAdvice + @ExceptionHandler 统一接住
  ← 底层是 DispatcherServlet 的外层 try-catch + 异常解析器链
  ← 只对 Controller 调用链有效，Filter/Interceptor 接不住
```

### 必记要点

1. 异常 = 带类型、会传播、能被分层接住的控制流机制，不只是"抛信息"
2. try-catch 让进程不崩，但当前方法会中断；catch 后从 try-catch 块之后继续执行
3. 业务异常继承 RuntimeException（非受检），不污染调用链，Spring 事务能回滚
4. 自定义异常构造器必须调 super(message)，否则 getMessage() 返回 null
5. catch 顺序：子类在前，父类在后
6. 换抛异常时保留 cause，避免堆栈丢失
7. @RestControllerAdvice + @ExceptionHandler 统一处理，Controller 不用写 try-catch
8. 全局处理器底层靠 DispatcherServlet 的外层 try-catch，只对 Controller 调用链有效

## 10. 自测问题

1. 抛出异常后，当前方法里 throw 之后的代码会执行吗？try-catch 块之后的代码会执行吗？
2. 受检异常和非受检异常的区别是什么？业务异常应该继承哪个？为什么？
3. 自定义异常的构造器如果不调用 `super(message)`，会有什么后果？
4. catch 块的顺序为什么必须子类在前、父类在后？
5. 在 catch 里换抛另一种异常时，如何保留原始异常的堆栈信息？
6. Spring Boot 的 `@RestControllerAdvice` 为什么能让 Controller 不写 try-catch？底层机制是什么？
7. `@ExceptionHandler` 的匹配过程是怎样的？如果同时有 `@ExceptionHandler(UserNotFoundException.class)` 和 `@ExceptionHandler(BizException.class)`，抛出 UserNotFoundException 会走哪个？
8. Filter 里抛出的异常能被 `@ExceptionHandler` 接住吗？为什么？如果不能，该怎么处理？
9. `try-with-resources` 相比 `try-finally` 有什么优势？它要求资源实现什么接口？
10. 以下代码有什么问题？`try { ... } catch (Exception e) { }`
