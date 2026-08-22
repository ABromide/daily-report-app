# AI4AI-Bench：让 Agent 改训练算法，而不是只调训练过程

### 元信息

| 字段 | 内容 |
|---|---|
| 标题 | AI4AI-Bench: Benchmarking LLM Agents in Algorithmic Design for Recursive Self-Improvement |
| 作者 | Yizhe Chi, Wenyi Li, Deyao Hong, Xiaoqiu Wang, Mingju Gao, Kaisen Yang, Bingxiang He, Youjie Zheng, Calvin Xiao, Qinhuai Na |
| 方向 | 大模型 Agent；大模型后训练；AI for AI |
| 发布时间 | 2026-08-20T17:56:59Z，来自 arXiv v1 页面与 arXiv 元数据 |
| 原文 | https://arxiv.org/abs/2608.20318 |
| HTML | https://arxiv.org/html/2608.20318v1 |
| 项目页 | https://lab.einsia.ai/ai4ai/ |
| 代码 | https://github.com/Einsia/AI4AI-Bench |

### TL;DR

- **这篇论文做什么**：AI4AI-Bench 问一个更窄但更关键的问题：coding agent 能不能改进一个 AI 项目已经在使用的训练算法，而不是只改 batch size、checkpoint、学习率或运行时脚本。
- **它怎么做**：作者冻结 10 个真实研究代码库，覆盖 SFT、多轮 agentic RL、on-policy distillation、reward modeling、DPO、diffusion RL、machine unlearning、graph diffusion、model soup 和 one-shot pruning。每个任务给 agent 4 小时、1 张 B300 和公开 proxy；提交后只把源码 patch 带入新容器，最多重新训练 12 小时，再用固定隐藏 evaluator 打分。
- **它的核心证据**：研究评测 6 个系统、29 个模型/框架/推理强度配置、10 个任务，共 290 个 cell。统一分数均值为 0.166，最好系统均值为 0.250；在 0.1 代表原仓库算法、1.0 代表任务最优的坐标上，最强系统也只补上不到五分之一距离。
- **关键数字**：263 个有改动提交中，141 个只改运行方式，平均 0.126；122 个触及学习方式，平均 0.226。reasoning effort 从最低到最高时，触及算法层的比例从 8% 升到 64%，均分从 0.094 升到 0.196，但得分并不随 effort 稳定单调上升。
- **最重要的判断**：这篇论文把“AI 改进 AI”拆到可测的算法层：如果 agent 只会把现有 recipe 跑久一点、调小学习率或多存 checkpoint，它并没有证明递归自我改进所需的复利机制。
- **局限**：baseline 是各仓库 shipped recipe，不是人类专家上限；final evaluator 与 proxy 的隔离主要是访问和时间隔离，不保证样本语义完全不重叠；所有结论绑定到 10 个任务、1 张 B300、4 小时探索和这些 agent/harness 版本。

### 1. 研究问题：为什么“改代码”不等于“改训练算法”？

作者关心的不是一般意义上的 coding benchmark，而是递归自我改进中的一个具体环节：

- AI 系统可以改进硬件利用、数据生产、训练算法；
- 硬件优化会遇到 roofline，数据路线会遇到人类文本存量和 synthetic data 退化；
- 训练算法不同，因为更好的 objective、update rule、regularization 或 schedule 会改变后续每一次训练的 compute-capability 兑换率；
- 如果下一代 agent 也由这个更好算法训练出来，算法层改进才有复利意义。

这就引出论文的核心判别：

| 看起来像进步 | 论文认为不够的原因 | 真正要测的能力 |
|---|---|---|
| 在固定数据集上提交更好预测 | 可能是特征工程、ensembling 或数据技巧 | 是否改变模型学习方式 |
| 把训练跑得更久或更稳 | 可能只是运行层调度 | 是否重写 objective、supervision、update |
| 调 batch size、LR、checkpoint | 仍是现有算法的外围参数 | 是否诊断训练动态并改机制 |
| 复用已有 recipe 达到更高分 | 可能只说明工程执行更好 | 是否产出后续训练可继承的方法 |

论文的主张可以写成一句话：

> 递归自我改进需要的是“训练方法被改进并被继承”，而不是“一次实验被更聪明地跑完”。

### 2. 任务形式：把 agent 置于真实研究代码库，而不是玩具脚本

AI4AI-Bench 的一个任务被形式化为：

```text
Task = (C, a0, q, m, d)

C  = 冻结研究代码库
a0 = 训练或构造开始时的固定模型/资产
q  = agent 探索期可反复查询的便宜 proxy
m  = 最终 evaluator 计算的指标
d  = 指标方向，上升更好或下降更好
```

执行流程是：

```text
Input:
  frozen source C
  fixed start asset a0
  cheap proxy q
  exploration budget Te = 4h on one B300

Agent:
  read repository
  edit training or construction code
  run short probes against q
  return rewritten source C'

Verifier:
  apply C' in a fresh container
  train or construct from scratch under Tv = 12h
  keep at most three latest valid checkpoints
  evaluate by fixed metric m

Output:
  task score and code-change classification
```

这个流程里最重要的边界不是 GPU 数量，而是“只让源码 patch 穿过边界”：

- exploration 期间训练出的权重不能带入正式验证；
- cache、rollout、临时状态、agent note 都不能带入正式验证；
- final evaluator 在 agent workspace 外部，agent 不能直接拿它调参；
- 同一套硬件、预算、evaluator 同时跑原始代码和 agent 提交代码。

因此，一个 cell 的胜负更接近于：

```text
同一任务、同一预算、同一评价器下：

  submitted source C' 生成的 artifact
  是否优于
  shipped source C 生成的 artifact
```

这比“看 agent 最后报了一个高分”更严格，因为它排除了探索期权重复用和隐藏 evaluator 反复试错。

### 3. 十个任务：覆盖训练算法家族，而不是覆盖十个题面

论文 Table 1 与项目 README 给出的任务族如下：

| 任务 | 算法家族 | 起点/资产 | final metric |
|---|---|---|---|
| OpenR1 | supervised fine-tuning | Qwen2.5-Coder-1.5B-Instruct | LiveCodeBench pass@1 |
| RAGEN | multi-turn agentic RL | Qwen2.5-3B-Instruct | held-out Sokoban solve rate |
| OPD | on-policy distillation | R1-Distill-Qwen-1.5B | AIME 24/25 |
| BTRM | Bradley-Terry reward modeling | Mistral-7B-Instruct-v0.2 | RewardBench |
| DPO | preference optimization | merged Zephyr/Mistral-7B | IFEval strict |
| DDPO | diffusion RL | Stable Diffusion v1.5 | aesthetic score with gates |
| NPO | machine unlearning | Llama-3.2-1B-Instruct | balanced unlearning score |
| DiGress | discrete graph diffusion | QM9 graph diffusion model | test NLL，越低越好 |
| Model Soup | weight averaging | 72 个 CLIP checkpoints | ImageNet-V2 top-1 |
| OWL | one-shot pruning | OPT-6.7B dense | WikiText-2 perplexity，越低越好 |

选择这些任务的逻辑不是“热门模型越多越好”，而是三条可验证约束：

- **必须是真实研究 codebase**：仓库要有作者实际运行的训练或构造算法，不只是教程。
- **必须有固定起点**：agent 要从同一个模型、checkpoint、数据或资产开始。
- **必须能半天内重放**：final evaluator 必须能在单 B300、12 小时以内完成。

两个非训练任务很有意思：

- Model Soup 并不训练新模型，而是决定 72 个 CLIP checkpoint 怎么组合；
- OWL 原始 recipe 是一次性 pruning，不包含 fine-tuning；
- 作者仍保留它们，因为“哪些权重要剪”“哪些 checkpoint 该合成”同样是算法设计问题。

这让 benchmark 的边界更清楚：

- 它不是只评估 training loop 工程；
- 它评估的是模型改造、目标函数、构造规则和模型选择策略的总称；
- 但它不覆盖系统内核优化、数据工程自动化或完整科研论文复现。

### 4. 评分公式：为什么 0.166 比 raw metric 更有解释力？

十个任务的 raw metric 不可直接平均：

- pass rate、aesthetic score、RewardBench 是越高越好；
- perplexity、negative log-likelihood 是越低越好；
- unlearning balanced score、model soup top-1、Sokoban solve rate 的自然尺度也不同。

作者引入每个任务自己的 progress coordinate：

```text
给定：
  x_perp = 无信息模型的参考点
  x_b    = 原仓库 shipped algorithm 的分数
  x_star = 任务最优点
  phi(x) = 将 raw metric 映射到同向质量坐标的函数

如果 phi(x) <= phi(x_b):
  sigma(x) = 0.1 * (phi(x) - phi(x_perp)) / (phi(x_b) - phi(x_perp))

如果 phi(x) > phi(x_b):
  sigma(x) = 0.1 + 0.9 * (phi(x) - phi(x_b)) / (phi(x_star) - phi(x_b))

然后 clip 到 [0, 1]；无有效 artifact 记为 0。
```

这个公式的含义是：

| 分数 | 解释 |
|---:|---|
| 0 | 没有产出有效模型，或质量低到无信息参考点 |
| 0.1 | 持平原仓库 shipped algorithm |
| 0.1 到 1.0 | 在原算法到任务最优之间补上多少距离 |
| 低于 0.1 | 提交代码比原仓库更差 |

这一步很关键，因为它让论文可以回答两个问题：

- 一个 agent 是否真的超过原始方法；
- 它超过了多少，而不只是赢或输。

论文还特别说明 perplexity 不能直接线性处理：

- perplexity 是 cross entropy 的指数；
- 因此 OWL 这类任务要用 `-log` 映射到同向质量坐标；
- 否则从 53.4 降到 16.2 会被误读成补上 71% 距离，而按 nats 计算约为 30%。

### 5. 实验设置：被测的是系统，而不只是模型名

论文把一个被测对象称为 system，因为结果受三层因素共同影响：

- foundation model 本身；
- agent harness，例如 Codex 或 Claude Code；
- reasoning effort 或 thinking level。

实验覆盖：

| 维度 | 设置 |
|---|---|
| 系统数量 | 6 个系统 |
| 配置数量 | 29 个 model/harness/effort 配置 |
| 任务数量 | 10 个任务 |
| 总 cell | 290 |
| 探索预算 | 每个 cell 4 小时，1 张 B300 |
| 验证预算 | 每个提交从干净环境最多 12 小时 |

主要结果可以压缩为：

| 结果 | 数字 | 解释 |
|---|---:|---|
| 全部 290 cell 平均 | 0.166 | 只略高于原仓库 0.1 基线 |
| 最强系统均值 | 0.250 | 仍只补上低比例距离 |
| 单个最好配置 | 0.288 | 未进入接近任务最优的区间 |
| 低于原仓库 baseline 的 cell | 124/290 | 超过五分之二尝试让结果变差 |
| 最高系统 | Claude Opus 5，0.250 | 论文环境中的系统排序第一 |
| GPT-5.6 Sol | 0.191 | 第二梯队，但距离最优仍远 |
| GPT-5.6 Luna | 0.117 | 仅略高于 shipped recipe |

这里不要过度解读成“某个模型绝对强弱榜”：

- 论文测的是 2026 年 8 月时这些 model-harness-effort 的组合；
- benchmark 仍是 10 个任务，而不是完整 AI 研发空间；
- 成本排序也不等同于分数排序，说明更多 token 或更贵探索并不自动转化为算法发现。

### 6. 关键发现：多数提交改的是运行方式，不是学习方式

论文最值得细读的部分不是排行榜，而是对提交 patch 的人工分类。

作者把有效改动拆成两类：

| 类别 | 典型改动 | 是否触及算法层 | 平均分 |
|---|---|---:|---:|
| 运行层改动 | 训练时长、checkpoint、学习率、batch size、容量、保存策略 | 否 | 0.126 |
| 学习方式改动 | objective、supervision、update rule、data、reward shaping | 是 | 0.226 |

在 263 个有改动提交里：

- 141 个只调整运行方式，占 54%；
- 122 个触及模型如何学习，占 46%；
- 触及算法层的提交平均分接近运行层提交的两倍；
- 但超过一半提交从未真正走到这个层次。

这说明 AI4AI-Bench 不是简单在说“agent 不够强”，而是在定位失败位置：

- agent 能读仓库、能跑实验、能改代码；
- 但常把可见的工程 knob 当成主要行动空间；
- 当任务要求它像 ML scientist 一样诊断训练动态并改变机制时，它才进入真正稀缺能力。

### 7. Reasoning effort：买到的是尝试算法层的勇气，不是稳定收益

项目页把这一点概括得很直接：更高 reasoning effort 让 agent 更愿意碰更难的改动，但不保证收益稳定增加。

论文给出的数字是：

| effort 变化 | 算法层改动比例 | 平均分 |
|---|---:|---:|
| 最低 reasoning setting | 8% | 0.094 |
| 最高 reasoning setting | 64% | 0.196 |

这个结果有两层含义：

- **正面解释**：更强推理确实让 agent 更可能读到 objective、reward、loss、update 这些核心路径，而不是停在训练脚本外围。
- **负面边界**：更愿意改算法并不等于改得对；论文强调没有 agent 的得分随 effort 稳定单调上升。

对研究者来说，这比“多想有用吗”更细：

- 多想首先改变搜索分布；
- 搜索分布从低风险工程调参移动到高风险算法重写；
- 但验证周期长、proxy 不完美、任务噪声和代码复杂度会让高 effort 的探索更容易产出坏 patch。

### 8. 论文的 claim → mechanism → evidence → boundary

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| RSI 的关键复利来自算法层 | objective/update 改进可被后续训练继承 | 论文把系统、数据、算法三层拆开，并选择算法层建 benchmark | 不证明系统工程或数据路线不重要 |
| 现有 benchmark 混淆了算法设计与工程执行 | 固定数据集或组件边界让 agent 通过外围技巧得分 | AI4AI-Bench 让 agent 改完整研究仓库，但 final evaluator 隐藏 | 仍由作者选择任务和 reference baseline |
| 统一评分必须跨 metric | 每个任务用 0、0.1、1.0 三个锚点映射 | 290 cell 平均 0.166，最好系统 0.250 | 锚点定义会影响跨任务均值解释 |
| 当前 agent 很少真正改学习机制 | patch 分类区分 run-level 与 learning-level | 141/263 只改运行方式；122/263 触及学习方式 | 分类含人工判断，边界 patch 可能有灰区 |
| reasoning effort 主要改变探索倾向 | 高 effort 更常进入算法层 | 算法层比例 8% 到 64%，均分 0.094 到 0.196 | 不保证单调收益，也不等价于科学发现能力 |

### 9. 图表与项目页证据：哪些信息支撑主线？

这篇文章没有必要把项目页图像逐张搬进正文；关键证据可以用表格和公式复现。真正承担论证功能的图表信息包括：

| 原文位置 | 支撑的结论 | 本文如何使用 |
|---|---|---|
| Figure 1 | 展示四小时探索、源码 patch、十二小时正式验证的生命周期 | 用 Mermaid 和流程描述替代截图 |
| Table 1 | 十个任务覆盖十类训练算法 | 用任务表重建 benchmark 范围 |
| Table 2 | 29 个配置在 10 个任务上的 raw metric 与映射分数 | 抽取总体均值、系统排序、低于 baseline 数量 |
| Section 4.1 | 区分 run-level 与 learning-level patch | 作为本文最核心机制证据 |
| Section 4.2 | reasoning effort 改变算法层尝试比例 | 解释“多想”买到什么、没买到什么 |
| Appendix B | 展示一个完整任务 contract | 用 RAGEN 例子说明 artifact、proxy、final metric、fresh replay 边界 |

一个更直观的流程图如下：

```mermaid
flowchart TD
  A["Frozen research repo C + start asset a0"] --> B["Agent explores for 4h on one B300"]
  B --> C["Agent may query cheap proxy q"]
  C --> D["Submission is source patch C' only"]
  D --> E["Fresh formal container"]
  E --> F["Train or construct from scratch, up to 12h"]
  F --> G["Keep at most 3 valid checkpoints"]
  G --> H["Fixed hidden evaluator computes final metric m"]
  A --> I["Original source C is replayed under same procedure"]
  H --> J["Compare C' against C, map to sigma score"]
```

### 10. 与相关工作的关系：它补的是“算法层隔离”

论文把自己放在几个相邻方向之间：

- **Kaggle 或 ML competition 式 benchmark**：适合测端到端提交能力，但 winning path 可能是特征、ensembling 或数据处理。
- **PostTrainBench 与 RSIBench-Data**：更贴近后训练和 RSI，但主要杠杆在数据、初始化或固定训练 stack。
- **MLS-Bench、MLGym、PaperBench、AI Scientist**：关注 AI 做 ML 或科研任务，但不一定把“改执行方式”和“改学习算法”拆开。
- **AutoML/AutoML-Zero**：更像自动发现算法，但与现代 agent 在真实研究仓库中读代码、调试、提交 patch 的形态不同。

AI4AI-Bench 的位置是：

- 它不声称覆盖整个自动科研；
- 它也不把 agent 产出的论文或叙述当核心产物；
- 它要求 agent 在真实代码中留下一个可重放的算法改动，并在隐藏 evaluator 下复测。

这让它对后训练研究也有意义：

- 如果未来要用 RL 训练“会做 ML research 的 agent”，AI4AI-Bench 的 dense score 比二元胜负更适合做 reward；
- 但 reward 仍需防止 agent 学会 benchmark 特定 shortcut，而不是真正形成可迁移算法设计能力。

### 11. 证据边界：这篇论文不能证明什么？

需要保留几个限制：

- **baseline 边界**：
  - 0.1 是原仓库 shipped algorithm；
  - 它不是人类 ML scientist 的上限；
  - agent 超过 0.1 只说明它赢了这个 reference recipe。

- **任务选择边界**：
  - 10 个任务覆盖面很宽，但不是完整 AI 训练世界；
  - 大规模 pretraining、distributed systems、data curation、frontier-scale safety training 都没有直接覆盖；
  - 单 B300、12 小时验证让任务必须可压缩。

- **proxy 边界**：
  - agent 探索期看不到 final metric；
  - 但某些任务的 proxy 与 final asset 可能来自相同 corpus 的不同切片；
  - 这保证不了语义完全隔离，只保证 final evaluator 不能被探索期直接查询。

- **分类边界**：
  - run-level 与 learning-level 的区别很有解释力；
  - 但真实 patch 可能同时改 schedule、loss、数据过滤和 checkpoint；
  - 灰区分类需要人工审读，未来最好公开分类规则与多标注一致性。

- **时间边界**：
  - 论文日期是 2026-08-20；
  - agent、harness、模型版本更新很快；
  - 结论应被看作当前快照，而不是长期能力定律。

### 12. 研究者视角：它对 Agent 和后训练研究提出了什么问题？

这篇论文最有价值的不是“当前 agent 得分低”，而是把下一步问题变得更精确。

对 Agent 研究：

- 需要区分“能编辑代码”和“能解释训练动态”；
- 需要让 agent 读取 loss curve、gradient norm、entropy、KL、reward saturation、validation drift，再把诊断映射到 objective 或 update 改动；
- 需要在 4 小时探索里管理实验组合，而不是只追逐一个短期 proxy。

对后训练研究：

- AI4AI-Bench 本身可以变成 agent RL 环境；
- 但 reward 设计必须避免过度拟合某些公开 proxy；
- 更理想的是训练 agent 形成可迁移的实验设计策略：保留 fallback、估计噪声、控制变量、复盘失败 patch。

对 AI 安全与治理：

- 递归自我改进不应该只被讨论成抽象能力曲线；
- 更可审计的问题是：某个系统是否能在封闭 evaluator 下稳定产出可继承的算法改进；
- 如果未来得分显著上升，风险评估应关注它改进的是一般训练算法，还是只在特定 benchmark 上过拟合。

一个简化研究 agenda 可以写成：

```text
Input:
  benchmark tasks with hidden final evaluators
  full trajectory logs from agent exploration
  source patches and final scores

Analyze:
  classify patch intent
  measure whether agent diagnoses training dynamics
  estimate proxy-final transfer
  compare fallback selection against final outcomes

Improve:
  train agents on experiment design
  add tools for training-dynamics reading
  reward mechanism-level changes only when final replay supports them

Boundary:
  never equate benchmark progress with unrestricted RSI
  require fresh replay, hidden evaluation, and patch-level audit
```

### 13. 结论：这是一套给“算法发现型 Agent”的验钞机

- AI4AI-Bench 把 AI for AI 的问题从口号拉回到源码 patch、fresh replay、hidden evaluator 和跨任务 score。
- 它显示当前强 agent 已能做一些有用工程探索，但大多数提交仍停留在运行层。
- 真正有信号的提交会触及 objective、supervision、update rule、reward shaping 或数据机制，且平均分更高。
- reasoning effort 会显著提高 agent 尝试算法层改动的概率，但没有解决“改得准不准”的问题。
- 这给后续研究留下了一个清楚判断标准：不要只问 agent 能否跑实验，要问它能否提出可重放、可继承、经隐藏 evaluator 验证的训练算法改进。

### 14. Appendix B 的意义：任务说明如何限制“投机性胜利”？

附录给出 RAGEN on Sokoban 的完整 instruction，这不是普通补充材料，而是理解 benchmark 可审计性的关键证据。它说明 agent 收到的并不是一句模糊目标，而是一份明确 contract：

| contract 片段 | 约束对象 | 为什么重要 |
|---|---|---|
| 固定 Qwen2.5-3B-Instruct policy | 起始模型 | 防止 agent 借不同初始化制造不可比结果 |
| public_four_bank_solve_rate | exploration proxy | 允许快速试错，但不暴露 final 512-board 分数 |
| held_out_512_board_solve_rate | final metric | 让正式分数来自探索期不可直接查询的 evaluator |
| fresh formal retrain | 提交边界 | 探索 rollouts、checkpoints、缓存不能继承 |
| checkpoint-<progress> | artifact 约定 | 防止只提交零散 trainer shard 或不可加载中间态 |
| 保存最多三个最近 checkpoint | 选择边界 | 限制 agent 用大量 checkpoint lottery 挑 lucky run |

这个 contract 让 benchmark 避开几类常见漏洞：

- **过拟合 final evaluator**：agent 看不到最终 evaluator，只能通过 proxy 建立假设。
- **用探索期训练成果作弊**：formal replay 从固定 policy 重新生成 boards 和 trajectories。
- **靠不可复现状态获胜**：只有源码 patch 和可加载 checkpoint 能进入评分。
- **把失败包装成提前结束**：instruction 明确要求提交的 formal recipe 应该合理使用正式训练预算。

但 contract 也暴露了真实研究 agent 的难点：

- agent 必须在有限时间里判断 proxy 是否可信；
- 它要决定哪些候选作为 fallback，哪些实验继续推进；
- 它要记录 board identities、trajectory length、reward distribution、filter statistics、checkpoint hash 等调试证据；
- 它还要在非确定训练噪声下避免把一次 seed 的偶然改进误判成算法进步。

这组要求已经接近一个初级 ML researcher 的实验纪律，而不是“让模型写几行代码通过测试”。

### 15. 失败模式：为什么 agent 容易停在运行层？

论文没有把失败归结为单一智力不足。更合理的解释是，训练算法改动在局部反馈上比运行层调参更危险。

| 选择 | 短期反馈 | 风险 | 为什么 agent 偏好它 |
|---|---|---|---|
| 延长训练 | 容易看到 proxy 上升或 loss 下降 | 可能只消耗预算，不改变机制 | 最直观，改动小，回滚容易 |
| 调学习率 | 几分钟内可观察曲线变化 | 可能破坏 final 泛化 | 符合常见调参经验 |
| 改 checkpoint 保存 | 容易提升被选中 artifact 机会 | 不提升学习本身 | 工程上低风险 |
| 改 objective | 需要理解 loss 与任务指标关系 | 可能直接训练崩溃 | 需要机制假设和较长验证 |
| 改 reward shaping | 可能 proxy 变好但 final 变差 | 奖励 hacking 风险高 | 需要读环境和 evaluator 边界 |
| 改数据生成 | 涉及分布、污染、覆盖率 | 容易违反 contract | 需要领域判断 |

因此，“只改运行方式”不是一个偶然现象，而是由反馈结构诱导出来的：

- 运行层改动更容易在 4 小时内完成一个闭环；
- 算法层改动需要读懂更深路径，且一次正式验证最长 12 小时；
- agent 若没有足够强的训练动态解释能力，自然会选择可见 knob。

这也解释了 reasoning effort 的双刃剑：

- 高 effort 让 agent 愿意进入 objective、data、update rule；
- 但它也会产出更大、更难验证、更容易坏掉的 patch；
- 如果没有强 proxy-final transfer 判断，高 effort 可能只是让搜索空间扩大，而不是让科学判断同步提升。

### 16. 可复现性：项目发布了什么，仍缺什么？

项目 README 显示仓库发布了 quickstart、10 个任务、runtime assets、evaluation receipts、published images、troubleshooting 和 replay/evaluate 入口。这对 benchmark 很重要，因为它允许后来者复跑两个层次：

- **复跑任务环境**：准备 pinned assets，跑 smoke test，验证 Docker、GPU passthrough、CUDA kernel、host mounts 和 mock score lifecycle。
- **复跑 agent 提交**：用 `candidate.patch` 在同一固定任务起点 replay，最多生成三个 checkpoint，再分别 evaluate。

从审计角度看，公开代码提供了几类证据：

| 公开材料 | 可以验证什么 | 不能验证什么 |
|---|---|---|
| tasks/README | 十个任务的 metric、proxy、final evaluator 范围 | 每次正式评测的全部内部状态 |
| orchestrator/trial.sh | explore 到 formal replay 的主流程 | 不同云环境下完全相同的硬件时序 |
| evaluate.sh | checkpoint 独立评价流程 | hidden final 服务不存在时的官方盲测一致性 |
| task.toml/declaration.py | immutable identities、mounts、commands | 上游模型和数据许可长期稳定 |
| 290 trajectories | agent 行为与 patch 分类材料 | 人工分类的一致性和未来版本漂移 |

因此，复现性评价应该分成三层：

- **代码可运行性**：读者能否在合适 GPU、Docker 和资产下启动任务。
- **结果可重放性**：给定同一 patch，能否在 formal 环境复测出同类结果。
- **研究结论可延展性**：换模型、换 harness、换任务后，run-level 与 learning-level 的差距是否仍存在。

论文较强的是前两层的工程设计；第三层需要未来版本持续填充。

### 17. 如果把它用于训练 agent，reward 应该怎么设计？

AI4AI-Bench 的 dense score 很适合作为 RL 环境候选，但直接把 `sigma` 当唯一奖励会有问题。更稳妥的做法是把最终分数、机制分类和实验纪律拆开。

可以定义一个训练信号草案：

```text
Reward = final_score_gain
       + alpha * mechanism_change_bonus
       + beta  * reproducibility_bonus
       - gamma * contract_violation_penalty
       - delta * proxy_overfit_penalty

其中：
  final_score_gain = sigma(C') - 0.1
  mechanism_change_bonus 只在 patch 触及 learning objective/update/data 且 final replay 有收益时给
  reproducibility_bonus 来自 loadable artifact、clean replay、稳定日志和失败可诊断性
  contract_violation_penalty 惩罚外部数据、final seed 泄漏、不可加载 checkpoint
  proxy_overfit_penalty 惩罚 proxy 上升但 final 显著下降的候选
```

这个设计反映了论文的核心警告：

- 不能奖励“看起来大胆”的算法改动；
- 也不能只奖励“final score 刚好高”的偶然 lucky run；
- 真正需要的是机制假设、可重放 artifact、隐藏 evaluator 收益三者同时成立。

对未来 agent 系统，训练目标也许应包括：

- 自动生成实验计划并标注每个实验要验证的机制假设；
- 读训练曲线时区分优化失败、泛化失败、artifact invalid、proxy mismatch；
- 在有限预算中维护 fallback，而不是把最后一个实验当唯一提交；
- 对每个 patch 写出“为什么这个改动应当影响 final metric”的因果解释。

如果一个 agent 在这些能力上提升，AI4AI-Bench 的分数上升才更接近真实算法发现能力；否则，它可能只是学会了在 10 个公开任务上寻找脆弱捷径。
