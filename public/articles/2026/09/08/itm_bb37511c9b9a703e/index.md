# Verify Before You Distill：用提示级教师门控修正 on-policy distillation 的盲信问题

## 元信息与 TL;DR

- 原文：Verify Before You Distill: Prompt-Level Teacher Gating for On-Policy Distillation
- 作者：Zhiwei Zhang、Zechen Sun、Fei Zhao、Kang Peng、Bin Liang、Huayu Deng、Yao Hu、Kam-Fai Wong、Mu Chuan
- 链接：https://arxiv.org/abs/2609.02998
- 类型：论文，大模型后训练 / on-policy distillation / verifier-grounded RL
- 日期证据：
  - arXiv abs 页标记为 `Submitted on 2 Sep 2026`，提交历史为 `Wed, 2 Sep 2026 17:54:09 UTC`。
  - arXiv HTML 页面响应元信息显示 `Published Time: Fri, 04 Sep 2026 00:02:26 GMT`，这应理解为 HTML 工件发布时间，不等同于论文首次提交日。
  - Hugging Face paper 页在本轮抓取时显示作者/提交者社区项时间为 `2026-09-08T02:29:54`，作为当前平台活动证据；正文仍保留 arXiv 原始日期，避免把平台活动误写成 arXiv 发布。
- 本文边界：这是一篇方法与训练系统论文，不是开源代码发布。以下解读依据 arXiv abs、HTML 正文、TeX 源码中的表格、公式、算法和图。

### TL;DR

- 论文要解决的是 vanilla OPD 的一个结构性问题：它把冻结教师在每个 prompt 上的 token-level dense supervision 都默认当成可信信号，却没有先验证教师在这个具体 prompt 上是否真的可靠。
- 作者提出 Teacher-Gated On-Policy Distillation，简称 TGOPD。核心机制是让教师在空闲窗口里为同一个 prompt 额外生成少量 probe rollout，用任务 verifier 打分，得到提示级可靠性估计 `q_T(x)`。
- 如果 `q_T(x) >= tau`，训练使用 dense OPD；如果门控失败，则撤回教师信号，改用 verifier-grounded GRPO。两条监督信号按 prompt 二选一，不做 token 级混合。
- 论文主实验覆盖 4B dense student 和 35B MoE student，三类任务分别是数学、代码、指令遵循；数据源包括 DAPO-Math-17K、CodeI/O、Nemotron-Cascade 2 过滤集。
- 单域结果显示 TGOPD 在 6 个 domain x scale 设置中都优于 vanilla OPD；最大收益在代码任务，4B 平均增益 `+3.0`，35B 平均增益 `+2.9`。
- 多域 MOPD 结果显示，4B 七项 benchmark 平均从 `53.40` 到 `54.54`，35B 从 `60.99` 到 `61.94`；但也有小回退，例如 4B LiveCodeBench `-0.48`、35B AIME 2025 `-0.15`、35B IFBench `-0.41`。
- 计算效率不是附带卖点，而是方法成立的系统条件：vanilla OPD 的教师节点在 4B 单域实验中平均 GPU 利用率只有 `9.8%`，TGOPD 用 probe 填充空闲窗口后升到 `78.9%`。
- 局限同样明确：结论依赖二值 verifier、可验证任务、固定 probe budget、有限模型规模、有限训练步数和作者实现的异步流水线；它证明的是“提示级可靠性门控有价值”，不是所有蒸馏场景都应照搬这个阈值。

## 研究问题：OPD 为什么需要先验证教师？

### Vanilla OPD 的优势和盲点

- On-policy distillation 的基本诱惑很强：
  - 学生自己采样 rollout；
  - 冻结教师对学生实际生成的 token 给 dense supervision；
  - 相比只靠最终 reward 的 RLVR，每个 token 都能得到更细的学习信号。
- 论文把这个优势保留下来，同时指出一个盲点：
  - OPD 的 reverse KL 信号只衡量学生 token 概率和教师 token 概率的差距；
  - 它不直接关心教师答案在当前 prompt 上是否正确；
  - 当教师“高置信但错”时，dense supervision 反而会把错误压得更紧。

### 这不是简单的 confidence calibration 问题

- 作者的关键诊断是：教师自己的分布信号不能稳定地区分 prompt-level reliability。
- Figure 2 用每个 domain `2400` 个 prompt 做离线诊断：
  - 每个 prompt 采样 `10` 个教师回答；
  - 用 verifier 得到 `q_T^(10)`，也就是十次回答的通过率；
  - 再比较教师自信度能否区分高可靠和低可靠 prompt。
- 结果显示：
  - 代码 domain 的 AUROC 只有 `0.51`，几乎接近随机；
  - 数学 domain 的 AUROC 为 `0.73`，有区分能力但远非可靠判定；
  - 在 `q_T^(10) < 0.5` 的低可靠区间，教师最高置信样本在代码中仍有 `84%` 错误率，在数学中有 `61%` 错误率。

![教师自信度诊断](/daily-report-app/data/assets/2026/09/08/itm_bb37511c9b9a703e/teacher-confidence.png)

### 论文要推翻的隐含假设

| 隐含假设 | 论文中的反例 | 对后训练的含义 |
|---|---|---|
| 强教师整体更好，所以每个 prompt 都值得学 | 教师可靠性按 prompt 波动，代码中自信度几乎不能区分好坏 | 需要 instance-level admission，而不是全局信任 |
| 低质量教师信号可以靠 token 权重软化 | RLSD-style 全局削弱教师角色后，在 14 列指标中 8 列低于 base | 问题不是少用教师，而是只在不可靠处撤回 |
| verifier 只能给 sparse reward，无法帮助 dense distillation | verifier 可先审核教师 probe，再决定是否允许 dense OPD | verifier 的作用从训练信号扩展到路由器 |

## 论文主张与论证路线

### Claim -> Mechanism -> Evidence -> Boundary

| 层次 | 论文如何展开 | 应该怎样读 |
|---|---|---|
| Claim | OPD 不应无条件接收教师 token 信号，教师可靠性需要按 prompt 验证 | 这是训练信号治理问题，不只是优化技巧 |
| Mechanism | 用 `K_T` 个教师 probe 和 verifier pass rate 估计 `q_T(x)` | probe 是提示级审核，不是再生成一个 teacher answer 给学生模仿 |
| Evidence | 4B/35B，数学/代码/IF，单域和多域结果，阈值与 fallback 消融 | 证据覆盖多个任务族，但都要求可验证 reward |
| Boundary | 固定二值 verifier、有限预算、有限训练步数、特定异步流水线 | 不能直接推出开放问答、偏好任务或无 verifier 场景有效 |

### 论证路线图

```mermaid
flowchart TD
  A[Vanilla OPD: dense teacher signal on every prompt] --> B[问题: reverse KL 会放大高置信错误]
  B --> C[诊断: confidence 在代码上几乎不能识别低可靠 prompt]
  C --> D[TGOPD: teacher probe + verifier 得到 q_T(x)]
  D --> E{q_T(x) >= tau?}
  E -->|是| F[使用 dense OPD]
  E -->|否| G[撤回教师信号, 使用 GRPO fallback]
  F --> H[单域与多域评测]
  G --> H
  H --> I[收益主要来自 blocking unreliable teacher signal]
```

## 方法机制：TGOPD 的门控到底在控什么？

### 可靠性定义

- 论文先把教师在 prompt `x` 上的可靠性定义为 verifier reward 的期望：

```math
R_T(x) = E_{y ~ pi_T(.|x)}[r(x,y)] in [0,1]
```

- 这个定义有三个重要含义：
  - 可靠性属于 prompt，而不是属于整个教师模型；
  - 可靠性由 outcome verifier 决定，而不是由教师 logprob、entropy 或 teacher-student agreement 决定；
  - 可靠性是“教师采样能否解题”的概率，因此天然允许同一个教师在不同 prompt 上表现不同。

### 用 probe 估计 `R_T(x)`

- 因为 `R_T(x)` 没有闭式可得，TGOPD 让教师对同一个 prompt 独立生成 `K_T` 个 probe：

```math
q_T(x) = 1 / K_T * sum_{k=1}^{K_T} r(x, y_hat^k)
```

- 若 reward 是二值的，则：

```math
K_T q_T(x) ~ Binomial(K_T, R_T(x))
```

- 这带来一个清晰的统计边界：
  - `q_T(x)` 是无偏估计；
  - 方差为 `R_T(x)(1 - R_T(x)) / K_T`；
  - 但无偏不等于单次门控一定准确，尤其当 `K_T` 很小或 prompt 靠近阈值时。

### 门控规则不是连续加权

- 主实验使用 `K_T = 3`、`tau = 2/3`。
- 操作上等价于三次 probe 里至少两次通过：

```math
g(x) = 1[q_T(x) >= tau]
```

- 论文反复强调这不是“OPD 和 GRPO 混一点”的加权策略：
  - `g(x) = 1`：整个 prompt 的 student rollout token 使用 OPD advantage；
  - `g(x) = 0`：整个 prompt 撤回教师信号，使用 GRPO advantage；
  - 同一 prompt 内不让两种 provenance 不同的监督信号混合。

![TGOPD 框架图](/daily-report-app/data/assets/2026/09/08/itm_bb37511c9b9a703e/tgopd-framework.png)

## 目标函数：从 OPD 和 GRPO 到二选一路由

### OPD 分支

- OPD 的 token-level advantage 来自教师和学生在同一个学生采样 token 上的 log-likelihood gap：

```math
A_OPD(i,t) = beta * sg[log pi_T(y_i,t | x, y_i,<t) - log pi_theta(y_i,t | x, y_i,<t)]
```

- 它的价值是 dense：
  - 每个 token 都有学习方向；
  - 学生学习自己实际 rollout 中哪些 token 更像教师；
  - 训练效率高于只等最终 reward。
- 它的风险也来自 dense：
  - 如果教师在该 prompt 上错，错误信号会覆盖整条轨迹；
  - reverse KL 的 mode-seeking 特性会强化教师的高概率行为；
  - 高概率不等于正确。

### GRPO fallback 分支

- 当门控关闭时，TGOPD 改用 verifier reward 的 group-relative signal：

```math
A_GRPO(i) = r(x,y_i) - 1/G * sum_j r(x,y_j)
A_GRPO(i,t) = A_GRPO(i)
```

- 这条分支更粗：
  - 同一个 rollout 里的所有 token 共享同一个 advantage；
  - 如果整组 rollout reward 全相同，centered advantage 为 0，该 prompt 不产生有效更新；
  - 如果组内有好坏差异，学生仍能从 verifier 中学到相对方向。

### TGOPD selector

- 最终 advantage 是：

```math
A_TGOPD(i,t) = g(x) * A_OPD(i,t) + (1 - g(x)) * A_GRPO(i,t)
```

- 因为 `g(x)` 是 0/1，公式看起来像相加，实际是 selector：
  - 它保留了 OPD 在可靠 prompt 上的完整强度；
  - 它避免在不可靠 prompt 上继续追随教师；
  - 它把 verifier 从“只评价学生”扩展为“先审计教师，再决定训练信号来源”。

## 算法流程：为什么 probe 不一定拖慢流水线？

### 一轮 rollout-update cycle

```text
Input:
  prompt batch B, student pi_theta, rollout snapshot pi_old,
  frozen teacher pi_T, verifier r, group size G,
  probe budget K_T, threshold tau

For each prompt x in B:
  1. Rollout nodes concurrently sample G student rollouts from pi_old.
  2. Teacher node concurrently samples K_T probe rollouts from pi_T.
  3. Verifier scores teacher probes and computes q_T(x).
  4. Teacher still scores student tokens as vanilla OPD does.
  5. Verifier scores student rollouts for RLVR signal.
  6. If q_T(x) >= tau, use OPD advantage.
  7. Otherwise, use GRPO advantage.

Output:
  PPO-clipped update with the selected per-prompt advantage.
```

### 系统层面的关键点

- 论文不是说 probe 免费，而是说异步 OPD 里教师节点原本就有大量空闲。
- 标准 OPD 中：
  - 学生 autoregressive decoding 在 rollout nodes 上跑；
  - 教师只在学生 rollout 完成后做 forward scoring；
  - scoring 比 decoding 便宜，所以教师节点长时间等待。
- TGOPD 把教师 probe 放在学生 decoding 同时执行：
  - 如果 `K_T` 个 probe 在学生 batch 完成前结束，理论上不增加 wall-clock；
  - 实际不会完全重叠，所以论文仍报告了 35B code 对齐 run 的 `5.9%` mean step time 增加；
  - 因此“利用率提升”不能被误读为“端到端完全无开销”。

## 实验设置：数据、模型、baseline 和指标

### 模型与训练设置

| 维度 | 设置 |
|---|---|
| 学生模型 | Qwen3.5-4B dense；Qwen3.6-35B-A3B MoE，3B active parameters |
| 任务域 | mathematics、code、instruction following |
| 教师 | 每个 domain 训练一个 GRPO domain-specialist teacher，训练后冻结 |
| 训练框架 | slime 异步 rollout-update loop |
| 稳定化 | 使用 IcePop 缓解异步 rollout 带来的 train-inference probability mismatch |
| 主实验门控 | `K_T = 3`，`tau = 2/3` |
| 资源拓扑 | 4B 用 5 个 8-GPU nodes；35B 用 7 个 8-GPU nodes |

### 数据和指标

| Domain | 训练 prompts | 评测指标 |
|---|---|---|
| Math | DAPO-Math-17K | AIME 2025、AIME 2026、HMMT-Feb 2025 |
| Code | CodeI/O input-output prediction | LiveCodeBench code-generation Pass@1、OJBench overall |
| IF | Nemotron-Cascade 2 过滤集 | IFBench、IFEval |

### Baselines 的比较意义

| Baseline | 机制 | 它检验什么 |
|---|---|---|
| Vanilla OPD | 每个 prompt 都用 reverse-KL dense signal | 无门控教师信任的上限和风险 |
| TrOPD | token-level trust region，outlier 用 forward KL | 分布信号能否局部调节教师 |
| RG-OPD | verifier-derived advantage 与 likelihood gap 一致时保留 trajectory distillation | outcome evidence 做 trajectory-level 过滤 |
| RLSD-style | verifier 决定方向，教师调节 token magnitude | 全局降低教师角色是否可行 |
| TGOPD | prompt-level probe gate，OPD/GRPO 二选一 | 只在教师不可靠时撤回 dense signal |

## 主结果：最强证据来自代码负迁移

### 单域结果

| Scale | Math 平均增益 vs Vanilla OPD | Code 平均增益 vs Vanilla OPD | IF 平均增益 vs Vanilla OPD | 关键观察 |
|---|---:|---:|---:|---|
| 4B | +1.5 | +3.0 | +1.6 | 代码收益最大，OJBench 达到 20.0 |
| 35B | +1.2 | +2.9 | +1.9 | LiveCodeBench 从 Vanilla OPD 的 60.2 到 TGOPD 的 64.0 |

- 论文最有力的局部证据是 35B code：
  - base model 在 LiveCodeBench 是 `61.0`；
  - vanilla OPD 下降到 `60.2`；
  - TrOPD 是 `58.5`；
  - RG-OPD 是 `57.5`；
  - RLSD-style 是 `56.9`；
  - TGOPD 达到 `64.0`，不仅高于 base，也高于 teacher 的 `62.7`。
- 这不是“教师越强越好”的故事，而是：
  - 教师整体提供有用 dense signal；
  - 但部分 prompt 的教师信号会造成负迁移；
  - TGOPD 在这些 prompt 上撤回教师，保留学生从 verifier 里学的机会。

### 多域 MOPD 结果

| Scale | Vanilla MOPD Avg | MOPD + TGOPD Avg | 赢的列数 | 主要收益 |
|---|---:|---:|---:|---|
| 4B | 53.40 | 54.54 | 6/7 | AIME 2026 `+3.85`，IFBench `+2.94`，OJBench `+0.87` |
| 35B | 60.99 | 61.94 | 5/7 | OJBench `+4.31`，AIME 2026 `+0.73`，HMMT-Feb `+1.67` |

- 多域结果说明门控不是只适合单 teacher：
  - 每个 prompt 先被路由到 domain-specialist teacher；
  - 被选中的 teacher 再做 `K_T = 3` probes；
  - verifier 仍按 domain 评价；
  - gate 仍只决定该 prompt 使用 OPD 还是 GRPO。
- 但多域表也暴露边界：
  - 4B LiveCodeBench 从 `50.48` 小降到 `50.00`；
  - 35B AIME 2025 从 `73.12` 小降到 `72.97`；
  - 35B IFBench 从 `44.40` 小降到 `43.99`。
- 因此，TGOPD 的证据不是“每列都涨”，而是“平均收益稳定，回退幅度小，且在教师可靠性最难判别的代码维度收益最明显”。

## 消融：收益主要来自阻断坏教师，还是来自 GRPO fallback？

### 阈值消融

- 主实验用三次 probe 的 `2/3` 多数门。
- 阈值消融改用 `K_T = 5`，扫 `1/5`、`2/5`、`3/5`、`4/5`、`5/5`。
- 论文报告的是倒 U 型关系：
  - 阈值太低会放进低可靠教师信号；
  - 阈值太高会拒绝本来有用的 OPD signal；
  - `tau = 3/5` 附近三项数学 benchmark 达到峰值。

![门控阈值消融](/daily-report-app/data/assets/2026/09/08/itm_bb37511c9b9a703e/threshold-ablation.png)

### closed-gate policy 消融

- 门关掉以后有两种选择：
  - mask only：直接不更新该 prompt；
  - GRPO fallback：撤回教师，但保留 verifier-grounded group-relative update。
- 论文给出的结论很克制：
  - 四个设置中，masking 平均比无门控 baseline 高 `+1.08`；
  - full GRPO fallback 平均高 `+1.20`；
  - 也就是说，大约 `90%` 的收益来自“挡掉不可靠教师信号”，fallback 只提供较小增益。
- 这点很重要：
  - TGOPD 的核心不是 GRPO 比 OPD 更好；
  - 核心是 prompt-level audit 先决定能否信教师；
  - 当 gate 关闭时，GRPO 是一个实用 fallback，但不是全部收益来源。

## 机制细读：为什么“提示级”比“token 级”更适合这篇论文的问题？

### 错误来源发生在任务层，而不一定发生在单个 token

- 论文选择 prompt-level gate，不只是为了实现简单。
- 在代码、数学和指令遵循里，一个教师回答经常表现为整体方案错误：
  - 代码可能选错算法、不满足边界条件、误解输入输出格式；
  - 数学可能走到错误 lemma、把约束条件代错、或者在最后验证环节失败；
  - 指令遵循可能整体漏掉某条约束，而不是某个 token 局部异常。
- 如果错误是 task-level 的，token-level trust region 会遇到一个难题：
  - 错误轨迹内部仍可能有大量高概率、语法正确、看似稳定的 token；
  - 分布层面的平滑调整很难知道“这条轨迹整体不该被当作教师”；
  - verifier 看到最终 outcome 后，反而能更直接地判断这个 prompt 上教师是否值得信。

### hard gate 的代价是方差和不连续性

- TGOPD 的硬门控很干净，但也不是没有成本：
  - `K_T = 3` 时，`q_T(x)` 只能取 `0`、`1/3`、`2/3`、`1`；
  - 一个 probe 的偶然失败或偶然成功，就可能让 prompt 跨过门槛；
  - 接近真实可靠性阈值的 prompt 会有更高决策噪声。
- 论文用阈值消融说明多数门附近有效，但没有完全解决这个统计问题。
- 更严格的后续实验可以报告：
  - 同一 prompt 多次运行时 gate decision 的一致性；
  - `q_T(x)` 与更大样本离线 pass rate 的校准曲线；
  - gate 错开时，错误接受和错误拒绝分别造成多少训练损失。

### 为什么不是按 token 混合 OPD 和 GRPO？

- OPD advantage 和 GRPO advantage 的来源不同：
  - OPD 的强度来自教师与学生的 log-probability gap；
  - GRPO 的符号来自 verifier reward 相对组均值；
  - 一个是 token-specific，一个是 rollout-level。
- 如果直接混合，会出现尺度与语义的双重问题：
  - `lambda * A_OPD + (1 - lambda) * A_GRPO` 里的 `lambda` 很难解释；
  - 同一个 token 的更新方向可能同时被“像教师”和“相对 verifier 更好”拉扯；
  - 训练日志也很难说明一次失败到底来自教师、verifier、还是权重调参。
- TGOPD 的二选一路由让错误归因更清楚：
  - 门开时，承认这是一次教师主导的 distillation；
  - 门关时，承认教师不被准入，训练只接受 verifier-grounded signal；
  - 若 GRPO centered advantage 为 0，则该 prompt 实际不更新。

## 训练系统角度：这篇论文最容易被误读的两点

### 误读一：TGOPD 是“多采样教师答案”

- 表面看，TGOPD 让教师多生成 `K_T` 个 probe，似乎只是 test-time sampling。
- 但论文真正使用 probe 的方式不同：
  - probe 不直接当作学生要模仿的答案；
  - probe 的文本也不进入 OPD token-level supervision；
  - probe 只用于估计教师在当前 prompt 上的 outcome reliability。
- 因此它更像训练时的 admission test：
  - 教师先通过一组小测；
  - 通过后，已有的教师 scoring 信号才被准入；
  - 未通过时，学生不再被拉向教师分布。

### 误读二：GPU 利用率提高等于训练成本降低

- 论文没有说 TGOPD 让总训练成本必然下降。
- 它说的是在异步 OPD 拓扑里，教师节点存在可利用的空闲窗口。
- 需要同时看三个量：
  - teacher-node utilization：probe 让闲置教师忙起来；
  - cluster-average utilization：整体资源占用提高；
  - mean step time：端到端训练节拍是否被拖慢。
- 这也是为什么 `5.9%` mean step time overhead 很关键。
- 如果一个系统本来就把教师节点排得很满，或者教师 probe 比学生 rollout 更慢，TGOPD 的系统优势会缩水。

## 与安全研究的相邻意义：训练信号也需要权限边界

### 教师不是根权限

- 在很多后训练流水线中，强模型教师被默认放在高权限位置：
  - 它生成参考解；
  - 它给 token probability；
  - 它把稀疏 reward 转成 dense signal；
  - 它的输出被大规模复制给学生。
- TGOPD 的价值在于给这个高权限信号加了一道上下文审核。
- 这和 Agent 安全里的工具权限很相似：
  - 不是因为工具有用就每次都允许调用；
  - 不是因为教师强就每个 prompt 都允许监督；
  - 准入条件要绑定当前上下文和可验证证据。

### Verifier 也不是绝对裁判

- 但把 verifier 放进 gate 后，verifier 的边界会变得更重要。
- 在代码任务里，unit tests 可能漏掉隐藏行为：
  - 错误答案可能通过不完整测试；
  - 教师 probe 可能学会迎合测试格式；
  - 学生可能继承对 verifier 的过拟合。
- 在指令遵循任务里，rule-based judge 也可能覆盖不全：
  - 格式正确不代表意图完全满足；
  - 局部约束通过不代表全局任务完成；
  - judge 的偏差会被 gate 放大成训练信号准入偏差。
- 所以后续研究不能只调 `K_T` 和 `tau`，还要报告 verifier 的覆盖率、失败类型和抗过拟合能力。

## 如果把这篇论文用于复现实验，最小审计清单是什么？

| 审计项 | 需要记录什么 | 为什么重要 |
|---|---|---|
| Gate statistics | 每个 domain 的 open rate、close rate、`q_T` 分布 | 判断收益来自过滤比例还是 fallback 学习 |
| Probe variance | 同一 prompt 重复 probe 的决策一致性 | 衡量小 `K_T` 的随机误判 |
| Closed prompt outcome | closed prompt 中学生 rollout reward 是否有组内差异 | 决定 GRPO fallback 是否真的产生更新 |
| Verifier quality | tests/judge 覆盖的失败类型和漏判率 | 防止 gate 学到错误准入 |
| System overlap | probe decode 与 student rollout 的时间重叠比例 | 区分利用 idle capacity 和新增瓶颈 |
| Per-domain threshold | math/code/IF 分别的最优 `tau` | 避免一个全局阈值掩盖 domain 差异 |

- 这些审计项不是论文当前主结果的必要条件，但会决定 TGOPD 能否从一篇方法论文变成可迁移的训练实践。
- 尤其在 coding agent 后训练中，任务环境、测试强度、工具副作用和隐藏状态会比论文里的 CodeI/O 更复杂。
- 如果没有这些日志，只看最终 benchmark 平均分，很难判断一次收益来自：
  - 真正减少教师错误；
  - verifier 偶然偏好某类输出；
  - 训练调度带来的噪声；
  - 或者某个 domain 的小样本波动。

## Figure/Table 逐项证据解读

### Figure 1：计算空闲不是假设

- Figure 1 把 4B 单域 OPD 的教师节点利用率问题放在开头：
  - vanilla OPD 中，教师节点 `59%` 的采样低于 `5%` 利用率；
  - 平均利用率只有 `9.8%`；
  - TGOPD 后平均升到 `78.9%`。
- 这张图的论证功能是：
  - 说明 probe 不是凭空增加一个昂贵阶段；
  - 它试图吃掉异步流水线里原本闲置的教师节点；
  - 但不能单独证明训练完全无 wall-clock overhead。

### Figure 3：方法的真正创新在路由

- 框架图最值得看的不是 probe 本身，而是 signal provenance：
  - OPD signal 来自教师 token log-probability；
  - GRPO signal 来自 verifier reward；
  - gate 的任务是决定该 prompt 信任哪个来源。
- 如果把两者混合，会出现一个难解释的问题：
  - token-level dense signal 和 trajectory-level sparse signal 的尺度不同；
  - 一个来自模型分布，一个来自 outcome verifier；
  - 任意插值权重会把“信任判断”变成调参。
- 作者选择 hard gate，牺牲平滑性，换来更清楚的监督来源边界。

### Table 1：不是所有 baseline 都输得一样

- Table 1 的结构说明论文不是只对比 vanilla OPD：
  - TrOPD/RG-OPD 已经是 reliability-aware 或 verifier-aware 的强 baseline；
  - RLSD-style 检验“用 verifier 定方向、教师定幅度”的另一种路径；
  - teacher row 同时给出教师自身表现和 GRPO-only reference。
- 最值得注意的是 RLSD-style：
  - 它在 14 个 in-domain columns 中 8 个低于 base；
  - 说明全局削弱或重构教师角色会丢掉很多有用 dense supervision；
  - TGOPD 的设计选择是只在审核失败的 prompt 上撤回教师。

### Table 3 与 Figure 4：效率收益有系统前提

![GPU 利用率分析](/daily-report-app/data/assets/2026/09/08/itm_bb37511c9b9a703e/gpu-utilization.png)

| 配置 | Teacher OPD | Teacher TGOPD | Idle 变化 | Cluster avg 变化 |
|---|---:|---:|---:|---:|
| 4B SOPD | 9.8% | 78.9% | 59% -> 0% | 51.5% -> 69.5% |
| 35B SOPD | 8.8% | 82.8% | 57% -> 0% | 44.5% -> 56.3% |
| 4B MOPD | 7.0% | 66.6% | 78% -> 0% | 40.8% -> 53.5% |
| 35B MOPD | 5.0% | 57.7% | 70% -> 2% | 42.9% -> 51.5% |

- 这组证据支持两个判断：
  - probe 工作确实主要占用了教师节点空闲窗口；
  - 多域 MOPD 的利用率低于单域 SOPD，因为一个 teacher node 被切成 code 4 GPU、math 2 GPU、IF 2 GPU 的 domain engines。
- 论文也保留了反面边界：
  - rollout-node utilization 没有持续资源争用，但这不是零成本证明；
  - 附录提到 35B CodeIO 对齐 run 中，TGOPD mean step time 增加 `5.9%`。

## 相关工作位置：它和 TrOPD、RG-OPD、RLSD 的差异

### 分布信号路线

- EOPD、TrOPD、REOPOLD 等方法关注 entropy、teacher-student agreement、likelihood ratio 或 trust region。
- 这些方法的共同特点是：
  - 信号直接来自模型分布；
  - 能识别不确定性、偏移或优化风险；
  - 但不必然检验 outcome correctness。
- TGOPD 的批评是：在代码这类任务中，自信错误很常见，分布信号可能刚好看不出来。

### outcome evidence 路线

- RG-OPD、RLSD、SPOT 等工作已经使用 verifier 或环境正确性。
- TGOPD 的差异在粒度：
  - RG-OPD 更像 trajectory-level retain/drop；
  - SPOT 更偏 token branch 或 continuation 级别；
  - TGOPD 把判定提升到 prompt level，并且在 dense supervision 进入前完成 admission。
- 这种粒度选择让它适合异步 OPD：
  - prompt 级决策可以提前做；
  - probe 可以与 student decoding 重叠；
  - training loop 不需要在每个 token 上插入复杂分支。

## 证据边界与可复现性

### 这篇论文已经证明了什么

- 在作者设定的二值 verifier 任务中，prompt-level teacher reliability 不是一个可以忽略的变量。
- 少量教师 probe 足以让训练系统在多个 domain 和 scale 上改善平均结果。
- 在代码任务中，教师 confidence 的诊断证据最弱，TGOPD 的收益也最明显，这让“先验证再蒸馏”的机制解释比较一致。
- 利用教师 idle capacity 是可行的工程路径，尤其在 teacher scoring 不是吞吐瓶颈的异步 OPD 系统中。

### 还没有证明什么

- 没有证明开放式偏好任务、长文本写作、无标准答案任务同样有效。
- 没有证明 `K_T = 3`、`tau = 2/3` 是通用最优；阈值消融只在 4B math、99 steps 下更细地扫过。
- 没有公开完整训练代码和原始 run records，因此外部复现仍要依赖论文表格和实现描述。
- 没有系统报告每个 domain 中 gate open/close 的比例、closed prompt 中 reward variation 的频率、以及 fallback 真正产生非零 update 的占比。
- 没有展开 verifier 质量问题：如果 verifier 本身被污染、偏置或无法覆盖隐藏失败，`q_T(x)` 会把错误可靠性传给 gate。

## 领域延伸：后训练里“信号准入”会越来越重要

### 从更强教师到可审计教师

- 这篇论文值得放进后训练研究脉络中看：
  - 过去常问“教师要多强”；
  - TGOPD 改问“这个 prompt 上，教师信号是否获准进入梯度”。
- 这个转向和 agent 安全里的权限思想很像：
  - 不是所有工具调用都禁止；
  - 也不是所有工具调用都放行；
  - 而是按上下文做 admission control。

### 对 agent/coding model 训练的启发

- 代码任务的结果尤其有研究价值：
  - unit tests 可以直接给 verifier；
  - 教师高置信错误又很常见；
  - 负迁移在 LiveCodeBench 上非常明显。
- 这意味着 coding agent 后训练不应只堆更强 teacher traces：
  - 要区分 teacher trace 是可执行正确、局部错误、偶然通过测试，还是隐藏依赖环境；
  - 要记录 prompt-level 或 task-level admission decision；
  - 要把失败 trace 当成 verifier 和 gate 的训练对象，而不是简单丢弃。

### 下一步最该追问的问题

- 第一，gate calibration：
  - 不同 domain 是否需要不同 `tau`？
  - `K_T` 是否应随 prompt 难度自适应？
  - probe 之间是否真的足够独立？
- 第二，verifier robustness：
  - 当 verifier 只覆盖部分 correctness 时，gate 会不会鼓励教师钻 verifier 空子？
  - 对 agent 工具任务，verifier 是否能覆盖副作用、权限和长期状态？
- 第三，系统调度：
  - 如果 teacher idle window 不够大，probe budget 怎样和 throughput trade off？
  - 多域 teacher engine partition 是否应动态调整，而不是固定 code/math/IF GPU 配额？
- 第四，训练记录：
  - 论文应报告 gate open rate、closed prompt reward variance、mask/fallback 非零 update 比例；
  - 这些统计会决定 TGOPD 是主要在“过滤坏教师”，还是在“把难题交给 verifier RL”。

## 结论

- TGOPD 的贡献可以压缩成一句话：dense distillation 不应在 prompt 级别无条件信任教师。
- 它的机制不复杂，但边界清楚：
  - 用教师 probe 估计当前 prompt 的 outcome reliability；
  - 通过硬门控决定 OPD 或 GRPO；
  - 把 probe 放进异步 OPD 的教师空闲窗口；
  - 用消融说明主要收益来自阻断不可靠教师信号。
- 对后训练研究者来说，最值得带走的不是 `2/3` 这个阈值，而是“训练信号准入”的问题设定：当多个监督来源密度、成本和正确性证据不同，下一步的研究重点不只是把它们混起来，而是先判断它们是否应该进入这个 prompt 的梯度。
