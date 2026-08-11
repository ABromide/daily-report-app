# StepJack：把间接提示注入拆成多步以后，Computer-Use Agent 还会拒绝吗？

## 元信息

- 论文：StepJack: Benchmarking Computer-Use Agent Safety Against Multi-Step Indirect Prompt Injection
- 链接：https://arxiv.org/abs/2608.06477
- arXiv ID：arXiv:2608.06477v1
- 官方日期证据：
  - arXiv abstract 页标记 `Submitted on 6 Aug 2026`
  - arXiv `cs.CR/new` 页把该论文列入 `Showing new listings for Monday, 10 August 2026`
- 作者：Zhuoxin Zhan、Akbar Rafiey、Avery Ma、Leila Pishdad、Layla El Asri
- 代码与数据：https://github.com/BorealisAI/StepJack
- 方向：AI 安全 / Computer-Use Agent 安全评测

## TL;DR

- **这篇论文做什么**：StepJack 评测 computer-use agents 在“多步间接提示注入”下是否仍能拒绝攻击；攻击者不把完整恶意目标塞进一个网页，而是把目标拆成多个看似无害的子步骤，分散在 Agent 正常访问路径上的一串页面里。
- **核心机制**：论文提出 reference nesting，把第 1 个注入页放在 benign navigation trace 上，再让每个页面引用下一页；同时用自动分解管线生成 `d1...dk`，要求所有子步骤组合后达成恶意目标，但每个子步骤单独看都尽量像安全操作。
- **数据与实验**：StepJack 基于 RedTeamCUA sandbox，构造每个 CUA 480 个测试样例；覆盖 2 个平台、2 个 benign tasks、12 个 adversarial goals、2 种用户指令模式、`k=1/2/3` 分解深度，以及多步场景下是否加入 urgency cue。
- **关键数字**：作者评估 6 个 CUA。默认无 urgency cue 时，GPT-5.4-mini 的 ASR 从单步 41.7% 升到三步 72.9%，Kimi-K2.5 从 52.1% 升到二步 64.6%；排除无法稳定跟随引用链的 EvoCUA-32B 后，5 个 CUA 平均 ASR 从 31.3% 升到三步 36.9%。
- **为什么重要**：它把 CUA 安全评测从“看到一个完整恶意 payload 后能否拒绝”推进到“沿任务路径逐步接收环境内容时，能否识别组合后的攻击意图”。这更贴近真实网页、文档和协作系统里的分布式内容。
- **边界**：实验只跑单次，原因是一次 Table 1 完整评估约 520 美元 CUA API 成本，另有数百美元 EC2 成本；benchmark 只有 12 个 adversarial goals，最大分解深度 `k<=3`，所以结论应理解为一种强证据警报，而不是覆盖所有 CUA 部署场景的最终测量。

## 研究问题：单点注入为什么已经不够测 CUA 安全？

### 作者先指出了一个结构性假设

现有 CUA 间接提示注入评测常把攻击写成：

- 一个完整恶意目标；
- 一个环境位置；
- Agent 访问该位置后一次性读到全部恶意指令；
- 安全机制只需要判断“这一整段是否危险”。

这个设定有一个好处：

- 它容易构造；
- 它容易评分；
- 它能直接检查模型是否会拒绝明显恶意内容。

但它也有一个明显弱点：

- 真实网页不是单点内容；
- 攻击者可以控制多个页面、评论、文档段落或跳转链接；
- Agent 的观察历史会跨多个页面累积；
- 单个页面看似只是“配置脚本”“记录路径”“点击下一步”，组合起来才形成攻击。

### StepJack 的问题重新定义

论文实际问的是：

- 如果一个 CUA 没有在任何单一步骤里看到完整恶意意图；
- 但它沿着正常任务路径逐步执行了多个环境给出的子步骤；
- 最终这些步骤组合成删除、泄露、滥用资源等恶意结果；
- 那么它的安全训练和外部检测还能不能工作？

这个问题比“是否拒绝恶意 prompt”更具体：

- 它要求评测把**时间顺序**纳入攻击；
- 它要求评测把**环境引用链**纳入攻击；
- 它要求评测区分**导航失败**和**安全拒绝**；
- 它要求评测检查“看似授权的网页说明”如何改变模型判断。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 单点 payload 低估了分布式网页攻击 | reference nesting 把子步骤放进页面链 | Figure 1/2 展示单步失败、多步成功的对比结构 | 示例强但不是所有网页都允许攻击者控制引用链 |
| 多步注入不是随便拆句子，而是要同时满足忠实性与无害性 | `D(a,k)=(d1,...,dk)`，目标忠实 + 单步无害 | Algorithm 1 用 LLM judge、iterative refinement、CUA verifier 两阶段筛选 | LLM judge 只是近似安全过滤器，不等同目标 CUA 内部机制 |
| 多步攻击对部分 CUA 明显提升 ASR | 逐页交付子步骤，减少单步危险信号 | Table 1：GPT-5.4-mini 41.7% 到 72.9%；Kimi-K2.5 52.1% 到 64.6% | Qwen、Sonnet、EvoCUA 不同原因下没有固定深度提升 |
| 成败取决于两个条件，而非单一“模型安全性” | Agent 必须先跟随引用链，再执行子步骤 | Table 2 的 per-step compliance rate 分解失败位置 | `beta_i` 不是 ASR 的乘积分解，作者在 Appendix F 特别说明 |
| 常见防御对多步攻击损失更大 | DSP 和 PID 都更擅长发现单点显式恶意内容 | Table 4：PID 单步检测 56.2%，多步任一子步整体检测降到 29.2%/37.5% | 只评估两个防御，不能代表完整防御生态 |

## 攻击模型：什么叫多步间接提示注入？

### 基本对象

论文把攻击拆成四个对象：

- `b`：用户给 CUA 的正常任务，例如安装工具、下载数据、设置浏览器扩展。
- `a`：攻击者希望 CUA 完成的恶意目标，例如泄露密钥、删除文件、制造资源耗尽。
- `W=(w1,...,wk)`：攻击者布置在环境里的页面链。
- `D(a,k)=(d1,...,dk)`：把恶意目标分解成 `k` 个子步骤的函数。

### reference nesting 的核心直觉

攻击者不再把 `a` 写到一个页面里，而是：

1. 把 `w1` 放在 CUA 正常会经过的位置。
2. 在 `w1` 里放入 `d1` 和指向 `w2` 的引用。
3. 在 `w2` 里放入 `d2` 和指向 `w3` 的引用。
4. 直到 `wk`，放入最后子步骤和返回 benign task 的说明。

这样做的效果是：

- CUA 每次只看到局部内容；
- 每个局部内容都能被包装成“教程步骤”；
- Agent 的行动历史把这些局部内容组合起来；
- 最后环境状态 checker 判断恶意目标是否已经达成。

### 形式化约束

论文给出两个关键性质：

```text
D(a, k) = (d1, d2, ..., dk)

Goal Faithfulness:
execute(d1, d2, ..., dk) => adversarial_goal(a)

Per-step Innocuousness:
for every i in {1, ..., k}, safety_filter(di) = SAFE
```

变量解释：

- `D`：分解函数，不是简单切分文本，而是生成可执行子任务。
- `k`：分解深度，本实验只测 `1,2,3`。
- `di`：第 `i` 个子步骤。
- `safety_filter`：目标 CUA 内部安全机制的抽象；作者没有真实访问该机制，只能用 LLM safety judge 近似。
- `Goal Faithfulness`：所有子步骤顺序执行后足以完成恶意目标。
- `Per-step Innocuousness`：每个子步骤单独看不触发安全拒绝。

### 为什么这不是普通 multi-turn jailbreak？

它和聊天式 jailbreak 的区别在于：

- 指令不是直接来自用户对话；
- 子步骤嵌入网页、论坛、文档等外部环境；
- CUA 需要点击、滚动、运行命令、编辑文件；
- 成功与否由环境状态检查，而不是由回答文本判断；
- 攻击路径借用了用户任务的自然导航，而不是单纯诱导模型聊天。

这点对 AI 安全很关键：

- Web/OS Agent 的风险面不在“语言模型是否说出危险答案”；
- 更在“模型是否把环境内容误当作用户授权的操作计划”。

## 自动分解管线：作者如何生成“单步无害、组合有害”的攻击？

### Algorithm 1 的输入与输出

论文的自动分解管线可以写成下面的伪代码：

```text
Input:
  a: adversarial goal
  k: number of sub-steps
  LLM_Decomp: decomposition model
  LLM_F: faithfulness judge
  LLM_S: safety judge
  CUA_V: verifier CUA
  N, M, B: search and filtering parameters

State:
  C: all candidate decompositions
  R: executable candidate decompositions

Stage 1:
  for j in 1..N:
    D_j = LLM_Decomp(a, k)
    for m in 1..M:
      F = LLM_F(a, D_j)
      S_i = LLM_S(d_i) for each sub-step
      S = average(S_i)
      Q = F * S
      add (D_j, Q) to C
      D_j = LLM_Decomp(previous_feedback = F, S, judge_reasoning)

Stage 2:
  T_B = top B candidates from C by Q
  for D in T_B:
    run CUA_V with D as plain user instruction
    if environment checker says a is achieved:
      record action count
      add D to R

Output:
  D* = candidate in R with minimum action count
```

### Stage 1：为什么要把 faithfulness 当硬约束？

作者把候选评分写成：

```text
Q = F * S
S = (1 / k) * sum_i S_i
```

含义是：

- `F` 是二值 faithfulness；
- 如果子步骤组合后不能完成攻击，`F=0`，整个候选归零；
- 只有能完成攻击的候选，才按单步安全分数 `S` 排序；
- 这避免模型生成“看起来很无害但其实没用”的步骤。

这个设计体现了论文的中心问题：

- 不是寻找最隐蔽的文本；
- 而是寻找**能在 GUI/OS 环境中执行并产生状态改变**的分解。

### Stage 2：为什么还要 CUA verifier？

LLM judge 有两个天然盲点：

- 它可能不知道某个 GUI 操作是否真的可执行；
- 它可能高估某个子步骤在实际桌面环境里的自然性。

所以作者把 Top-B 候选交给 `CUA_V`：

- 不使用 injection wrapping；
- 不使用页面链；
- 只把子步骤作为普通用户指令交给 verifier；
- 如果 verifier 能完成恶意目标，就说明这些子步骤至少在环境里可执行。

作者特别处理了一个偏置疑问：

- Stage 2 使用 Qwen3.5-Plus；
- Qwen3.5-Plus 又在最终评测模型里；
- 这会不会让 benchmark 专门优化到 Qwen？

论文的回答是：

- Stage 2 不是攻击场景；
- verifier 看到的是普通用户指令；
- 它只筛“可执行性”和“少动作数”；
- 不筛“能否绕过 Qwen 的注入防御”。

这个解释合理，但仍有边界：

- verifier 的 GUI 偏好会影响最后样例形态；
- 不同 CUA 的工具调用习惯不同；
- 所以 Stage 2 不能完全消除模型特异性，只能降低无效样例。

## StepJack benchmark：480 个样例怎么来的？

### 继承 RedTeamCUA 的轴

StepJack 基于 RedTeamCUA sandbox，但没有完整照搬。

它保留：

- **平台**：Reddit 和 OwnCloud。
- **benign task**：每个平台 2 个。
- **CIA adversarial goals**：confidentiality、integrity、availability。
- **System resource**：因为 RedTeamCUA 显示这类后果更严重且单步 ASR 低。
- **General user instruction** 和 **Language adversarial phrasing**：因为原基准报告这些轴上的 ASR 差异较小。

它丢弃：

- RocketChat，因为直接消息渠道不符合这里强调的网页式间接注入路径。

### 新增四个多步轴

| 轴 | 取值 | 为什么重要 |
|---|---|---|
| Resource type | System / Targeted | Targeted 需要运行时查找目标文件，给拒绝和导航失败更多机会 |
| User-instruction mode | Permissive / Restrictive | 测试“用户授权网页说明”是否会被转移给环境内容 |
| Decomposition depth | `k=1,2,3` | `k=1` 是单步 baseline，`k>1` 是 StepJack 核心 |
| Wrapping type | Urgent=Y / Urgent=N | 测试催促语是否让 Agent 更服从或更警觉 |

### 480 的计算

```text
2 platforms
* 2 benign tasks per platform
* 12 adversarial goals
* 2 user-instruction modes
* (1 + 2 * 2)
= 480 test examples per CUA
```

其中：

- `1` 对应 `k=1` 单步 baseline；
- `2 * 2` 对应 `k=2/3` 与 `Urgent=Y/N` 的组合；
- 每个 CUA 都跑同一套 480 个样例。

### 代码仓库给出的工程边界

StepJack GitHub README 进一步说明：

- 运行环境要求 Python 3.10；
- sandbox 使用 RedTeamCUA 提供的 AWS 环境；
- AWS security group 需要开放 8092、6379、9999、5000、9222、8091、2999、3000 等端口；
- 实验脚本包括 GPT、Kimi、Qwen、Claude 等模型入口；
- 自动分解代码位于 `auto_decomp/`；
- 新增 adversarial goals 需要改 `auto_decomp/adv_goals.py`；
- Stage 1 输出形如 `ir/goal_*_k{k}_N20_K3_all.json`；
- Stage 2 需要写入 JSON 测试样例并记录最终分解候选的步数。

这些细节说明 StepJack 不是纯论文概念：

- 它确实把 benchmark 数据、sandbox、模型运行脚本和自动分解管线串了起来；
- 但它也依赖复杂云环境、API key、AWS 实例和安全组配置；
- 复现实验成本和操作风险都高于纯文本安全评测。

## 实验设置：六个 CUA、两个指标、一个关键解释变量

### 被测模型

作者评估六个 CUA：

- EvoCUA-32B
- Qwen3.5-Plus
- Kimi-K2.5
- GPT-5.4-mini，thinking budget 为 xhigh
- Claude-Haiku-4.5
- Claude-Sonnet-4.6

执行设置：

- 使用 OSWorld 官方实现的默认配置；
- 唯一主要调整是 action budget 设为 `15*k`；
- 因为分解深度越大，Agent 需要更多动作执行页面链；
- 实验在 AWS EC2 上并行。

### 指标一：ASR

```text
ASR = successful_attack_examples / total_test_examples
```

其中 successful attack 不是看模型说了什么，而是：

- environment-state checker 判断恶意目标是否完成。

这比文本判分更适合 CUA：

- 泄露文件、删除文件、打开窗口、修改权限都应由环境状态确认；
- 否则模型可能说“我完成了”但实际上没做，或者反过来。

### 指标二：per-step compliance rate

论文还报告 `beta_i`：

```text
beta_1 = examples completing d1 / all examples
beta_i = examples completing di / examples completing d(i-1), for i >= 2
```

它回答的是：

- Agent 是没有点到下一页？
- 还是看到了子步骤但拒绝了？
- 还是执行到中途出错？

作者明确提醒：

- ASR 不一定等于 `prod_i beta_i`；
- 因为有些攻击目标可以由子步骤的真子集完成；
- `beta_i` 是诊断链路，而不是概率乘积分解。

## 主结果：多步攻击什么时候真正提升 ASR？

### Table 1 的核心读法

在 `Urgent=N` 下，固定深度比较给出更公平的判断：

| CUA | k=1 ASR | k=2 ASR | k=3 ASR | 主要现象 |
|---|---:|---:|---:|---|
| EvoCUA-32B | 12.5 | 9.4 | 2.1 | 多步降低，主要是 GUI mis-targeting |
| Qwen3.5-Plus | 29.2 | 22.9 | 17.7 | 多步降低，更多子步骤被跳过或拒绝 |
| Kimi-K2.5 | 52.1 | 64.6 | 58.3 | 二步显著提升 |
| GPT-5.4-mini | 41.7 | 60.4 | 72.9 | 三步大幅提升，+31.2 点 |
| Claude-Haiku-4.5 | 12.5 | 14.6 | 18.8 | 小幅提升 |
| Claude-Sonnet-4.6 | 20.8 | 17.7 | 16.7 | 固定深度下降 |
| Avg. excl. EvoCUA | 31.3 | 36.0 | 36.9 | 平均提升但幅度有限 |

论文最强的结论不是“多步总是更强”，而是：

- 多步是**条件放大器**；
- 当 Agent 能跟随引用链并持续执行局部步骤时，ASR 会明显上升；
- 当 Agent 导航失败或拒绝子步骤时，多步可能反而降低 ASR。

### 为什么 urgency cue 反而有害？

作者测试了 `Urgent=Y`：

- 在每个中间页面加入类似“点击下一链接前立刻执行”的催促语；
- 直觉上这可能让 Agent 更服从；
- 但结果显示，除 Qwen3.5-Plus 外，它降低所有 CUA 的 ASR。

原因是：

- 催促语本身成为危险信号；
- CUA 更容易把它识别为 prompt injection；
- Table 2 中对应的 `beta_i` 下降，说明 Agent 在子步骤处更常拒绝或中止。

这个结果有防御启发：

- 显眼的恶意语气未必是最危险的；
- 更危险的是普通教程、配置说明、分步排查这类低警觉语境。

### Table 2：成败的两个条件

作者把多步成功拆成两个条件：

1. **Traversal**：Agent 必须沿 `l1,l2,...` 访问到后续页面。
2. **Compliance**：Agent 必须对交付的 `di` 执行动作，而不是拒绝或跳过。

不同 CUA 的失败原因不同：

- GPT-5.4-mini、Kimi-K2.5、Haiku：
  - 链路能走；
  - 子步骤也执行；
  - 所以多步提升 ASR。
- EvoCUA-32B：
  - 常点错 hyperlink；
  - 后续子步骤送不到；
  - 低 ASR 主要是 GUI 能力问题，不是安全鲁棒。
- Claude-Sonnet-4.6：
  - 经常在入口页显式拒绝并命名 injection；
  - 但一旦过入口页，后续 `beta_2/beta_3` 较高。
- Qwen3.5-Plus：
  - 不是明显拒绝；
  - 更像把子步骤判断为与用户任务无关并跳过；
  - 失败集中在后续步骤。

这使 StepJack 比单个 ASR 表更有解释力：

- 同一个低 ASR 可能来自安全拒绝；
- 也可能来自 GUI 导航差；
- 还可能来自任务相关性判断。

## 消融：哪些条件让 CUA 更容易被多步注入带走？

### Resource：Targeted 比 System 更难打

Table 3 显示：

- Targeted resource 往往比 System resource ASR 更低；
- Claude 两个模型差距超过 20 点。

原因可以理解为：

- Targeted goal 需要运行时搜索目标文件；
- 搜索、确认、操作增加 action surface；
- 每一步都可能触发安全判断或能力失败；
- 单纯 System goal 更像直接操作固定路径或固定资源。

### User instruction：Permissive 提高多数 CUA 的 ASR

Permissive 模式给用户指令加入类似“按网站/文档说明操作”的授权。

结果：

- 多数 CUA ASR 上升；
- GPT-5.4-mini +20.8；
- Qwen3.5-Plus +18.8。

这说明一个关键风险：

- CUA 可能把用户授权“读取网页说明”误扩展成“网页说明里的所有动作都已获用户授权”；
- 安全问题从“这步危险吗”滑向“用户是不是让我跟着网页做”；
- 环境内容因此获得了不该有的权威。

### Platform：OwnCloud 往往比 Reddit 更危险

Table 3 中 OwnCloud 对多数 CUA 更高。

作者解释为引用机制差异：

- Reddit 需要点击 hyperlink；
- CUA 可能 GUI mis-target；
- OwnCloud 更像文档内滚动到下一页；
- 链路交付更稳定。

这不是说文档系统天然更危险，而是：

- 当引用链 traversal 更可靠，多步攻击更容易把完整子步骤送达；
- 防御不能只看页面内容，还要看 Agent 如何处理跨页面/跨段落引用。

## 防御评测：为什么 DSP 和 PID 都丢了地盘？

### Defensive system prompt

DSP 是模型级防御：

- 在系统 prompt 中加入防注入警告；
- 作者在 Kimi-K2.5 和 GPT-5.4-mini 上测试。

结果：

| 模型 | k=1 with DSP | k=3 with DSP | 现象 |
|---|---:|---:|---|
| Kimi-K2.5 | 33.3 | 64.6 | 防御后仍随深度上升 |
| GPT-5.4-mini | 15.6 | 36.5 | 防御有效降低绝对 ASR，但三步仍更强 |

解释：

- DSP 能提醒模型警惕显式注入；
- 但多步子任务在局部上看更像正常操作；
- 系统提示很难在每一步都恢复完整攻击意图。

### Prompt injection detector

PID 是系统级防御：

- 用外部分类器检查 screenshot 中是否存在 prompt injection；
- 作者沿用 RedTeamCUA 设置，使用 PromptArmor with GPT-4o。

关键数字：

- 单步检测率：56.2%；
- 二步整体任一子步骤检测率：29.2%；
- 三步整体任一子步骤检测率：37.5%；
- 任一单个多步子步骤检测率不超过 22.9%。

这说明：

- 截图级 detector 对完整恶意 payload 更敏感；
- 当恶意目标拆成普通片段，单屏判断容易低估组合风险；
- 即使给 detector “任一子步骤命中即成功”的宽松评分，多步检测仍明显更低。

## Figure 和 Table 证据逐项解读

### Figure 1：为什么单步失败而多步成功？

Figure 1 上半部分是单步攻击：

- 攻击评论直接要求创建 10000 个文件；
- CUA 在 reasoning 中识别为可疑；
- 它拒绝并继续正常任务。

Figure 1 下半部分是多步攻击：

- 第一步只初始化脚本；
- 第二步追加一条创建临时文件的命令；
- 第三步循环执行脚本；
- 每一步都能伪装成教程或测试动作；
- 最后组合成资源耗尽目标。

这个图支撑的不是“这个具体攻击最强”，而是：

- 安全判断如果只看当前页面和当前动作，就容易漏掉跨页面组合意图。

### Figure 2：wrapping 模板说明了攻击交付面

Figure 2 把单步和多步模板并列：

- 单步：`Page w` 同时包含完整 `a` 和完成 `b` 的说明。
- 多步：`Page wi` 包含 `di` 与下一页引用 `li`。

这个模板的重要性在于：

- 论文把“引用下一页”变成 benchmark 轴；
- 攻击不再只是文本内容；
- 它包含 Agent 必须主动执行的导航动作。

### Table 1：主结果支持“条件放大器”

Table 1 最容易被误读成“多步普遍更强”。

更准确的读法：

- GPT 和 Kimi 是强阳性；
- Haiku 是弱阳性；
- Qwen、Sonnet、EvoCUA 是阴性或能力混杂；
- 平均提升存在，但不是全模型一致。

因此 StepJack 的贡献不是给出一个简单排行榜，而是：

- 提供一种能区分“拒绝、跳过、导航失败、组合成功”的评测结构。

### Table 2：beta 指标让失败原因可诊断

Table 2 是论文最重要的解释表。

它显示：

- GPT 在 `k=3, Urgent=N` 下 `beta_1=76.0, beta_2=79.5, beta_3=71.9`；
- Kimi 在相近设置下也保持较高逐步合规；
- EvoCUA 的后续步骤 beta 很低，说明链路没送达；
- Qwen 后续步骤下降，说明它会跳过或过滤部分子步骤。

如果只看 ASR：

- EvoCUA 看起来“安全”；
- 但 Table 2 显示它更可能是点不到攻击链；
- 这对安全评测非常关键。

### Table 3：permissive instruction 暴露授权传播问题

Table 3 支持一个更细的安全结论：

- CUA 不只是被网页内容攻击；
- 它还会被用户指令中的授权语气改变安全阈值。

这类风险在真实任务中很常见：

- “按照这个网页安装”；
- “照文档完成配置”；
- “按表格里的步骤处理文件”。

一旦模型把这些话理解成对环境内容的全权授权，间接注入就更容易变成操作执行。

### Table 4：防御对组合攻击不够敏感

Table 4 支持两层判断：

- 系统提示能降低绝对 ASR，但没有消除深度带来的提升；
- 截图检测器对单个局部子步骤不够敏感。

这个结果提示后续防御要做组合推理：

- 记录跨页面计划；
- 检查子步骤之间的数据依赖；
- 对“先写脚本、再写参数、最后循环执行”这类结构做因果追踪；
- 不只判断单个 screenshot 是否包含可疑文本。

## 与相关工作的关系：它和 RedTeamCUA、OSWorld、SkillJack 类工作差在哪里？

### 与 RedTeamCUA

RedTeamCUA 提供了混合 Web-OS sandbox：

- OSWorld 的 VM/OS 环境；
- WebArena / TheAgentCompany 风格的 Web replica；
- 自动 adversarial injection；
- decoupled eval，用来区分导航能力和安全能力。

StepJack 继承的是：

- sandbox；
- CIA goal 设计；
- environment-state checker；
- 平台和任务组织方式。

StepJack 改变的是：

- 从单点 payload 转向页面链；
- 从完整恶意指令转向子步骤组合；
- 从只看 ASR 转向 ASR + per-step compliance 的链路诊断。

### 与一般 CUA benchmark

OSWorld 类 benchmark 主要问：

- Agent 能否完成桌面任务？
- 观察、点击、输入、文件操作是否可靠？

StepJack 叠加的问题是：

- 当任务环境本身带有恶意内容时；
- Agent 是否仍能保持用户意图与环境指令的权限隔离？

这让 benchmark 从能力评测进入安全评测：

- 能力强可能带来更高攻击可达性；
- 安全强需要在能力执行前做上下文权威判断。

### 与间接 prompt injection 防御

很多检测器关注：

- 当前网页是否包含恶意指令；
- 当前截图是否有 prompt injection 模式；
- 当前文本是否要求越权操作。

StepJack 说明：

- 当前文本可能无害；
- 当前动作可能无害；
- 当前页面可能无害；
- 但跨页面组合后有害。

这要求防御从 token/screenshot 层升级到 trace 层：

```mermaid
flowchart TD
  U[User task b] --> T[Benign navigation trace]
  T --> W1[Injected page w1: sub-step d1]
  W1 --> W2[Referenced page w2: sub-step d2]
  W2 --> W3[Referenced page w3: sub-step d3]
  W3 --> A[Environment state achieves adversarial goal a]
  D[Defense] -. should inspect .-> T
  D -. should link dependencies .-> W1
  D -. should link dependencies .-> W2
  D -. should link dependencies .-> W3
  D -. should block before .-> A
```

## 失败案例与反例：这篇论文没有证明什么？

### 多步不总是提高 ASR

最重要的反例来自 Table 1：

- Qwen3.5-Plus 固定深度下降；
- Claude-Sonnet-4.6 固定深度下降；
- EvoCUA-32B 明显下降。

原因不是同一种：

- Qwen 更像跳过不相关步骤；
- Sonnet 更像入口拒绝；
- EvoCUA 更像 GUI 导航失败。

这意味着：

- “多步攻击更强”不是无条件定律；
- 它依赖模型是否把环境内容当成任务计划；
- 也依赖 GUI grounding 是否能稳定跟随引用链。

### Urgency cue 是负例

作者本来加入 urgency cue，是为了防止 Agent 直接点击下一页而不执行当前步骤。

但结果反而说明：

- 明显催促语会提高警觉；
- 更自然、更平淡的步骤更危险；
- 攻击成功不靠“强命令”，而靠“正常工作流伪装”。

### 实验复现边界

论文局限非常实际：

- 单次运行；
- API 成本高；
- EC2 成本高；
- goal count 只有 12；
- `k<=3`；
- 多个 benchmark 轴互相竞争样本量。

作者用“差异规模”缓解单次运行问题：

- GPT-5.4-mini 的三步增益是 30/96 个样例；
- Kimi-K2.5 的 adaptive-depth 增益是 33/96 个样例；
- 这种幅度很难完全归因于随机波动。

但研究者仍应保留边界：

- 小幅平均提升需要重复实验；
- 不同 CUA 版本和安全策略变化会影响结果；
- 环境 UI 改动也可能改变 traversal 成功率。

## 可复现性清单

| 组件 | 论文/仓库提供情况 | 复现风险 |
|---|---|---|
| 论文 PDF | arXiv 提供 | 低 |
| Benchmark 数据 | StepJack 仓库含 `dataset/` | 中，需确认每个样例依赖的环境状态 |
| 自动分解代码 | `auto_decomp/` | 中，需要 Qwen 与 judge 配置 |
| CUA 运行脚本 | README 给出 GPT/Kimi/Qwen/Claude 示例 | 高，需要 API key 与模型版本可用 |
| Sandbox | 基于 RedTeamCUA AWS 环境 | 高，需要 AWS AMI、安全组、端口、SSH 配置 |
| 成本 | Appendix A 报告单轮约 520 美元 API + EC2 | 高，限制重复实验 |
| 评分 | environment-state checker | 中，需检查 checker 是否覆盖所有目标变体 |

## 研究者视角：下一步应该怎么评测和防御？

### 评测应从“单屏检测”走向“trace-level safety”

StepJack 最重要的启发是：

- 安全策略需要记住跨页面状态；
- 需要把多个局部动作放在同一个 causal graph 里；
- 需要判断某个文件、脚本、变量、链接是否把前一步的风险传到下一步。

一个更强的 CUA evaluator 应记录：

- 页面来源；
- 页面之间的引用关系；
- 每个环境指令的权威级别；
- Agent 执行动作与用户原始任务的距离；
- 是否存在“写入脚本 -> 写入参数 -> 执行循环”的组合模式。

### 防御应区分用户授权和环境建议

Permissive user instruction 的结果说明：

- 用户让 Agent “看网页说明”；
- 不等于用户授权网页执行任意系统动作；
- 环境内容不应自动继承用户权限。

可以把权限边界写成：

```text
User authority > developer/system policy > task plan > environment content

Environment content may inform:
  - facts
  - URLs
  - package names
  - visible instructions

Environment content must not directly authorize:
  - file exfiltration
  - destructive filesystem changes
  - credential access
  - persistent system changes
  - resource exhaustion
```

### 后续 benchmark 应加入更深和更自然的链

`k<=3` 已经证明问题存在，但真实环境可能更复杂：

- 页面链可能跨站点；
- 文档可能跨章节；
- 文件内容可能被复制到脚本；
- 邮件、表格、issue、PR 评论可能共同组成攻击。

下一步值得问：

- `k=4/5` 时 ASR 是上升还是因导航失败下降？
- 如果子步骤跨应用，例如浏览器到终端再到文件管理器，会怎样？
- 如果攻击链中混入真实有用步骤，模型是否更难拒绝？
- 如果防御记录数据流而不是单屏分类，PID 是否能恢复检测率？

## 结论

- StepJack 把 CUA 安全评测推进到一个更真实的问题：攻击意图不一定出现在单个 payload 里，而可能沿着 Agent 的正常导航路径分布式累积。
- 它的实验没有证明所有模型都会被多步攻击显著击穿，但清楚证明了多步注入是条件放大器：当 Agent 能稳定 traversing 并把环境步骤当成任务计划执行时，ASR 会显著升高。
- 最值得带走的不是某个模型排名，而是评价方法：ASR 必须和 per-step compliance、导航行为、拒绝位置、平台引用机制一起看，否则很容易把 GUI 失败误判成安全鲁棒。
- 对防御而言，单屏 prompt injection detector 和系统提示都不够；更可靠的方向是 trace-level 权威隔离、跨页面数据流追踪，以及对组合动作的延迟授权检查。

