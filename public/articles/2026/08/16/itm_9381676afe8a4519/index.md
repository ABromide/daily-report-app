# CrEST：让自教师只教“幅度”，不再替 verifier 决定方向

| 项目 | 信息 |
| --- | --- |
| 论文 | Teach the Magnitude, Not the Direction: Verifier-Bounded Credit Assignment for Multi-Turn Multi-step LLM Agents |
| 方法 | CrEST, Hierarchical Credit Assignment via Entropy-Gated Self-Teacher |
| 作者 | Zechuan Wang, Siyuan Lu, Hongxuan Zhang, Linjian Mo, Chenyi Zhuang, Leilei Gan |
| 机构 | Zhejiang University, Shanghai Innovation Institute, AWorld Team/Inclusion AI, Westlake University, Nanjing University |
| 官方链接 | <https://arxiv.org/abs/2608.13179> |
| PDF | <https://arxiv.org/pdf/2608.13179> |
| arXiv 版本 | `arXiv:2608.13179v1`, 2026-08-13 12:44:37 UTC |
| 方向 | 大模型后训练 / 多轮工具型 Agent / RLVR 信用分配 |

## TL;DR

1. **这篇论文研究什么**：多轮多步工具型 Agent 的后训练。标准 RLVR/GRPO 把一个 trajectory 的 verifier reward 广播给所有 token；当同一 session 里 Turn 1 成功、Turn 2 失败时，失败 turn 的 token 也可能被正向强化。
2. **核心方法是什么**：CrEST 把 per-token advantage 分解成两层：`A_t = A_turn[t] * phi_t`。`A_turn[t]` 来自每个 turn 独立的 verifier reward，决定更新方向；`phi_t` 来自带特权上下文的 self-teacher 和 entropy gate，只调节更新幅度。
3. **为什么不是普通自蒸馏**：OPD/OPSD 让 teacher 分布直接定义 token-level 更新目标，因此容易 teacher-bounded 或梯度集中。CrEST 的关键约束是：teacher 不能翻转 verifier 给出的符号，只能在 verifier 同意的方向上放大高不确定 token。
4. **实验怎么做**：作者在 BFCL V3 Multi-Turn 和 WildToolBench 上训练 Qwen3-4B-Instruct 与 Qwen3-8B；baseline 包括 GRPO、MT-GRPO、EnvTuning、OPD、OPSD；rollout group size 为 `G=16`。
5. **关键数字是什么**：Qwen3-4B 上，CrEST 的 BFCL V3 平均准确率为 `52.00%`，强于 MT-GRPO 的 `49.25%`；WildToolBench session accuracy 为 `7.03%`。Qwen3-8B 上，CrEST 的 BFCL 平均为 `50.00%`，WildToolBench session accuracy 为 `9.38%`。
6. **最能支撑机制的证据**：层级消融显示，inter-turn only 从 `43.63%` 到 `47.88%`，intra-turn only 到 `48.75%`，二者合并到 `52.00%`；去掉 direction gate 或 entropy gate 都会掉到 `46%` 左右。
7. **训练稳定性证据**：BFCL V3 Qwen3-4B 训练曲线中，CrEST 约 20 step 到 `0.60` 训练准确率，最终约 `0.70`；OPSD plateau 在约 `0.49` 后回落；OPSD top-5% token 占超过 `77%` 梯度质量，CrEST 约把 top-10% 控制在 `57%`。
8. **局限是什么**：实验只有两个 benchmark、两个模型规模、单训练 seed；turn index 需要在 rollout group 内语义对齐；entropy gate 用 per-token surprisal 近似 token 重要性，未证明适用于所有结构化生成任务。

## 研究问题：多轮 Agent 的 credit assignment 到底错在哪里？

### 论文反对的不是 RLVR，而是“单奖励广播”

- RLVR 的优点很明确：
  - reward 来自环境或 verifier；
  - 性能天花板理论上由 verifier 质量决定；
  - 对工具调用、函数调用、状态检查等任务很自然。
- 论文指出的问题也很具体：
  - GRPO 等方法常把 trajectory-level reward 变成一条轨迹里所有 token 的共同 advantage；
  - 单轮任务里，这只是噪声较大；
  - 多轮 session 里，turn 的目标可以相互独立，统一 reward 会把成功和失败混在一起。

### 一个两轮例子为什么足够暴露问题？

| Turn | 目标 | 真实结果 | trajectory-level 广播的问题 |
| --- | --- | --- | --- |
| Turn 1 | 查机场、查航班、订票 | 成功 | 应该正向强化关键工具名和参数 |
| Turn 2 | 取消上一轮预订 | 失败 | 若整条轨迹平均仍为正，失败 token 也被强化 |

- Figure 1 把这个错误画得很直接：
  - **GRPO**：把一条轨迹的 reward 均匀涂到两个 turn；
  - **OPSD**：能给 token-level 信号，但可能集中在低熵格式 token；
  - **CrEST**：先按 turn 给方向，再按 token 给幅度。

![Figure 1：GRPO、OPSD 与 CrEST 的信用分配差异](/assets/2026/08/16/itm_9381676afe8a4519/figure-1-overview.png)

### 为什么 OPD/OPSD 也不能直接解决？

| 方法 | 它补了什么 | 它牺牲什么 | CrEST 的判断 |
| --- | --- | --- | --- |
| OPD | teacher 给 dense per-token reverse KL | 需要同族、同 tokenizer、强 teacher | 实用约束重，且目标被 teacher 限制 |
| OPSD | student 自己带 privileged context 当 teacher | 容易梯度集中，可能 teacher-bounded | 自教师可用，但不能决定方向 |
| Hybrid distillation | 尝试把 RL 与蒸馏组合 | 常缺少多轮 turn 结构和梯度集中控制 | 需要同时处理 inter-turn 与 intra-turn |

- 论文的问题可以压缩成一句话：
  - **能不能保留 verifier-bounded 的方向，同时从 self-teacher 得到 dense token 信号？**
- CrEST 的回答是：
  - 让 verifier 决定“这个 turn 应该强化还是抑制”；
  - 让 self-teacher 只回答“在这个已批准方向上，哪些 token 更值得多放大一点”。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 多轮多步 Agent 有两层 credit assignment | `A_t = A_turn[t] * phi_t`，先 turn 级方向，再 token 级幅度 | Figure 1/2 展示成功 turn 与失败 turn 分开，内容 token 与格式 token 分开 | 依赖每个 turn 能得到 verifier reward |
| verifier 应该决定方向 | `A_turn` 由 per-turn reward 在 rollout group 内标准化得到 | 方向 gate 保证 teacher 不能翻转符号；去掉 direction gate 平均从 `52.00` 掉到 `46.75` | token reweighting 仍会改变整体梯度合成，不是全局最优保证 |
| self-teacher 应该只调幅度 | privileged self-teacher 产生 `Delta_t`，再经 entropy gate 变成 `phi_t` | OPSD 梯度 top-5% 超过 `77%`，CrEST 避开极端集中 | surprisal 是启发式，不一定总等于 token 重要性 |
| 两层机制互补 | inter-turn only 与 intra-turn only 分别解决不同失败模式 | GRPO `43.63`，inter-turn only `47.88`，intra-turn only `48.75`，both `52.00` | 消融主要在 Qwen3-4B BFCL V3 上 |
| 长轨迹和 session-level 指标最能验证机制 | credit 稀释越严重，turn segmentation 越重要 | BFCL Long Context 4B 相比最强 baseline `+7.0`，WildToolBench session 8B `+1.57` | WildToolBench session accuracy 绝对值仍很低 |

## 方法机制：把 advantage 拆成方向与幅度

### 统一目标函数

论文仍然使用标准 on-policy policy gradient 形式：

```text
J(theta) = E_{x~D, y~pi_theta(.|x)} [
  sum_t A_t * log pi_theta(y_t | y_<t, x)
]
```

其中核心变化是结构化 per-token advantage：

```text
A_t = A_turn[t] * phi_t

A_turn[t] : inter-turn credit，回答“哪个 turn 应该被强化或抑制”
phi_t     : intra-turn credit，回答“这个 turn 内哪个 token 更值得放大”
```

- 这不是在 policy gradient 外面加一个 auxiliary loss。
- 它把 dense signal 放进 advantage 系数本身。
- 但它强制 teacher 的角色收缩为 magnitude modulation。

### Turn-level：每个 turn 独立做 group-relative advantage

给定一个 prompt/session，采样 `G` 条 rollout；第 `i` 条 rollout 的第 `k` 个 turn 有 verifier reward `R_k^(i)`。

```text
A_k^(i) = (R_k^(i) - mean({R_k^(j)}_{j=1..G})) /
          (std({R_k^(j)}_{j=1..G}) + epsilon)
```

| 变量 | 含义 | 机制作用 |
| --- | --- | --- |
| `G` | rollout group size，实验里为 `16` | 形成同一 turn 的相对比较 |
| `R_k^(i)` | 第 `i` 条 rollout 第 `k` 个 turn 的 verifier reward | 不再用整条 trajectory 平均 |
| `A_k^(i)` | 第 `k` 个 turn 的标准化 advantage | 该 turn 内所有 token 的基础方向 |
| `epsilon` | 数值稳定项 | 避免 group 内方差过小时爆炸 |

- 关键不是“更细粒度就一定好”。
- 关键是 turn index 在 group 内语义对齐：
  - 同一组 rollout 面对同一个 session；
  - 第 `k` 个 turn 对应同一个用户请求；
  - 因此可比较的是“同一 turn 的不同尝试”，不是任意 step 的混合结果。

### Token-level：self-teacher 只做选择性放大

CrEST 构造一个 privileged self-teacher：

- teacher 不是外部 235B 模型；
- teacher 是同一 student 模型；
- 但 teacher condition on ground-truth tool-call results 或成功上下文；
- 它能对学生轨迹中每个 token 给出一个相对 logprob 差异。

基本信号可以写成：

```text
Delta_t = (log pi_T(y_t | h_t^T) - log pi_theta(y_t | h_t)) / tau
```

然后结合 verifier 方向：

```text
w_t = clip(exp(sign(A_turn[t]) * Delta_t), 1 - epsilon, 1 + epsilon)

g_dir_t = 1[sign(A_turn[t]) * Delta_t > 0]
```

| 情况 | 解释 | CrEST 怎么处理 |
| --- | --- | --- |
| verifier 正向，teacher 也更偏好该 token | `sign(A_turn) * Delta_t > 0` | 可以放大 |
| verifier 正向，teacher 不偏好该 token | 方向不一致 | 不让 teacher 干预 |
| verifier 负向，teacher 认为该 token 更该被压低 | 方向一致 | 可以放大负向更新 |
| teacher 与 verifier 方向相反 | teacher 想翻转符号 | direction gate 关闭 |

### Entropy gate：为什么要看 student uncertainty？

- 论文认为低熵 token 往往是格式、括号、逗号、固定 JSON 片段。
- 如果 teacher-student divergence 直接变成权重，训练可能把梯度集中到这些低价值 token。
- 因此 CrEST 使用 student surprisal `u_t = -log pi_theta(y_t | h_t)` 做 entropy gate。

```text
g_ent_t = sigmoid((u_t - E[u]) / (std(u) + epsilon))

lambda_eff_t = clip(
  lambda * g_dir_t * (1 + rho * (2 * g_ent_t - 1)),
  0,
  lambda
)

phi_t = 1 + lambda_eff_t * (w_t - 1)
```

| 超参数 | 实验设定 | 含义 |
| --- | ---: | --- |
| `lambda` | `0.3` | 调幅强度，论文称只有它被调参 |
| `epsilon` | `0.28` | clip bound |
| `tau` | `2.0` | `Delta_t` 温度 |
| `rho` | `0.5` | entropy gate 范围 |

### 方法总图

![Figure 2：CrEST 的 inter-turn 与 intra-turn 组合](/assets/2026/08/16/itm_9381676afe8a4519/figure-2-method.png)

- Figure 2 左侧对应 `A_turn`：
  - 每个 turn 从 environment verifier 拿 reward；
  - 在同一 group 内算该 turn 的均值和标准差；
  - 这部分输出 direction。
- Figure 2 右侧对应 `phi_t`：
  - self-teacher 与 student 的 token probability 差异形成 `Delta_t`；
  - entropy gate 让高不确定内容 token 得到更多调幅；
  - 这部分输出 magnitude。
- 底部的乘法式是论文核心：
  - `A_t = A_turn[t] * phi_t`。

## 算法流程：一轮 CrEST 训练 step

```text
Input:
  prompt batch D
  policy pi_theta
  group size G
  hyperparameters lambda, tau, epsilon, rho

State:
  on-policy rollout group
  per-turn verifier rewards
  privileged self-teacher logprobs
  student surprisal statistics

Loop:
  for each prompt x in D:
    sample G rollouts from pi_theta
    obtain per-turn rewards R_k^(i)

    for each turn k:
      compute A_k^(i) with group-relative normalization

    compute teacher logprobs under privileged context

    for each token t:
      Delta_t = teacher logprob - student logprob, scaled by tau
      w_t = clipped exp(sign(A_turn[t]) * Delta_t)
      if teacher direction agrees with verifier direction:
        enable direction gate
      else:
        keep phi_t = 1

      compute entropy gate from student surprisal
      compute lambda_eff_t
      A_t = A_turn[t] * (1 + lambda_eff_t * (w_t - 1))

Output:
  update theta with policy gradient using per-token A_t

Failure boundary:
  if turn reward is unavailable, terminal-only, or turn identity is not aligned,
  the turn-level advantage no longer has the same interpretation.
```

## 实验设置：benchmark、模型与 baseline

### Benchmark 怎么选？

| Benchmark | 规模与切分 | 任务特征 | 为什么适合检验 CrEST |
| --- | --- | --- | --- |
| BFCL V3 Multi-Turn | 100 fixed IDs 训练；400 non-overlap 评估，覆盖 Base、Missing Functions、Missing Parameters、Long-Context | 结构化函数调用，多轮依赖清楚 | per-turn reward 可比较，Long Context 放大 credit 稀释 |
| WildToolBench | 256 个 multi-turn sessions；128 训练，128 评估 | 更自然的组合任务、指代、省略、任务切换 | session accuracy 严格，能暴露跨 turn 失败 |

### 模型与训练配置

| 项目 | 设置 |
| --- | --- |
| 模型 | Qwen3-4B-Instruct，Qwen3-8B |
| rollout | group size `G=16`，temperature `1.0`，max generation length `10000` |
| batch | `32` prompts/step * `16` samples = `512` rollouts/step |
| optimizer | Adam，`beta1=0.9`，`beta2=0.999`，weight decay `0.01`，gradient clipping `1.0` |
| learning rate | `1e-6` constant |
| hardware | single-node `8 x H200`；teacher 类方法用 4 GPU serve teacher，4 GPU 训练和 rollout |
| evaluation | 每个训练后 policy 用 temperature `1e-6` 做 3 次 decode |

### Baseline 分组

| 类型 | 方法 | 作用 |
| --- | --- | --- |
| RL-based | GRPO | trajectory-level binary reward baseline |
| RL-based | MT-GRPO | per-agent-step advantage，但 step 内 token 同权 |
| RL-based | EnvTuning | 使用环境反馈的 agentic RL baseline |
| Distillation-based | OPD | 同族强 teacher dense token supervision |
| Distillation-based | OPSD | student with privileged context self-teacher |
| Proposed | CrEST | verifier direction + self-teacher magnitude |

## 主结果：CrEST 的收益集中在哪里？

### Qwen3-4B-Instruct

| Method | BFCL Avg | Base | Miss Func | Miss Param | Long Context | WTB Task | WTB Session |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base model | 22.12 | 26.5 | 21.0 | 15.5 | 25.5 | 37.89 | 3.13 |
| GRPO | 43.63 | 53.5 | 42.5 | 31.5 | 47.0 | 40.23 | 4.69 |
| MT-GRPO | 49.25 | 63.0 | 46.0 | 35.0 | 53.0 | 43.36 | 6.25 |
| EnvTuning | 47.25 | 60.0 | 47.0 | 32.0 | 50.0 | 44.92 | 4.69 |
| OPD | 44.50 | 52.0 | 43.0 | 38.0 | 45.0 | 42.58 | 6.25 |
| OPSD | 38.75 | 46.0 | 41.0 | 26.0 | 42.0 | 38.88 | 4.69 |
| **CrEST** | **52.00** | **67.0** | **48.0** | **38.0** | **60.0** | **48.44** | **7.03** |

### Qwen3-8B

| Method | BFCL Avg | Base | Miss Func | Miss Param | Long Context | WTB Task | WTB Session |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Base model | 33.38 | 41.5 | 38.5 | 27.0 | 26.5 | 43.75 | 4.69 |
| GRPO | 43.25 | 53.0 | 46.0 | 36.0 | 38.0 | 45.43 | 5.47 |
| MT-GRPO | 44.00 | 57.0 | 45.0 | 36.0 | 38.0 | 49.61 | 7.03 |
| EnvTuning | 46.00 | 54.0 | 45.0 | 40.0 | 45.0 | 49.02 | 7.81 |
| OPD | 44.75 | 50.0 | 52.0 | 39.0 | 38.0 | 45.25 | 3.91 |
| OPSD | 41.75 | 48.0 | 43.0 | 39.0 | 37.0 | 43.95 | 3.91 |
| **CrEST** | **50.00** | **60.0** | **51.0** | **42.0** | **47.0** | **52.34** | **9.38** |

### 这些数字支持哪个 claim？

1. **RL family 仍比 distillation family 更稳**：
   - Qwen3-4B 上，OPSD `38.75` 低于 GRPO `43.63`；
   - Qwen3-8B 上，OPSD `41.75` 也低于 GRPO `43.25`；
   - 这支持论文对 teacher-bounded 与 self-distillation instability 的担忧。
2. **更细的 RL credit assignment 有收益但不够**：
   - Qwen3-4B 上，MT-GRPO 从 GRPO `43.63` 提到 `49.25`；
   - 但 CrEST 继续到 `52.00`；
   - 这说明 step/turn 粒度方向有用，但 token-level 幅度仍有空间。
3. **长轨迹与 session-level 指标更能体现机制**：
   - Qwen3-4B Long Context，CrEST `60.0`，最强 baseline MT-GRPO `53.0`；
   - Qwen3-8B WildToolBench Session，CrEST `9.38`，最强 baseline EnvTuning `7.81`；
   - 这些正是 credit dilution 更严重的设置。

## 训练动态：为什么不是简单多调一个超参？

![Figure 3a：BFCL V3 Qwen3-4B 训练曲线](/assets/2026/08/16/itm_9381676afe8a4519/figure-3a-training-curve.png)

### Figure 3a 支持什么？

- CrEST：
  - 约 `20` step 到 `0.60` 训练准确率；
  - 后续继续上升，最终接近 `0.70`；
  - 说明 dense token modulation 没有把 RL 方向带偏。
- GRPO：
  - 上升更慢；
  - 到 `160` step 约 `0.57`；
  - 说明只靠 trajectory/turn 稀疏信号，收敛速度与上限都受限。
- OPSD：
  - 在约 `0.49` 附近 plateau；
  - 后期还会下降；
  - 与 teacher-bounded 或梯度集中解释一致。

### 梯度集中证据为什么重要？

| 方法 | 梯度分布现象 | 论文解释 |
| --- | --- | --- |
| OPSD | top-1% token 约占 `42%`，top-5% 超过 `77%` | 少量 pivot token 主导更新，训练不稳 |
| GRPO | top-10% 约 `31%` | 过于分散，所有 token 同权 |
| CrEST | top-10% 约 `57%` | 比 GRPO 更会区分 token，但远不如 OPSD 极端 |

- 这组证据对应 CrEST 的核心中间地带：
  - 需要 token differentiation；
  - 但不能让 teacher divergence 直接接管训练；
  - entropy gate 的目标是让梯度集中在高不确定内容 token，而不是格式 token。

## 消融：两层 credit assignment 是否真的互补？

### 层级消融

| Method | Avg | Base | Miss Func | Miss Param | Long Context |
| --- | ---: | ---: | ---: | ---: | ---: |
| GRPO | 43.63 | 53.5 | 42.5 | 31.5 | 47.0 |
| + Inter-turn only | 47.88 | 62.0 | 44.0 | 35.5 | 50.0 |
| + Intra-turn only | 48.75 | 61.0 | 50.0 | 32.0 | 52.0 |
| + Both CrEST | **52.00** | **67.0** | 48.0 | **38.0** | **60.0** |

- **Inter-turn only**：
  - 从 `43.63` 到 `47.88`；
  - 最大改善在 Base split，说明 turn-level reward dilution 是真实问题。
- **Intra-turn only**：
  - 从 `43.63` 到 `48.75`；
  - Miss Func 到 `50.0`，说明 token-level content/format 区分很有价值。
- **Both**：
  - 到 `52.00`；
  - Long Context 从 `47.0` 到 `60.0`；
  - 支持“没有 turn 方向，token 调幅会放错位置；没有 token 调幅，turn 内关键决策仍被格式 token 稀释”。

### Gate 消融

| Variant | Avg | Base | Miss Func | Miss Param | Long Context |
| --- | ---: | ---: | ---: | ---: | ---: |
| CrEST | **52.00** | **67.0** | 48.0 | **38.0** | **60.0** |
| w/o Direction gate | 46.75 | 60.0 | 47.0 | 28.0 | 52.0 |
| w/o Entropy gate | 46.25 | 59.0 | **50.0** | 27.0 | 49.0 |
| w/o Both gates | 43.50 | 53.0 | 43.0 | 27.0 | 51.0 |

- 去掉 direction gate：
  - teacher 可以覆盖 verifier 的方向；
  - Miss Param 从 `38.0` 掉到 `28.0`；
  - 说明参数类 token 的 teacher 信号并不总可靠。
- 去掉 entropy gate：
  - average 掉到 `46.25`；
  - Long Context 从 `60.0` 掉到 `49.0`；
  - 说明长序列中格式 token 的梯度集中更容易伤害训练。
- 去掉两个 gate：
  - `43.50`，几乎回到 GRPO；
  - 说明 uncontrolled self-distillation 并没有免费收益。

### Lambda 敏感性

| `lambda` | 现象 | 解释 |
| ---: | --- | --- |
| `0` | final accuracy 约 `0.63` | 只剩 inter-turn，缺 token 放大 |
| `0.3` | final accuracy 约 `0.69`，最好 | 选择性放大足够但不过度 |
| `0.5` | 早期有收益，约 80 step 后低于 `0.1`，最终约 `0.61` | 过度集中导致停滞 |

- 这说明 CrEST 的核心不是“teacher 信号越大越好”。
- 它的主张更窄：
  - teacher 信号要被 verifier 方向约束；
  - teacher 信号要被 entropy gate 校准；
  - 调幅强度要小到不破坏 RL 的探索和上限。

## Figure/Table 逐项证据解读

| 证据 | 支持的结论 | 不能证明什么 |
| --- | --- | --- |
| Figure 1 | GRPO、OPSD、CrEST 三种 credit 分配策略的失败模式和设计差异 | 它是概念图，不是实验结果 |
| Figure 2 | `A_turn` 与 `phi_t` 的乘法结构，以及 direction/magnitude 分工 | 不证明 self-teacher 在所有任务上都可靠 |
| Table 1 | 设计空间里 GRPO、MT-GRPO、OPD/OPSD、CrEST 的位置 | 方法分类简化了很多 hybrid RL 方法 |
| Table 2 | 主结果跨两个模型、两个 benchmark 超过 baseline | 单 seed，不代表训练方差 |
| Figure 3 | CrEST 训练更快、OPSD plateau、梯度集中被缓和 | 训练曲线是 BFCL V3 Qwen3-4B，不能外推到所有模型 |
| Table 3 | inter-turn 与 intra-turn 单独都不够，合并最好 | 只在一个主要设置上消融 |
| Table 4 | direction gate 与 entropy gate 都必要 | gate 的最优形式未被穷尽 |
| Appendix lambda | `lambda=0.3` 是较好 trade-off | 只调了一个超参，其他固定值未系统搜索 |

## 相关工作位置：它把后训练讨论往哪里推了一步？

### 相对 GRPO/RLVR

- CrEST 没有反对 verifier-bounded RL。
- 它反对的是 trajectory-level reward 的粗广播。
- 论文的贡献是把 reward 的“方向可信”与 teacher 的“dense token signal”拆开。

### 相对 OPD/OPSD

- OPD 的密集信号很诱人，但 teacher 依赖重。
- OPSD 去掉外部 teacher，却容易把 privileged teacher 变成目标本身。
- CrEST 的区别在于：
  - teacher 是可选的幅度放大器；
  - teacher 不能决定 positive/negative 更新方向；
  - teacher 的影响被 `lambda * epsilon` 控制。

### 相对 Agent 工具学习

- 多轮工具使用不是简单 sequence generation。
- 它有自然层级：
  - session；
  - turn；
  - step/tool call；
  - token。
- CrEST 选择 turn 和 token 两级，是一个现实折中：
  - turn 级能拿 verifier reward；
  - token 级能承接 teacher dense signal；
  - step 级和 tool-call 级仍可作为未来扩展。

## 证据边界与可复现性问题

### 论文自己承认的边界

1. **benchmark 范围有限**：
   - 只覆盖 BFCL V3 与 WildToolBench；
   - 它们分别代表结构化函数调用和自然 multi-turn session；
   - 但不覆盖浏览器 Agent、代码仓库修改、长期记忆、真实 API 权限等场景。
2. **模型规模有限**：
   - 只看 4B 与 8B；
   - 不能证明 30B、70B、frontier API 模型同样收益。
3. **训练方差不足**：
   - 每个方法单 training seed；
   - 三次 decode 是 decoding consistency，不是 independent training replicates。
4. **turn alignment 假设很强**：
   - 同一 rollout group 里第 `k` 个 turn 必须表示同一用户请求；
   - 若任务有动态分支、提前终止、用户 turn 数不同，公式解释会变复杂。
5. **entropy gate 是启发式**：
   - surprisal 能区分工具参数和格式 token；
   - 但在自然语言解释、代码生成、多模态输出中，高 surprisal 不一定等于高价值。

### 我会额外加的怀疑点

| 疑问 | 为什么重要 |
| --- | --- |
| per-turn verifier 的成本和质量如何扩展 | 真实 Agent 很多 reward 只有最终状态，turn-level reward 需要额外工程 |
| privileged self-teacher 是否泄漏评测结构 | 训练时给 ground-truth tool-call results，需要确认不把测试答案分布间接注入 |
| 与 process reward 的关系 | 若已经有高质量 step/process reward，CrEST 的边际收益可能变化 |
| 长 session 的错误传播 | Turn k 独立 reward 可能忽略前面错误对后面可行性的影响 |
| 安全场景里的负向 reward | 抑制危险工具调用时，teacher 调幅是否会错误放大“看似合理但危险”的 token |

## Detail inventory：这篇论文里真正该记住的细节

### 方法名与模块边界

| 名称 | 全称或含义 | 在论文中的边界 |
| --- | --- | --- |
| CrEST | Hierarchical Credit Assignment via Entropy-Gated Self-Teacher | 一个 advantage 构造框架，不是新 verifier，也不是新 benchmark |
| `A_turn` | turn-segmented verified advantage | 只决定符号和基础强度，来自 per-turn verifier reward |
| `phi_t` | token-level magnitude modulation | 只在 `>=1` 的范围内放大，不能翻转 verifier 方向 |
| direction gate | `1[sign(A_turn) * Delta_t > 0]` | teacher 与 verifier 方向一致时才允许放大 |
| entropy gate | 基于 student surprisal 的 sigmoid gate | 把放大预算从格式 token 转向高不确定内容 token |
| privileged self-teacher | 同一模型在 ground-truth context 下给 logprob | 不是外部强模型，因此不需要 tokenizer 对齐 |

### 数据、训练与评测库存

| 项目 | 具体信息 | 对结论的作用 |
| --- | --- | --- |
| BFCL V3 训练 | multi-turn Base split 中 100 fixed IDs | 让 turn index 在 rollout group 内可对齐 |
| BFCL V3 评估 | 400 non-overlap examples，四个 split 各 100 | 观察 Base、Missing Function、Missing Parameter、Long Context 差异 |
| WildToolBench | 256 sessions，128 训练、128 评估 | 检验自然 multi-turn 互动和 strict session accuracy |
| 模型 | Qwen3-4B-Instruct 与 Qwen3-8B | 说明方法不只在一个大小上有效，但仍限于小中规模 |
| group size | `G=16` | group-relative advantage 的统计基础 |
| 每步 rollout | `32 * 16 = 512` | 训练成本并不低，尤其 teacher 类方法还要 serve self-teacher |
| teacher 部署 | OPSD/CrEST 用 4 GPU serve teacher，4 GPU 训练 | CrEST 省掉外部 235B teacher，但不是零成本 |
| OPD 额外成本 | Qwen3-4B OPD 需要 Qwen3-235B-A22B-Instruct teacher，16 GPU setup | 解释 OPD 实用性劣势 |

### 失败案例不是“模型笨”，而是 credit 被放错位置

- Turn 级失败：
  - 一个 session 里前两轮成功、第三轮失败；
  - trajectory-level reward 仍可能给前面和后面类似方向；
  - 失败 turn 内生成错误工具名、错误参数、错误引用对象的 token 被一起强化。
- Token 级失败：
  - 同一 turn 里真正关键的是 `get_flight`、`"JFK"`、`booking_id`；
  - 低熵格式 token 如括号、逗号、JSON key、固定模板也拿到同样 advantage；
  - 训练预算被格式 token 稀释，模型没有集中修正关键动作。
- OPSD 式失败：
  - self-teacher 给了 dense token 信号；
  - 但没有 verifier direction anchoring；
  - 一旦 teacher 的高置信 token 集中在格式或局部 shortcut，梯度就可能塌到少数 token。

### 公式边界：为什么“符号不翻转”不等于“全局方向不变”

论文附录的证明有一个容易误读的地方：

```text
phi_t = 1 + lambda_eff_t * (w_t - 1)
```

- 当 direction gate 关闭：
  - `lambda_eff_t = 0`；
  - 所以 `phi_t = 1`；
  - teacher 没有影响。
- 当 direction gate 开启：
  - `sign(A_turn[t]) * Delta_t > 0`；
  - clip 后 `w_t >= 1`；
  - 因此 `phi_t >= 1`；
  - teacher 只能在 verifier 批准的方向上放大。

但这只保证每个 token 的 scalar coefficient 不翻转。

- 它不能保证：
  - 所有 token 梯度求和后的 aggregate gradient 完全同向；
  - 训练 stationary point 不变；
  - verifier-bounded ceiling 在任意优化动态下都是全局数学定理。
- 它能合理支持的是更弱、更实用的判断：
  - teacher 不再直接定义 token 的正负方向；
  - teacher 的 perturbation 被 `lambda * epsilon` 控住；
  - 默认 `lambda=0.3`、`epsilon=0.28` 时，每个 token 的 advantage 系数最多被放大约 `8.4%`。

### 与已有方法的细粒度差别

| 对比对象 | 表面相似 | 关键差异 |
| --- | --- | --- |
| GRPO | 都是 group-relative policy optimization | GRPO 是 trajectory-level，CrEST 是 turn-level + token-level |
| MT-GRPO | 都比整条轨迹更细 | MT-GRPO 仍让 step 内所有 token 同权，CrEST 在 token 内再调幅 |
| OPD | 都使用 dense token signal | OPD 的 teacher 决定目标，CrEST 的 teacher 只调幅 |
| OPSD | 都使用 self-teacher | OPSD 容易 teacher-bounded，CrEST 用 verifier 约束方向 |
| EnvTuning | 都从环境反馈学习 | EnvTuning 强在环境 reward 设计，CrEST 强在 credit allocation |
| Process reward | 都想细化奖励 | process reward 改 reward source，CrEST 改 advantage decomposition |

## 研究者视角的失败边界推演

### 如果只有 terminal reward，CrEST 怎么办？

- 论文方法最自然的前提是有 per-turn reward。
- 若环境只告诉最终 session 是否成功：
  - 无法直接计算 `R_k^(i)`；
  - turn-level advantage 会退化；
  - CrEST 只剩 token-level modulation，风险接近 intra-turn only 消融。
- 可行扩展方向包括：
  - 用 execution trace reconstruction 估计 turn outcome；
  - 用 process reward model 给每个 turn 标注；
  - 用 counterfactual replay 检查某个 turn 的错误是否导致最终失败。

### 如果 turn 之间强耦合，独立 reward 会不会误导？

- 多轮 Agent 常有 carry-over：
  - 前一轮订票成功，后一轮才能取消；
  - 前一轮查到 id 错了，后一轮即使用正确工具也会失败；
  - 前一轮污染 memory，后面所有 turn 都带偏。
- CrEST 的独立 turn reward 在这类场景可能低估因果链：
  - 它能指出 Turn 2 失败；
  - 但未必能把 Turn 2 失败归因到 Turn 1 的错误状态。
- 因此更强版本可能需要：
  - turn-level immediate reward；
  - state transition consistency reward；
  - backward credit trace；
  - 对 tool observation 和 memory update 的 provenance 检查。

### 如果用于安全训练，reward 必须更严格

- 安全任务中的“失败”不是答错，而是可能产生外部副作用。
- CrEST 的方向由 verifier 给出，因此 verifier 的盲区会直接变成训练方向的盲区。
- 例如：
  - 工具调用语法正确，但越权读取文件；
  - 参数看似合法，但组合后泄露敏感数据；
  - 当前 turn 安全，跨 turn 聚合后形成危险计划。
- 在这些场景中，CrEST 只能作为 credit allocator。
- 它必须和下面机制配合：
  - typed permission gate；
  - post-tool-return verifier；
  - action provenance；
  - irreversible action human approval；
  - long-horizon risk aggregation。

## 逐段阅读笔记：每一节在论证中承担什么功能？

### Introduction：把问题从“信号稀疏”改写成“两层错配”

- 引言不是简单说 RLVR sparse reward 不够。
- 它先承认 RLVR 的优势：
  - verifier reward 给了一个比 teacher 更开放的性能上限；
  - 工具调用任务天然适合环境验证；
  - agentic RL 已经成为后训练主线。
- 然后它把问题定位到 multi-turn：
  - 单 turn 里统一 reward 只是 noisy；
  - multi-turn 里不同 turn 有独立 outcome；
  - 统一 reward 变成 ill-posed credit assignment。
- 这一步很关键：
  - 如果问题只是 sparse，OPD/OPSD 就足够自然；
  - 如果问题是层级错配，就必须同时解决 turn 和 token。

### Related Work：为“方向/幅度分权”腾出位置

- 工具使用部分强调 multi-turn benchmark 的特殊性：
  - state consistency；
  - error propagation；
  - session-level accuracy 低于单步指标。
- Agentic RL 部分说明：
  - 很多方法关心 reward design；
  - 但 trajectory 或 step advantage 仍不能解释 turn 内 token 差异。
- OPD/OPSD 部分则负责证明：
  - dense token signal 是真需求；
  - 但 teacher-defined objective 不能直接接管 RL。
- 因此 CrEST 的位置不是折中口号，而是一个明确空位：
  - verifier 决定方向；
  - self-teacher 提供密集幅度；
  - entropy gate 控制集中风险。

### Method：核心是乘法分解，不是额外 loss

- Method 的结构很干净：
  - 先给统一 policy gradient；
  - 再把 `A_t` 分解为 `A_turn[t]` 与 `phi_t`；
  - 然后分别解释 turn segmentation 和 token modulation。
- 这比“RL loss + distillation loss”更强：
  - auxiliary loss 常要调权重；
  - 两个 loss 的方向可能互相冲突；
  - CrEST 把冲突压到 advantage 的符号约束里。
- 读这一节时应关注一个边界：
  - 它证明的是 token-wise scalar sign preservation；
  - 它不是证明全局优化不会偏离；
  - 因此论文主张应理解为工程上更稳的约束，而不是完整收敛理论。

### Experiments：主结果服务于两个机制判断

- 第一类判断：
  - RL-based 方法通常强于 distillation-based 方法；
  - 这支持“direction 仍应来自 verifier”。
- 第二类判断：
  - CrEST 强于 GRPO、MT-GRPO、EnvTuning；
  - 这支持“只要方向还在 verifier 下，dense token 幅度有额外收益”。
- 最有说服力的不是平均分本身，而是分项模式：
  - Long Context 改善更大；
  - WildToolBench session accuracy 改善更大；
  - 这些正好对应 credit dilution 最严重的位置。

### Ablation：把设计拆成必要条件

- 层级消融回答：
  - 只做 inter-turn 不够；
  - 只做 intra-turn 也不够；
  - 二者合并才到最高。
- gate 消融回答：
  - direction gate 不是形式约束；
  - entropy gate 不是视觉上好看的附加模块；
  - 去掉任一 gate 都会让 average 掉 5 点左右。
- lambda 消融回答：
  - teacher signal 不是越强越好；
  - 最佳点来自 calibrated amplification；
  - 过度放大会重新制造 OPSD 式集中风险。

### Limitations：真正限制来自 reward 可获得性

- 论文写的模型规模和 benchmark 范围是显性限制。
- 更深的限制是 reward structure：
  - CrEST 需要 per-turn verified reward；
  - 需要 turn index 语义对齐；
  - 需要 privileged context 能安全构造。
- 这些限制决定了 CrEST 最适合：
  - 有结构化 session；
  - 有可验证 turn outcome；
  - 工具调用结果可被解析和比较的任务。
- 对开放网页、企业 API、多 Agent 协作、长期记忆场景，CrEST 的思想仍有价值，但必须先解决验证与归因工程。

## 领域延伸：对后训练与 Agent 安全有什么启发？

### 对后训练：从“谁给监督”转向“谁有权决定方向”

- 很多后训练争论会落在：
  - RL 是否太稀疏；
  - distillation 是否更稳定；
  - teacher 是否更强。
- CrEST 提供了一个更细的拆法：
  - **方向权**交给 verifier；
  - **幅度权**交给 teacher；
  - **放大权**再交给 entropy/uncertainty gate。

这个拆法值得继续研究，因为它把监督源的权力边界显式化了。

### 对工具型 Agent：训练目标必须尊重工作流结构

- 多轮工具 Agent 的错误不是一条文本序列里的平均错误。
- 它有结构化边界：
  - 每个用户 turn 可能对应独立目标；
  - 每个工具参数可能承担不同 causal role；
  - 上下文 carry-over 会让局部错误传播到后续 turn。
- 因此后训练算法不能只问“整条轨迹成不成功”。
- 它至少要问：
  - 哪个 turn 成功；
  - 哪个 turn 失败；
  - 失败 turn 里哪些 token 是关键决策；
  - 成功 turn 里哪些 token 只是格式。

### 对 AI 安全：verifier-bounded 不是天然安全，关键是 verifier 的边界

- CrEST 保留 verifier-bounded ceiling，但这句话有前提：
  - verifier reward 必须真的表达安全目标；
  - per-turn reward 必须覆盖危险副作用；
  - self-teacher privileged context 不能把危险 shortcut 当成高置信 token。
- 在安全训练里，CrEST 的方向/幅度分离很有价值：
  - 安全 policy 或环境 checker 决定方向；
  - teacher 只帮助找到高不确定危险 token；
  - 但不能让 teacher 覆盖安全 verifier。
- 真正难的问题仍然是：
  - 如何给多轮安全任务构造 per-turn verifier；
  - 如何处理跨 turn 累积风险；
  - 如何让 reward 看到工具副作用、权限边界和不可逆动作。

## 结论

- CrEST 的贡献不只是“又一个 GRPO 变体”。
- 它抓住了多轮工具型 Agent 后训练中的一个结构性错位：
  - trajectory-level reward 给不了 turn 级方向；
  - self-distillation 给得了 token 级密集信号，却不该决定优化方向。
- 最值得带走的判断是：
  - **自教师可以有用，但它应该教幅度，不应该替 verifier 教方向。**
- 论文的实验结果支持这个判断：
  - 主结果在 BFCL V3 和 WildToolBench 上跨两个模型规模领先；
  - 消融表明 inter-turn 与 intra-turn 两层互补；
  - gate 消融说明 direction gate 与 entropy gate 都不是装饰。
- 但边界也要放在同等重要的位置：
  - 单 seed、两类 benchmark、两个模型规模；
  - turn-level verifier 依赖较强；
  - entropy/surprisal 对 token 重要性的假设仍需更多任务验证。

对研究者来说，下一步不是把 CrEST 当成万能后训练 recipe，而是把它提出的问题继续拆开：当 Agent 任务有明确层级结构时，训练算法应如何把 verifier、teacher、uncertainty、权限边界和环境反馈放在各自该有的位置上。
