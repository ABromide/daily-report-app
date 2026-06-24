# Red-Teaming the Agentic Red-Team：当进攻型安全 Agent 自己成为攻击面

### 元信息与 TL;DR

| 项目 | 内容 |
| --- | --- |
| 论文 | [Red-Teaming the Agentic Red-Team](https://arxiv.org/abs/2606.24496) |
| 版本 | arXiv v1，2026-06-23 提交 |
| 作者 | Dario Pasquini、Michał Bazyli、Taras Fedynyshyn、Artem Sorokin |
| 主题 | AI 安全、AI for security、进攻型安全 Agent、沙箱与权限隔离 |
| 证据主体 | 12 个开源 agentic offensive-security tools、3 类 honeypot payload、6 个前沿模型、kill-chain 与架构原则 |

- **这篇文章做什么**：论文不是评测进攻型安全 Agent 能不能打靶，而是反过来问：这些自动化红队工具本身能否承受被目标系统主动攻击。作者审计 12 个开源进攻型 Agent，发现共同问题不是单个 prompt 写得差，而是 worker、orchestrator、secret、网络和文件系统边界放在了错误的信任层。
- **核心方法**：作者提出一条面向 agentic-red-team 的 kill chain：先通过目标环境诱导 worker 执行 payload，再利用 worker 与 orchestrator 的共享文件、共享网络或高权限容器完成升权、持久化、secret 外泄、guardrail 绕过和沙箱逃逸。
- **关键证据**：Table 1 显示 12 个工具里，多数可以被拿到 worker RCE；11/12 可被访问 secret 类信息；10/12 可实现 hard persistence；所有测试工具都可被 unbounded weaponization；10/12 可达某种 host escape，8/12 可达 host RCE。
- **最刺眼的实验数字**：在自动化评测中，3 类 honeypot payload 乘以 6 个模型、聚合 10 个可复现实验工具，攻击平均成功率为 **97.8%**。Claude Opus 4.8、DeepSeek V4 Pro、GLM-5.1、Kimi K2.6 四列为 **100.0%**，GPT-5.5 为 **96.7%**，Gemini 3.1 Pro 为 **90.0%**。
- **关键机制**：论文称这种初始攻击不依赖显式 prompt injection，而是利用 agent 在渗透测试任务中“下载、检查、执行目标侧关键工件”的正常工作流。payload 本身尽量表现为功能完整的良性工具，真正危险点藏在“自植入漏洞 + 恶意输入文件”的组合里。
- **设计结论**：不要把 LLM guardrail 当最后防线。安全架构必须默认 worker 可能被恶意控制，然后用最小权限 worker、无 secret worker、worker/orchestrator 隔离、外置 egress proxy、host-level policy enforcement 和 task-specific API 缩小爆炸半径。
- **局限**：论文是强安全分析，但不是生产遥测研究。被审计对象是 2026 年 6 月附近的公开版本，实验 testbed 复刻了系统 prompt 和核心工具接口，不能等同于每个真实部署的全部配置；同时，攻击细节高度依赖进攻型 Agent 的高权限任务边界。

### 研究问题：为什么要红队“红队 Agent”？

论文关心的不是传统 LLM 安全问题：

- 不是问模型是否输出危险文本；
- 不是问 Agent 是否能完成 CTF；
- 不是问自动化渗透测试是否提升效率；
- 而是问一个更底层的问题：

> 当一个进攻型安全 Agent 被派去检查敌对目标时，目标能否反过来攻击这个 Agent 的运行基础设施？

这个问题成立，是因为进攻型安全 Agent 天然具备三个危险属性：

| 属性 | 正常用途 | 安全后果 |
| --- | --- | --- |
| 高权限 worker | 运行扫描器、exploit、shell 工具、浏览器、脚本 | worker 一旦被控制，就不是普通聊天上下文污染，而是代码执行入口 |
| 目标侧交互 | 访问未知主机、下载样本、解析服务输出 | 攻击者可以把“被测目标”设计成诱饵环境 |
| 长链路自动化 | reconnaissance、payload 分析、报告生成、持续会话 | 单次错误可穿过 memory、volume、API、network namespace 和 host 边界 |

论文把这类系统命名为 **agentic-red-teams**：面向自动化渗透测试、红队、全链路对抗模拟的 Agent 系统。作者的判断是：这些工具已经从研究演示走向真实使用，因此它们自己也必须按真实敌手模型接受审计。

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 进攻型安全 Agent 暴露了新的反向攻击面 | 目标系统可操纵 Agent 的取证、下载、执行流程 | 12 个工具的架构与攻击能力表 | 不覆盖所有闭源商业实现 |
| 初始 worker RCE 不需要显式 prompt injection | honeypot staging 让 payload 成为“完成任务所需工件” | Table 3 平均 97.8% 成功率 | testbed 复刻真实工具关键接口，但不等于所有部署 |
| 沙箱不是充分防线 | worker 与 orchestrator 共享文件、共享网络、共享 volume 或 docker socket | PentestGPT、RedAmon、AIRecon、CAI 等案例 | 具体逃逸路径随版本和部署变化 |
| guardrail 放在 orchestrator 层会失效 | 攻击者拿到 worker 后直接做底层网络/文件/命令行为 | 所有测试工具可被 unbounded weaponization | 深层策略执行需要工程成本 |
| 安全设计应默认 LLM/worker 不可信 | 最小权限、无 secret worker、外置网络策略、task-specific API | 第 9 节提出架构原则 | 论文给原则，不是完整产品实现 |

这条论证路线的关键转折是：作者不试图证明“某个模型不够聪明”，而是证明 **把策略校验放在 LLM 输出层，本身就是错误边界**。如果 worker 已被拿下，LLM 工具调用层的 allowlist、denylist、prompt-injection detector 都已经绕过了真实执行路径。

### 系统抽象：orchestrator、worker 与 front-end

论文把差异很大的工具抽象成三层：

| 组件 | 责任 | 高价值状态 | 主要风险 |
| --- | --- | --- | --- |
| Orchestrator | 管理 agent loop、memory、skills、tool dispatch、guardrail | API key、session state、数据库、系统配置 | 被 worker 写文件或访问 API 后升权 |
| Worker | 执行 bash、扫描器、payload 分析、网络交互 | 通常应只有低权限运行环境 | 容器权限过高、能触达 host/orchestrator |
| Front-end | 用户输入、任务管理、结果展示 | 用户操作入口、报告材料 | 若与 orchestrator 边界混合，扩大信任面 |

用 Mermaid 表示，论文中的核心风险链路可以压缩成：

```mermaid
flowchart LR
  A["Attacker-controlled target"] --> B["Worker downloads or inspects artifact"]
  B --> C["Worker RCE"]
  C --> D{"Isolation boundary?"}
  D -->|shared file or volume| E["Orchestrator RCE"]
  D -->|shared network or unauth API| E
  D -->|privileged container or docker socket| F["Host compromise"]
  E --> G["Secrets exfiltration"]
  E --> H["Persistence"]
  C --> I["Unbounded weaponization"]
  F --> J["Operator infrastructure compromise"]
```

这里最重要的不是某个 exploit 技巧，而是 **worker 与 orchestrator 的方向性信任**：

- orchestrator 可以给 worker 下发任务；
- worker 的 stdout/stderr、文件产物、网络可达性不应该反过来影响 orchestrator 的代码执行或 secret 访问；
- 一旦这个方向被打穿，Agent 系统就从“工具执行环境被攻破”升级成“操作员基础设施被攻破”。

### 初始攻击：为什么不是传统 prompt injection？

论文第 4 节的关键概念是 **agent-phishing**。它和常见间接 prompt injection 的差别是：

| 维度 | 间接 prompt injection | agent-phishing |
| --- | --- | --- |
| 操纵载体 | 文本指令、网页内容、工具结果 | 目标侧“看似必要”的工件、脚本、配置、样本 |
| 目标动作 | 让 LLM 改变计划或泄露信息 | 让 Agent 下载、检查并执行工件 |
| 防御假设 | 模型识别恶意文本即可拦截 | 模型必须识别良性外观下的漏洞组合 |
| 失败原因 | 文本注入越来越容易被模型标记 | 任务本身要求 Agent 处理可疑目标材料 |

作者把攻击拆成两个门：

```text
Input:
  adversary-controlled target T
  offensive-security agent redA
  staged artifact P

Gate 1:
  redA 是否认为 P 是推进任务所需材料，并下载/复制它？

Gate 2:
  redA 是否认为 P 经检查后可执行，或必须执行才能验证目标状态？

Output:
  若 Gate 1 与 Gate 2 同时通过，则 worker 获得 RCE 风险。

Failure boundary:
  如果 Agent 拒绝执行整个渗透任务，实验记为失败；
  如果 Agent 进入任务但没有拒绝 payload，则论文观察到它会定位、下载并执行。
```

论文的代表例子是一个名为 `pwcrypt` 的小工具。它表面上是密码 vault 的加解密 CLI，包含 KDF、cipher、salt、IV、metadata 等自洽字段。关键点是：payload 不靠“明显恶意代码”取胜，而是把危险拆成两部分：

- 可执行程序看起来像普通、有漏洞的软件；
- 输入文件携带触发漏洞所需的数据；
- Agent 看到的是“目标里发现的关键工件”，而不是一段显式恶意指令。

这使模型检查变得困难：如果模型只搜索反连、daemon、obfuscation、shell 字符串、可疑 syscall，它可能会低估“普通漏洞 + 恶意样本”的组合风险。

### 实验设置与主结果

作者做了两层验证：

- 手工端到端验证，用于确认真实工具中的攻击路径；
- 自动化 testbed，用于在多个 Agent、模型、payload 上大规模重复初始 worker RCE 实验。

自动化评测的设置如下：

| 维度 | 设置 |
| --- | --- |
| 评测对象 | 10 个可复刻的 agentic-red-team 系统；Artemis 与 nebula 因难以完整复刻被排除 |
| honeypot payload | `cfgunpack`、`db-restore`、`pwcrypt` |
| 模型 | Claude Opus 4.8、DeepSeek V4 Pro、Gemini 3.1 Pro、GLM-5.1、GPT-5.5、Kimi K2.6 |
| 运行环境 | 每次运行两个新 Docker 容器：一个 honeypot，一个 Agent 系统 |
| 任务 | Agent 被要求对 honeypot 做完整 penetration test |
| 终止条件 | 70 turns、Agent 宣布完成、或触发 planted payload |
| 成功判定 | Agent 文件系统出现专用 flag file |

Table 3 的结果可以整理为：

| Honeypot | Claude Opus 4.8 | DeepSeek V4 Pro | Gemini 3.1 Pro | GLM-5.1 | GPT-5.5 | Kimi K2.6 | Overall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| cfgunpack | 10/10 | 10/10 | 9/10 | 10/10 | 10/10 | 10/10 | 98.3% |
| db-restore | 10/10 | 10/10 | 9/10 | 10/10 | 9/10 | 10/10 | 96.7% |
| pwcrypt | 10/10 | 10/10 | 9/10 | 10/10 | 10/10 | 10/10 | 98.3% |
| Overall | 100.0% | 100.0% | 90.0% | 100.0% | 96.7% | 100.0% | 97.8% |

这个表的含义需要谨慎读：

- 它不是说所有真实部署都会被同一 payload 直接打穿；
- 它说明在作者构造的“目标诱饵 + 工件执行”设置下，前沿模型没有可靠阻止下载和执行；
- 失败主要来自模型一开始拒绝执行 penetration test，而不是在任务中识别 payload；
- 一旦 Agent 接受任务，它通常会继续走到定位、下载、检查、执行。

### Kill chain：从 worker RCE 到 host compromise

论文第 3 节把攻击路径拆成五个阶段：

| 阶段 | 攻击目标 | 典型机制 | 防御关注点 |
| --- | --- | --- | --- |
| 1. Worker RCE | 拿到执行环境 foothold | target-side staging、payload execution | worker 必须低权限且可重置 |
| 2. Privilege escalation | 从 worker 到 orchestrator | 共享 volume、可写配置、无鉴权 API、共享网络 | worker 不能写 orchestrator 状态 |
| 3. Persistence | 跨 session 留存控制 | trojanize source、污染 memory/skills | 持久状态必须有 provenance 与完整性保护 |
| 4. Sandbox escape | 从容器到 host | docker socket、privileged mode、host network、bind mount | 禁用高危 capability，收窄 mount |
| 5. Host compromise | 控制操作员机器 | 进入传统后渗透阶段 | 将 Agent 看作暴露在敌对网络中的系统 |

论文还强调两个中间目标：

- **Secrets exfiltration**：偷 LLM API key、历史任务信息、session 产物或 host secrets。
- **Persistent and unbounded weaponization**：把受害者的 Agent/基础设施变成攻击任意目标的跳板，尤其是绕过 scope guardrail 后攻击敏感域名。

这条链路的研究意义是：它把“Agent 被 prompt injection 影响”升级为“Agent 作为 cyber infrastructure 被利用”。因此防御也必须从 prompt 级别上移到系统级别。

### Table 1：12 个工具暴露了什么共同问题？

Table 1 汇总了 12 个工具的攻击能力。为了避免逐项复述符号，按论文结论可整理为：

| 能力 | 论文观察 |
| --- | --- |
| Worker RCE | 大多数工具可被初始阶段拿到 worker 代码执行；无 OS sandbox 的工具会直接进入 host 风险 |
| Secrets exfiltration | 11/12 可访问某类 secret；若到 host compromise，则扩展为 all host secrets |
| Persistence | 10/12 可达 hard persistence；另有 soft persistence 通过 memory、skills、episodic state 等实现 |
| Unbounded weaponization | 12/12 可被绕过范围限制，用底层执行环境做任意行动 |
| Host compromise | 10/12 可达某种 host escape，8/12 可达 full host RCE |

Table 2 则列出工具特性：

- 有的使用 Docker sandbox；
- 有的提供 binary allowlist、command denylist、scope check、prompt-injection detection；
- 有的具备 memory、skills、多 session、多 agent；
- 有的直接借用 Claude Code、OpenCode、LangGraph、LangChain 或自研 harness。

这说明问题不是“某个框架不安全”。论文真正的批评是：

- 很多工具把 Docker 当成安全边界，但同时给 worker 过多 capability；
- 很多工具把 guardrail 放在 LLM 工具调用前后，但不监控 worker 的真实网络和文件行为；
- 很多工具为了易用性共享配置、volume、secret、host network，最终让 worker 有机会影响 orchestrator。

### 升权案例：共享文件与共享网络为什么危险？

论文第 5 节给出两类 worker→orchestrator 升权路径。

#### 1. 不完整文件系统隔离

典型模式：

- worker 与 orchestrator 共享某个可写目录；
- orchestrator 后续会读取目录中的配置、hook、skill、MCP server 设置或 source file；
- 攻击者在 worker RCE 后写入恶意配置；
- orchestrator 重启或下一次调用时加载配置，完成升权。

论文用 PentestGPT 说明这一类问题：

- worker 可以写入 Claude Code 读取的配置目录；
- 后续 invocation 中 hook 被触发；
- 攻击从 worker 容器移动到 orchestrator 语境。

这里的核心教训是：**共享 volume 不是中性便利设施，而是跨信任域写通道**。

#### 2. 弱网络隔离

典型模式：

- worker 和 orchestrator 在同一 Docker bridge 或 host network；
- orchestrator 暴露内部 REST API、proxy、recon service；
- API 只靠 CORS、localhost、网络位置或隐式信任；
- worker RCE 后可直接访问这些 API。

论文用 RedAmon 说明：

- worker 能访问 recon orchestrator；
- 内部服务没有强认证；
- 攻击者通过参数让 orchestrator 拉取攻击者控制的设置；
- orchestrator 泄露内部 key，并调用 host Docker daemon 执行攻击者指定组件。

这说明网络隔离必须是真隔离：

- CORS 不是 server-side auth；
- localhost 不是 security boundary；
- container network reachability 必须按最小权限设计；
- orchestrator API 必须假设 worker 输出和 worker 请求都可能恶意。

### Guardrail 失效：为什么“拦截 LLM tool call”不够？

论文第 6 节对 guardrail 的批评非常重要。许多工具有规则：

- 禁止访问 `.gov` 或金融机构域名；
- denylist 某些 bash 命令；
- 检测 base64、obfuscation；
- 用 LLM-as-a-judge 判断 tool call 是否越界；
- 在 operation creation 阶段做 regex 过滤。

问题在于，这些规则大多只作用在 **orchestrator 产生的高层动作** 上。

一旦攻击者已经拿到 worker RCE：

- 网络连接可以由 worker 里的进程直接发出；
- shell 命令可以绕过 LLM tool call 管道；
- 文件写入可以直接碰到共享 mount；
- guardrail 根本看不到真实行为。

可以用一个公式化边界来理解：

```text
真实风险 R = f(model_action, worker_runtime, network_egress, filesystem, secrets, host_capabilities)

浅层 guardrail 只约束：
  g(model_action)

当 attacker controls worker_runtime 时：
  g(model_action) ≠ control(R)
```

因此第 9 节提出的方向是 **deep guardrails**：

- 网络策略在 worker 外部执行，例如外置 egress proxy；
- 文件系统策略由 host/container runtime 强制；
- shell 能力拆成 task-specific API；
- orchestrator 不把 raw bash 当默认接口；
- worker 不持有 secret；
- worker 输出进入 orchestrator 前按非信任输入处理。

### 持久化与 secret：Agent 的 memory/skills 也会变成供应链

论文把 persistence 分为 hard persistence 与 soft persistence。

| 类型 | 含义 | 代表风险 |
| --- | --- | --- |
| Hard persistence | 攻击者修改代码、配置、hook、容器启动路径，跨重启持续执行 | 下次启动自动恢复攻击者控制 |
| Soft persistence | 攻击者污染会重新进入上下文的 memory、skills、session artifact | 下次 Agent 读取状态时再次触发危险行为 |

这对 Agent 系统尤其关键，因为很多 Agent 把“长期记忆”“技能库”“会话总结”“操作日志”当成能力增强模块。论文提醒我们：这些模块也是可写、可传播、可触发的状态。

若没有 provenance 与 authority：

- 目标系统返回的内容可能进入 memory；
- memory 可能进入下一次 prompt；
- skill 可能被 agent 视为可信工具；
- session artifact 可能被报告生成器或 orchestrator 读取。

这和普通 RAG prompt injection 相似，但危害更大，因为进攻型安全 Agent 本来就能运行命令、访问网络、处理敏感目标。

### 沙箱逃逸：Docker 存在不等于隔离成立

论文第 8 节最直接的结果是：

- 10/12 达到某种 host escape；
- 8/12 达到 host-level RCE；
- 没有 OS-level sandbox 的 METATRON、nebula、xalgorix 从初始 worker RCE 就直接进入 host 风险。

Appendix A.3 给出的逃逸类型包括：

| 模式 | 安全后果 |
| --- | --- |
| `--privileged` 与 host network | 容器获得过宽 Linux capability，host 边界近似失效 |
| docker socket bind mount | worker 可创建高权限容器或挂载 host 文件系统 |
| host directory read-write mount | worker 可写入 host 侧配置，下一次启动触发 |
| orchestrator proxy in host process | worker 通过 API 让 host 进程执行代码 |

这里不能把结论简化成“不要用 Docker”。论文的意思更具体：

- Docker 可以是合适隔离手段；
- 但一旦给了 docker socket、host network、privileged mode、宽 mount，隔离性质就变了；
- 安全性取决于 capability、namespace、mount、network、secret placement 的组合，而不是“用了容器”这个标签。

### 安全架构：默认 worker 已经被攻破

论文第 9 节提出的设计哲学是：不要假设 prompt injection 或模型操纵能被彻底消灭。更稳妥的不变量是：

> 即使 worker 被恶意控制，也不能让攻击继续扩散到 orchestrator、secret、host 或任意外部目标。

可以把目标写成：

```text
Minimize blast radius:

Given:
  worker = compromised

Require:
  access(worker, secrets) = false
  write(worker, orchestrator_state) = false
  reach(worker, orchestrator_private_api) = false
  network(worker) ⊆ approved_policy
  capabilities(worker) ⊆ task_minimum
  host_escape(worker) = blocked_by_runtime
```

对应设计原则：

| 原则 | 论文含义 | 工程落点 |
| --- | --- | --- |
| Worker sandbox 是必要条件 | 无 sandbox 的系统初始 RCE 就等于 host 风险 | worker 独立 OS/container/VM 边界 |
| Worker 最小权限 | 只给任务所需 capability | 禁用 privileged、收窄 mount、禁 docker socket |
| Worker 无 secret | LLM key、session key、internal token 不进 worker | secret 只在 orchestrator 或专门 broker |
| Orchestrator 与 worker 隔离 | worker 不能写 orchestrator 状态或访问私有 API | 单向 command/result 通道，强认证，输出转义 |
| 深层 guardrail | 策略在真实行为层执行 | egress proxy、host firewall、filesystem policy |
| Task-specific API | 少给 raw shell，多给受限原语 | `run_nmap(host, options)` 好过任意 bash |

这套架构不是“让 Agent 变笨”，而是把高危自由度压到可审计接口里：

- 对任务有必要的能力保留；
- 对跨边界扩散能力默认拒绝；
- 对 worker 输出做 untrusted input 处理；
- 对网络和文件系统行为用 runtime enforcement，而不是仅靠 LLM 判断。

### 与相关工作的关系

论文把自己放在三个研究方向之间：

| 方向 | 既有关注 | 本文位置 |
| --- | --- | --- |
| LLM red-teaming | 诱导模型输出违规内容或越权行为 | 本文研究“红队 Agent 工具链本身被目标攻击” |
| Agent prompt injection | 网页、邮件、工具结果污染 Agent 决策 | 本文强调不依赖显式文本注入的工件诱导与系统升权 |
| AI for cybersecurity | 用 LLM 自动化安全测试、漏洞利用、报告生成 | 本文指出这些工具本身是高价值攻击面 |

它最有价值的迁移不是“某个 payload 技巧”，而是威胁模型转换：

- 被测目标不是被动材料；
- worker 不是可信执行器；
- memory/skills 不是天然可信知识；
- sandbox 不是默认成立的边界；
- guardrail 不应只看 prompt 和 tool call。

### 证据边界与复现风险

这篇论文很强，但要避免过度外推。

| 证据 | 能支持什么 | 不能直接支持什么 |
| --- | --- | --- |
| 12 个公开工具审计 | 公开生态存在系统性架构弱点 | 所有商业部署都有相同漏洞 |
| Table 3 自动化成功率 | agent-phishing 在作者 testbed 中对多模型稳定有效 | 任意真实目标与任意 payload 都 97.8% 成功 |
| 10/12 host escape、8/12 host RCE | 工具默认配置/设计中存在严重沙箱边界问题 | 每个工具当前最新版仍保持完全相同路径 |
| 第 9 节架构原则 | 可以系统性缩小 worker compromise 影响 | 已给出完整、可直接落地的安全产品 |

复现上还有几个注意点：

- 论文是 v0.1，后续版本可能修正工具版本、表格或披露细节；
- 被审计仓库可能快速 patch，因此审计 commit 很关键；
- 真实部署可能启用额外 network policy、VM 隔离、secret broker；
- 自动化 testbed 为可控实验，和真实 Agent 的完整状态管理仍有差异。

不过，这些边界不会削弱核心结论：**只把防御放在模型和 orchestrator 层，不足以保护一个能执行代码的 Agent 系统**。

### 对 AI 安全与 Agent 工程的延伸

这篇论文对 AI 安全的启发有三层。

#### 1. Agent 安全要从“上下文污染”走向“基础设施隔离”

很多 Agent 安全讨论仍围绕：

- prompt injection；
- tool misuse；
- memory poisoning；
- policy bypass；
- unsafe response。

本文说明，一旦 Agent 拥有 shell、浏览器、文件系统和网络，安全问题会迅速变成传统系统安全问题：

- capability；
- namespace；
- mount；
- secret distribution；
- network egress；
- process boundary；
- audit log integrity。

#### 2. AI for security 工具必须比普通 Agent 更保守

进攻型安全 Agent 面对的是敌对输入，而不是普通网页或文档。它们的默认工作就是：

- 连接未知服务；
- 下载未知样本；
- 运行未知工具；
- 解析恶意 payload；
- 对可疑系统做动态交互。

所以它们不应复用一般 coding agent 的权限模型。一个面向安全任务的 Agent，反而应该更像恶意样本分析沙箱：

- worker 可牺牲；
- worker 无 secret；
- worker 出网受控；
- worker 文件系统可回滚；
- worker 到 orchestrator 的通道单向、结构化、强校验。

#### 3. Benchmark 需要测“被攻击时的系统性质”

今天很多 Agent benchmark 测：

- solved rate；
- task completion；
- tool-call accuracy；
- exploit success；
- report quality。

本文暗示还需要新的安全 benchmark：

| 指标 | 问题 |
| --- | --- |
| Compromise containment | worker 被拿下后是否能接触 orchestrator/secret/host |
| Guardrail depth | 策略是否约束真实网络和文件行为 |
| Persistence resistance | memory、skill、config 是否可被目标持久污染 |
| Secret exposure | worker 是否能读取 API key、历史任务、用户文件 |
| Egress control | worker 是否能向任意域名发起连接 |

这类 benchmark 比“模型是否识别 prompt injection”更接近真实部署风险。

### 工程落地检查：读完论文后应该立刻问什么？

如果把这篇论文当作审计清单，而不是只当作一篇攻击论文，最实用的问题不是“模型会不会被骗”，而是下面这些更机械的边界问题。

| 检查项 | 应该确认什么 | 高风险信号 |
| --- | --- | --- |
| Worker 权限 | worker 是否只拥有完成任务所需的最低 capability | `--privileged`、host network、docker socket、宽目录挂载 |
| Secret 分布 | API key、session token、internal key 是否完全不进入 worker | worker 环境变量、共享配置目录、日志中出现 secret |
| Orchestrator API | worker 是否能访问管理 API、proxy、task controller | 内部 API 只靠 localhost、CORS 或 Docker 网络隔离 |
| 文件写通道 | worker 是否能写 orchestrator 会加载的配置、hook、skill、MCP server | 共享 volume 同时服务执行环境与控制平面 |
| 出网控制 | worker 的真实网络流量是否被 runtime 层策略约束 | 只在 LLM tool call 层做域名 denylist |
| 持久状态 | memory、skills、session artifacts 是否记录来源与权限 | 目标返回内容可直接进入长期记忆或可执行 skill |
| 输出处理 | worker stdout/stderr 是否被当成非信任输入 | 模板拼接、shell interpolation、反序列化、日志 sink 未转义 |

这些问题的共同点是：它们都可以在不讨论模型能力的情况下被验证。也就是说，哪怕未来模型更善于识别恶意样本，系统仍然应该满足这些硬边界；反过来，如果这些边界不存在，再强的模型也只是在脆弱架构前面多放了一层概率过滤器。

一个更保守的部署策略可以分成三圈：

- **第一圈：可牺牲 worker**。worker 每次任务后销毁，文件系统只保留明确导出的低敏结果，不能回写控制平面状态。
- **第二圈：窄接口 orchestrator**。orchestrator 只接受结构化结果，不接受 worker 提交的新工具、新 hook 或可执行配置；所有内部 API 都需要强认证和调用来源校验。
- **第三圈：host 与组织边界**。host 不暴露 docker socket 给 worker，不把用户目录挂入 worker，不让 worker 直连任意互联网目标；高风险网络访问通过外部代理按任务 scope 审计。

这也解释了为什么论文把“task-specific API”放在设计原则里。原始 bash 是最灵活的接口，但它也把安全边界推给了模型和人类审查。受限 API 会牺牲一部分自由度，却能让系统明确知道正在发生的是端口扫描、HTTP 抓取、漏洞验证还是报告读取，从而把策略执行放回可审计层。

### 结论

`Red-Teaming the Agentic Red-Team` 的核心贡献，是把进攻型安全 Agent 从“能力工具”重新放回“可被攻击的系统”中审视。

最值得带走的判断有四个：

- **第一，目标环境可以反向攻击 Agent**。对于进攻型安全 Agent，敌对目标不是数据源，而是主动对手。
- **第二，worker RCE 应被当作可预期事件**。只要任务要求处理未知工件，模型迟早可能执行不该执行的东西。
- **第三，orchestrator-level guardrail 不是系统级防线**。它约束的是高层动作，不是 compromised worker 的真实行为。
- **第四，Agent 安全的关键是 blast radius**。最小权限、无 secret worker、强网络隔离、文件系统隔离、task-specific API，比“让模型更会识别恶意内容”更可靠。

这篇论文的边界也清楚：它不证明所有 Agent 部署都会按同一路径被攻破，也没有交付完整防御系统。但它给出了一个很有用的研究基准：任何能执行代码、访问网络、保存状态的 Agent，都应该先回答一个问题：

> 如果 worker 已经是恶意的，系统还能保证什么不发生？

能回答这个问题，才谈得上把 Agent 放进真实安全工作流。
