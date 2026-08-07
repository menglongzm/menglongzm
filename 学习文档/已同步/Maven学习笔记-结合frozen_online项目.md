# Maven 学习笔记（结合 frozen_online 项目）

> 主要示例：`muyuan-slaughter-opms-frozen-cost-accounting`  
> 同构工程：`muyuan-slaughter-mdm-opms`  
> 前端 `my-a-soa-front-slaughter-opms` 使用 Node/Yarn，不由 Maven 管理。  
> 更新日期：2026-07-28

---

## 目录

1. [Maven 的一句话定位](#1-maven-的一句话定位)
2. [本项目的 Maven 结构](#2-本项目的-maven-结构)
3. [依赖管理：管理程序需要的库](#3-依赖管理管理程序需要的库)
4. [构建管理：把源码变成可交付产物](#4-构建管理把源码变成可交付产物)
5. [项目结构管理：组织多模块工程](#5-项目结构管理组织多模块工程)
6. [父子 POM：子模块具体继承什么](#6-父子-pom子模块具体继承什么)
7. [BOM、dependencyManagement 与 dependencies](#7-bomdependencymanagement-与-dependencies)
8. [仓库与 package、install、deploy](#8-仓库与-packageinstalldeploy)
9. [本项目完整构建链路](#9-本项目完整构建链路)
10. [常用命令](#10-常用命令)
11. [速记卡](#11-速记卡)
12. [自检题](#12-自检题)

---

## 1. Maven 的一句话定位

Maven 是 Java 项目的 **依赖管理器、构建工具和项目组织工具**。

在本项目中，它负责：

```text
组织多模块
  → 解析和下载依赖
  → 统一依赖版本
  → 编译代码与处理资源
  → 运行测试
  → 打包普通 Jar / 可执行 Fat Jar
  → 安装到本地仓库或发布到公司 Nexus
  →（可选）构建并推送 Docker 镜像
```

可以把 Maven 理解成：

```text
pom.xml = 项目说明书
Maven   = 按说明书工作的自动化流水线
```

---

## 2. 本项目的 Maven 结构

根工程：

```text
muyuan-slaughter-opms-frozen-cost-accounting/
├─ pom.xml                         ← 根 POM，总控
├─ ...-api/                        ← 接口与数据契约
├─ ...-base-common/                ← 公共类型和工具
├─ ...-common-dal/                 ← 公共数据访问
├─ ...-common-service/             ← 公共服务
├─ ...-external-api/               ← 外部接口边界
├─ ...-external-service/           ← 外部服务实现
├─ ...-job/                        ← 定时任务
├─ ...-dal/                        ← 数据访问
├─ ...-service/                    ← 业务逻辑
└─ ...-start/                      ← 启动与最终装配
```

根 POM 使用：

```xml
<packaging>pom</packaging>
```

这表示根项目主要用于聚合模块、继承配置和统一版本，本身不作为业务 Jar 运行。

---

# 3. 依赖管理：管理程序需要的库

依赖管理是 Maven 最常被提到的功能，但它不只是“下载 Jar”，还包括传递依赖、版本选择、作用域、排除依赖和模块间引用。

## 3.1 依赖坐标：Maven 如何识别一个库

依赖通常由 GAV 唯一定位：

```xml
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>easyexcel</artifactId>
    <version>3.3.3</version>
</dependency>
```

| 字段 | 含义 | 类比 |
|---|---|---|
| `groupId` | 组织或产品组 | 厂商 |
| `artifactId` | 构件名称 | 商品名 |
| `version` | 构件版本 | 商品型号 |

完整坐标是：

```text
com.alibaba:easyexcel:3.3.3
```

## 3.2 自动下载第三方 Jar 的完整链路

本项目 `service` 声明：

```xml
<dependency>
    <groupId>com.muyuan.platform</groupId>
    <artifactId>my-sc-slaughter-sap-client</artifactId>
    <version>1.0-SNAPSHOT</version>
</dependency>
```

Maven 的处理过程：

```text
1. 读取 dependency，确定要什么
2. 查本地仓库 ~/.m2/repository
3. 本地没有，再查 repositories 或 settings.xml 中的镜像仓库
4. 下载 Jar 和它的 POM
5. 读取其 POM，继续解析传递依赖
6. 缓存到本地仓库
7. 放入当前模块对应的 classpath
```

因此：

```text
dependency   = 下载什么
repositories = 去哪里下载
本地 .m2     = 下载后的本地缓存与本机构件仓库
```

## 3.3 传递依赖

如果 A 依赖 B，B 又依赖 C，通常 A 会间接获得 C：

```text
job → service → dal
```

本项目 `job` 直接依赖 `service`。如果 `service` 依赖 `dal`，则 Maven 通常会把 `dal` 作为 `job` 的传递依赖。

这能减少重复声明，但也可能带来版本冲突，所以需要版本管理和冲突调解。

## 3.4 版本冲突如何产生

例如：

```text
项目
├─ easyexcel → poi 4.1.2
└─ 另一个库 → poi 3.17
```

同一个 `org.apache.poi:poi` 出现多个版本。最终运行时通常只能选择一个版本，否则可能出现：

```text
NoSuchMethodError
ClassNotFoundException
NoClassDefFoundError
```

本项目父 POM 明确统一：

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.apache.poi</groupId>
            <artifactId>poi</artifactId>
            <version>4.1.2</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

这会约束依赖树中的 POI 版本，降低运行期冲突概率。

## 3.5 Maven 的版本冲突调解规则

在没有 `dependencyManagement` 强制管理时，Maven 主要使用：

### 规则一：路径最近者优先

```text
项目 → A → C:1.0
项目 → B → D → C:2.0
```

`C:1.0` 离项目更近，通常胜出。

### 规则二：路径一样近时，先声明者优先

如果两个版本距离相同，通常在 POM 中先出现的依赖胜出。

### 更可靠的做法

不要依赖“碰巧胜出”，应在 `dependencyManagement` 中明确统一版本。

## 3.6 排除不需要或冲突的传递依赖

假设某库传递引入旧 POI，可排除：

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>report-client</artifactId>
    <version>1.0.0</version>
    <exclusions>
        <exclusion>
            <groupId>org.apache.poi</groupId>
            <artifactId>poi</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

然后在当前项目显式声明统一版本。

`exclusions` 是精确处理冲突的工具，不能因为“依赖多”就随意排除。排除后应运行测试，确认运行期仍有完整类库。

## 3.7 scope：依赖在什么时候有效

| scope | 编译 | 测试 | 运行/打包 | 本项目示例 |
|---|---:|---:|---:|---|
| `compile` | 是 | 是 | 是 | 默认依赖 |
| `provided` | 是 | 是 | 通常不带入运行包 | `lombok`、`muyuan-core-auto` |
| `runtime` | 否 | 是 | 是 | 运行期驱动等 |
| `test` | 否 | 是 | 否 | `junit`、`mockito` |
| `import` | 不适用 | 不适用 | 不适用 | BOM，仅在 dependencyManagement 使用 |

`provided` 的含义是：编译时需要，但预期运行环境提供，或它只是编译辅助工具。

## 3.8 模块间互相引用

本项目自己的模块也通过 GAV 引用。例如 `service`：

```xml
<dependency>
    <groupId>org.muyuan</groupId>
    <artifactId>muyuan-slaughter-opms-frozen-cost-accounting-dal</artifactId>
    <version>${muyuan.slaughter.opms.frozen.cost.accounting.version}</version>
</dependency>
```

在同一次根工程构建中，Maven Reactor 会直接使用本次构建产生的 `dal` 模块，而不一定要求它预先存在于远程仓库。

如果另一个独立工程要引用该模块，则通常需要先 `install` 到本机，或 `deploy` 到公司 Nexus。

---

# 4. 构建管理：把源码变成可交付产物

Maven 构建不是一个单独动作，而是一条由生命周期阶段组成的流水线。

## 4.1 Maven 三套生命周期

| 生命周期 | 作用 |
|---|---|
| `clean` | 删除上一次构建产物 |
| `default` | 编译、测试、打包、安装、发布 |
| `site` | 生成项目站点和报告 |

最常使用的是 `clean` 和 `default`。

## 4.2 default 生命周期的关键阶段

```text
validate
  → compile
  → test
  → package
  → verify
  → install
  → deploy
```

| 阶段 | 作用 |
|---|---|
| `validate` | 检查项目是否可构建 |
| `compile` | 编译主代码 |
| `test` | 编译并运行单元测试 |
| `package` | 打成 Jar/War |
| `verify` | 执行额外验证或集成测试检查 |
| `install` | 安装到本机 `.m2` |
| `deploy` | 发布到远程 Maven 仓库 |

执行后面的阶段，会自动执行前面的阶段。例如：

```text
mvn package = validate + compile + test + package
mvn install = ... + package + verify + install
mvn deploy  = ... + install + deploy
```

## 4.3 编译 Java 代码

本项目父 POM 统一配置：

```xml
<properties>
    <java.version>1.8</java.version>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
</properties>
```

```xml
<plugin>
    <artifactId>maven-compiler-plugin</artifactId>
    <version>3.8.1</version>
    <configuration>
        <source>${java.version}</source>
        <target>${java.version}</target>
        <encoding>UTF-8</encoding>
        <compilerArgs>
            <arg>-parameters</arg>
        </compilerArgs>
    </configuration>
</plugin>
```

含义：

- 允许使用 Java 8 语法
- 生成面向 Java 8 的 class
- 源码按 UTF-8 读取
- `-parameters` 保留方法参数名，便于 Spring 参数绑定和反射

## 4.4 运行测试

`mvn test` 会执行测试生命周期相关步骤，通常包括：

```text
编译主代码
  → 处理测试资源
  → 编译 src/test/java
  → 使用测试插件运行测试
```

本项目 `service` 声明：

```xml
<dependency>
    <groupId>junit</groupId>
    <artifactId>junit</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-core</artifactId>
    <scope>test</scope>
</dependency>
```

这些依赖只用于测试，不应进入生产运行包。

常见命令区别：

```bash
mvn package                 # 默认运行测试
mvn package -DskipTests     # 编译测试代码，但跳过测试执行
mvn package -Dmaven.test.skip=true
                            # 通常连测试编译也跳过
```

发布前不应习惯性跳过测试。跳过测试适合临时定位构建问题，不能替代验证。

## 4.5 打包：普通 Jar、Fat Jar 和 War

### 普通 Jar

`api`、`dal`、`service` 等库模块产生普通 Jar，主要包含本模块的 class 和资源。依赖 Jar 不会全部塞进其中。

### Fat Jar

`start` 模块使用 Spring Boot 插件的 `repackage`：

```xml
<goal>repackage</goal>
```

它会把应用类、依赖和 Spring Boot 启动结构重新包装，形成可以执行的 Jar：

```bash
java -jar muyuan-slaughter-opms-frozen-cost-accounting-start.jar
```

### War

War 通常用于部署到外部 Servlet 容器。当前项目子模块配置的是：

```xml
<packaging>jar</packaging>
```

因此本项目主要走 Spring Boot 可执行 Jar，而不是 War。

## 4.6 资源复制

Maven 默认会把：

```text
src/main/resources/**
```

复制到：

```text
target/classes/**
```

最终进入 Jar。Java 文件则被编译成 class，而不是原样复制。

## 4.7 为什么要额外打包 `src/main/java/**/*.xml`

Maven 默认不会把 `src/main/java` 下的 XML 当资源复制。

本项目存在：

```text
...-dal/src/main/java/.../mapper/DemoMapper.xml
...-dal/src/main/java/.../mapper/MyMdProductInfoMapper.xml
```

因此父 POM 配置：

```xml
<resource>
    <directory>src/main/java</directory>
    <includes>
        <include>**/*.xml</include>
    </includes>
</resource>
```

打包后应同时存在：

```text
.../DemoMapper.class
.../DemoMapper.xml
```

如果漏掉 XML，编译可能成功，但运行时 MyBatis 可能报：

```text
Invalid bound statement (not found)
```

## 4.8 资源过滤是什么

资源复制和资源过滤不是一回事：

```text
资源复制 = 原样放入 target/classes
资源过滤 = 复制时替换 ${变量}
```

示例资源：

```properties
app.name=${project.artifactId}
app.version=${project.version}
```

启用过滤：

```xml
<resource>
    <directory>src/main/resources</directory>
    <filtering>true</filtering>
</resource>
```

打包后可能变成：

```properties
app.name=muyuan-slaughter-opms-frozen-cost-accounting-start
app.version=V2026-07-08-12-00
```

### 本项目现状

当前根 POM 配置了资源目录，但没有在这些 `<resource>` 中明确启用 `<filtering>true</filtering>`。

因此可确认的是“资源复制和额外收集 Java 目录 XML”，不能说本项目当前已经启用了 Maven 资源过滤。

配置文件中的密码、Token 等敏感值也不应通过普通 POM 属性硬编码。此项目使用 Nacos/Jasypt 等能力时，应遵循现有配置管理方式。

## 4.9 插件与生命周期绑定

Maven 生命周期只定义阶段，插件负责执行具体工作：

```text
compile 阶段  → maven-compiler-plugin 编译
package 阶段  → jar 插件打包
repackage goal → spring-boot-maven-plugin 重包装
```

本项目还配置了：

- `maven-antrun-plugin`：在 package 阶段复制 Jar 到根 `target`
- `docker-maven-plugin`：构建、标记、推送镜像

所以 Maven 可理解为“生命周期调度器”，插件才是具体工人。

---

# 5. 项目结构管理：组织多模块工程

## 5.1 多模块聚合

根 POM 的 `<modules>`：

```xml
<modules>
    <module>...-api</module>
    <module>...-base-common</module>
    <module>...-dal</module>
    <module>...-service</module>
    <module>...-start</module>
</modules>
```

作用：从根目录执行一次命令，Maven Reactor 就能构建多个模块。

Maven 会分析模块间依赖，并按可用顺序构建，而不只是机械地按目录逐个执行。

## 5.2 聚合与继承不是一回事

这是多模块项目中非常容易混淆的概念。

| 概念 | 配置 | 解决什么问题 |
|---|---|---|
| 聚合 | 根 POM 的 `<modules>` | 一次构建哪些模块 |
| 继承 | 子 POM 的 `<parent>` | 子模块复用哪些配置 |

### 聚合但不继承

A 可以被根工程聚合，但它的 parent 是另一个公司父 POM。

### 继承但不聚合

B 可以继承某父 POM，但父 POM 不把 B 写进 `<modules>`。此时 B 不会随父工程一次性构建。

本项目根 POM 同时承担了两种角色：

```text
聚合 POM：通过 modules 组织一次构建
父 POM：通过 parent 给子模块继承配置
```

## 5.3 Reactor：同一次构建中的模块协调器

从根目录执行：

```bash
mvn clean package
```

Maven 创建 Reactor，负责：

1. 收集所有 modules
2. 读取模块依赖关系
3. 计算构建顺序
4. 在同一次构建中传递模块产物
5. 汇总成功、失败和跳过状态

例如：

```text
api / base-common
    → dal
    → service
    → job / start
```

如果基础模块失败，依赖它的后续模块通常会跳过。

## 5.4 继承与统一配置管理

父 POM统一了：

- Java 版本与编码
- 平台版本和业务版本属性
- 公共依赖
- 依赖版本表
- 编译插件
- 资源目录
- 下载仓库
- 发布仓库
- Docker 插件版本和仓库地址

好处：

```text
改一次父 POM → 多个子模块统一生效
```

例如，把 `java.version` 从 1.8 调整为更高版本时，原则上无需逐个修改所有子 POM。

实际升级仍需验证源码、插件、依赖和运行环境兼容性。

## 5.5 模块职责与依赖边界

Maven 能声明模块依赖，但不会自动保证架构合理。

推荐依赖方向应尽量清晰：

```text
api / common
  ↑
dal / external boundary
  ↑
service / job
  ↑
start（最终装配）
```

应避免底层模块反向依赖启动模块，也应避免所有模块彼此循环依赖。Maven 遇到循环模块依赖时无法建立正常构建顺序。

---

# 6. 父子 POM：子模块具体继承什么

## 6.1 自动继承的主要内容

| 类别 | 本项目内容 |
|---|---|
| 坐标 | `groupId=org.muyuan` |
| properties | Java、平台版本、业务版本、Docker 等 |
| dependencies | 根级公共依赖会进入子模块 |
| dependencyManagement | 继承版本管理规则 |
| build/plugins | 编译与 Spring Boot 插件配置，可由子模块覆盖 |
| resources | resources 与 Java 目录 XML 规则 |
| repositories | 阿里云和公司 Nexus |
| distributionManagement | release/snapshot 发布仓库 |

## 6.2 不应混淆的内容

- `<modules>` 是聚合清单，不是“继承给子模块”的配置。
- `dependencyManagement` 只给版本规则，不自动引入 Jar。
- `pluginManagement` 只管理插件默认配置，插件通常仍需在 `<plugins>` 中启用。
- 子模块可覆盖父级属性和插件配置。

---

# 7. BOM、dependencyManagement 与 dependencies

## 7.1 BOM 是版本目录 POM

本项目：

```xml
<dependency>
    <groupId>org.muyuan.platform</groupId>
    <artifactId>muyuan-bom</artifactId>
    <version>${muyuan.tool.version}</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>
```

BOM 不作为业务 Jar进入 classpath。它把自身的 `dependencyManagement` 版本表导入当前项目。

```text
BOM = 公司统一版本目录
不是 = 一次性引入所有公司 Jar
```

## 7.2 不写 version 时版本从哪里来

`dal`：

```xml
<dependency>
    <groupId>org.muyuan</groupId>
    <artifactId>muyuan-core-tool</artifactId>
</dependency>
```

父 POM：

```xml
<dependencyManagement>
    <dependency>
        <groupId>org.muyuan</groupId>
        <artifactId>muyuan-core-tool</artifactId>
        <version>${muyuan.tool.version}</version>
    </dependency>
</dependencyManagement>
```

属性：

```xml
<muyuan.tool.version>3.0.1.MY.RELEASE</muyuan.tool.version>
```

最终版本：

```text
org.muyuan:muyuan-core-tool:3.0.1.MY.RELEASE
```

若子模块、父 `dependencyManagement`、BOM 都没有提供版本，Maven 会报缺少 version。

## 7.3 三者区别

| 配置 | 是否引入 Jar | 主要作用 |
|---|---:|---|
| BOM import | 否 | 批量导入版本目录 |
| `dependencyManagement` | 否 | 管理版本、scope、排除等默认规则 |
| `dependencies` | 是 | 真正引入依赖 |

```text
BOM / dependencyManagement = 商品目录
Dependencies              = 实际下单
Repositories              = 商店地址
```

## 7.4 根 dependencies 对子模块的影响

父 POM 的 `dependencies` 会被子模块继承。

以 `job` 为例，它自己只声明 `service`，但还会获得父级公共依赖，如 `muyuan-core-boot`、Web、XXL-Job、Lombok 等。

同时它还可能获得 `service` 的传递依赖，如 `dal`。

最终依赖约等于：

```text
父级公共依赖
+ 子模块直接依赖
+ 直接依赖带来的传递依赖
- exclusions 排除的依赖
→ 再经过版本冲突调解
```

---

# 8. 仓库与 package、install、deploy

## 8.1 下载仓库

本项目根 POM 配置：

```text
阿里云公共仓：第三方公开构件
公司 Nexus：org.muyuan、com.muyuan.platform 等内部构件
```

Maven 通常先查本地 `.m2`，没有才访问远程仓库。

实际企业环境还可能通过用户 `settings.xml` 配置镜像、账号和 server。POM 中的仓库不是 Maven 唯一可能使用的下载来源。

## 8.2 三个阶段的区别

| 命令 | 结果位置 | 用途 |
|---|---|---|
| `mvn package` | 当前模块 `target` | 得到本次构建产物 |
| `mvn install` | 再放入本机 `.m2` | 给本机其他独立工程引用 |
| `mvn deploy` | 再上传远程 Nexus | 给同事、服务和 CI 引用 |

这里的 deploy 是“发布 Maven 构件”，不是将业务服务部署到生产服务器。

业务上线通常是：

```text
Maven package
  → start Fat Jar
  → Docker 镜像
  → 推 Harbor
  → 部署到 K8s/服务器
```

Maven deploy 的主要链路则是：

```text
普通 Jar + POM
  → Nexus
  → 被其他 Maven 项目当依赖下载
```

---

# 9. 本项目完整构建链路

从根目录执行：

```bash
mvn clean package
```

典型过程：

```text
1. clean 删除各模块 target
2. 读取根 POM 和 modules
3. Reactor 计算模块构建顺序
4. 解析父 POM、BOM、dependencyManagement
5. 从本地 .m2 / 远程仓库解析依赖
6. 复制和处理资源
7. 按 Java 8 编译主代码
8. 编译并运行测试
9. 为各模块打普通 Jar
10. start 通过 repackage 生成可执行 Fat Jar
11. 配置的额外插件处理复制或镜像任务
```

若执行 `install`，再把各模块构件放入本机 `.m2`。若执行 `deploy`，再上传到 `distributionManagement` 指定的公司 Nexus。

---

# 10. 常用命令

```bash
# 清理构建产物
mvn clean

# 编译主代码
mvn compile

# 运行单元测试
mvn test

# 打包（默认会经过测试）
mvn clean package

# 临时跳过测试执行
mvn clean package -DskipTests

# 安装到本地仓库
mvn clean install

# 发布到远程 Maven 仓库
mvn clean deploy

# 查看 dal 最终依赖树
mvn dependency:tree \
  -pl muyuan-slaughter-opms-frozen-cost-accounting-dal

# 查看继承和合并后的最终有效 POM
mvn help:effective-pom \
  -pl muyuan-slaughter-opms-frozen-cost-accounting-job

# 构建某模块及其所依赖的同项目模块
mvn package -pl muyuan-slaughter-opms-frozen-cost-accounting-service -am
```

`-pl` 选择模块，`-am` 同时构建该模块依赖的 Reactor 模块。

---

# 11. 速记卡

## 三大能力

```text
1. 依赖管理
   下载依赖、传递依赖、版本管理、冲突调解、模块引用

2. 构建管理
   编译、测试、资源处理、Jar/Fat Jar、插件与生命周期

3. 项目结构管理
   多模块聚合、父子继承、统一配置、Reactor 构建顺序
```

## 最容易混淆的区别

| 概念 A | 概念 B | 区别 |
|---|---|---|
| `dependencies` | `dependencyManagement` | 真引入 vs 只管理 |
| BOM | 普通 Jar | 版本目录 POM vs 运行代码 |
| 聚合 | 继承 | 一起构建 vs 复用配置 |
| resource copy | resource filtering | 原样复制 vs 替换变量 |
| package | install | target 产物 vs 再放入本地仓库 |
| Maven deploy | 业务部署 | 发构件到 Nexus vs 上线服务 |
| 普通 Jar | Fat Jar | 本模块代码资源 vs 可执行且包含依赖结构 |

## 一句主线

```text
POM 声明模块、依赖和规则
→ Maven Reactor 按依赖顺序构建
→ 插件完成资源、编译、测试和打包
→ 构件可留在 target、安装到 .m2 或发布到 Nexus
```

---

# 12. 自检题

1. `dependency` 和 `repositories` 分别决定什么？
2. `dependencyManagement` 中声明 EasyExcel 后，为什么子模块还要再声明依赖？
3. `muyuan-bom` 为什么写 `type=pom` 和 `scope=import`？
4. Maven 遇到同一依赖多个版本时如何调解？本项目 POI 如何统一？
5. `job → service → dal` 中，dal 为什么可能成为 job 的传递依赖？
6. 聚合和继承分别通过哪个 XML 节点实现？
7. 为什么根目录一次构建能按 api、dal、service、start 的关系排序？
8. 资源复制和资源过滤有什么区别？本项目是否明确启用了过滤？
9. 为什么 Java 目录中的 Mapper XML 需要额外配置？
10. `package`、`install`、`deploy` 的产物最终分别放在哪里？
11. 为什么 service 通常跳过 Spring Boot repackage，而 start 执行 repackage？
12. Maven deploy 为什么不是业务上线部署？

<details>
<summary>参考答案</summary>

1. dependency 决定下载什么；repositories 决定去哪里找。
2. management 只提供版本规则，不真正引入 Jar。
3. 因为它导入的是版本目录 POM，不是业务 Jar。
4. 默认近者优先、同深度先声明优先；本项目用 dependencyManagement 锁定 POI 4.1.2。
5. Maven 默认解析直接依赖的传递依赖，除非 scope 或 exclusions 阻止。
6. 聚合用 `<modules>`；继承用子 POM 的 `<parent>`。
7. Reactor 收集模块并根据依赖图计算顺序。
8. 复制是原样复制，过滤会替换 `${...}`；当前 POM未明确设置 `filtering=true`。
9. Maven 默认不把 `src/main/java/**/*.xml` 当资源，漏包会导致 MyBatis 运行期找不到语句。
10. target、本机 `.m2`、远程 Nexus。
11. service 是库 Jar；start 是最终可执行应用。
12. deploy 发布构件给其他 Maven 工程使用；业务上线是把应用或镜像运行在目标环境。

</details>

---

## 建议继续阅读的位置

| 目标 | 文件 |
|---|---|
| 总模块、版本、公共依赖、仓库 | `muyuan-slaughter-opms-frozen-cost-accounting/pom.xml` |
| 可执行 Fat Jar | `...-start/pom.xml` |
| 不写 version 的示例 | `...-dal/pom.xml` |
| 测试依赖示例 | `...-service/pom.xml` |
| 根依赖继承示例 | `...-job/pom.xml` |
| Java 目录 Mapper XML | `...-dal/src/main/java/.../mapper/*.xml` |
| resources Mapper XML | `...-dal/src/main/resources/mapper/*.xml` |

---

**最终记忆：** Maven 不只是下载 Jar。它同时回答三个问题：

```text
项目需要什么？      → 依赖管理
源码怎样变成产物？  → 构建管理
多个模块怎样协作？  → 项目结构管理
```
