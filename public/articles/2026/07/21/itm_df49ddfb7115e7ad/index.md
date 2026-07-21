# Recursive Harness Self-Improvement：让 Agent Harness 自己从执行历史中变好

### 元信息

- 标题：Recursive Harness Self-Improvement
- 作者：Hyunin Lee、Jinglue Xu、Jeffrey Seely、Donghyun Lee、Matei Zaharia、Yujin Tang
- 机构：Sakana AI、UC Berkeley
- 类型：论文
- 方向：大模型 Agent；具体是 harness 优化、多 Agent 工作流、测试时扩展与执行轨迹质量
- arXiv：<https://arxiv.org/abs/2607.15524>
- Hugging Face Papers：<https://huggingface.co/papers/2607.15524>
- 日期证据：
  - arXiv 页面显示论文提交于 2026-07-17 00:21:19 UTC。
  - Hugging Face Papers 页面显示 Published on Jul 17，并由社区在 2026-07-20 提交。

### TL;DR

- 这篇论文关心的是 model-harness co-evolution 的前半圈：固定基础模型不变，能否先把用户侧 harness 优化到能生成更高质量执行轨迹，从而提升当前 Agent 表现，并为未来模型训练产生更好 traces。
- 作者提出 Recursive Harness Self-Improvement，简称 RHI。它把 harness 表示成 prompt-level agent loop，包括角色、指令、agent 间通信 contract、workflow hops、验收门、fallback 和 recall 规则；每轮只比较当前 harness 与上一轮 harness 的产物，用 pairwise preference history 继续改写 harness。
- RHI 的核心是把昂贵的人口级 harness 搜索降成轨迹局部自比较。理想目标要比较大量候选，有限种群搜索仍要多候选执行和二次 pairwise 比较；RHI 每轮只需要 1 次新 agent execution 和 1 次 pairwise evaluation，成本是常数阶。
- 实验使用 30 个合成开放式机器学习研究任务，覆盖 quantitative finance、robotics、pharmaceutical ML 三个领域；每个任务要求产出完整代码仓库和标准交付物，包括 `research_report.md`、PNG 图、`metrics.json` 和 `index.json`。
- 关键结果：在 Sonnet 4.6、Opus 4.7、Opus 4.8 三个 Claude coding agent 后端上，少数 RHI 迭代可让 high-reasoning agent 超过同家族更高测试时计算设置；Sonnet 4.6 high + H[2] 对 Sonnet 4.6 max 赢 20/30，Opus 4.7 一轮后超过 xhigh/max，Opus 4.8 两轮后超过 xhigh、max 和 ultracode。
- 成本证据同样重要：Sonnet 4.6 high + H[2] 比 max 成本低 7%，cache read/write 从 4.91 降到 3.31；Opus 4.7 high + H[1] 比 max 成本低 18%，cache 从 3.37 降到 2.11；Opus 4.8 high + H[2] 比 max 成本低 23%，比 ultracode 低 60%，对应 cache 分别下降 32% 和 64%。
- 作者认为收益主要不是输出更长，而是更好的 task-specific context management：RHI 学会了更有效的 agent 间 contract 和 hops，让信息流更稀疏、更少冗余、更贴合任务。
- 局限：评测依赖 LLM-as-a-judge pairwise 比较；benchmark 是合成 ML 研究任务，不等于真实科研生产；RHI 只优化 prompt 表示的 harness，不训练模型、不保证跨任务泛化；信息论目标是解释性假设，不是已证明的真实优化目标。

### 研究问题：为什么要优化 harness，而不是继续加 reasoning effort？

- 论文的背景判断是：
  - 现代 Agent 的能力不只来自基础模型。
  - prompts、tools、memory、subagents、workflow、verification、governance 等 harness 也在决定输出质量。
  - 这些 harness 生成的执行轨迹又可能成为未来模型训练数据。

- 因此，模型和 harness 之间存在一个递归飞轮：
  - 更好的 harness 组织当前模型完成任务。
  - 更好的执行轨迹被保存、筛选、训练或蒸馏。
  - 未来模型再用更强能力支撑下一代 harness。

- 这篇论文只做前半圈：
  - 不更新模型权重。
  - 不训练新的 coding model。
  - 不搜索大规模 executable harness code。
  - 只问：用户能否针对当前任务，用很少迭代把 prompt-level harness 改好？

- 这个问题有现实意义：
  - provider-built harness 必须覆盖大量用户和任务，不可能频繁为每个任务重写。
  - 用户侧 harness 可以更任务特化，但不能花很多执行预算。
  - 开放式代码仓库任务没有单一 verifier，无法只用 pass/fail reward。

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| prompt-level harness 可以被任务特化优化 | 把 harness 写成角色、指令、contracts、hops 和辅助规则，再由 LLM harness optimizer 根据偏好历史更新 | 三个后端上少量 RHI 迭代超过同家族更高 reasoning effort baseline | 没有证明同一 harness 能跨任务复用；这里是 task-specific 优化 |
| 轨迹局部自比较足够便宜 | 每轮只比较 `H[i]` 和 `H[i-1]` 的输出，而不是维护大候选种群 | Table 1：Trajectory-local RHI 每轮 `N_trace=1`、`N_pair=1`、总成本 `Theta(1)` | 局部比较是 noisy signal，可能陷入局部最优；论文用历史作为 momentum 缓解 |
| 收益不是简单因为输出更长 | 跟踪 normalized output tokens、cost、cache read/write | Sonnet 4.6 和 Opus 4.8 中，输出 token 近似平，但性能改善；Opus 4.7 证据不充分 | 不能排除个别模型或任务中 longer output 仍有帮助 |
| 主要收益来自上下文管理 | RHI 优先更新 contracts 和 hops，使 agent 间信息流更任务化、更少冗余 | cache read/write 下降；contracts/hops task MI 单调增加；task-conditional total correlation 单调下降 | 信息论分析基于 embedding 估计，是诊断证据，不是机制证明 |
| RHI 是 test-time scaling 的补充，不替代 train-time scaling | 固定模型上改善 harness，但弱模型 + RHI 不稳定追上更强模型 | Sonnet 4.6 + RHI 提升明显，却不能稳定闭合到 Opus 4.7 high/xhigh | 结论只限当前 benchmark 和模型族 |

### 方法机制：把 harness 当作可递归更新的文本对象

#### 1. 问题定义

论文把编码 Agent 写成：

```text
y ~ A(H, x)
```

变量含义：

| 符号 | 含义 |
|---|---|
| `A` | 固定语言模型驱动的 coding agent |
| `H` | harness，决定 agent loop、角色、通信和工作流 |
| `x` | 任务 prompt |
| `Y` | 输出空间；这里是完整代码仓库 |
| `y` | Agent 在 harness `H` 下生成的仓库 |

开放式仓库任务无法只靠一个数值指标评价，所以作者用 pairwise evaluator：

```text
L_eval(y1, y2, x_eval) in { y1 > y2, y1 ~ y2, y2 > y1 }
```

评价维度包括：

- deliverable coverage
- numerical and empirical rigor
- reproducibility
- presentation
- engineering quality
- task alignment

#### 2. 理想目标为何太贵

理想目标是找到一个 harness，使它对参考分布中的竞争 harness 有最高期望胜率：

```text
H*_x in arg max_H f_x(H)
```

其中：

```text
f_x(H) =
  E_{H', y, y'} [
    1{ L_eval(y, y'; x_eval) = y > y' }
  ]
```

直观解释：

- 让 `H` 和许多别的 harness 比。
- 每个 harness 都要执行 coding agent。
- 每对输出都要 evaluator 做 pairwise 判断。
- 对黑箱 coding agent 来说，这是昂贵的。

论文把三类成本压成表：

| 目标 | 每轮执行 traces | 每轮 pairwise evaluations | 总成本 |
|---|---:|---:|---:|
| Ideal objective | `M` | `M choose 2` | `Theta(M^2)` |
| Finite-population search | `m` | `m choose 2` | `Theta(m^2)` |
| Trajectory-local RHI | 1 | 1 | `Theta(1)` |

这就是 RHI 的关键取舍：

- 放弃全局搜索。
- 只做当前 harness 对上一轮 harness 的局部改进。
- 用历史偏好缓解单次 pairwise 判断的噪声。

#### 3. RHI 的局部目标

第 `i` 轮，RHI 把竞争者分布集中到上一轮 harness：

```text
nu_i = delta_{H_x^(i-1)}
```

局部目标是：

```text
f_tilde_x^(i)(H) =
  E_{y ~ A(H, x), y- ~ A(H_x^(i-1), x)}
  [
    1{ L_eval(y, y-; x_eval) = y > y- }
  ]
```

这不是理想目标的无偏估计，而是有意改变优化问题：

- 原问题：和很多竞争 harness 比。
- RHI：只问这一轮是否胜过上一轮。
- 优势：每轮成本可控。
- 代价：可能只做局部上升。

#### 4. RHI 算法伪代码

```text
Input:
  tasks {x_j}_{j=1..n}
  agent A
  evaluator L_eval
  harness optimizer L_harness
  evaluation prompt x_eval
  stopping threshold epsilon

Initialize:
  H_x^(0): initial prompt-level harness
  D_x = empty self-comparison history

Step 0:
  Run A(H_x^(0), x) to get y_x^(0)

For iteration i = 1, 2, ...:
  For each task x_j:
    y_j^(i) = A(H_j^(i), x_j)
    pref_j = L_eval(y_j^(i), y_j^(i-1), x_eval)
    D_j = D_j union {pref_j}

  s_i = mean_j 1[y_j^(i) wins y_j^(i-1)]

  If s_i < epsilon:
    break

  For each task x:
    H_x^(i+1) = L_harness(H_x^(i), D_x)

Return:
  H_x^* for each task
```

关键细节：

- `x_eval` 只给 evaluator，不直接给 harness optimizer。
- harness optimizer 只看到当前 harness 和历史偏好。
- 历史 `D_x` 不是梯度，而是语义 momentum。
- 每个任务的 harness 是 task-specific，而不是共享全局模板。

### Harness 的结构：RHI 主要优化 contracts 和 hops

论文把 harness 分成两大块：

| 组件 | 作用 |
|---|---|
| Agent design | 定义候选 agent 的 roles 和 instructions |
| Agent workflow | 定义 agents 如何交互、何时调用 reasoning、信息如何传递 |

workflow 又拆成：

| 子组件 | 含义 | 为什么重要 |
|---|---|---|
| Contract | 子 Agent 输出给 orchestrator 或下游 Agent 的信息接口 | 控制什么信息必须传、什么信息不该传 |
| Hop | orchestrator-subagent 的工作流步骤 | 控制何时分解、何时汇总、何时回忆、何时终止 |

prompt-represented harness 大致形如：

```text
Agent candidates:
  Agent 1:
    role: ...
    instruction: ...
    contract(out-to-orchestrator): ...
  Agent N:
    role: ...
    instruction: ...
    contract(out-to-orchestrator): ...

Workflow:
  Hop 1: ...
  Hop M: ...

Auxiliary rules:
  acceptance gates
  failure fallback rules
  evidence-motivated recall triggers
  communication rules
```

作者为什么强调 contracts 和 hops？

- 全量共享历史像 dense attention：
  - 每个 Agent 都可能读到大量无关上下文。
  - KV cache 读写和上下文传播成本更高。
  - downstream decision 容易被噪声干扰。

- task-specific contract 更像稀疏注意力：
  - 只传下游需要的信息。
  - 保留任务相关证据。
  - 降低冗余上下文。
  - 让 orchestrator 更容易判断是否完成。

这也是论文把 RHI 解释成“学习 harness-level information-flow sparsity pattern”的原因。

### Benchmark：30 个合成开放式 ML 研究任务

任务来源不是现成 benchmark，而是从三个领域的行业岗位描述转换成研究任务：

| 领域 | 数量 | 任务特征 |
|---|---:|---|
| Quantitative finance | 10 | 时间序列、交易成本、策略评估、因果/稳健性检查 |
| Robotics ML | 10 | 模型训练、控制/感知实验、benchmark 构造、可复现分析 |
| Pharmaceutical ML | 10 | synthesis planning、optimization、数据划分、模型比较 |

每个任务要求完整代码仓库，而不是一个答案字符串。

标准交付物包括：

- `research_report.md`
- PNG visualization files
- `metrics.json`
- `index.json`
- 有些任务还要求模型比较文件、消融摘要或可复现实验脚本。

这种 benchmark 的优点：

- 比单题问答更接近 coding agent 的真实工作。
- 能测试研究报告、代码组织、实验设计和可复现性。
- pairwise judge 可以比较多维质量。

但边界也明显：

- 它是合成任务。
- 任务集只有 30 个。
- 评测只读取任务指定交付物，不读取仓库所有文件。
- evaluator 上下文控制在最大输入长度的约 30% 到 40%，长文件会按同一协议截断。

### 评测设计细读：为什么用 pairwise，而不是给仓库打一个分？

这篇论文的评测选择值得单独拆开，因为它决定了 RHI 的适用边界。

#### 1. 输出是仓库，不是答案

在这些任务中，Agent 不是回答一个数学题，也不是提交一个函数。

它要交付的是：

- 多文件代码仓库。
- 实验脚本。
- 图表文件。
- `metrics.json` 中的结构化指标。
- `research_report.md` 中的方法、结果、局限和结论。

这意味着单一 verifier 很难覆盖质量：

- 代码能运行，不代表实验设计合理。
- 图能生成，不代表指标解释正确。
- 报告完整，不代表复现实验可信。
- 文件齐全，不代表任务没有偏题。

因此作者选择 pairwise judge，而不是 scalar score。

#### 2. Pairwise 的优势

pairwise 比较的好处是：

- evaluator 不必校准一个绝对分数。
- 只需判断两个仓库谁更好。
- 多维标准可以通过自然语言 rubric 同时考虑。
- 对开放式任务更接近人工评审。

论文中的 evaluator rubric 明确覆盖六项：

| 维度 | 要检查的问题 |
|---|---|
| Deliverable coverage | 是否满足任务显式交付物要求 |
| Numerical and empirical rigor | 方法、baseline、指标和局限是否内部一致 |
| Reproducibility | 是否有依赖、入口、随机种子和复现说明 |
| Presentation | 报告是否清晰，图表和结果是否整合 |
| Engineering quality | 文件树、代码片段、模块组织是否可读 |
| Task alignment | 是否真正回应任务目标，而不是漂到别的问题 |

这些维度和 RHI 的 harness 更新目标是匹配的：

- 如果 contract 要求子 Agent 返回指标和局限，deliverable coverage 会改善。
- 如果 hop 要求先设计 baseline 再跑实验，empirical rigor 会改善。
- 如果 acceptance gate 要求检查 `index.json` 和 `metrics.json`，reproducibility 会改善。

#### 3. Pairwise 的风险

但 pairwise judge 也带来三个风险：

| 风险 | 具体表现 | 对结论的影响 |
|---|---|---|
| Judge 偏好格式化 | 更长、更像论文的报告可能被偏好 | 可能高估 presentation-heavy harness |
| 上下文截断 | 仓库文件太多时只能看指定交付物和截断内容 | 可能漏掉隐藏 bug 或无关代码 |
| 自比较泄漏 | RHI 的反馈来自相邻版本比较，若 evaluator 偏好被学到，harness 可能逐渐迎合 judge | 需要真实用户或独立测试集验证 |

作者用两个 evaluator 配置和三个随机种子缓解这些问题，但不能完全消除。

#### 4. 为什么这仍然比只看 pass/fail 更适合本文？

RHI 的目标不是让一个已知测试集通过。

它想改善：

- 任务分解。
- 证据保留。
- agent 间信息传递。
- 研究报告质量。
- 代码仓库组织。

这些性质没有简单 pass/fail 信号。若强行使用单一 verifier，优化会偏向可测部分，反而忽略开放式研究任务中最重要的推理和表达质量。

所以这篇论文的评测选择可以理解为：

- 它牺牲了一部分客观性。
- 换来了对开放式仓库质量的覆盖。
- 因此结果应读作“pairwise judge 下的仓库偏好提升”，而不是“真实科研成功率提升”。

### 主实验：少数 RHI 迭代能超过同族测试时扩展

实验模型后端：

- Claude Sonnet 4.6
- Claude Opus 4.7
- Claude Opus 4.8

基线方式：

- base agent 使用 high reasoning。
- 对照是同一 coding agent 的更高 reasoning effort，例如 xhigh、max、ultracode。
- 每个配置使用 3 个随机种子。
- pairwise evaluator 使用两个不同模型家族/推理设置：GPT-5.5 max，以及 Opus 4.7 或 Opus 4.8 xhigh。

主结果可概括为：

| 后端 | RHI 结论 | 关键数字 |
|---|---|---|
| Sonnet 4.6 | high + H[2] 超过 max | 对 max 赢 20/30 pairwise comparisons |
| Opus 4.7 | H[0] 不如 xhigh/max，但一轮 RHI 后超过二者 | 说明初始 harness 不够，局部更新有效 |
| Opus 4.8 | H[0] 已接近或略超 xhigh；H[2] 超过 xhigh、max、ultracode | 说明任务特化 prompt harness 可超过 provider-built dynamic workflow |

这里最有意思的是 Opus 4.8 ultracode 对比：

- ultracode 使用 xhigh reasoning 和内置 dynamic workflow，可生成多个 subagents。
- RHI 仍能让用户构造的 task-specific prompt harness 胜出。
- 作者据此认为：固定系统级 harness 不一定能覆盖高度异质的任务分布。

但这个结论要谨慎：

- 它不证明所有用户 prompt harness 都比 provider harness 强。
- 它只说明在这个 30 任务 benchmark 上，task-specific harness optimization 可以超过一个强内置多 Agent 设置。
- 真实产品中的 provider harness 可能还有未公开的工具、记忆和安全机制。

### 成本与 token：RHI 不只是“写得更多”

论文专门拆了 output tokens、cost、cache read/write。

| 模型 | RHI 配置 | 对照 | 成本变化 | cache read/write 变化 |
|---|---|---|---:|---:|
| Sonnet 4.6 | high + H[2] | max | 2.38 vs 2.56，低 7% | 4.91 到 3.31，低 33% |
| Opus 4.7 | high + H[1] | max | 2.11 vs 2.60，低 18% | 3.37 到 2.11，低 37% |
| Opus 4.8 | high + H[2] | max | 1.69 vs 2.19，低 23% | 2.51 到 1.69，低 32% |
| Opus 4.8 | high + H[2] | ultracode | 1.69 vs 4.15，低 60% | 4.74 到 1.69，低 64% |

作者对 output tokens 的解释更细：

- Sonnet 4.6：
  - normalized output-token usage 在 H[0] 到 H[4] 之间大致 1.71 到 1.86。
  - 性能却持续改善。

- Opus 4.8：
  - normalized output-token usage 大致 1.42 到 1.81。
  - H[2] 的性能超过更高计算 baseline。

- Opus 4.7：
  - output tokens 和性能同时增加。
  - 作者承认这里证据不充分，不能把二者完全分开。

合理结论是：

- RHI 的收益不主要来自更长输出。
- 更像是 harness 改变了信息组织方式。
- 特别是 contracts 和 hops 降低了无用上下文传递。

### 为什么 cache read/write 是关键证据？

如果 RHI 只是让 Agent “多想一会儿”，我们应该看到：

- output tokens 增加。
- 推理成本上升。
- 性能随生成长度改善。

但论文观察到的更像另一种模式：

- 输出长度在两个模型上近似稳定。
- cache read/write 明显下降。
- 成本下降同时性能上升。

这说明 harness 的改变可能影响了“上下文如何被带入下一步”。

用 Agent 工作流语言解释：

- 一个松散 harness 会让 orchestrator 把大量历史、草稿、失败尝试和中间日志传给下游。
- 下游 Agent 需要在过长上下文中重新筛选任务目标和证据。
- 每次子任务调用都会复制或读取许多重复信息。

RHI 优化后的 contract 则更像接口类型：

```text
Subagent output contract:
  - claim being tested
  - dataset slice used
  - metric value
  - validation command
  - failure mode
  - unresolved assumption
```

这种 contract 的收益是：

- 信息粒度变清楚。
- downstream step 不必读取完整历史。
- orchestrator 更容易判断是否召回、重跑或终止。
- cache 使用下降不只是省钱，也意味着系统状态更简洁。

因此，cache read/write 的下降是本文最有解释力的辅助证据之一。

它把“RHI 更强”连接到一个机制假设：

- 不是更长 reasoning。
- 不是更多 Agent。
- 而是更稀疏、更任务化、更少冗余的信息流。

### 消融：RHI 不替代更强模型

作者问了一个重要问题：

- 如果 Sonnet 4.6 + RHI 能超过 Sonnet 4.6 max，那它能不能追上 Opus 4.7？

答案是否定且保守的：

- Sonnet 4.6 high + H[i] 在 2 到 4 轮后明显提升。
- 但并不能稳定追上 Opus 4.7 high 或 Opus 4.7 xhigh。

这给出了正确边界：

- RHI 是固定模型使用方式的优化。
- 它可以提升 same-family test-time scaling 的天花板。
- 它不是 train-time scaling 或更强基础模型的替代品。

### 消融：到底是 harness 哪些部分在变化？

论文用 embedding 诊断 harness 变化。

分析对象：

- 完整 harness 文本。
- roles
- instructions
- contracts
- hops

方法：

- 对每个任务、每轮 RHI harness 做文本 embedding。
- 使用 OpenAI `text-embedding-3-large` 和 `all-mpnet-base-v2` 两种 embedding。
- 用 t-SNE/UMAP 看低维投影。
- 用 cosine similarity 看连续迭代是否稳定。

主要观察：

- 初始 harness H[0] 与 RHI 后 H[1..4] 分离明显。
- 第一轮变化最大，后续逐步稳定。
- contracts 的连续相似度较快升高：0.48 -> 0.66 -> 0.69 -> 0.72。
- roles 变化更慢：0.28 -> 0.31 -> 0.33 -> 0.31。

作者解释：

- pairwise feedback 对 contract refinement 的学习信号更强。
- 当前反馈设计可能足以优化 contract，但对 roles、instructions、hops 的细化还不够。
- 未来可以改进 evaluator feedback 的质量和具体性。

### 信息论假设：让 contracts/hops 更任务相关，同时减少冗余

RHI 没有显式 scalar reward。

所以作者没有声称找到了真实 loss，而是提出一个解释性假设：

```text
J(g_i) = f_ext - beta * f_int
```

其中：

- `g_i` 是第 `i` 轮 task-to-harness mapping。
- `f_ext` 衡量外部提示强调的组件是否含有更多任务信息。
- 当前实现里，外部强调组件是 `contracts` 和 `hops`。
- `f_int` 衡量 harness 组件之间的 task-conditional redundancy。
- `beta > 0` 控制冗余惩罚强度。

用更直白的话说：

- 好 harness 不能只是把任务描述复制进每个组件。
- contracts、hops 要更懂任务。
- roles、instructions、contracts、hops 之间要分工，不要彼此重复。

#### 证据 1：contracts/hops 的任务互信息上升

作者用 embedding 后的 Gaussian canonical-correlation mutual information 做诊断。

Table 2 的趋势：

| 组件 | RHI 迭代趋势 | 解释 |
|---|---|---|
| roles | 单调下降 | 角色不再承担过多任务特定信息 |
| instructions | 大致持平或轻微下降 | 通用行为规范保持相对稳定 |
| contracts | 单调上升 | 信息传递接口越来越任务化 |
| hops | 单调上升 | workflow 控制流越来越任务化 |

这支持 `f_ext`：

- RHI 没有把所有字段都变得更任务化。
- 它主要把任务信息注入 optimizer prompt 强调的 coordination components。

#### 证据 2：组件冗余下降

作者用 total correlation 衡量组件间统计依赖：

```text
TC(role, instr, cont, hop)
  = sum_hc H(hc) - H(role, instr, cont, hop)
```

又用 per-task centering 估计 task-conditional total correlation。

Table 3 的关键趋势：

| 指标 | text-embedding-3-large debiased | all-mpnet-base-v2 debiased |
|---|---:|---:|
| `TC|task` 第 1 轮 | 4.84 | 3.51 |
| `TC|task` 第 4 轮 | 3.63 | 2.62 |
| 趋势 | 单调下降 | 单调下降 |

这支持 `f_int`：

- 控制任务信号后，组件之间残余冗余下降。
- harness 逐渐从“各处重复相似规则”变成“不同组件承担不同功能”。

但必须强调边界：

- 这些是 embedding-based diagnostic statistics。
- 不能当作原始文本真实互信息。
- 不能证明 LLM optimizer 内部真的在最大化 `J(g_i)`。
- 它们提供的是一个可检验的解释框架。

### Figure/Table 证据解读

| 图表 | 支持什么 | 不能证明什么 |
|---|---|---|
| Figure 1 | RHI 在 30 个合成 ML 研究任务上让 high+RHI 超过 xhigh/max/ultracode 等 test-time scaling baseline，并显示成本更低 | 不说明真实生产任务中同样成立 |
| Figure 2 | RHI 的五步循环：当前 harness 产出、与上一轮自比较、保存偏好、更新 harness | 不证明局部自比较一定找到全局最优 |
| Table 1 | 轨迹局部 RHI 每轮成本是 1 trace + 1 pairwise，常数阶 | 没把实际 LLM token 成本和 wall-clock 完全展开 |
| Figure 3/4 | harness 分为 agent design、contracts、hops 和辅助规则 | 只是结构定义，不是性能证据 |
| Figure 5/6/7 | 三个后端上少数 RHI 迭代可超过高 reasoning baseline | 评测仍依赖 LLM judge 和 30 任务样本 |
| Figure 8 | RHI 不能稳定替代更强基础模型 | 不否认更强 RHI 或更多任务可能改变结论 |
| Figure 9/10/11 | harness 和组件 embedding 随迭代出现系统变化，contracts 稳定较快 | embedding 变化不是内部机制证明 |
| Table 2 | contracts/hops 的 task MI 单调增加 | MI 估计是诊断代理 |
| Table 3 | task-conditional total correlation 单调下降 | 只说明文本组件表征冗余下降，不直接证明执行因果 |
| Figure 13 | 默认内置 multi-agent harness 成本更高但 Elo 不稳，显式 prompt harness 改善 cost-performance | 附录实验，不等于所有内置 harness 都弱 |
| Figure 14 | normalized cost、output tokens、cache read/write 的分布趋势与主文均值一致 | 仍不覆盖更多模型、工具和任务分布 |

### 失败与局限：这不是自动“自我进化”神话

这篇论文标题里有 self-improvement，但它的边界比标题更克制。

#### 1. 它不是模型自改写

- 基础模型固定。
- evaluator 固定。
- harness optimizer 固定。
- 递归发生在 prompt-level harness trajectory 上。

因此 RHI 更像：

- bounded harness-level RSI。
- 任务局部 workflow adaptation。
- 不是 Gödel Machine 式自证明自改写。
- 不是模型权重层面的 recursive self-improvement。

#### 2. 它不是全局搜索

- 每轮只和上一轮比。
- 如果上一轮方向错，局部比较可能把系统带进局部区域。
- 历史 `D_x` 能提供 momentum，但不能保证全局最优。

#### 3. 它依赖 judge

- 输出是完整仓库，无法用单指标验证。
- evaluator 只看指定交付物，长文件会截断。
- LLM-as-a-judge 可能偏好格式、冗长或表面严谨。
- 多 evaluator 和多 seed 能缓解，但不能消除 judge bias。

#### 4. 它的 benchmark 是合成的

- 30 个任务覆盖三类 ML 研究领域。
- 任务来自岗位描述转换。
- 这比玩具题复杂，但仍不是长期真实科研项目。
- 结论不应外推到所有 coding agent 工作流。

#### 5. 安全与治理问题没有完全展开

RHI 会让用户侧 harness 更任务化，这带来潜在风险：

- harness 可能学到过度优化 judge 的格式偏好。
- contracts 可能隐藏错误假设，让下游 agent 看不到必要上下文。
- failure fallback 和 recall triggers 如果设计不好，可能放大幻觉或重复执行。
- 如果未来把这些 execution traces 用于训练，trace 质量、偏差和污染治理会变成更高风险问题。

### 相关工作中的位置

RHI 位于四条线交叉处。

| 方向 | RHI 的关系 |
|---|---|
| Recursive self-improvement | RHI 是 bounded harness-level RSI，只更新可复用系统组件，不改模型权重 |
| Harness optimization | 与 Meta-Harness、AutoHarness、Self-Harness、TTHE 等同属系统层优化，但 RHI 不维护大候选种群 |
| Prompt/program optimization | 与 OPRO、TextGrad、DSPy、GEPA 有关系，但优化对象不是单 prompt，而是多 Agent harness |
| Multi-agent/test-time scaling | RHI 试图区分“多算一点”与“更好协调”，因此测 output tokens、cost 和 cache |

最重要的区别是：

- RHI 把 harness 当作 prompt-represented multi-agent control program。
- 它用 pairwise self-comparison 更新，不用可执行 code harness 搜索。
- 它要求开放式仓库任务的多维评价，而不是单 verifier。

### 对 Agent 系统的延伸思考

RHI 对 Agent 系统设计的启发很直接：

#### 1. Harness 应该是可学习对象

很多系统把 harness 当静态模板：

- 写好 system prompt。
- 写好 subagent roles。
- 写好 handoff protocol。
- 偶尔人工修改。

RHI 的观点是：

- harness 也是可迭代优化的对象。
- 但优化粒度应控制在用户任务和少量迭代内。
- 更新对象最好是可读、可审计、可回滚的文本规范。

#### 2. 多 Agent 的关键不是“更多 Agent”

附录 Q&A 的 Figure 13 说明：

- 默认 multi-agent 有时比 single(default) 更贵但 Elo 更低。
- 加入显式 `H(0)` 后，multi(ours) 才改善。
- single(unionOur) 说明角色/指令本身有帮助，但 multi(ours) 仍更好。

这给出一个工程判断：

- 多 Agent 系统的收益不来自数量。
- 收益来自 contract、handoff、验收门和 fallback。
- 没有明确通信结构的多 Agent 可能只是更贵的上下文扩散。

#### 3. Harness 优化需要可回滚的审计账本

如果把 RHI 放进真实系统，最不能省的是 harness 版本账本。

每次更新至少应记录：

- 输入任务 `x`。
- 旧 harness `H[i-1]`。
- 新 harness `H[i]`。
- 两个版本的输出摘要。
- evaluator 偏好。
- 人工或自动审查备注。
- 成本、token、cache 指标。
- 哪些 contract、hop、acceptance gate 被改动。

原因很简单：

- RHI 的学习信号是 noisy local preference。
- 单次胜利不代表全局改进。
- 如果后续迭代退化，需要知道是哪条 contract 或 hop 引入问题。
- 如果这些 traces 进入训练数据，还需要知道它们来自哪个 harness 版本。

这也是本文和普通 prompt tuning 的差别：

- prompt tuning 往往只保存最终 prompt。
- harness self-improvement 必须保存演化轨迹。
- 否则“自改进”会变成不可审计的 prompt 漂移。

#### 4. Context management 是 Agent scaling 的核心变量

传统 test-time scaling 往往是：

- 更高 reasoning effort。
- 更多 tokens。
- 更多 samples。
- 更多 subagents。

RHI 提供另一条路：

- 改写 agent 间信息接口。
- 减少不必要上下文传播。
- 让每个 downstream step 只接收必要证据。
- 用更低 cache read/write 达到更好性能。

这对长任务 Agent 很关键：

- 未来的性能瓶颈可能不是“模型不会推理”。
- 而是“系统把太多无关状态传给了错误的角色”。

### 结论

- Recursive Harness Self-Improvement 是一篇关于 Agent 系统层学习的论文。
- 它把 harness 从静态 prompt scaffold 变成可递归更新的任务特化对象。
- 它用非常便宜的局部 pairwise feedback 代替大规模 harness population search。
- 它在 30 个合成开放式 ML 研究任务上显示：少量 RHI 迭代可以超过更高 reasoning effort 甚至 ultracode 类内置 workflow，同时降低 cost 和 cache read/write。

最值得带走的判断：

- 对复杂 coding agent，继续提高 reasoning effort 不是唯一 scaling 路线。
- 更好的 harness 可能通过稀疏、任务化的信息流提升产物质量。
- contracts 和 hops 是比“角色名称”更关键的系统设计对象。
- pairwise self-comparison 可以成为开放式任务上的轻量学习信号。

但也要保留限制：

- 结果依赖 LLM judge。
- 任务集小且合成。
- RHI 是 task-specific，不是通用自进化。
- 信息论目标只是解释性假设。

研究者视角下，RHI 真正打开的问题是：

- 如何把 prompt-level harness 优化变成可审计实验？
- 如何检测 harness 是否在优化 judge 偏好而非真实任务质量？
- 如何让 execution traces 进入未来模型训练时保持来源、质量和安全边界？
- 如何把 contract、hop、memory、tool policy、verification 共同纳入一个可更新的 Agent control layer？

如果这些问题继续推进，Agent 的“后训练”可能不只发生在模型参数里，也会发生在围绕模型的 harness、memory 和 workflow 层。
