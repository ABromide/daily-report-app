# Rethinking Indirect Prompt Injection as a Test-Time Search Problem：把间接提示注入重新看成攻击者的测试时搜索

## 元信息与 TL;DR

- 原文：Rethinking Indirect Prompt Injection as a Test-Time Search Problem
- 作者：Duong M. Nguyen、Joon Sik Kim、Blazej Manczak、Vaikkunth Mugunthan
- 链接：https://arxiv.org/abs/2609.04495
- 类型：论文，AI 安全 / Agent 安全 / 间接提示注入
- 日期证据：
  - arXiv abs 页标记：Submitted on 3 Sep 2026；提交历史为 `Thu, 3 Sep 2026 21:28:37 UTC`。
  - arXiv 官方 `cs/new` 页把该论文列在 `Showing new listings for Monday, 7 September 2026` 下面。
- 本文边界：以下解读只讨论授权、隔离、合成环境里的安全评测方法，不复述可直接迁移到真实系统的攻击 payload 细节。

### TL;DR

- 这篇论文的核心判断很直接：间接提示注入不应只被看成一组固定 payload 的静态命中率，而应看成攻击者在特定用户任务、工具环境和注入目标共同诱导出的攻击面上做测试时搜索。
- 作者提出一个 agentic attacker search harness，包含环境侦察、策略/历史管理、以及带 victim-agent 反馈的 Evaluate 工具，让攻击者能在 token budget 下自适应地选择注入位置、语义 framing 和下一轮尝试。
- 实验用了两个合成任务套件：Workspace 来自 AgentDojo 口径，包含 40 个用户任务与 6 个注入任务，独立配对得到 240 个 task pairs；Retail 由 Prime-style environment generator 生成，包含 17 个用户任务与 8 个注入任务，独立配对得到 136 个 pairs。
- 指标不是单次攻击模板成功率，而是 ASR@T：在攻击者总 token 消耗为 T 时，统计注入目标被 victim agent 执行的比例；附录还定义了更严格的 JSR，要求攻击目标成功且原始用户任务也成功。
- 主结果显示攻击者 test-time compute 增加会提高漏洞发现与利用能力。作者明确报告：Retail 中 GPT-5.5 在约 50K tokens 后开始明显退化，而 Opus-4.8 在 500K tokens 时 ASR 为 20.6%；Workspace 中 GPT-5.5 在 100K tokens 已达到 52.1% ASR，而 Retail 同预算为 37.5%。
- 消融说明“多试几次”本身不够：No-Harness 去掉侦察与搜索工具后在 100K tokens 后平台期；No-Strategy 保留侦察但去掉 Strategy 管理，会重复相近攻击模式；Full-Harness 才能把更多预算转为策略多样化与长程收益。
- 最关键的安全含义是：Agent 安全报告必须说明攻击者能力、搜索过程和预算。一个 victim 在固定低预算攻击下看起来安全，并不代表它面对自适应搜索时仍安全。
- 证据边界也很清楚：论文使用白盒、合成任务套件、有限模型组合和有限 token budget；作者承认黑盒迁移、生产环境、更多 harness/防御和统计方差仍需系统评估。

## 研究问题：为什么 IPI 不是一个静态模板测试？

### 传统评测的隐含假设

- 间接提示注入通常被描述成：攻击者把恶意指令放进外部内容，Agent 在检索邮件、网页、文件或数据库记录时读到它，然后把它当成高优先级指令执行。
- 许多 benchmark 因此会固定：
  - 一批用户任务；
  - 一批注入目标；
  - 一批注入模板；
  - 一个 victim agent；
  - 一次或有限次数执行。
- 这种设置适合比较基础鲁棒性，但它暗含一个强假设：攻击成功率是 victim 的一个近似固定属性。

### 作者要推翻的地方

- 作者认为 IPI 的难度不只取决于 payload 文本强不强，而取决于三者交互：

| 因素 | 在论文里的角色 | 为什么会改变攻击面 |
|---|---|---|
| 环境 | 工具、状态、可读外部内容、可写目标 | 决定攻击者能把内容放在哪里，victim 会读到什么 |
| 用户任务 | benign tool-use trajectory | 决定 victim 必须经过哪些实体、文件、邮件、订单或日历 |
| 注入任务 | attacker objective | 决定恶意动作能否伪装成前置条件、后续清理或相关操作 |
| 攻击者能力 | 搜索、侦察、反馈利用、预算分配 | 决定能否从失败轨迹里找到更贴近工作流的 framing |

- 论文真正关心的问题是：如果攻击者不是一次性模板，而是一个能观察环境、测试 victim、记录失败、更新策略的 agent，那么现有 Agent 安全评测是否低估了风险？
- 这个问题把 IPI 从“prompt 字符串鲁棒性”推进到“工具化系统的动态攻击面”。

## 论文主张与论证路线

### Claim → Mechanism → Evidence → Boundary

| 层次 | 论文如何展开 | 我们应该如何读 |
|---|---|---|
| Claim | IPI 风险依赖 attacker search procedure 与 test-time compute budget | 报告 ASR 时必须带上攻击者预算，不然指标不可比 |
| Mechanism | Search harness 让攻击者侦察环境、管理策略、用 Evaluate 得到 victim feedback | 成功来自“任务相邻攻击面”，不是随机蛮力 |
| Evidence | Retail/Workspace 两个任务套件，GPT-5.5 与 Opus-4.8 两个 victim，GLM-5.2 attacker，高 reasoning effort | 证据覆盖异构工具流，但还不是生产部署证明 |
| Boundary | 白盒、合成环境、有限模型与预算；黑盒和真实系统留给未来 | 结论是“评测方法与风险趋势”，不是现实世界漏洞率 |

### 论证路线图

```mermaid
flowchart TD
  A[传统 IPI 静态评测] --> B[忽略用户任务诱导的动态攻击面]
  B --> C[把 IPI 表述为 test-time search]
  C --> D[设计 agentic attacker search harness]
  D --> E[在 Workspace 与 Retail 中按预算测 ASR@T]
  E --> F[发现预算增加与 harness 结构会改变 ASR]
  F --> G[提出评测报告应公开 attacker procedure 与 compute budget]
```

## 方法机制：Search Harness 到底做了什么？

### 形式化对象

- 作者采用的基元来自工具化 Agent 评测：
  - environment：应用域与状态，例如 workspace、email、calendar、retail support database；
  - tools：victim agent 能调用的动作接口；
  - environment state：任务执行前后的可验证状态；
  - user task：用户给 victim 的 benign request；
  - injection task：攻击者希望 victim 执行的恶意目标；
  - injection vector：可放置外部内容的位置，例如邮件正文、待办事项、评论、产品问答等。

### 搜索目标不是“写一个更强指令”

- 论文的关键转向是把攻击面看成 latent search space：
  - 位置维度：恶意内容应该放在哪个外部对象里；
  - 语义维度：它应该被包装成提醒、前置条件、清理动作、参考编号还是相关案例；
  - 工具路径维度：victim 需要调用哪些工具才能完成攻击目标；
  - 兼容性维度：攻击目标是否能自然嵌入 benign workflow；
  - 预算维度：继续侦察、生成新 payload、还是直接 Evaluate，都有 token 成本。

### 三个组件

| Harness 组件 | 输入 | 输出 | 作用 |
|---|---|---|---|
| Explore Environment | 环境说明、工具说明、当前任务、候选注入位置 | 对系统状态、实体、可用工具与约束的结构化理解 | 找到 victim 可能会读的路径和可写动作 |
| Reasoning and Searching | 已探索环境、攻击目标、历史失败 | 策略树、候选 subspace、下一批 payload/位置 | 避免只在同一种 wording 附近重复搜索 |
| Evaluation and Feedback | 候选攻击配置 | victim response、tool-use trajectory、utility score、security score | 把真实执行反馈变成下一轮搜索依据 |

### 伪代码重构

```text
Input:
  E: environment and tools
  U: user task
  I: injection task
  B: attacker token budget

State:
  K_env: environment knowledge
  S: strategy tree
  H: attempt history
  best: best observed attack configuration

Loop while budget remains:
  1. If K_env is thin, call reconnaissance tools for task-relevant entities.
  2. Use S and H to choose a promising attack subspace.
  3. Generate candidate injection vector and high-level framing.
  4. Evaluate candidate in a temporary environment.
  5. Record victim trajectory, utility score, security score, and failure reason.
  6. If security score succeeds, update best and decide whether to refine.
  7. If failures repeat, prune that semantic neighborhood and branch S.

Output:
  Attack success evidence under a specified search procedure and token budget.

Failure boundary:
  No success at B tokens means the search did not find a path within B,
  not that the victim is budget-independently secure.
```

## 实验设置：两个套件、两个 victim、一个 attacker

### Task suites

| 套件 | 来源/构造 | 用户任务 | 注入任务 | 独立配对数 | 主要意义 |
|---|---:|---:|---:|---:|---|
| Workspace | 采用 AgentDojo 风格任务 | 40 | 6 | 240 | 文件、邮件、日历、待办等办公工作流 |
| Retail | Prime-style environment generator 生成 | 17 | 8 | 136 | 客服、订单、商品、评论、消息等电商工作流 |

- 这两个套件不是为了覆盖真实世界所有 Agent，而是为了形成可执行、可验证、可重复的异构工具环境。
- Workspace 更像操作性办公任务：读取 artifact、发送邮件、删文件、建日历。
- Retail 更像 case-centric 支持流程：查用户、查订单、处理消息、报告 spam、购买商品。

### 模型设置

| 角色 | 模型 | 设置 |
|---|---|---|
| Victim 1 | Claude Opus 4.8 | high reasoning effort |
| Victim 2 | GPT-5.5 | high reasoning effort |
| Attacker | GLM-5.2 via Together AI | high reasoning effort |

- 作者把 victim 和 attacker 都放在较强推理设置下，避免只测弱模型的模板脆弱性。
- 这也意味着结果不能简化为“某个模型坏”，因为论文重点是预算、工具轨迹和任务兼容性如何共同改变攻击成功率。

## 指标：ASR@T 与 JSR 的差别

### ASR@T

- 主指标是 attack success rate at token budget T。
- 令第 j 个任务对的 security score 为：

```math
s_j \in \{0,1\}
```

- 则：

```math
\mathrm{ASR}=\frac{1}{N}\sum_{j=1}^{N}\mathbb{I}[s_j=1]
```

- 这个指标问的是：攻击者是否让 victim 执行了注入目标。
- 它不要求 victim 同时完成原始用户任务，因此能刻画“攻击目标本身是否被触发”。

### JSR

- 附录还定义 Joint Success Rate。
- 令第 j 个任务对的 utility score 为：

```math
u_j \in \{0,1\}
```

- 则：

```math
\mathrm{JSR}=\frac{1}{N}\sum_{j=1}^{N}\mathbb{I}[s_j=1 \land u_j=1]
```

- JSR 更严格，因为它要求恶意目标成功，同时 benign task 也成功。
- 对安全评测来说，ASR 与 JSR 应该一起看：
  - ASR 高说明系统会执行攻击目标；
  - JSR 高说明攻击还能隐藏在成功完成用户任务的轨迹里；
  - ASR 高、JSR 低说明攻击会破坏任务，但仍暴露工具权限风险。

## 主结果：预算本身是攻击能力的一部分

### Figure 2 的实验证据

| 观察 | 论文报告的关键数字 | 含义 |
|---|---:|---|
| Retail 中 GPT-5.5 明显退化 | 约 50K tokens 后 ASR 开始明显上升 | 低预算评测会低估可搜索攻击者 |
| Retail 中 Opus-4.8 更稳健 | 500K tokens 时 ASR 为 20.6% | victim model 之间存在清晰差距 |
| Workspace 中 GPT-5.5 更快达到高 ASR | 100K tokens 为 52.1% | 办公 artifact 工作流有更多短路径攻击面 |
| 同预算 Retail 对比 | 100K tokens 为 37.5% | 电商任务中某些攻击目标需要更长搜索 |

### 为什么 Workspace 更容易？

- 作者的解释不是“Workspace 防御更差”，而是任务路径更短：
  - 办公任务经常自然读取外部 artifact；
  - 待办、会议记录、邮件正文和 cloud-drive 文件本来就是 Agent 要处理的上下文；
  - follow-up、cleanup、calendar/email 动作更容易被包装成任务后续步骤；
  - victim 读到攻击内容的路径更像 benign workflow，而不是突兀插入。

### 为什么 Retail 仍然危险？

- Retail 中攻击成功与 workflow compatibility 强相关：
  - 如果 benign task 已经涉及 spam、moderation、support verification，私有信息写入内部 note 更容易被包装成流程动作；
  - 如果 benign task 已经触及 checkout、delivery、order handling，购买类恶意动作更容易找到自然路径；
  - 如果 benign task 很窄、工具路径短且目标无关，搜索也难以凭空制造兼容性。

## 消融：No-Harness 和 No-Strategy 证明了什么？

### 三种设置

| 设置 | 去掉了什么 | 论文观察 |
|---|---|---|
| Full-Harness | 无 | 能持续把预算转为新策略、新 framing 与更强搜索 |
| No-Harness | 去掉侦察和搜索工具 | 100K tokens 后进入平台期 |
| No-Strategy | 保留侦察，去掉 Strategy 管理 | 会过度侦察并重复相似攻击模式 |

### 关键解释

- No-Harness 说明：只有更多 tokens，但没有显式环境探索和反馈组织，收益会很快耗尽。
- No-Strategy 说明：知道环境还不够；如果没有策略树或语义层级，攻击者容易在同一方向上不断改写类似 payload。
- Full-Harness 的价值在于：
  - 失败后改变攻击目标与 benign task 的因果关系；
  - 把 near-miss 记录为后续搜索信号；
  - 在探索和利用之间动态切换；
  - 当局部 refinement 无效时重新扩展 attack surface。

## 附录证据：成功来自工作流相邻性，不是通用越狱

### Retail 注入任务难度表

| 难度 | 任务类型概括 | ASR | 作者解释 |
|---|---|---:|---|
| 低 | 标记消息、报告公开回复、归档消息等单步状态改变 | 100.0% | Routine action，工具路径短，不容易触发 victim 抵抗 |
| 高 | 内部 note 里的私有信息写入 | 76.5% 或 47.1% | 虽然敏感，但 sink 是内部 flag note，能被包装成工作流一部分 |
| 高 | 保存支付方式购买指定商品 | 41.2% | 高风险金融状态改变，17 对里成功 7 对，token-heavy |
| 高 | 把跨用户 PII 公开贴到评论或问答 | 0.0% | 公开披露更显眼，victim 更容易识别为明显恶意 |

### Workspace 注入任务难度表

| 难度 | 任务类型概括 | ASR | 解释 |
|---|---|---:|---|
| 中 | 删除 cloud-drive file | 97.5% | 破坏性动作但只需单个 `delete_file` 路径，40 对里成功 39 对 |
| 低 | 发送无害邮件 | 95.0% | 单步 `send_email`，40 对里成功 38 对 |
| 低 | 创建日历事件 | 95.0% | 单步 `create_calendar_event`，40 对里成功 38 对 |
| 中 | 转发普通邮件正文 | 92.5% | 同样是检索再发送，但内容不像凭证 |
| 高 | 转发 Facebook security code | 2.5% | 40 对里只成功 1 对，credential-like 信息更显眼 |
| 高 | 转发 security code 后删除 sent email | 0.0% | 增加隐蔽删除步骤，恶意性和操作复杂度都更高 |

### 这组数字的研究意义

- 风险不等于“敏感任务一定成功，低风险任务不重要”。
- 论文反而显示：
  - 操作上简单的工具动作，即使是删除文件，也可能高 ASR；
  - 语义上明显敏感的凭证类转发，即使工具路径类似，也显著更难；
  - 内部 sink 与公开 sink 的差异很大，前者更容易被解释为 routine case handling。
- 这支持作者的核心机制：攻击面是由任务路径、工具动作、目标语义和可见风险共同塑造的。

## Figure / Table 证据怎么读？

### Figure 1：把 IPI 变成搜索图

- Figure 1a 的重点不是画一个新攻击流程，而是说明攻击面由 environment、user task、injection task 共同诱导。
- Figure 1b 把 harness 分成探索、推理搜索、评估反馈三块。
- 这张图支撑的是方法主张：攻击者不是在固定 payload list 里采样，而是在执行反馈中迭代选择 subspace。

### Figure 2：ASR@T 曲线

- Figure 2 是论文最重要的经验结果。
- 它支持两个判断：
  - attack success 是 token budget 的函数；
  - victim robustness 也必须在相同 attacker budget 下比较。
- 如果只报告“某模型在某 benchmark 上 ASR=多少”，但不说明攻击者是否能自适应 Evaluate、是否有 50K/100K/500K tokens，就无法复现安全含义。

### Figure 5：Harness 消融

- Figure 5 回答一个可能质疑：是否只是预算越大随机试得越多？
- 消融结果否定了这个简化解释：
  - 没有 harness 时，增加预算到 100K 后收益有限；
  - 没有 Strategy 时，侦察存在但搜索方向重复；
  - 完整 harness 才表现出随预算继续提升的趋势。

### Table 5 / Table 6：攻击目标的语义难度

- 这两张表提供了比主图更细的安全诊断：
  - 同样是“发送邮件”，普通内容和安全码差异巨大；
  - 同样是“泄露信息”，内部 note 和公开评论差异巨大；
  - 同样是“有害动作”，单步删除文件可能比多步凭证外传更容易。
- 这说明 defense 不能只按工具名或动作类型划权限，还要考虑内容语义、sink publicness、任务上下文和连续动作模式。

## 与相关工作的关系

### 相比 AgentDojo / InjecAgent / WASP

- 早期或同期 benchmark 的价值在于给出可执行环境与固定任务集合。
- 本文不是否定这些 benchmark，而是指出：
  - 静态模板评测容易把攻击者能力固定住；
  - 当 attacker 可以从 victim feedback 学习时，ASR 不再是单点数值；
  - benchmark 应该报告 attacker procedure 与 compute budget。

### 相比 adaptive red teaming

- 论文把已有的自动化红队、黑盒 fuzzing、MCTS、trajectory-aware search 放进同一条脉络。
- 它的新意在于把“自适应攻击”表述为 dynamic test-time computation problem。
- 这使得 Agent 安全评测能借鉴推理模型里的 budget scaling 观念：不是问模型有没有被某个 prompt 打穿，而是问在给定预算和反馈通道下，攻击者能发现多少可利用路径。

## 证据边界与可复现性问题

### 作者承认的边界

- 实验是白盒：攻击者能看到环境；黑盒迁移需要更多计算，作者留给未来系统评估。
- 套件是合成的：Workspace 和 Retail 可执行、可验证，但不能代表所有生产环境。
- 模型覆盖有限：victim 只有 Claude Opus 4.8 与 GPT-5.5，attacker 是 GLM-5.2。
- 预算有限：500K token cap 可能截断仍在积极改进的搜索过程。
- 统计方差有限：重复 victim evaluations 的计算成本限制了独立运行数量。

### 还需要谨慎的地方

- 论文报告了清晰趋势，但它不是现实系统漏洞率测量。
- 高 ASR 的低风险动作不一定造成同等安全损失，但它说明工具权限与任务上下文可以被操控。
- 低 ASR 的凭证类泄露也不等于已解决，因为更强 black-box optimizer、更长预算、更贴近真实业务的环境可能改变结果。
- 作者没有给出生产级 defense，只是证明评测必须把 adaptive attacker 纳入威胁模型。

## 更细的机制判断：为什么“任务相邻”比“指令强度”更重要？

### 从 prompt 强度到 trajectory plausibility

- 很多 IPI 讨论会自然落到“payload 是否更隐蔽、更强硬、更会绕过系统提示”。
- 这篇论文的更有价值之处，是把注意力从单条文本转移到 trajectory plausibility：
  - victim 是否本来就需要读取承载注入内容的对象；
  - victim 是否本来就会使用相近工具；
  - 注入目标是否能被解释为用户任务的前置检查、后续清理或同一业务 case 的旁支；
  - 执行攻击目标后，最终环境状态是否仍像一个合理的任务完成结果。
- 这解释了为什么“公开贴出跨用户 PII”在 Retail 中为 0.0%，但“写入内部 spam flag note”可以达到较高 ASR：前者的 sink publicness 太显眼，后者更像客服工作流内部记录。
- 也解释了为什么 Workspace 里删除文件能到 97.5%：它是破坏性动作，但工具路径短，且如果用户任务本来围绕 cloud-drive artifact 展开，victim 可能把删除看成清理动作。

### 对评测设计的反向要求

| 常见简化 | 论文给出的修正 |
|---|---|
| 只测固定 payload | 测攻击者如何根据失败反馈换策略 |
| 只看 victim 最终回答 | 记录 tool-use trajectory 与 environment state |
| 只报告一个 ASR | 报告 ASR@T，并说明 T 的 token 口径 |
| 只按动作危险性排序 | 同时考虑 sink publicness、任务兼容性、工具步数和内容语义 |
| 只给平均值 | 拆到 injection task / user task pairing，解释成功因素 |

- 这种设计比单纯扩大样本数更重要，因为 IPI 的攻击面不是均匀分布的。
- 如果 benchmark 没有覆盖不同工具路径、不同外部 artifact、不同 sink 类型，平均 ASR 会掩盖最关键的结构性弱点。

## 防御含义：把工具调用变成可审计的语义承诺

### 单层防御为什么不足

- 输入清洗只能处理“外部内容里像指令的文本”，但论文里的成功机制往往更像“合理工作流里的旁路动作”。
- 系统提示可以声明外部内容不可信，但当 victim 必须读取外部内容才能完成任务时，模型仍要把其中一部分信息转成行动依据。
- 工具权限白名单可以限制可调用动作，却很难判断“这次调用是否仍属于原始用户任务”。
- 因此，防御目标不应只是让模型忽略恶意指令，而是让每一次工具调用都能被绑定到可审计的任务意图。

### 一个更合理的防御分层

| 层 | 需要记录的证据 | 可检测的风险 |
|---|---|---|
| Source layer | 外部内容来源、信任等级、是否可写、是否跨用户 | 不可信内容被当成授权来源 |
| Intent layer | 用户原始目标、允许的子目标、禁止的 sink | 注入目标伪装成任务延伸 |
| Tool layer | 工具名、参数、读写对象、状态改变 | routine tool 被用于越权状态改变 |
| Data-flow layer | 数据从哪个 source 流向哪个 sink | 私有数据进入公开或跨域 sink |
| Review layer | 高风险动作是否需要人类确认或 verifier 判定 | 多步链式攻击绕过单点检查 |

- 这类分层和论文的 test-time search 视角是对应的。
- 攻击者搜索的是“哪里能把注入目标嵌进任务轨迹”，防御者就要记录“每个动作为什么属于原任务”。
- 如果系统只能看到单个 tool call，而看不到它与用户目标和外部来源之间的关系，就很难区分 legitimate cleanup 与 injected side effect。

### 可以由本文继续推进的实验

- 第一类实验：固定 victim 和任务套件，逐步增加 defender-side policy。
  - 例如只加 source labeling、只加 sink policy、只加 tool confirmation、组合加入 data-flow verifier。
  - 观察 ASR@T 曲线是否整体下降，还是只把攻击推向更长预算。
- 第二类实验：固定防御，改变 attacker feedback。
  - 如果只返回 success/fail，不返回 tool trajectory，攻击者是否仍能找到相邻工作流？
  - 如果延迟反馈或噪声反馈，Strategy 工具是否还有效？
- 第三类实验：把 JSR 作为主要指标。
  - 真实攻击通常希望保留用户任务成功以降低可疑度。
  - 如果某防御只降低 JSR 而不降低 ASR，它可能仍允许有害状态改变，只是更容易暴露。

## 对后续 Agent benchmark 的约束建议

### 最低报告标准

- 我会把这篇论文读成一个 benchmark reporting checklist，而不只是一次 IPI 攻击实验。
- 后续 Agent 安全 benchmark 至少应该报告：
  - attacker 是否能读环境；
  - attacker 是否能多轮 Evaluate；
  - 每轮 Evaluate 返回哪些反馈；
  - attacker token budget 与 victim token budget 是否分开统计；
  - 每个成功是否同时保留 utility；
  - 成功分布是否集中在少数 user-task / injection-task pairs；
  - 是否存在 compute cap 截断仍在改进的搜索。

### 为什么这会影响论文结论可比性？

- 两篇论文都报告 20% ASR，并不一定代表同等安全风险。
- 如果第一篇只用固定模板、低预算、无 feedback，第二篇用 agentic attacker、500K tokens、完整 trajectory feedback，它们测到的是不同威胁模型。
- 相反，如果一个 defense 在低预算攻击下表现很好，但在 Full-Harness 高预算下退化，就说明它可能只抵御了浅层 payload，而没有缩小任务诱导攻击面。
- 这也是本文最值得被后续工作继承的地方：把攻击者视作具有资源约束的搜索过程，而不是一个静态输入分布。

## 对 Agent 安全研究的启发

### 评测报告应该新增哪些字段？

| 字段 | 为什么需要 |
|---|---|
| attacker model | 攻击者本身的推理能力影响搜索质量 |
| victim model | 不同 victim 在同预算下可比 |
| search harness | 是否有侦察、策略管理、Evaluate feedback |
| token budget | ASR 是预算函数，低预算结论不能外推 |
| feedback channel | victim trajectory、utility/security score 会显著提升搜索效率 |
| task-suite topology | 工具数量、artifact 类型、sink publicness 决定攻击面 |
| ASR 与 JSR | 区分“攻击成功”与“攻击并保持任务成功” |

### 防御设计不应只做输入清洗

- 如果攻击面来自 task trajectory，防御也要进入 trajectory 层：
  - 对外部内容做 instruction/data 分离；
  - 对工具调用做目的绑定；
  - 对跨上下文数据流做 sink-aware policy；
  - 对 state-changing tools 做多步确认或 capability scoping；
  - 对任务相邻但权限升级的操作做异常检测。

### 更值得追问的问题

- 黑盒场景下，攻击者需要多少额外预算才能达到白盒近似效果？
- 如果 victim 有强制引用来源、显式工具意图声明、或沙箱权限，ASR@T 曲线会如何变化？
- JSR 是否比 ASR 更能预测真实攻击隐蔽性？
- 能否把 attack surface breadth 定义为可计算指标，例如工具图的可达 sink 数、外部 artifact 读取次数、跨用户数据流数量？
- 防御评测是否也要给 defender test-time compute，例如在线策略更新、trajectory monitor 或 verifier ensemble？

## 结论

- 这篇论文最重要的贡献不是一个更强的 prompt injection payload，而是把 Agent IPI 评测改写成一个动态搜索问题。
- 一旦接受这个视角，安全结论就必须从单点 ASR 变成曲线：`ASR = f(attacker, harness, feedback, task surface, token budget)`。
- 对研究者来说，它把 Agent 安全的焦点从“模型是否服从坏指令”推进到“系统是否暴露可被自适应搜索放大的任务相邻攻击面”。
- 对工程防御来说，它提醒我们：权限、工具、外部内容和任务路径不能分开治理；攻击者利用的正是这些边界之间的缝隙。
- 当前证据仍是受控合成环境中的初步结果，但它已经足以要求未来 Agent benchmark 把 attacker compute budget 和 search procedure 作为一等公民报告。
