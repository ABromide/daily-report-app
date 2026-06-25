# Plans Don't Persist：为什么 Agent 的上下文管理是承重墙

### 元信息

| 字段 | 内容 |
|---|---|
| 标题 | Plans Don't Persist: Why Context Management Is Load Bearing for LLM Agents |
| 作者 | Aman Mehta, Anupam Datta |
| 机构 | Snowflake AI Research |
| 类型 | 论文 |
| arXiv | https://arxiv.org/abs/2606.22953 |
| 官方日期 | 2026-06-22 |
| 主题 | LLM Agent、上下文压缩、计划保持、hidden-state probe、推理轨迹污染 |

### TL;DR

- 这篇论文研究一个很具体但会影响长程 Agent 工程的问题：Agent 早期写下的 plan，到底会被模型内化成跨步持久状态，还是只作为窗口里的文本被反复读取。
- 作者提出 **replay pairing**：同一条轨迹跑两种条件，A 保留计划，B 删除计划但重放相同 action-observation 序列，再比较每一步 hidden state 的 cosine distance。
- 在 Llama-3.1-70B 的 ALFWorld ReAct Agent 上，计划信号在 step +1 达到 `0.453`，一个 action-observation 周期后降到 `0.110`，约 `4.1x` 衰减；HotpotQA 的衰减更快，约 `12.4x`。
- Ridge probe 在 L32 上能预测计划信号，ALFWorld 上 `R^2=0.875±0.016`、AUROC `0.999`，并能零样本迁移到 HotpotQA；但作者明确承认 step index 也几乎可被解码，L32 step-index `R^2=0.978`，所以 probe 不是内容特异性的因果证据。
- 对 DeepSeek-R1-Distill-Llama-70B，普通 replay pairing 会被 `<think>` 轨迹污染，因为 B 条件虽然删掉原计划，但保留的历史推理块会重新陈述计划；作者提出 **strict stripping**，只在 B 条件删除历史 `<think>...</think>` 块，step +1 信号从 `0.022` 提到 `0.058`，恢复 `+163%`，held-out 为 `+153%`。
- 压缩压力测试显示实际代价：在 30 个 ALFWorld 任务、每策略 150 runs 下，naive eviction 让成功率从 `56.7%` 降到 `22.0%`，下降 `34.7pp`；但 plan_protected 和 probe_gated 都没有恢复成功率，说明“保护计划”不等于“解决上下文压缩”。
- 局限很重要：论文证明的是表征诊断和压力测试，不是通用行为修复；计划信号混有长度、位置、话语结构，strict stripping 也有不对称操作带来的混淆，需要 length-matched filler、shuffled-plan placebo、双边 stripping、plan-span redaction 等后续控制。

### 1. 这篇论文真正问了什么？

这篇论文不是在问“计划提示是否有用”。作者默认 ReAct、Chain-of-Thought、Tree of Thoughts、Reflexion 这类框架已经说明了显式计划能影响 Agent 行为。

它问的是更底层的问题：

- 当 Agent 在早期写下一个多步计划后，后续动作依赖的是哪一种机制？
- 是模型把计划“内化”进某种跨步持久表征？
- 还是每一步都靠再次读取上下文窗口里的计划文本？
- 如果上下文压缩、摘要或 eviction 把计划删掉，Agent 会不会在行为测试还没报警前已经失去关键工作状态？

作者把这个问题放在长程 Agent 的工程背景里看。现代 Agent 不可能无限保留完整历史，所以系统会做三类操作：

| 上下文操作 | 工程动机 | 论文关心的风险 |
|---|---:|---|
| compression | 缩短历史，节省窗口 | 摘要可能丢掉行动约束 |
| summarization | 把旧轮次变成摘要 | 计划细节可能被改写或过度抽象 |
| eviction / KV-cache pruning | 直接移除旧 tokens | Agent 可能不再能读取最初计划 |

这就把“计划是否持久”变成了一个承重问题：如果计划只是窗口里的文本，那么 eviction 不是无损优化，而是删除了 Agent 的工作记忆。

### 2. 作者的核心概念：context-time object

论文把信息来源分成两种：

| 概念 | 含义 | 对 Agent 的含义 |
|---|---|---|
| context-time memory | 信息还在窗口里，模型每次 forward 都能读取 | 删除 token 会改变行为或 hidden state |
| persistent internal state | 信息跨步留在模型内部状态中 | 删除原始 token 不应该显著改变后续状态 |

作者的主张可以压缩成一句话：

> plan 是 context-time object，而不是 Agent 已经内化的 persistent state。

这句话的研究意义在于，它挑战了一种常见工程直觉：只要模型“想过”或“写过”某个计划，后面就会记得。论文的实验显示，至少在标准 Llama ReAct Agent 上，这个直觉不成立。

### 3. 方法：Replay Pairing 如何隔离计划信号？

作者的测量方法是 **replay pairing**。它不直接看最终任务成败，而是看删除计划后 hidden state 会发生多大变化。

```mermaid
flowchart TD
  T[Task and initial observations] --> G[Guard asks agent to write full plan]
  G --> A[Condition A: keep plan in history]
  G --> B[Condition B: remove plan exchange]
  A --> A1[Run normal trajectory, record hidden states]
  B --> B1[Replay same actions and observations, discard B outputs]
  A1 --> D[Compare hidden states per step and layer]
  B1 --> D
  D --> S[PlanSignal = 1 - cosine(hA, hB)]
```

关键设计有三点：

- **同轨迹重放**：B 条件不让模型自由产生另一条轨迹，而是重放 A 的 action 和 observation，避免行为分叉影响表征比较。
- **只删计划交换**：A 与 B 的主要差异是 guard message 和 plan answer 是否仍在 history 中。
- **逐步逐层测量**：作者记录每一步、每一层的 last-token hidden state，计算 plan-present 与 plan-stripped 的 cosine distance。

论文里的核心公式是：

```text
PlanSignal(s, l) = 1 - cos(h_A(s, l), h_B(s, l))

变量：
- s：相对 guard 注入的 step，step 0 是要求写计划的那一步
- l：Transformer layer
- h_A：保留计划条件下的 hidden state
- h_B：删除计划条件下的 hidden state
- PlanSignal 越大，说明当前 hidden state 越依赖“计划仍在上下文里”
```

这个定义有一个很重要的边界：它测量的是“计划交换存在造成的状态差异”，不等于纯粹的“计划内容语义”。计划文本被删除时，history length、token position、discourse structure 也一起改变。因此作者反复强调，这个信号是 composite signal，最多是 plan-content-specific component 的上界。

### 4. 实验设置：Agent、环境、计划注入

作者主要用了三类模型或模型族：

| 模型 | 用途 | 关键原因 |
|---|---|---|
| Llama-3.1-70B-Instruct | 主实验标准 Agent | 非 reasoning 模型，没有 `<think>` 块污染 |
| Llama-3.1-8B-Instruct | 同族规模验证 | 看衰减形状是否跨 scale 保持 |
| DeepSeek-R1-Distill-Llama-70B | reasoning 模型分析 | 会输出 `<think>`，暴露 replay pairing 的污染问题 |

环境主要是：

- **ALFWorld**：文本家庭任务，Agent 要执行 `go_to`、`pick_up`、`put`、`heat`、`cool`、`clean`、`examine` 等动作；覆盖六类任务，简单任务大约 3-4 个计划步骤，复杂任务大约 6-8 个计划步骤。
- **HotpotQA**：多跳问答，用来检查同一测量协议能否跨任务域复现。

计划注入方式也很有工程含义。作者不是等 Agent 自然规划，而是在 ALFWorld step 2、HotpotQA step 4 插入 guard，让 Agent 明确写出完整多步计划：

```text
Before continuing, please state your complete plan for finishing this task.
Describe each step in order: where you will go, what you will pick up,
what actions you will perform, and where you will place the object.
```

这一步的意义是把“计划”变成可观测对象：它足够早，可以影响后续长轨迹；也足够晚，Agent 已经看到任务和初始上下文，不是在空白状态下编计划。

### 5. 主结果：计划信号很快衰减

ALFWorld 上最重要的曲线来自 80 个任务：

| 指标 | 数值 | 解释 |
|---|---:|---|
| pre-plan signal | `< 1e-8` | A/B 在 guard 前几乎完全一致，说明 replay 机制本身没有明显偏差 |
| step +1 signal | `0.453 ± 0.039` | 计划刚写完后，hidden state 强烈依赖计划仍在 history 中 |
| step +2 signal | `0.110 ± 0.032` | 一个 action-observation 周期后，信号约 `4.1x` 衰减 |
| step +5 signal | `~0.027` | 到第 5 步时，计划痕迹接近残余水平 |
| peak layer | L32 | 中层最敏感，早层和晚层较弱 |
| ALFWorld task type spread | `0.445-0.474` | 六类任务初始 spike 相近 |
| decay spread | `4.0-4.4x` | 简单计划和复杂计划都快速衰减 |

这组数字支持作者的核心解释：标准 LLM Agent 并没有把计划稳定带到后续 hidden state 中；如果后续还需要计划，它大概率是在每一步从 context 重新读取。

HotpotQA 复现了初始信号，但衰减更快：

| 域 | step +1 | step +2 或后续 | 衰减 |
|---|---:|---:|---:|
| ALFWorld | `0.453` | `0.110` | `4.1x` |
| HotpotQA | `0.445` | `0.036` | `12.4x` |

作者给出的解释是：ALFWorld 的 observation 例如“你到达 countertop，看见 tomato”本身和计划语义高度重合，因此计划相关特征还能被环境反馈重新激活；HotpotQA 的 observation 是百科段落，往往和计划步骤“先搜 X、再找 Y”正交，所以计划表征更容易被覆盖。

### 6. Probe：能检测衰减，但不能过度解释

作者训练了一个 Ridge regression probe，在 peak layer L32 上预测 scalar plan signal：

```text
y(s) = PlanSignal(s, L32)

probe input: plan-present hidden state h_A(s, L32)
probe output: predicted plan-signal magnitude
binary fire rule: prediction >= tau
tau = 0.15
```

Table 1 的关键结果如下：

| 评测 | R^2 | AUROC | F1 | Precision | Recall |
|---|---:|---:|---:|---:|---:|
| ALFWorld L32 | `0.875 ± 0.016` | `0.999` | `0.898` | `0.985` | `0.825` |
| HotpotQA L32 transfer | n/a | `1.000` | `0.678` | `0.513` | `1.000` |
| HotpotQA L40 transfer | n/a | `1.000` | `0.968` | `0.938` | `1.000` |

这个结果有两个层面：

- 乐观层面：L32 的 plan-presence direction 可以跨 ALFWorld 和 HotpotQA 迁移，说明它不只是 ALFWorld 某个任务模板的噪声。
- 谨慎层面：step index 在 residual stream 中也几乎可被解码，L32 上 step-index regressor 的 `R^2=0.978`，所以 AUROC 接近 1 不等于 probe 学到了“计划语义内容”。

作者没有回避这个问题。他们把 probe 的有效性限制在“诊断信号”而不是“内容读出器”：

| 证据 | 支持什么 | 不能证明什么 |
|---|---|---|
| AUROC 0.999 | hidden state 有强烈的 active-vs-decayed 可分性 | 不证明 probe 读懂了具体计划内容 |
| HotpotQA transfer | 某些 plan-presence direction 跨域稳定 | 不证明阈值无需跨域校准 |
| 4-class probe macro F1 0.862 | 衰减状态有 graded ordering | 不排除 step-index leakage |
| Brier `2.5e-6`, ECE `0.0002` | 主二分类边界很容易校准 | 不代表难边界也稳定，step +2 vs +3 的 ECE 为 `0.066` |

这个克制是论文质量较高的地方：作者没有把 probe 包装成“计划神经元”或“计划概念方向”，而是把它作为上下文管理诊断器。

### 7. Early warning：probe 比行为失败早几步报警

作者还做了一个早期预警分析：

- 定义 deviation：第一步 plan-alignment `< 0.3`，由 Claude Opus 4 judge 判断。
- 在 80 个 ALFWorld 任务中，有 31 个任务出现 deviation。
- 对这些 deviation 任务，probe 平均提前 `4.45` 步触发，median 为 `5`。
- 在 `74.2%` 的 deviation case 中，probe 领先行为偏离。

这说明 probe 不只是离线可视化工具。它有可能成为 context manager 的运行时信号：当 probe 发现计划信号过低，就尝试把计划重新浮出窗口。

但第 8 节的压力测试会告诉我们：这个想法只对了一半。

### 8. Reasoning 模型的测量陷阱：`<think>` 会污染 B 条件

DeepSeek-R1-Distill-Llama-70B 让这篇论文更有意思。普通 replay pairing 在 R1 上得到一个反直觉结果：

| 模型/条件 | step +1 plan signal |
|---|---:|
| Llama-3.1-70B，同任务子集 | `0.099` |
| R1-Distill-Llama-70B，standard stripping | `0.022` |

如果只看这个表，会误以为 R1 几乎不编码计划。但作者指出这是测量 artifact。

原因是：

- R1 每一步都会输出 `<think>...</think>`。
- 这些 think traces 往往会重新陈述计划内容。
- B 条件虽然删掉了最初的 plan exchange，但 replay 历史里保留了 prior assistant turns。
- 因此 B 条件仍然能从历史 `<think>` 中看到计划证据。
- A/B hidden state 的距离被低估，看起来像 R1 不携带计划。

作者提出 **strict stripping**：

```text
standard B:
  remove original guard + plan exchange
  keep prior assistant turns as replay history

strict B:
  remove original guard + plan exchange
  remove every complete historical <think>...</think> block
  keep content after </think>, such as Thought: and Action:
```

这个设计有两个 sanity checks：

- 对没有 `<think>` 的 Llama，strict stripping 应该基本是 no-op。
- 对 reasoning 模型，strict stripping 后的 plan signal 应该高于 standard stripping。

结果符合这两个检查：

| 测试 | standard | strict | 变化 |
|---|---:|---:|---:|
| R1 in-sample 5 tasks | `0.022` | `0.058` | `+0.036`, `+163%` |
| R1 held-out 5 tasks | 未列完整表 | 未列完整表 | `+153%` |
| Llama no-think | baseline | strict | `+4.8%`, 近似 no-op |

但 strict stripping 仍然不是完美控制：

- 它只在 B 条件做删除，是不对称操作。
- 它删除完整 `<think>` 块，不只是删除 plan-relevant spans。
- 它保留 `Thought:` 和 `Action:` 后文本，里面可能仍然有计划重述。
- 因此 recovery 可能混合了计划污染、一般 reasoning-history 删除、局部分布漂移。

作者列出的下一步控制很清楚：

1. 对 A 和 B 都 strip，再比较是否仍有差异。
2. 用 length-matched neutral text 替换 `<think>` 块，而不是直接删除。
3. 只 redaction plan spans，保留其他推理内容。

### 9. R1 probe transfer：方向变了，但信号还在

strict stripping 后，Llama-trained L32 probe 在 R1 上能部分迁移：

| Probe | Eval target | AUROC | n |
|---|---:|---:|---:|
| Llama L32 | Llama ALFWorld | `0.999` | 80 |
| Llama L32 | Llama HotpotQA | `1.000` | 25 |
| Llama L32 | R1 raw | `0.600` | 5 |
| Llama L32 | R1 strict | `0.748 [0.62, 0.87]` | 19 |
| R1 L32 self-probe | R1 strict | `1.000` | 85 |
| R1-Distill-Qwen self-probe | strict | `1.000` | 85 |
| Qwen3 L26 self-probe | Qwen3 thinking | binary AUROC `0.616`, regression `R^2=0.997` | 15 |

这里最值得注意的是方向差异：

- R1 self-probe 到 Llama L32 direction 的夹角是 `89.3°`，cosine 只有 `0.012`。
- 这意味着 R1 不是沿 Llama 的同一个 hidden-state direction 表达计划信号。
- 但 self-probe 又能到 AUROC 1.000，说明计划相关信号并非不存在，而是编码方向发生了旋转或重组。

这对 Agent 诊断工具有一个直接提醒：不要把单模型 probe 当成跨模型通用传感器。跨模型迁移可作为证据之一，但上线诊断需要目标模型或模型族上的校准。

### 10. 压缩压力测试：删计划真的会坏，但只保计划不够

论文最接近工程系统的一节是 context-compression stress test。

实验设置：

| 维度 | 设置 |
|---|---|
| 环境 | ALFWorld |
| 模型 | Llama-3.1-70B ReAct Agent |
| 任务 | 30 个 held-out tasks |
| runs | 每个策略 150 runs，30 tasks x 5 runs |
| step cap | 20 |
| budget | system prompt + keep_recent=4 messages |
| success | `max_t score(t) > 0` |
| 显著性 | 10,000 次 paired permutation，95% bootstrap CI |

四种上下文策略：

| 策略 | 发送给模型的上下文 | 直觉 |
|---|---|---|
| none | 不压缩 | 上界基线 |
| naive | system + last 4 messages | 最粗暴 eviction |
| plan_protected | naive + 永远 pin plan span | 保护计划本身 |
| probe_gated | naive + probe 触发时重注入 plan | 只在诊断低信号时补计划 |

Table 9 的核心结果：

| Policy | Success | SE | Delta | p | Resurfacing |
|---|---:|---:|---:|---:|---:|
| none | `56.7%` | `4.0%` | n/a | n/a | `0.0` |
| naive | `22.0%` | `3.4%` | `-34.7pp` vs none, CI `[-44.7, -24.7]` | `<0.001` | `0.0` |
| plan_protected | `20.7%` | `3.3%` | `-1.3pp` vs naive, CI `[-10.7, +8.0]` | `0.89` | 未作为动态触发 |
| probe_gated | 论文正文说明未恢复 | 未强调 | vs naive 不显著 | `0.67` | `6.1` 次/run |

这组结果很重要，因为它避免了一个过度简单的结论。

如果只看 plan signal decay，我们可能会说：计划会衰减，所以只要把计划 pin 住或 probe 触发时重注入计划就行。

压力测试说明不是这样：

- naive eviction 确实大幅伤害成功率，支持“计划和历史上下文是承重信息”。
- 但 plan_protected 没有恢复，因为窗口里丢掉的不只是计划，还有最近 observations、actions、object state、失败尝试等工作状态。
- probe_gated 平均每 run 重新浮出计划 `6.1` 次，仍然没恢复，因为 stale plan 不能替代动态环境状态。

这把论文的工程结论从“保护计划”推进到“上下文管理要识别多种承重 token”。

### 11. 论文证据链：claim -> mechanism -> evidence -> boundary

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 标准 LLM Agent 不持久保存计划 | 计划信号在 hidden state 中快速衰减 | ALFWorld step +1 `0.453`，step +2 `0.110`，step +5 `~0.027` | 计划内容与长度、位置、话语结构未完全分离 |
| 计划衰减不是单一任务特例 | 同协议跨域、跨 scale 复现 | HotpotQA 初始 `0.445`，衰减 `12.4x`；Llama-8B 衰减形状相似 | 仍主要是 Llama family 与两个任务域 |
| L32 probe 可诊断计划衰减 | Ridge probe 读 hidden-state plan-signal magnitude | ALFWorld `R^2=0.875`，AUROC `0.999`，HotpotQA transfer AUROC `1.000` | step-index leakage 强，不能当内容特异 probe |
| reasoning model 需要特殊 stripping | `<think>` 会把计划重述进 B 条件 | R1 strict 后从 `0.022` 到 `0.058`，`+163%` | strict stripping 不对称，需 span-level redaction |
| 计划 eviction 有行为代价 | 压缩窗口丢掉 context-time plan | none `56.7%`，naive `22.0%`，`-34.7pp` | plan protection 未恢复，说明还有其他承重历史 |

### 12. Detail inventory：哪些细节值得保留？

为了避免把这篇论文读成一句“Agent 会忘计划”，这里把可复用的技术细节单独列出来。它们决定了这套方法能否迁移到别的 Agent 评测里。

| 细节类型 | 论文里的具体做法 | 迁移时要注意什么 |
|---|---|---|
| 计划触发 | ALFWorld 在 step 2 注入 guard，HotpotQA 在 step 4 注入 | 注入太早会让计划缺少环境信息，太晚会让后续可测步数不足 |
| 轨迹匹配 | B 条件重放 A 的 action 和 observation，丢弃 B 自己的 action | 如果不重放，hidden-state distance 会混入行为分叉，不再是计划差异 |
| hidden state 位置 | 每次 forward 的 last-token position | 如果改成所有 token 平均或 attention head 输出，数值不可直接比较 |
| 层选择 | 70B 主峰在 L32，8B 主峰约在相对深度 37.5% | 不应把 L32 当成跨架构常数，而应重新做 layer sweep |
| probe 目标 | 回归连续 plan signal，再用阈值转 fire/no-fire | 直接二分类更容易学到 step index shortcut |
| reasoning 处理 | 对 B 条件 strict strip 历史 `<think>` 块 | 对本身不产出 `<think>` 的模型应接近 no-op，否则方法有额外副作用 |
| 压缩预算 | `keep_recent=4` messages plus system prompt | 这是很激进的预算，结论应读作 stress test，不是所有压缩系统的平均表现 |

这些细节说明作者并不是简单“删一句计划看看结果”。真正的贡献是把 Agent 轨迹变成成对可比较对象，并把计划存在与否转成一条可随 step、layer、model family 变化的曲线。

### 13. 为什么 plan_protected 也失败？

`plan_protected` 的失败是全文最容易被忽略的一点。它说明计划确实重要，但不是唯一重要的上下文。

在 ALFWorld 里，Agent 需要维护的工作状态至少包括：

- 当前房间与容器位置，例如 tomato 在 countertop 还是 microwave。
- 已经执行过的动作，例如是否已经 heat、clean、cool。
- 环境反馈里的新事实，例如某个 receptacle 为空，或某个 object 不在预期位置。
- 失败动作和无效尝试，避免重复走同一条错误路径。
- 原始目标和计划步骤之间的映射，例如“先拿 tomato，再加热，再放到指定位置”。

naive eviction 会同时删掉这些状态。把原始 plan pin 回来，只能恢复目标分解，不能恢复动态世界状态。因此 `plan_protected` 比 naive 还略低一点并不矛盾：它占用了有限窗口预算，却没有补回最需要的 recent observations。

这对实际 Agent memory 设计有三个直接启发：

1. 计划应当被保护，但不能只保护计划。
2. recent observation/action history 可能比静态计划更接近“工作内存”。
3. 压缩策略应该按信息类型做 replay-pairing 诊断，而不是统一用“最近 N 轮”或“摘要旧历史”。

换句话说，context manager 需要知道自己删掉的是“可丢弃闲聊”还是“任务状态变量”。这篇论文只完整测了 plan，但它给出了测其他变量的方法。

### 14. 如果把它用于安全约束，会怎么做？

这篇论文对 AI 安全的延伸价值在于：安全约束很可能和计划一样，是 context-time object。可以设计一个平行实验：

```text
Input:
  agent task with tool access
  safety instruction S, such as "never delete files" or "read-only mode"
  paired replay protocol

Conditions:
  A: keep S in history
  B: remove S but replay same external observations

Measurements:
  hidden-state safety signal = 1 - cosine(h_A, h_B)
  tool-call risk delta = P(delete/write/network | A) vs P(... | B)
  decay curve after each action-observation cycle
```

如果安全信号也像计划一样快速衰减，就说明长程 Agent 的安全边界不能只靠开头 system prompt。系统需要周期性重申、结构化 pinning、工具层 enforcement，或把约束编译到外部 policy engine，而不是期待模型“记得”。

这也是我认为本文值得进入 Daily Report 的原因：它把一个看似偏 mechanistic 的表征测量，连接到了 Agent memory、上下文压缩和安全约束持久性的共同问题。

### 15. 可以怎样复现作者的伪流程？

下面是按论文方法抽象出的 replay pairing 伪代码：

```text
Input:
  task T
  model M
  guard step g
  layer set L

State:
  history_A = initial task history
  trajectory = []
  hidden_A = {}
  hidden_B = {}

Procedure:
  1. Run Agent A normally until step g.
  2. Inject guard asking for complete plan.
  3. Store plan exchange in history_A.
  4. Continue Agent A:
       for each step s:
         record hidden_A[s, l] for l in L
         record action_s and observation_s
         append them to trajectory
  5. Build history_B:
       copy same initial history
       remove guard + plan exchange
       if reasoning model and strict mode:
         remove prior complete <think>...</think> blocks
  6. Replay trajectory in B:
       for each step s:
         feed same previous actions and observations
         call M to get hidden_B[s, l]
         discard B's generated action
  7. For each step/layer:
       PlanSignal[s, l] = 1 - cosine(hidden_A[s, l], hidden_B[s, l])

Output:
  per-step, per-layer plan signal curve
  optional probe trained on h_A[s, L*] -> PlanSignal[s, L*]
```

失败边界也要写进伪流程：

- 如果 B 不重放 A 的 action-observation，而是自由生成，轨迹分叉会污染 hidden-state distance。
- 如果 reasoning model 的历史 `<think>` 不被处理，B 会重新看到计划内容，distance 被低估。
- 如果只用 binary active/decayed 标签训练 probe，step index 可能成为快捷特征。
- 如果只在 Llama 上校准 probe，换到 R1/Qwen3 后方向和阈值都可能失效。

### 16. 图表证据应该怎么读？

论文图表很多，但核心证据可以归到四类：

| Figure/Table | 支持的主张 | 我对证据强度的判断 |
|---|---|---|
| Figure 1 | replay pairing 的 A/B 条件构造 | 方法示意，关键在是否真的 action-observation matched |
| Figure 2 | L32 peak 与六类 ALFWorld 任务衰减一致 | 支持“不是某个任务类型偶然现象” |
| Figure 3 | ALFWorld step +1 spike 与快速衰减 | 主证据，直接支撑 context-time plan |
| Table 1 | probe performance 与 HotpotQA transfer | 支持诊断器可用，但被 step-index caveat 限制 |
| Table 4 | R1 strict-strip per-task recovery | 支持 reasoning-trace confound，不是单任务偶然 |
| Table 5 | cross-regime probe transfer | 支持 R1 有不同编码方向 |
| Table 9 | compression stress test | 最关键的工程压力测试，说明 naive eviction 有行为代价 |

我认为最有说服力的不是 AUROC 0.999，而是这三个结果放在一起：

1. pre-plan signal 接近 0，说明 replay pairing 基线干净。
2. ALFWorld 和 HotpotQA step +1 初始信号接近，但衰减速度随 observation-plan overlap 改变。
3. naive eviction 让行为成功率下降 34.7pp，而 plan-only recovery 无法救回来。

这三点共同说明：计划不是被模型“永久记住”的抽象意图，而是和动态上下文一起组成 Agent 工作状态。

### 17. 和近期 Agent 研究的关系

这篇论文可以放到三条线里理解：

| 研究线 | 代表问题 | 本文补充 |
|---|---|---|
| Agent planning | 显式计划是否提高任务完成率 | 不只看计划是否有用，而是看计划影响是否依赖窗口文本 |
| Long-context faithfulness | 模型是否真的用到窗口里的信息 | 把检验对象从 facts 扩展到 agent plan |
| Mechanistic probes | hidden state 是否线性编码某些属性 | 把 probing 从单次 forward 扩展到多步 Agent temporal axis |

它和“更长上下文”路线也有张力。更长窗口能推迟 eviction，但不能证明哪些 token 可以安全删。作者的框架提供的是一种 token importance test：只要把某类历史删掉再 replay，就能看 hidden state 和行为压力是否变化。

可测试对象不只计划，还包括：

- safety policy：安全约束是否只是窗口文本？
- tool schema：工具参数和错误语义是否会被后续步骤遗忘？
- user preferences：用户偏好是否在多轮任务中保留？
- environment state：最近 observation 是否比全局 plan 更关键？
- failed attempts：失败历史是否防止 Agent 重复踩坑？

### 18. 局限：作者主动承认了哪些没做完？

论文的边界相当明确：

| 局限 | 为什么重要 | 需要的后续实验 |
|---|---|---|
| plan signal 混有位置、长度、话语结构 | 删除 plan 不只删除语义，也改变序列结构 | length-matched filler、shuffled plan、paraphrase、ablation |
| probe 有 step-index leakage | 近乎完美 AUROC 可能来自“第几步” | mixed-effects control，固定 step/task/plan length/overlap |
| strict stripping 不对称 | 只改 B 条件会引入分布偏移 | strip both A/B 或 neutral replacement |
| 没有强因果干预 | probe 能测，但 steering 是 null | 更细粒度 head-aware 或 content-specific intervention |
| 模型域有限 | 主证据来自 Llama family、ALFWorld、HotpotQA | MoE、RL-tuned reasoning、真实软件 Agent |
| plan protection 未恢复行为 | 说明压缩损失不止计划 | keep_recent sweep，多类型承重 token replay tests |

这些局限不会推翻“计划在标准 LLM Agent 中快速 context-time 衰减”的测量结果，但会限制两个更强说法：

- 不能说模型完全没有任何计划内容表征。
- 不能说 L32 probe 读出了计划语义。
- 不能说 re-surfacing plan 就能修复长程 Agent。

### 19. 对 Agent 系统设计的研究启发

从研究者视角看，这篇论文的价值不在于给出一个可直接上线的 compression policy，而在于给出一套更严谨的问题分解。

一个长程 Agent 的上下文管理不应该只问：

- 还能塞多少 tokens？
- 摘要压缩率多少？
- 最近 N 轮够不够？

它还应该问：

- 哪些历史 token 是 context-time object？
- 哪些信息被模型真的内化了？
- 哪些信息只有保留原文才能继续影响动作？
- 哪些信息可以摘要，哪些必须原样 pin？
- 哪些信息被删除后，hidden state 先变，行为后坏？

这会把 Agent memory 从“存储系统设计”推进到“可测量的状态保持问题”。

### 20. 我的判断

这篇论文最强的贡献是 **测量框架**，不是 probe 本身，也不是 strict stripping 这个具体修补。

我会把它的结论分成三层：

1. **强结论**：在作者测试的标准 Llama Agent 设置中，计划信号快速衰减，计划高度依赖上下文窗口。
2. **中等结论**：reasoning traces 会污染 replay pairing；测 reasoning model 的 plan persistence 必须处理历史 `<think>`。
3. **弱结论**：probe-gated re-surfacing 可能成为 context manager 的一部分；当前压力测试没有证明它能修复成功率。

对 AI 安全和 Agent 工程来说，最值得继续追问的是安全约束与工具约束是否也有同样性质。如果“不要访问外部网络”“只能用只读工具”“不要覆盖用户文件”这类指令也只是 context-time object，那么长程 Agent 的压缩策略就是安全边界的一部分，而不是简单性能优化。

### 21. 继续追问

- **计划之外的承重 token**：任务目标、权限边界、工具 schema、用户偏好、失败历史，哪一类最容易被错误压缩？
- **内容特异 probe**：能否在控制 step index、长度、位置后仍读出计划内容差异？
- **动态计划 vs 静态计划**：reasoning model 的 `<think>` 自刷新是否比静态 pinned plan 更抗压缩？
- **真实软件 Agent**：在代码修改、文件系统操作、浏览器自动化中，plan eviction 是否会导致权限违规或重复修改？
- **安全约束 replay pairing**：删除 safety instruction 后 hidden state 与工具调用概率如何变化？
- **压缩策略评测**：除了 success rate，还应记录 deviation lead time、unsafe action rate、repeated action rate、tool misuse rate。

这篇论文把“上下文窗口”从一个容量限制，重新定义成 Agent 的工作状态载体。它真正提醒我们的是：长程 Agent 的记忆不是自动存在的，很多关键状态只是还没被删掉。
