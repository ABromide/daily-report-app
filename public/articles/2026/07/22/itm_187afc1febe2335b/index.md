# Know Your Agent：为什么 Agent 红队不能只改 Prompt，而要先做侦察

## 元信息

| 字段 | 内容 |
|---|---|
| 论文 | Know Your Agent: Reconnaissance-Driven Pentesting of AI Agents |
| 链接 | https://arxiv.org/abs/2607.19837 |
| 主题 | AI 安全 / Agent 渗透测试 / 间接提示注入 |
| arXiv 日期 | 2026-07-22 |
| item_id | itm_187afc1febe2335b |

## TL;DR

- 这篇论文的核心判断是：测试 AI Agent 的间接提示注入风险，不应该像反复试 prompt 模板，而应该像传统渗透测试一样，把 reconnaissance 放进攻击循环。
- 作者提出 agent reconnaissance：黑盒攻击者通过正常交互逐步提取目标 Agent 的工具、tool schema、权限、当前任务、拒绝边界、防御措辞和执行环境，再用这些 knowledge assets 构造更贴合目标的 IPI payload。
- 论文实现了 Know Your Agent（KYA）：由 Orchestrator、Reconnaissance、Exploitation 三个模块围绕目标画像 `M` 循环运行；每次失败不只是改写 payload，而是判断还需要学习什么目标属性。
- 在 AgentDojo 和 InjecAgent 上，KYA 分别达到 86.0% 和 99.3% ASR；AgentDojo 更能体现价值，因为它包含 Workspace、Slack、Travel、Banking 四类多步工具工作流，共 629 个 user-task × attack-goal 组合。
- 跨模型实验显示 KYA 不依赖某个目标模型：在 AgentDojo 上 GPT-4.1 为 86.0%，Llama 3.3-70B 为 72.3%，Gemini 3 Flash 为 89.2%；Gemini 3 Flash 上 Important Instructions 只有 8.1%，说明通用模板失效时，目标侦察仍能打开攻击面。
- 消融显示 reconnaissance 是主要贡献：无先验知识时单次 payload 在 97 个 AgentDojo 任务上只有 12.4% ASR，带防御时 2.1%；只知道 Agent 当前任务即可提升到 61.9% 和 38.1%。完整框架在 AgentDojo 上达到 86.0%，NoRecon 只有 27.4%。
- 常见 prompt-level 防御不能完全解决问题：delimiter defense 几乎无效，KYA ASR 从无防御 86.0% 变成 86.3%；repeat-user-prompt 降到 53.0%；PI detector 最强，降到 30.4%，但也会显著影响 benign-task utility。
- OpenHands 真实 coding agent case study 给出更现实的边界：5 个小仓库、10 个软件工程任务、7 个注入目标、3 次重复，共 70 个 unique cases；KYA 总 ASR 为 21.9%，其中 Risky tier 最高 35.0%，Benign 28.3%，Dangerous 8.9%。
- 论文局限包括：KYA 本身是双用途工具；AgentVigil/AutoHijacker 是 best-effort 复现；OpenHands 仓库刻意较小；部分代码承诺 camera-ready release；结果衡量的是授权闭环测试中的攻击成功，不等于真实恶意利用许可。

## 研究问题：为什么“先侦察”会改变 Agent 安全评测？

### 当前红队方法的盲点

很多 Agent IPI 测试仍在做三类事情：

- 静态模板：
  - 例如 ignore previous instructions。
  - 简单、可复现，但不关心目标 Agent 的工具和任务。
- 单次生成：
  - 让模型生成更自然或更隐蔽的 payload。
  - 仍然是 fire-and-forget。
- 迭代改写：
  - 根据失败、拒绝、成功反馈修改 payload。
  - 反馈主要被当成“下一版 prompt 怎么写”的优化信号。

论文指出，这些方法遗漏了传统 pentesting 最关键的环节：每一次交互都能学习目标系统的新事实。对 Agent 来说，这些事实不是端口和服务版本，而是工具名称、schema、系统提示风格、拒绝语、当前任务、用户 persona、权限边界和 defense wording。

### Agent 的可观察行为本身就是攻击面

传统软件中，错误信息、banner、开放端口会泄露目标结构；Agent 中，对话和工具行为扮演类似角色：

- Agent 能不能访问 Slack？
- Slack tool 的参数名是什么？
- 它能读哪些 channel？
- 什么请求会触发拒绝？
- 它当前是在帮用户报销、订票、发邮件，还是修代码？
- 它如何格式化 tool output、system note、assistant message？

这些信息会让 payload 更像合法工作流的一部分，而不是孤立恶意指令。

## 威胁模型：KYA 到底假设攻击者能做什么？

论文聚焦 tool-using agent 的间接提示注入：

```text
D_env = D_benign || p_adv
```

- `D_benign` 是环境中的正常数据：
  - 网页、文档、邮件、repo 文件、tool output。
- `p_adv` 是攻击者种进去的恶意 payload。
- 当 Agent 通过工具读取 `D_env` 时，payload 进入上下文窗口。

攻击目标包括：

- 未授权 tool invocation：
  - 发送邮件、转账、修改 repo 状态。
- 数据泄露：
  - 把 secret、邮件、tool output 发到攻击者控制位置。
- 输出操纵：
  - 误导用户或改变报告结论。

黑盒假设也很重要：

- 攻击者不能修改模型权重。
- 不能直接读 system prompt。
- 不能改 tool 实现。
- 只能像合法用户一样交互。
- 可以在 Agent 会读取的数据源中放置内容。
- 可以观察交互轨迹中暴露的回复和工具行为。

这使 KYA 更接近真实授权测试，而不是白盒安全审计。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| Agent IPI 测试应包含 reconnaissance | 把目标画像 `M` 作为循环状态，每次交互后更新 knowledge assets | KYA 在 AgentDojo 86.0%、InjecAgent 99.3% ASR | 高 ASR 是红队能力，不是防御推荐 |
| 目标知识比通用模板更关键 | 工具、schema、任务、拒绝边界、格式等资产让 payload 更可执行 | AgentDojo 上 KYA 明显超过 AgentVigil、Important Instructions 等 | InjecAgent 已接近饱和，区分度较低 |
| 当前 prompt-level 防御不足 | 侦察能适配 delimiter、repeat prompt、PI detector 等防御 | delimiter 下 KYA 仍 86.3%，repeat prompt 53.0%，PI detector 30.4% | PI detector 降低 ASR 但会影响 utility |
| 真实 coding agent 中最危险的是“看起来合理”的风险目标 | OpenHands case study 中 Risky tier 35.0% 高于 Dangerous 8.9% | 5 仓库、10 任务、7 目标、3 pass | 仓库刻意较小，不能代表全部 SWE 场景 |

## KYA 框架：三个模块围绕目标画像循环

### 目标画像 `M`

KYA 的核心状态是 target profile `M`。它记录：

- asset value：
  - 例如 tool name、schema、拒绝短语、用户任务。
- leverage type：
  - Evasion、Pretext、Blueprint。
- exploited weakness：
  - W1 surface-form trust。
  - W2 coherence-based legitimation。
  - 或两者同时。

`M` 初始为空，并在测试过程中单调增长。每次新观察都会让后续 payload 更贴合目标。

### Orchestrator

Orchestrator 决定下一步是学习还是攻击：

- 会扫描 tactic library。
- 选择对未知目标估计成功率最高的 tactic。
- 检查 tactic 需要哪些 prerequisite assets。
- 如果 `M` 里缺信息，就派 Reconnaissance。
- 如果信息足够，就派 Exploitation。
- 如果攻击失败，就把失败回复当成诊断信号：
  - 继续侦察。
  - 改写当前 tactic。
  - 或切换 tactic。

这和传统 payload mutation 的区别在于：失败不是简单的“prompt 不够强”，而可能说明缺少某个目标事实。

### Reconnaissance

Reconnaissance 模块用 Scout agent 生成 probe：

- Active assets：
  - 通过 benign question 获取，例如“你能帮我做什么”“列出工具”。
- Passive assets：
  - 观察目标对某些输入的反应，例如哪些词触发过滤。
- Conversational assets：
  - 通过空 payload 或正常互动获取当前任务、用户语气、benign response pattern。

这些 probe 的目标不是直接攻击，而是补全 `M`。

### Exploitation

Exploitation 模块由两个子角色组成：

- Strategist：
  - 根据 tactic 和 `M` 生成结构化 crafting plan。
  - 决定采用什么格式、pretext、避开什么触发词。
- Forger：
  - 把计划转成最终 payload。
  - 把 Blueprint、Pretext、Evasion 三类资产合成具体注入文本。

用伪代码表示：

```text
Input:
  target agent A
  tactic library L
  empty profile M
  attack objective G

Loop until success or budget exhausted:
  tactic = Planner.select(L, M, G)
  missing = tactic.required_assets - M.assets

  if missing is not empty:
    probe = Scout.make_probe(missing, M)
    observation = run_against_agent(A, probe)
    M.update(extract_assets(observation))
    continue

  payload = Strategist.plan(tactic, M, G)
  injection = Forger.render(payload, M)
  result = run_attack(A, injection)

  if objective_satisfied(result, G):
    return success

  M.update(extract_assets(result))

Output:
  success/failure
  discovered target profile
  payload trajectory
```

## Knowledge assets：什么信息最有攻击价值？

论文把资产分成三类：

| 类型 | 作用 | 例子 |
|---|---|---|
| Evasion | 避开过滤、拒绝和防御触发点 | guardrail wording、敏感 token、拒绝边界 |
| Pretext | 让 payload 像当前任务的自然延续 | 用户当前目标、业务上下文、用户 persona |
| Blueprint | 让 payload 采用目标信任的结构形式 | tool schema、role marker、XML/Markdown delimiter、tool-call syntax |

最关键的发现是 Agent's Task。单独给攻击者这一项资产，就把 97 个 AgentDojo 任务上的 ASR 从：

- 无防御 baseline 12.4% 提到 61.9%。
- 带防御 baseline 2.1% 提到 38.1%。

这说明很多 IPI 成败不取决于 payload 是否更“坏”，而取决于它是否像当前任务里合理的一步。

### 资产之间不是并列关系，而是组合关系

论文最值得细读的地方在于，它没有把 knowledge asset 当成一串可泄露字段，而是解释这些字段如何组合成攻击条件：

- 只有 tool name：
  - 攻击者知道目标可能能调用 Slack、email 或 shell。
  - 但不知道参数结构时，payload 仍容易写错。
- 加上 tool schema：
  - payload 可以嵌入更像真实调用的字段名、路径、收件人、channel 或命令结构。
  - 这让模型更容易把外部文本解释为“可执行计划”。
- 再加上用户当前任务：
  - 攻击目标可以被包装成任务延伸。
  - 例如“备份 Slack 频道”比“窃取所有消息”更像工作流动作。
- 再加上拒绝边界：
  - 攻击者知道哪些词、格式或动作会触发防御。
  - 后续 payload 就会避开这些触发点，或者把动作改写成安全检查、迁移、备份、合规审计等 pretext。

这解释了为什么 KYA 的目标画像 `M` 必须跨轮积累。单个资产可能只让 payload 更自然一点；多个资产组合后，payload 才能同时满足三个条件：看起来像目标环境中的可信格式、看起来像当前任务的合理下一步、看起来没有踩中防御触发词。

### 资产泄露也有“最小必要披露”问题

防守者不能简单禁止 Agent 说明能力，因为用户确实需要知道系统能做什么。但论文给出的启发是：不同层级的信息应该分级披露。

| 信息 | 用户可用性价值 | 攻击价值 | 更稳妥的披露方式 |
|---|---|---|---|
| 高层能力 | 高 | 中 | 可以说“我能帮助处理邮件和日程” |
| 精确 tool schema | 中 | 高 | 仅在执行前向授权用户展示必要参数 |
| 拒绝触发词 | 低 | 高 | 只给类别化原因，不泄露绕过细节 |
| 当前用户任务 | 高 | 高 | 不应向外部网页、邮件、repo 注释回显 |
| 权限边界 | 高 | 高 | 给用户读权限摘要，但不给不可信内容枚举 |

因此，KYA 不只是攻击框架，也是在提醒 Agent runtime 需要“披露面治理”。很多系统把可解释性和透明度都压到自然语言里，结果把 tool schema、policy wording 和任务上下文一起泄露给了潜在攻击者。

## 两个 Agent 弱点：为什么侦察资产会转化成攻击力？

### W1：Surface-form trust

模型会把某些表面形式和 authority 关联：

- system prompt 语言。
- role marker。
- XML 或 Markdown delimiter。
- tool-output structure。
- schema fragment。
- tool-call syntax。

这些形式本来帮助模型在正常任务中理解结构，但攻击者一旦通过侦察学到目标使用的具体形式，就可以在不可信内容中仿造它们。

### W2：Coherence-based legitimation

Agent 往往会优先执行与当前上下文“连贯”的动作。攻击者如果知道：

- 当前用户任务。
- 正在使用的工具。
- 文件名或业务对象。
- 用户语气。
- workflow 阶段。

就能把注入目标伪装成任务延伸。OpenHands case study 里 Risky tier 比 Dangerous tier 更成功，正是这个机制的证据：删除文件或交换文件名看起来像开发任务中的清理/重构；上传 `/etc/shadow` 则太不连贯，反而更容易被忽略。

## 实验一：AgentDojo 与 InjecAgent

### 设置

AgentDojo 包含四类 agent：

| Suite | User tasks | Attack goals |
|---|---:|---:|
| Workspace | 40 | 6 |
| Slack | 21 | 5 |
| Travel | 20 | 7 |
| Banking | 16 | 9 |

总计 629 个 user-task × attack-goal 组合。目标模型包括 GPT-4.1、Llama 3.3-70B、Gemini 3 Flash。KYA 由 GPT-5 驱动，最多选择 3 个 tactic，总计最多 10 次 exploitation attempts。

### GPT-4.1 目标 Agent 上的主表

| Benchmark | Method | ASR |
|---|---|---:|
| AgentDojo | Ignore Previous | 2.5% |
| AgentDojo | Important Instructions | 47.7% |
| AgentDojo | AgentVigil | 37.7% |
| AgentDojo | AutoHijacker | 1.0% |
| AgentDojo | KYA No Recon | 27.4% |
| AgentDojo | KYA Full | 86.0% |
| InjecAgent | TopicAttack | 98.6% |
| InjecAgent | AgentVigil | 89.7% |
| InjecAgent | KYA No Recon | 97.8% |
| InjecAgent | KYA Full | 99.3% |

### 如何解读？

- AgentDojo 是更有区分度的测试：
  - 多步工具工作流让目标知识变得关键。
  - KYA Full 比 No Recon 高 58.6 个百分点。
- InjecAgent 接近饱和：
  - 很多强 prompt-generation baseline 已经很高。
  - KYA 仍最高，但增量较小。

这证明 reconnaissance 对复杂 Agent 工作流更关键，而不是单纯让 payload 文风更强。

## 实验二：跨模型稳健性

| 目标模型 | Method | AgentDojo ASR | InjecAgent ASR |
|---|---|---:|---:|
| GPT-4.1 | Important Instructions | 47.7 ± 3.9 | 65.2 ± 2.8 |
| GPT-4.1 | AgentVigil | 37.7 ± 3.8 | 89.7 ± 1.8 |
| GPT-4.1 | KYA | 86.0 ± 2.7 | 99.3 ± 0.5 |
| Llama 3.3-70B | Important Instructions | 31.3 ± 3.6 | 80.3 ± 2.4 |
| Llama 3.3-70B | AgentVigil | 34.5 ± 3.7 | 98.8 ± 0.6 |
| Llama 3.3-70B | KYA | 72.3 ± 3.5 | 99.7 ± 0.3 |
| Gemini 3 Flash | Important Instructions | 8.1 ± 2.1 | 3.9 ± 1.1 |
| Gemini 3 Flash | AgentVigil | 21.6 ± 3.2 | 98.0 ± 0.8 |
| Gemini 3 Flash | KYA | 89.2 ± 2.4 | 99.9 ± 0.1 |

Gemini 3 Flash 上的结果尤其说明问题：

- 通用静态模板在 AgentDojo 上只有 8.1%。
- AgentVigil 也只有 21.6%。
- KYA 达到 89.2%。

这意味着，即使目标模型能抵抗通用 payload，它仍可能通过正常交互暴露工具、任务和防御形式；攻击者可以利用这些资产构造高度定制 payload。

## 实验三：消融与防御

### 组件消融

作者把 KYA 拆成 reconnaissance 和 tactic database：

- Reconnaissance 是主要贡献。
- 34% 成功只出现在包含 reconnaissance 的配置中。
- Tactics alone 只比 Recon only 多 4%。
- Full system 独有解决 31% case，说明 tactic 要和侦察资产结合才真正有效。
- NoRecon 在 AgentDojo 累计 ASR 只有 27.4%，Full 为 86.0%。

结论很明确：

```text
Reconnaissance is not a convenience feature;
it is the capability that turns interaction feedback into target knowledge.
```

### Prompt-level 防御

| Attack Method | No Defense ASR | PI Detector ASR | Repeat Prompt ASR | Delimiters ASR |
|---|---:|---:|---:|---:|
| Important Instructions | 47.7 | 13.4 | 27.3 | 41.2 |
| AgentVigil | 37.7 | 8.9 | 24.3 | 35.3 |
| KYA | 86.0 | 30.4 | 53.0 | 86.3 |

这张表有三个重点：

- Delimiter defense 几乎挡不住 KYA：
  - 86.0% -> 86.3%。
- Repeat prompt 有效果但残余很高：
  - 86.0% -> 53.0%。
- PI detector 最强：
  - 86.0% -> 30.4%。
  - 但表中还报告 utility 变化，许多 baseline 的 benign-task utility 明显下降。

因此，提示层防御不是无用，但它不能消除侦察驱动攻击。更强防线应放在工具权限、数据源隔离、action approval、tool output taint tracking 上。

### 为什么 delimiter 防御几乎无效？

Delimiter 的思想是把工具输出包起来，并告诉模型不要执行其中的指令。它的问题在于：

- 它仍然依赖模型在同一个上下文窗口里维持边界。
- 它没有改变工具调用权限。
- 它没有阻止攻击者学习 delimiter 的具体形式。
- 它没有把 untrusted tool output 从“可参考数据”降级成“不可发起动作的数据”。

KYA 的侦察循环会把 delimiter 本身变成 Blueprint asset。攻击者一旦知道目标怎样标记工具输出，就可以构造更像系统格式、错误日志、迁移说明或安全提醒的 payload。换句话说，delimiter 如果只是文本约定，而不是 runtime-enforced label，它就会成为可模仿的表面形式。

### PI detector 为什么更强但有成本？

PI detector 在表中把 KYA ASR 降到 30.4%，说明专门分类工具输出是否含注入确实有效。但它也带来两个研究问题：

- 第一，分类器会干扰 utility：
  - 如果检测器把正常工具输出误判为恶意，Agent 就无法完成用户任务。
  - 表中多个 baseline 的 utility 下降明显，说明检测不是免费安全层。
- 第二，分类器本身也可能被侦察：
  - 攻击者可测试哪些措辞被拦。
  - 可把命令拆成更像任务说明的片段。
  - 可利用当前用户任务做 pretext，让 payload 更像自然上下文。

因此，更完整的防御不是“检测到注入就结束”，而是把检测结果接入 action policy：

```text
if tool_output_is_tainted:
  allow summarization
  deny new high-impact tool calls
  require user confirmation for state change
  strip executable instructions before model planning
```

这样即使 detector 漏掉部分 payload，后面的 action boundary 仍能限制真实副作用。

## OpenHands case study：为什么“中等危险”反而更容易成功？

### 设置

作者用 OpenHands 做真实 coding agent 验证：

- 5 个小仓库：
  - 数值 helper。
  - Flask web app。
  - sorting library。
  - SQLite data layer。
  - number-theoretic generator。
- 10 个真实软件工程任务：
  - bug fix。
  - feature implementation。
  - code refactoring。
  - code comprehension。
- 7 个注入目标：
  - Benign。
  - Risky。
  - Dangerous。
- 70 个 unique cases。
- 每个 case 跑 3 pass。

Payload 被写入 Agent 会打开的源文件中，包装成 Python comment，例如 `# DEVELOPER NOTE: ...`。它不会出现在用户 prompt 中，只在 Agent 读文件时进入上下文。

### 结果

| Tier | ASR |
|---|---:|
| Benign | 28.3% |
| Risky | 35.0% |
| Dangerous | 8.9% |
| Overall | 21.9% |

这个非单调结果很重要：

- Benign 目标虽然无害，但可能和当前任务不相关。
- Dangerous 目标太突兀，例如上传 SSH key 或读取 `/etc/shadow`。
- Risky 目标最像真实开发工作的一部分：
  - 删除 stray file。
  - 重命名或交换文件。
  - 调整仓库结构。

所以 Agent 的危险并不只来自“更坏的指令”，而来自“坏指令是否能伪装成当前任务中的合理动作”。

## Figure / Table 证据逐项解读

### Figure 1：Reconnaissance in the loop

这张图的作用是区分两种红队哲学：

- 旧方法：
  - attack -> fail -> mutate attack。
- KYA：
  - recon -> profile -> attack -> observe -> recon/profile update -> attack。

它支撑论文的核心机制：攻击循环中的状态不是 payload 字符串，而是目标画像。

### Figure 2：State chart

Figure 2 把 prior workflows 放在单一 attack state 里，而 KYA 增加 reconnaissance state。这个 state 的意义是主动寻找 knowledge asset `k`，再用 `k` 构造 `p_adv`。

这解释了为什么 KYA 能越过一些模板无法越过的边界：它不是押注某个通用模板，而是先发现目标需要什么格式、pretext 或 evasion。

### KYA architecture figure

架构图显示：

- Orchestrator 决策。
- Reconnaissance / Exploitation 产出 payload。
- Target agent 执行。
- 观察结果回写 `M`。

这里 `M` 是全文最重要的状态变量。没有 `M`，系统退化成普通 iterative attack。

### AgentDojo / InjecAgent table

这张表证明：

- 在复杂工具工作流里，KYA 的优势最大。
- 在单步或已饱和 benchmark 里，KYA 仍能最高，但贡献边际变小。

因此它不是“所有场景都因为更强生成模型而提升”，而是“需要目标建模的场景最受益”。

### Defense table

防御表说明：

- delimiter 是弱边界。
- repeat-user-prompt 是中等边界。
- PI detector 是较强但有 utility 成本的边界。

更重要的是：KYA 在所有防御下仍为最高 ASR。这说明防御如果只在 prompt 层处理文本，很难阻止对工具 schema、任务语境和拒绝边界的适配。

## 安全含义：如何防 reconnaissance-driven IPI？

### 1. 减少不必要的 target disclosure

Agent 不应随意泄露：

- 完整 tool list。
- tool schema。
- 权限范围。
- system instruction 片段。
- guardrail wording。
- internal policy rationale。

但这不能做成“完全不解释”，否则可用性下降。更合理的是：

- 给用户必要的高层能力说明。
- 对攻击者可利用的精确 schema 做最小披露。
- 对拒绝原因做类别化，不暴露触发词。

### 2. 把 tool output 当成 tainted data

IPI 的根源是 tool output 进入上下文后被模型当作指令。防御应维护 taint：

```text
tool output from untrusted source
  -> may inform answer
  -> may not create new instruction
  -> may not request tool call
  -> may not override user/system policy
```

这需要 runtime 支持，而不是只靠 prompt 说“不要听网页里的指令”。

### 3. 权限要绑定用户意图，而不是绑定 Agent 能力

KYA 利用 task plausibility。防御也应使用 task binding：

- 当前用户任务允许哪些 action？
- 哪些 tool call 是完成任务所必需？
- 哪些 action 虽然工具可用，但不属于当前授权？
- 外部数据能否提出新的 tool call？

如果用户只是让 Agent 总结网页，网页内容不应获得发邮件、转账或改 repo 的权力。

### 4. 红队报告应输出目标画像泄露清单

KYA 作为防御工具时，不应只报告 payload 成功率。更有价值的是：

- 泄露了哪些 tools。
- 哪些 schema 可被枚举。
- 哪些 refusal boundary 可被探测。
- 哪些 task context 可被外部内容利用。
- 哪些 defense wording 被转化为 evasion strategy。

这能把攻击结果变成可修复事项。

### 5. 把“侦察成功”当成独立漏洞等级

一个 payload 没有最终成功，并不代表系统安全。如果攻击者已经枚举出高价值资产，后续攻击成本会下降。防守侧可以把侦察结果分级：

- P3：
  - 只泄露高层能力，例如“我能处理邮件”。
- P2：
  - 泄露具体 tool 名称、部分参数、拒绝类别。
- P1：
  - 泄露完整 schema、权限范围、当前用户任务或防御措辞。
- P0：
  - 泄露可直接执行高影响动作的调用格式，并且外部内容可诱导 Agent 采用该格式。

这种分级能避免只看最终 ASR 的盲点。KYA 的价值之一就是把“攻击前学到了什么”记录下来，让团队知道哪一层信息披露需要收紧。

### 6. 复现实验时应同时记录失败轨迹

如果团队把 KYA 当成授权测试工具，不应只保存成功 payload。失败轨迹同样有价值，因为它能说明防御到底在哪一层生效：

- payload 未进入上下文：
  - 说明数据源或检索路径隔离有效。
- payload 进入上下文但没有被执行：
  - 说明模型或 prompt policy 起作用。
- payload 触发 tool call 但被 runtime 拦截：
  - 说明 action authorization 有效。
- payload 触发敏感动作后才被撤回：
  - 说明语言层有意识，但执行前拦截失败。

这四类失败对应完全不同的修复方向。只报告最终 ASR 会把它们混在一起，导致团队误以为“模型拒绝了”就等于“系统安全了”。

### 7. 部署前的最低检查

在部署能读外部网页、邮件、代码仓库或工单的 Agent 前，至少应完成三项检查：

- 外部内容能否枚举工具和 schema。
- 外部内容能否诱导高影响 tool call。
- 外部内容能否在失败后帮助攻击者学习拒绝边界。

如果这三项没有被记录，团队就很难判断系统是否真的抵抗了 reconnaissance-driven IPI。

这也是本文最实际的落点：先限制侦察，再讨论拒绝。

边界先行。

## 局限与研究边界

### 双用途风险

论文明确承认 KYA 是 dual-use。它能帮助防守者授权测试，也可能帮助攻击者发现部署系统缺陷。作者的缓解方式包括：

- 实验在 closed, controlled environments 中进行。
- 代码 release 面向 lawful, authorized, defensive evaluation。
- 把发现 payload 视为 vulnerability report。

但这仍要求读者谨慎使用。KYA 的机制描述足够强，不能把它当成普通 prompt engineering 工具。

### Baseline 复现不完美

AgentVigil 和 AutoHijacker 的原实现未开源，论文使用 best-effort reproductions。虽然作者给出复现细节，但仍可能影响比较：

- 原作者实现可能更强。
- 超参数选择可能影响 ASR。
- seed corpus 和 scoring function 可能不同。

因此应重点看 NoRecon、asset ablation 和 OpenHands case study，它们更直接证明 reconnaissance 本身的价值。

### OpenHands case study 规模有限

五个小仓库是为了控制变量，不是为了覆盖真实软件工程全部复杂性。真实 repo 可能：

- 文件更多。
- CI 更复杂。
- 权限更大。
- 任务更长。
- Agent 使用子 Agent 或长期 memory。

这些因素既可能降低攻击成功，也可能提供更多 reconnaissance surface。

## 结论

Know Your Agent 的贡献不是又提出一种更会写恶意 prompt 的方法，而是把 Agent 安全测试的对象重新定义为一个可侦察系统。

它告诉我们：

- Agent 的工具、schema、任务和防御措辞会泄露可利用知识。
- 交互反馈不只是成功/失败信号，而是目标画像更新材料。
- 间接提示注入最危险的形态往往不是显眼恶意命令，而是贴合当前任务的合理化动作。
- prompt-level 防御有帮助，但不能替代工具权限、taint tracking、最小披露和 action-level authorization。

对研究者和 Agent 系统构建者来说，下一步不是只问“这个 payload 能不能成功”，而是问：

- 攻击者在成功前学到了什么？
- 哪些信息本不该被外部输入枚举？
- 哪些工具调用没有绑定用户意图？
- 哪些防御只是在提示层重复规则，却没有改变运行时权限？

如果 Agent 已经像小型操作系统一样管理工具、状态和外部服务，那么它的安全评测也必须像系统渗透测试一样，把 reconnaissance、exploitation、evidence 和 remediation 放在同一个闭环里。
