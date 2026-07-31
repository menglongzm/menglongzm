# Spring Boot 约定配置与启动机制学习梳理

> 本文整理“约定优于配置、Spring Boot 启动过程、请求如何到达 Controller、Maven 与 Boot 边界、自动配置与 Bean 生命周期、企业多模块项目中的 Spring Boot 用法”等可迁移知识。适合已了解 Java 与基础 Web 概念、正在学习 Spring Boot 的读者。正文以通用机制为主，项目示例仅作说明，不代表所有系统都应照搬。

## 1. 一句话定位

Spring Boot Web 服务本质上是：在一个长期运行的 JVM 进程中，先按约定和配置装配好 Bean、路由与内嵌 Web 服务器，再持续接收 HTTP 请求，并通过 Spring MVC 将请求分发到对应 Controller 方法。

它要解决的核心问题是：

1. 如何用尽量少的配置把业务代码装进可运行的 Web 服务；
2. 启动时到底准备了什么；
3. 请求真正进入 Controller 之前经过了哪些环节；
4. Maven、Spring Framework、Spring Boot 各自负责哪一段。

## 2. 整体地图

```text
Maven 声明依赖并打包
  -> classpath 中出现 Starter / 框架 JAR
  -> Spring Boot 自动配置与组件扫描
  -> 注册 BeanDefinition
  -> 创建 Bean、完成依赖注入与 AOP 代理
  -> 启动内嵌 Web 服务器并绑定端口
  -> 建立 URL 到 Controller 方法的路由表
  -> 服务就绪

请求到来
  -> 操作系统网络栈 / 内嵌服务器
  -> Filter 链
  -> DispatcherServlet
  -> HandlerMapping / HandlerAdapter
  -> 参数解析与校验
  -> Controller
  -> Service / 数据访问 / 外部调用
  -> 返回值序列化
  -> HTTP 响应
```

可以把整套知识分成四层：

| 层级 | 关注点 | 典型问题 |
|---|---|---|
| 构建层 | Maven 如何把依赖和模块装进可运行包 | 为什么 `pom` 里写 Starter |
| 约定层 | 为什么少写配置也能跑 | 为什么放对包名就不用写扫描配置 |
| 启动层 | 服务启动时准备了什么 | Bean、路由、端口何时就绪 |
| 请求层 | 一次 HTTP 请求如何处理 | 请求为何不是直接落到 Controller |

## 3. 必要前置知识

- **JVM 进程**：`java -jar` 启动后得到一个长期运行的 Java 进程。
- **classpath**：JVM 能加载到的类和资源集合；Maven 依赖最终进入这里。
- **Bean**：由 Spring 容器创建、注入和管理的对象。
- **依赖注入**：对象不自己 `new` 依赖，而由容器注入。
- **HTTP 基本概念**：方法、路径、请求头、请求体、状态码、响应体。
- **Servlet 模型**：请求先进入 Web 容器，再进入 Servlet/Filter 处理链。

## 4. 核心知识

### 4.1 约定优于配置

- **是什么**：框架先规定一套通用目录、命名、依赖和默认行为；代码遵守约定时，框架自动完成大量装配；只有偏离默认或环境相关的内容才需要显式配置。
- **如何工作**：Spring Boot 通过启动类位置、包结构、注解、classpath 依赖、标准配置文件名和属性名推断应装配什么。
- **何时使用**：稳定、通用、可推断的选择应尽量用约定；环境差异、业务决策、有歧义的选择应显式配置。
- **边界或易错点**：约定不等于零配置；数据库地址、密钥、环境参数、事务边界、业务规则都不能靠框架猜。也不要把“Maven 里写了依赖”本身叫做 Spring Boot 约定——那只是把 JAR 放进 classpath。

判断标准：

```text
稳定且通用 -> 约定
变化且重要 -> 配置
独特业务决策 -> 代码或领域模型
```

适合约定的例子：

- 启动类位于根包，业务代码放在其子包；
- Controller 使用 `@RestController`，Service 使用 `@Service`；
- 配置文件命名为 `application.yml` / `application-{profile}.yml`；
- 引入 `spring-boot-starter-web` 后按 Web 应用默认装配；
- Java 驼峰字段与数据库下划线字段按规则自动映射。

必须显式配置的例子：

- 数据库 URL、用户名、密码；
- 注册中心/配置中心地址与命名空间；
- 当前激活环境；
- 多个实现类中选择哪一个；
- 事务边界与业务优先级规则；
- 代码放在默认扫描范围之外时的包路径。

### 4.2 Maven 与 Spring Boot 的边界

- **是什么**：Maven 负责构建期的依赖、编译、模块和打包；Spring Boot 负责运行期根据 classpath 和配置装配应用。
- **如何工作**：
  - `pom.xml` 声明 Starter、版本、模块关系，并把 JAR 放进最终包；
  - 应用启动后，Spring Boot 发现这些类和自动配置元数据，再决定创建哪些基础设施 Bean。
- **何时使用**：讨论“为什么写了 starter 就能用 Web/Mongo”时，先分清这两段。
- **边界或易错点**：Starter 出现在 `pom` 里，不代表它是 Maven 的能力；Starter 的“组合依赖 + 自动生效”是 Spring Boot 设计的，Maven 只负责下载和入包。

可记为：

```text
Maven = 装进来
Spring Boot = 让它变成可用 Bean / 运行能力
```

| 步骤 | 负责方 | 结果 |
|---|---|---|
| 在 `pom` 写 `spring-boot-starter-web` | Maven | Web 相关 JAR 进入 classpath |
| 启动时发现 Web 环境并装配 MVC | Spring Boot | 创建 `DispatcherServlet` 等基础设施 |
| 业务类加 `@RestController` | 开发者 + 组件扫描 | 业务 Controller 成为 Bean |
| 打包 fat JAR | Maven + Spring Boot 插件 | 得到可执行包 |

### 4.3 Spring Framework 与 Spring Boot

- **是什么**：Spring Framework 提供 IoC、依赖注入、AOP、事务等核心对象管理能力；Spring Boot 在其上增加自动配置、Starter、约定、内嵌服务器、可执行 JAR 和外部化配置。
- **如何工作**：
  - Spring 核心问题是“如何管理对象”；
  - Boot 额外解决“如何少写样板，尽快变成可运行服务”。
- **何时使用**：解释“Spring Boot 是不是只做 Bean 创建和注入”时使用本区分。
- **边界或易错点**：组件扫描、DI、AOP 主要是 Spring Framework 的能力；Boot 更强的是基础设施自动注册与约定。

记忆句：

```text
Spring：管对象
Boot：尽量自动决定该创建哪些基础设施 Bean，并快速装配成可运行服务
```

### 4.4 Starter 与自动配置

- **是什么**：
  - **Starter**：Spring Boot 设计的能力组合包，通常通过 Maven 引入；
  - **自动配置**：启动时按条件决定创建哪些基础设施 Bean 的机制。
- **如何工作**：Spring Boot 检查依赖是否存在、属性是否配置、用户是否已自定义同类 Bean、当前是否为 Web 应用等，再决定是否启用某套默认装配。
- **何时使用**：需要 Web、数据访问、消息、安全等常见能力时，优先引入对应 Starter。
- **边界或易错点**：引入依赖不等于业务已经使用该能力；classpath 有 Redis/MQ 依赖，不代表代码里真的在用缓存或消息。

可抽象为：

```text
存在 Web 依赖且是 Servlet Web 应用
  -> 配置 Spring MVC 与内嵌服务器

存在 MongoDB Starter 且有连接信息
  -> 创建 MongoClient / MongoTemplate

用户已自定义同名基础设施 Bean
  -> 通常不再重复创建默认实现
```

常见条件判断思想包括：

- 某类是否在 classpath；
- 某属性是否存在；
- 用户是否已提供同类 Bean；
- 当前是否为 Web 应用。

#### 自动配置元数据在哪里

自动配置候选类通常登记在**依赖 JAR 内部**，不是业务工程的 `src/main/resources`：

| Boot 版本倾向 | 常见位置 |
|---|---|
| 经典 / 2.x 常见 | `META-INF/spring.factories` |
| 2.7 过渡期 | 也可能同时存在 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` |
| Boot 3 主流 | 上述 `AutoConfiguration.imports` |

注意：

- `spring.factories` 是**文件**，不是目录；
- 它回答“有哪些自动配置类可被考虑”，不等于这些类一定会生效；
- 是否生效仍看条件注解。

### 4.5 三个常被混用的词

| 术语 | 真正含义 | 典型例子 |
|---|---|---|
| **自动配置** | 启动时按条件创建基础设施 Bean | 自动提供 `DataSource`、`MongoTemplate`、MVC |
| **自动装配 / 依赖注入** | 把已有 Bean 注入到需要它的地方 | `@Autowired` / 构造器注入 Service |
| **动态配置** | 运行期从配置中心读取或刷新配置 | Nacos、`@RefreshScope` |

三者关系：

```text
自动配置：决定创建哪些基础设施 Bean
自动装配：把 Bean 注入到另一个 Bean
动态配置：改的是 Environment 中的属性值，不一定重新走整套自动配置
```

### 4.6 组件扫描与 Bean 装配

- **是什么**：组件扫描负责发现带注解的类并注册 Bean 定义；容器再创建对象、注入依赖，并在需要时生成代理。
- **如何工作**：`@SpringBootApplication` 通常包含配置类、自动配置和组件扫描。默认从启动类所在包向下扫描 `@Component`、`@Service`、`@Repository`、`@Controller`、`@RestController`、`@Configuration` 等。
- **何时使用**：普通业务对象用标准注解交给容器管理；只有特殊创建逻辑才需要手写 `@Bean`。
- **边界或易错点**：类不在扫描范围内就不会成为 Bean；同一接口有多个实现时，“按类型注入”可能产生歧义，需要 `@Primary` 或 `@Qualifier`。

典型结果：

```text
扫描到 @Service 实现类
  -> 注册为 BeanDefinition
  -> 创建实例
  -> 注入依赖
  -> 可能包装成事务/AOP 代理
  -> 放入 ApplicationContext
```

### 4.7 `@ComponentScan` 与 `@MapperScan`

- **是什么**：
  - `@ComponentScan`：扫描 Spring 组件语义的类；
  - `@MapperScan`：专门把 MyBatis Mapper 接口注册为可注入的代理 Bean。
- **如何工作**：
  - 普通 `@Service` 有可实例化实现类，组件扫描即可；
  - Mapper 通常是接口，没有直接实现类，需要 MyBatis 生成代理（如通过 `MapperFactoryBean`）后才能注入。
- **何时使用**：有 MyBatis Mapper 时，集中使用 `@MapperScan` 或等价平台能力，不要指望只靠普通组件扫描。
- **边界或易错点**：即使 Mapper 上写了 `@Mapper`，大型项目仍常使用集中扫描；多数据源场景下，`@MapperScan` 还可关联不同 `SqlSessionFactory`。

| 对比项 | `@ComponentScan` | `@MapperScan` |
|---|---|---|
| 目标 | 业务/普通 Spring 组件 | Mapper 接口代理 |
| 典型对象 | 有实现体的类 | 接口 |
| 创建方式 | 反射实例化或配置类 | MyBatis 代理 |
| 多数据源 | 不直接解决 | 可指定 SqlSession 工厂 |

Feign 接口同理：也没有手写实现，而是由 OpenFeign 生成 HTTP 客户端代理后再注册为 Spring Bean。

### 4.8 组件扫描 vs 自动配置

| 对比项 | 组件扫描 | 自动配置 |
|---|---|---|
| 主要目标 | 业务组件 | 框架基础设施 |
| 定义来源 | 项目中带组件注解的类 | 依赖 JAR 中的自动配置类及其 `@Bean` |
| 条件强弱 | 扫到通常就注册 | 强依赖条件判断 |
| 后续生命周期 | 同一套 IoC 生命周期 | 同左 |

共同点：

```text
注册路径不同
  -> 但进入容器后
  -> 都走实例化、注入、初始化
```

易错点：以为“扫描到类之后还要再走一遍自动配置，Bean 才会生成”。实际上扫描本身就会注册业务 Bean 定义；自动配置主要补基础设施。

### 4.9 BeanDefinition 与实例化两阶段

- **是什么**：容器先收集“如何创建对象”的说明书，再真正 `new` 并初始化。
- **如何工作**：
  1. **注册阶段**：写入 `BeanDefinition`（类型、作用域、依赖、初始化/销毁方法、是否懒加载等）；
  2. **实例化阶段**：创建对象、填充属性、AOP 代理、初始化回调，再放入单例池。
- **何时使用**：理解“为什么启动会先扫很久，再集中创建对象”，以及“扫到了不等于对象已存在”。
- **边界或易错点**：懒加载 Bean 可能延后到首次使用才实例化；默认单例通常在启动期 eager 创建。

```text
找到类 / 导入自动配置
  -> 注册 BeanDefinition
  -> （稍后）实例化 + 依赖注入 + 初始化
  -> 可被其他对象注入使用
```

### 4.10 基础设施是不是 Bean

- **是什么**：`DispatcherServlet`、`ObjectMapper`、`DataSource`、`MongoTemplate`、WebServer 工厂等，绝大多数是 Bean，或由 Bean 创建和管理。
- **如何工作**：自动配置类通过 `@Bean` 方法把这些对象纳入 IoC。
- **何时使用**：解释“谁创建了 MongoTemplate / 谁创建了消息转换器”。
- **边界或易错点**：有些运行时对象由 Factory Bean 创建后启动，不一定总以“业务侧直接注入的同名 Bean”形态出现，但仍在 Spring 生命周期协调下。

### 4.11 企业多模块与单进程装配

- **是什么**：代码可以拆成多个 Maven 模块，但最终仍可由一个 `start` 模块依赖并打成一个可执行 JAR，运行在同一个 JVM 和同一个 Spring 容器中。
- **如何工作**：根 POM 负责模块聚合和依赖管理；业务模块产出普通 JAR；启动模块依赖它们，并使用 Spring Boot 打包插件生成可执行包。
- **何时使用**：希望按职责拆分代码、复用 API 契约、保持单一部署单元时。
- **边界或易错点**：Maven 多模块不等于多个微服务；只有 `start` 才是完整可启动入口，`service`/`dal`/`job` 通常不是独立进程。

常见模块职责：

| 模块类型 | 常见职责 |
|---|---|
| `api` | DTO、VO、跨服务契约 |
| `dal` | Entity、Mapper、Repository |
| `service` | Controller、Service、业务编排 |
| `external-api` | 出站 Feign 客户端 |
| `job` | 定时任务入口 |
| `start` | 启动类、配置、最终可执行包 |

运行关系通常是：

```text
多个业务模块 JAR
  -> start 模块依赖并装配
  -> 一个可执行 JAR
  -> 一个 JVM 进程
  -> 一个 Spring 容器
```

### 4.12 配置来源、服务名与环境差异

- **是什么**：Spring 环境由多层属性源组成，包括命令行参数、系统属性、环境变量、本地配置文件、外部配置中心等。
- **如何工作**：`application.yml` 提供通用默认；`application-{profile}.yml` 提供环境差异；占位符如 `${db.url}` 从更高优先级属性源解析。
- **何时使用**：把稳定默认值放本地，把环境敏感值放到外部配置或密钥管理。
- **边界或易错点**：
  - 本地 profile 文件为空时，并不代表应用无配置，只说明真实值可能来自 Nacos、环境变量或启动参数；
  - **Nacos 等配置中心不会改写本地 `application.yml` 文件**，而是把属性合并进运行时 `Environment`；
  - **服务名常量 alone 无效**，必须在启动时真正传给启动器/注册逻辑后才成为运行时身份。

服务名的典型作用：

```text
向注册中心登记自己
  -> 让其他服务按名字发现自己
  -> 作为拉取远程配置的定位信息之一
  -> 出现在日志、监控、部署标识中
```

它不是端口，也不是 Java 包名。

典型加载关系：

```text
application.yml
+ application-dev.yml
+ 外部配置中心 / 环境变量 / 启动参数
= 最终 Environment
```

适合放本地的内容：

- 端口默认值；
- MyBatis 映射规则；
- 文档扫描包；
- 与环境无关的框架开关。

适合放外部的内容：

- 数据库连接；
- 注册中心地址；
- 对象存储密钥；
- 任务调度中心地址。

### 4.13 Spring Boot 启动过程

- **是什么**：从 `main()` 开始，到端口监听成功、应用可接收请求为止的准备过程。
- **如何工作**：先准备环境，再构建对象图，再准备 Web 分发体系，最后绑定端口进入就绪状态。
- **何时使用**：排查启动失败、理解“为什么启动慢但请求分发快”、判断某能力是启动期装配还是请求期执行。
- **边界或易错点**：启动完成不等于所有健康检查、服务注册或流量接入都已完成，尤其在容器编排环境中。

可压缩为五步：

```text
1. Maven/打包结果进入 JVM
2. 准备 Environment
3. 扫描并注册 BeanDefinition，执行自动配置
4. 实例化 Bean，建立 Web 路由与服务器
5. 绑定端口并就绪
```

更细的主线：

1. JVM 加载启动类并执行 `main()`；
2. 创建 Spring 应用并读取多层配置；
3. 根据依赖判断应用类型，例如 Servlet Web；
4. 扫描业务组件、Mapper、Feign 等并注册 Bean 定义；
5. 执行自动配置，创建 Web、数据源、Mongo、事务等基础设施；
6. 创建单例 Bean，完成依赖注入和 AOP 代理；
7. 创建内嵌 Web 服务器，例如 Undertow 或 Tomcat；
8. 注册 `DispatcherServlet`、Filter 等；
9. 扫描 Controller，建立路由表；
10. 绑定端口，发布启动完成事件。

关键认知：

> 扫描类、创建 Bean、建立路由、创建连接池，通常在启动阶段完成；请求阶段复用这些结果，而不是每次请求重新扫描和重建。

#### 如何真正把服务跑起来

| 场景 | 做法 | 注意 |
|---|---|---|
| 本地开发 | 运行 `start` 模块启动类的 `main` | 不要误跑只有业务代码的子模块 |
| 部署 | 先 `mvn clean package`，再运行 `start` 产出的可执行 JAR | 子模块 JAR 通常不是完整服务 |
| 外部配置 | 用启动参数/环境变量提供注册中心、profile 等 | 本地 yml 可能只有占位符 |

### 4.14 内嵌 Web 服务器与端口监听

- **是什么**：Spring Boot Web 应用通常内嵌 Tomcat、Undertow 或 Jetty，由应用进程自己监听端口，而不是必须部署到外部应用服务器。
- **如何工作**：读取 `server.port` 等配置后，向操作系统申请绑定端口，再等待网络事件。
- **何时使用**：独立可执行 JAR、容器化部署、本地开发。
- **边界或易错点**：业务代码通常不自己写 `while(true)` 轮询端口；真正监听端口的是 Web 服务器，它依赖操作系统网络能力高效等待连接。

更准确的理解：

```text
没有请求时
  -> 不需要业务线程空转检查端口
  -> 操作系统等待网络事件

请求到达时
  -> 操作系统通知 Web 服务器
  -> 服务器解析 HTTP
  -> 进入处理链
```

#### Undertow 与 Tomcat

两者都可以作为 Spring Boot 内嵌服务器，接收 HTTP 并交给 Spring MVC。差异主要在连接与线程模型：

| 对比项 | Tomcat | Undertow |
|---|---|---|
| 常见印象 | 经典 Servlet 容器 | 更偏事件驱动 |
| 线程模型 | 同步业务中常见“一请求一 worker” | 常区分 IO 线程与 Worker 线程 |
| 在 Boot 中的角色 | 内嵌服务器之一 | 内嵌服务器之一 |

线程角色可以先这样记：

| 线程角色 | 主要工作 |
|---|---|
| IO 线程 | 接收连接、读写网络数据 |
| Worker 线程 | 执行 Servlet、Controller、阻塞式业务 |

重要纠正：

> 使用 Undertow **不等于** 业务自动变成全异步非阻塞。若 Controller/Service 仍调用阻塞 JDBC、同步 Feign、同步 Mongo API，请求仍然会占用 Worker 线程直到结束。

经典 Spring MVC 可近似理解为：一次同步请求在处理期间通常占用一个 Worker 线程，直到返回或进入特殊异步模式。

### 4.15 DispatcherServlet 与请求分发

- **是什么**：`DispatcherServlet` 是 Spring MVC 的前端控制器，几乎所有进入 MVC 的请求都先到它，再由它协调后续组件。
- **如何工作**：它不自己写业务，而是问“谁处理、怎么调、参数从哪来、返回值怎么写、异常怎么转”。
- **何时使用**：理解注解式 Controller 请求链路时，把它视为总调度入口。
- **边界或易错点**：端口监听在 Web 服务器层；业务入口在 Controller 层；两者之间由 Filter 和 `DispatcherServlet` 连接。

一句话边界：

```text
Undertow / Tomcat：网络请求如何进入进程
DispatcherServlet：请求应该交给哪个 Java 方法
```

`DispatcherServlet` 协调的关键角色：

| 组件 | 职责 |
|---|---|
| `HandlerMapping` | 根据请求找到 Handler 方法 |
| `HandlerAdapter` | 真正调用 Handler 并处理参数/返回值 |
| `HandlerMethodArgumentResolver` | 把 HTTP 数据变成方法参数 |
| `HandlerMethodReturnValueHandler` | 处理返回值 |
| `HttpMessageConverter` | JSON 等与 Java 对象互转 |
| `HandlerExceptionResolver` | 统一处理异常 |
| `HandlerInterceptor` | Controller 调用前后的横切逻辑 |

### 4.16 启动时建立路由表

- **是什么**：Spring MVC 在启动阶段扫描 Controller 上的映射注解，提前建立“请求条件 -> Java 方法”的映射。
- **如何工作**：读取类级与方法级 `@RequestMapping` / `@GetMapping` / `@PostMapping` 等，结合 HTTP 方法、路径、消费/生产媒体类型等生成映射项。
- **何时使用**：解释为什么冲突路由常在启动期暴露，以及为什么请求期分发可以很快。
- **边界或易错点**：不是每次请求都遍历全部 Controller 类去“现找方法”。

抽象路由表：

| 条件 | 处理器 |
|---|---|
| `POST /api/orders/query` | `OrderController.query()` |
| `GET /api/orders/{id}` | `OrderController.detail()` |

匹配时除了路径，还可能看：

- HTTP 方法；
- `Content-Type`；
- `Accept`；
- 请求头或请求参数条件。

常见结果：

| 情况 | 典型结果 |
|---|---|
| 路径不存在 | 404 |
| 路径存在但方法不对 | 405 |
| 媒体类型不支持 | 415 / 406 |
| 条件匹配成功 | 得到 `HandlerMethod` |

### 4.17 请求到达 Controller 之前的完整链路

- **是什么**：从网卡收到数据到真正执行 Controller 方法之间的处理链。
- **如何工作**：先由操作系统和 Web 服务器处理网络与 HTTP 解析，再经过 Filter、`DispatcherServlet`、路由匹配、拦截器、参数解析和校验。
- **何时使用**：排查“请求到了服务但业务没执行”、认证失败、参数绑定失败、404/405 等问题。
- **边界或易错点**：“请求到达应用”不等于“Controller 一定执行”。

最短记忆路径：

```text
客户端
  -> TCP/IP
  -> 内嵌 Web 服务器
  -> Servlet Filter 链
  -> DispatcherServlet
  -> HandlerMapping
  -> Interceptor.preHandle
  -> HandlerAdapter
  -> 参数解析 / 校验
  -> Controller 方法
```

#### Filter 与 Interceptor

| 对比项 | Filter | Interceptor |
|---|---|---|
| 所属层次 | Servlet | Spring MVC |
| 位置 | `DispatcherServlet` 外围 | Handler 调用前后 |
| 是否知道具体 Controller 方法 | 通常不知道 | 通常知道 |
| 常见用途 | 编码、CORS、认证、请求包装 | 权限、审计、业务上下文 |

Filter 可直接短路请求，例如认证失败返回 401，此时 Controller 不会执行。

#### 参数如何生成

| 参数注解/类型 | 数据来源 |
|---|---|
| `@RequestParam` | 查询参数或表单 |
| `@PathVariable` | 路径变量 |
| `@RequestHeader` | 请求头 |
| `@RequestBody` | 请求体，常经 Jackson 反序列化 |
| `HttpServletRequest` | 原始请求对象 |

`@RequestBody` 的典型过程：

```text
Content-Type: application/json
  -> 选择 JSON 消息转换器
  -> Jackson 读取请求体
  -> 构造 DTO
  -> 作为方法参数传入
```

若使用 `@Valid` 等校验注解，校验失败也可能发生在 Controller 业务代码之前。

### 4.18 Controller 返回值如何变成 HTTP 响应

- **是什么**：Controller 返回的通常是 Java 对象，不是手写 JSON 字符串；框架负责写出 HTTP 响应。
- **如何工作**：`@RestController` 表示返回值写入响应体；返回值处理器选择合适的 `HttpMessageConverter`，常由 Jackson 序列化为 JSON。
- **何时使用**：理解为什么可以直接 `return R.data(result)`。
- **边界或易错点**：返回值无法序列化、循环引用、日期格式特殊时，需要额外注解或配置。

返回路径：

```text
Controller 返回对象
  -> 返回值处理
  -> HttpMessageConverter
  -> 写入响应体
  -> Filter 返回阶段
  -> Web 服务器发送响应
```

异常路径：

```text
Service/Controller 抛异常
  -> 若未被局部捕获
  -> DispatcherServlet
  -> 异常解析器 / @ControllerAdvice
  -> 统一错误响应
```

### 4.19 分层架构中的 Spring 用法

- **是什么**：Web 应用通常把“协议适配、业务规则、数据访问、外部调用”分开。
- **如何工作**：Controller 适配 HTTP；Service/Handler 编排业务；Mapper/Repository 访问数据；Feign 等客户端访问外部服务。
- **何时使用**：接口稳定、业务规则复杂、数据来源多样时。
- **边界或易错点**：Controller 直接访问数据库或堆砌复杂计算，会破坏分层，增加测试和演进成本。

通用调用链：

```text
Controller
  -> Service / Handler
  -> Mapper / Repository / Feign
  -> 数据库 / 外部服务
  -> 返回业务结果
  -> Controller 包装响应
```

双持久层也很常见：

| 技术 | 适合 |
|---|---|
| MyBatis / MyBatis-Plus | 关系库、复杂 SQL、报表查询 |
| Spring Data MongoDB / `MongoTemplate` | 文档型数据、灵活结构、条件更新 |

### 4.20 Feign、任务调度与事务在 Spring 中的位置

#### Feign

- Feign 把 Java 接口变成 HTTP 客户端代理。
- 接口上声明服务名、路径、方法后，调用接口方法即发起远程 HTTP 请求。
- 只写服务名、不写固定 URL 时，通常依赖服务发现找到实例。

#### 任务调度

- Spring 自带 `@Scheduled`；
- 企业系统也常用 XXL-JOB 等外部调度平台。
- 使用外部调度时，任务方法仍是 Spring Bean，但 Cron 往往在调度中心配置，而不是写在代码注解里。
- “任务代码已实现”不等于“线上已在跑”：还需要进程在线、执行器注册、调度中心配置、依赖数据源可用。

#### 事务

- Spring 可提供事务管理器与 `@Transactional` 代理；
- 框架能提供“如何做事务”，但不能替你决定“哪些操作必须原子执行”；
- 数据库部署是否支持事务，会直接影响多文档/多语句事务能否真正成立。

## 5. 贯穿示例

以“查询某月订单均价”这类只读接口为例，把约定、启动和请求串起来。

### 5.1 代码约定

```java
@SpringBootApplication
@MapperScan("com.example.order.mapper")
public class App {
    public static void main(String[] args) {
        SpringApplication.run(App.class, args);
    }
}

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping("/avg-price")
    public ApiResult<List<AvgPriceVO>> query(
            @RequestBody AvgPriceQuery query) {
        return ApiResult.ok(orderService.queryAvgPrice(query));
    }
}

@Service
public class OrderService {
    private final OrderMapper orderMapper;

    public OrderService(OrderMapper orderMapper) {
        this.orderMapper = orderMapper;
    }

    public List<AvgPriceVO> queryAvgPrice(AvgPriceQuery query) {
        // 校验月份格式，再查库
        return orderMapper.selectAvgPrice(query);
    }
}
```

这里遵守的约定包括：

- 启动类开启自动配置与扫描；
- Controller/Service 使用标准注解；
- Mapper 通过 `@MapperScan` 成为代理 Bean；
- URL 与 HTTP 方法通过注解声明；
- 依赖由容器注入，而不是业务代码手动装配基础设施。

### 5.2 启动时发生了什么

```text
执行 main()
  -> 读取 server.port=8080 等配置
  -> 组件扫描注册 OrderController / OrderService
  -> MapperScan 注册 OrderMapper 代理
  -> 自动配置 Web 与数据访问基础设施
  -> 实例化 Bean 并完成注入
  -> 注册路由：POST /api/orders/avg-price -> OrderController.query
  -> 内嵌服务器绑定 8080
  -> 应用就绪
```

### 5.3 请求时发生了什么

请求：

```http
POST /api/orders/avg-price HTTP/1.1
Content-Type: application/json

{
  "month": "2026-06"
}
```

处理过程：

```text
Web 服务器接收并解析 HTTP
  -> Filter 链
  -> DispatcherServlet
  -> 路由表命中 OrderController.query
  -> JSON 反序列化为 AvgPriceQuery
  -> 调用 Controller
  -> Service 校验并查库
  -> 返回 List<AvgPriceVO>
  -> 包装为 ApiResult
  -> 序列化为 JSON 响应
```

若月份格式非法、Token 无效、路径写错，失败点分别可能在：

- Service 业务校验；
- Filter 认证；
- HandlerMapping 路由匹配。

这说明问题定位要先判断失败发生在启动期、协议期还是业务期。

## 6. 易混概念

| 概念 A | 概念 B | 核心区别 | 选择依据 |
|---|---|---|---|
| 约定 | 配置 | 约定是默认规则，配置是显式覆盖或补充 | 稳定通用走约定，环境/歧义走配置 |
| Maven 依赖声明 | Spring Boot 自动配置 | 前者把 JAR 放进 classpath，后者决定创建哪些 Bean | 先有依赖，再谈自动配置 |
| 自动配置 | 自动装配 | 创建基础设施 Bean vs 注入已有 Bean | 看是“造出来”还是“塞进去” |
| 自动配置 | 动态配置 | 启动期条件装配 vs 运行期属性刷新 | 改 Bean 结构还是改属性值 |
| 组件扫描 | 自动配置 | 业务组件来源 vs 基础设施来源 | 来源不同，后续生命周期相同 |
| `@ComponentScan` | `@MapperScan` | 普通组件 vs Mapper 代理 | Mapper 接口要用专门扫描 |
| BeanDefinition | Bean 实例 | 说明书 vs 真正对象 | 扫到不等于已创建 |
| Spring Framework | Spring Boot | 管对象 vs 快速自动装配成服务 | 解释能力归属时分开说 |
| 多模块 | 微服务 | 代码拆分 vs 进程/部署拆分 | 先看部署边界 |
| Web 服务器 | `DispatcherServlet` | 管连接与 HTTP vs 管 MVC 分发 | 端口问题看服务器，路由问题看 MVC |
| Filter | Interceptor | Servlet 层 vs Spring MVC 层 | 容器级横切用 Filter，Handler 级用 Interceptor |
| 启动阶段 | 请求阶段 | 一次准备 vs 反复复用 | 慢启动查装配，慢请求查业务与 IO |
| 引入 Starter | 真正使用能力 | 依赖存在不等于业务调用存在 | 以代码和配置使用证据为准 |
| Undertow | 全异步业务 | 服务器模型 vs 业务是否阻塞 | 有阻塞 IO 就仍占 Worker |

## 7. 常见误区与边界

1. **误区**：Spring Boot Web 服务就是业务代码自己循环监听端口。  
   **正确理解**：内嵌 Web 服务器绑定端口并等待操作系统网络事件；业务代码负责处理已被分发的请求。

2. **误区**：请求到达 8080 后会立刻进入 Controller。  
   **正确理解**：中间还有 Web 服务器、Filter、`DispatcherServlet`、路由匹配、参数解析、拦截器和校验。

3. **误区**：约定优于配置等于完全不写配置。  
   **正确理解**：只是把可推断的默认行为交给框架；环境值和关键业务决策仍需明确。

4. **误区**：`pom` 里写了 Starter，所以这是 Maven 的约定大于配置。  
   **正确理解**：Maven 负责引入依赖；是否自动变成可用能力，是 Spring Boot 自动配置的事。

5. **误区**：启动类所在包以外的组件一定能被扫到。  
   **正确理解**：默认只从启动类包向下扫描；放在扫描范围外时必须显式补充扫描路径。

6. **误区**：`@ComponentScan` 可以替代 `@MapperScan`。  
   **正确理解**：Mapper 是接口代理，需要 MyBatis 专用注册机制。

7. **误区**：定义了服务名常量，服务就自动有了注册身份。  
   **正确理解**：常量必须在启动时真正传给启动/注册逻辑后才生效。

8. **误区**：Nacos 会把配置写进本地 `application.yml`。  
   **正确理解**：远程配置进入运行时 `Environment`，通常不改本地文件。

9. **误区**：自动装配就是自动配置，动态配置也是一回事。  
   **正确理解**：自动配置造基础设施 Bean；自动装配做注入；动态配置改运行期属性。

10. **误区**：扫描到了或导入了自动配置，对象就已经存在。  
    **正确理解**：先有 `BeanDefinition`，再实例化；默认单例多在启动期创建，懒加载除外。

11. **误区**：每次请求都会重新创建 Service、Mapper 和路由。  
    **正确理解**：大多数单例 Bean 和路由表在启动期完成，请求期复用。

12. **误区**：Maven 里有十个模块，就等于十个独立服务。  
    **正确理解**：若都由一个 `start` 模块打包运行，它们仍是单进程应用。

13. **误区**：父 POM 引入了 Redis 或 MQ，就说明项目在用缓存或消息。  
    **正确理解**：要以是否存在业务调用、监听器、缓存注解等实际使用证据为准。

14. **误区**：用了 Undertow，业务就天然非阻塞。  
    **正确理解**：服务器可以事件驱动，但阻塞式业务代码仍会占住 Worker 线程。

15. **误区**：加了 `@Transactional` 就一定具备真实原子性。  
    **正确理解**：还取决于事务管理器、数据源/数据库是否支持，以及方法是否真正走到代理调用。

## 8. 项目示例：企业应用中的落地方式

> 以下内容来自某屠宰运营相关工作区中两个后端工程及后续辅助讨论的观察，仅作“当前实现示例”，不是通用标准。

### 8.1 系统形态

工作区中存在两个结构相似的后端，以及一个前端：

- 成本核算类服务：偏计算、持久化、定时任务；
- 主数据/查询类服务：偏多数据源查询，并为其他服务提供 Feign 契约；
- 前端工程：不使用 Spring Boot。

两者后端都采用：

```text
Maven 多模块
  -> start 聚合
  -> 单一可执行 JAR
  -> Spring 容器统一管理 Controller/Service/DAL/Job
```

### 8.2 启动方式

一类启动类更接近标准写法，显式使用：

- `@SpringBootApplication`
- `@EnableFeignClients`
- `@MapperScan`
- 额外 `@ComponentScan`

另一类使用企业平台封装注解和启动器，例如组合 Cloud/Boot 能力的启动注解，以及平台 `run` 方法。外在效果仍是启动 Spring 容器，但公共能力更多来自内部 Starter。

服务名通过常量传入平台启动方法后，才成为注册中心、配置定位和 Feign 调用中的运行时身份。

本地如何启动的常见方式：

1. IDE 直接运行 `start` 模块主类；
2. 或 `mvn clean package -DskipTests` 后运行 `start` 的可执行 JAR；
3. 同时用启动参数提供 Nacos 地址、namespace、`spring.profiles.active` 等。

### 8.3 配置特征

本地 `application.yml` 常见内容包括：

- 服务端口与 Undertow 线程参数；
- MyBatis-Plus 映射与逻辑删除；
- Swagger 信息；
- 允许循环依赖、允许 Bean 覆盖等兼容开关。

环境差异文件可能为空，数据源等值使用占位符，实际依赖外部配置中心或启动参数。这意味着“仓库可编译”与“本地可启动”不是一回事。

Nacos 相关连接信息不一定写在仓库 yml 中；更常见的是启动参数注入。远程配置进入 `Environment`，不会自动改写本地 yml 文件。精确 Data ID 规则若封装在平台依赖内，业务仓库未必能直接看到。

### 8.4 约定的正反例

正面：

- 启动类、标准注解、Starter 依赖共同减少手工装配。

反面：

- 部分代码位于顶层 `controller` / `service` 包，不在启动类默认扫描树下；
- 因此必须显式补充 `@ComponentScan`。

这正说明：

```text
守约 -> 少配
破约 -> 补配
```

### 8.5 请求与协作

只读查询链大致为：

```text
Feign 契约
  -> Controller
  -> Service
  -> Mapper + 动态数据源
  -> XML SQL
  -> 统一响应对象
```

复杂计算链大致为：

```text
XXL-JOB 或临时 HTTP 入口
  -> Job/Controller
  -> Handler
  -> Mongo 日数据 + Feign 外部数据 + MyBatis 主数据
  -> 计算结果
  -> Mongo 条件写入
```

可迁移经验：

1. 查询服务适合“Controller + Service + XML SQL”；
2. 复杂批处理适合把编排逻辑放到 Handler，而不是堆在 Controller；
3. 跨服务协作时，Feign 契约与 Controller 路径应保持一致；
4. 自动覆盖写入常需配合状态机或 CAS 条件，避免覆盖人工结果；
5. 任务代码完成不等于调度已上线，还要看执行器、配置和依赖系统。

### 8.6 已知限制

| 类型 | 示例事实 | 影响 |
|---|---|---|
| 包结构偏离约定 | 部分代码位于顶层 `controller`/`service` 包 | 必须额外配置扫描路径 |
| 环境配置外置 | 本地 profile 基本为空 | 缺外部配置时难以启动 |
| 平台封装启动 | 真实 Nacos 引导细节在外部依赖 | 不能只靠业务仓库断言全部引导逻辑 |
| 能力预装但未使用 | 依赖中有缓存/消息相关 Starter | 不能据此判断业务已使用 |
| 事务依赖部署 | Mongo 多文档事务需要集群支持 | 单机环境可能只有注解、没有真实原子性 |

## 9. 速查

| 想完成的目标 | 使用的概念或操作 | 关键条件 |
|---|---|---|
| 少写装配代码 | 约定、Starter、组件扫描 | 包结构与注解符合默认规则 |
| 解释 pom 里的 Starter | Maven 引入 + Boot 自动配置 | 分清构建期与运行期 |
| 覆盖默认行为 | 显式配置、自定义 Bean、注解覆盖 | 只覆盖真正偏离默认的点 |
| 区分三个“自动” | 自动配置 / 自动装配 / 动态配置 | 分别对应造 Bean、注入、改属性 |
| 注册 Mapper | `@MapperScan` 或等价机制 | 不要只靠普通组件扫描 |
| 理解服务名 | 启动时传入的运行时身份 | 常量 alone 无效 |
| 理解服务为何能监听端口 | 内嵌 Web 服务器 + `server.port` | Web 依赖存在且容器创建成功 |
| 理解请求如何进业务 | Filter -> `DispatcherServlet` -> Controller | 路由匹配且前置检查通过 |
| 排查 404/405 | 路由表与映射注解 | 区分路径错误和方法错误 |
| 排查参数绑定失败 | `HttpMessageConverter` / 参数解析器 | JSON 结构、Content-Type、字段名 |
| 排查启动失败 | Environment、自动配置、Bean 创建 | 先看缺配置还是缺 Bean/循环依赖 |
| 拆分代码但单进程部署 | 多模块 + start 聚合打包 | 不要误当成多服务 |
| 调用其他服务 | Feign 客户端代理 | 服务名、路径、注册发现或 URL |
| 保证一组写操作原子 | `@Transactional` + 合适事务管理器 | 存储与部署必须真正支持事务 |

## 10. 最终记忆主线

```text
Maven 把依赖装进包
  -> Spring Boot 按约定与条件自动配置
  -> 注册 BeanDefinition 并创建 Bean
  -> 启动内嵌服务器、建立路由
  -> 绑定端口进入就绪
  -> 请求经服务器与 DispatcherServlet 分发
  -> Controller 调用业务并返回响应
```

### 必记要点

1. **约定优于配置**解决的是“稳定默认值由框架承担”，不是取消所有配置。
2. **Maven 负责装进来，Boot 负责用起来**；写在 `pom` 里不等于已经完成运行时装配。
3. **自动配置、自动装配、动态配置是三件事**，不要混用。
4. **启动阶段做准备，请求阶段做复用**：Bean、路由、连接池通常启动时建好。
5. **端口监听者是 Web 服务器，业务入口是 Controller**，中间必经 MVC 分发链。
6. **多模块是代码组织方式**；是否微服务要看进程与部署边界。
7. **依赖存在、注解存在、能力真实生效**是三件不同的事，排查时要分开看。

## 11. 自测问题

1. 为什么把 `@Service` 类放到启动类根包的子包下，通常不用改启动配置；若放到完全无关的顶层包，又可能要补什么？
2. 为什么 `pom` 里写了 `spring-boot-starter-data-mongodb`，仍可能启动失败或没有可用的 Mongo 能力？
3. 为什么 Spring Boot 能根据 Starter 自动创建 `MongoTemplate` 或数据源基础设施，却不能自动知道生产数据库地址？
4. `@ComponentScan` 和 `@MapperScan` 各解决什么问题？只保留前者通常会怎样？
5. 自动配置、自动装配、动态配置分别改变系统的哪一部分？
6. “扫描到某个类”和“该 Bean 已经可以注入使用”之间还差哪一步？
7. 一次 `POST /api/orders/avg-price` 请求，在进入 Controller 前最少会经过哪些环节？其中哪一步负责“找到哪个方法”？
8. 启动成功后，为什么通常不需要在每次请求时重新扫描 Controller 注解？
9. 如何判断一个工程是“多模块单服务”还是“多个独立微服务”？
10. 服务名常量写在代码里，但启动时没有传给启动器，会出现什么现象？
11. 父 POM 引入了消息或缓存 Starter，怎样证明业务真的在用它们？
12. 使用 Undertow 是否意味着业务代码不会阻塞线程？为什么？
13. Filter 返回 401 与 Controller 抛业务异常，失败点分别在请求链的什么位置？

## 12. 证据与时效边界

- 本文通用部分总结自 Spring Boot / Spring MVC 的常见机制，以及本会话与指定辅助对话中已确认的解释与纠正。
- 辅助对话补充重点包括：Maven 与 Boot 边界、`@ComponentScan`/`@MapperScan`、服务名与 Nacos/`Environment`、自动配置元数据位置、BeanDefinition 与实例化两阶段、自动配置/自动装配/动态配置三分、Undertow 与阻塞业务的关系、Spring 与 Spring Boot 分工。
- “项目示例”部分基于对本地工作区后端工程及辅助讨论的观察，反映当时可见实现，不保证与后续分支或未纳入仓库的平台内部实现完全一致。
- 企业平台启动器、Nacos Data ID 规则、生产部署拓扑等未在本地完整展开的部分，已按机制层表述，不把未核验细节写成确定事实。
- 不收录任何密钥、口令或可直接用于未授权访问的敏感配置值。
