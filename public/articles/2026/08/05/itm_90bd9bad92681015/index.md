# TurnSight：把工具调用轨迹里的“哪一步有用”还给后训练目标

## 元信息

| 字段 | 内容 |
| --- | --- |
| 标题 | TurnSight: Turn-Level Hindsight Self-Distillation for Tool-Integrated Reasoning |
| 作者 | Changle Qu, Sunhao Dai, Hengyi Cai, Yuqi Zhou, Xinran Chen, Simon, Jun Xu |
| 类型 | 论文 + 官方代码 |
| 官方链接 | https://arxiv.org/abs/2608.04007 |
| 版本日期 | arXiv v1, 2026-08-04 17:59:21 UTC |
| 代码与数据 | https://github.com/quchangle1/TurnSight |
| 研究方向 | 大模型后训练；工具型 Agent；长程工具调用的 credit assignment |

## TL;DR

- TurnSight 关心的问题不是“工具型 Agent 能不能通过 RL 变强”，而是更细的一个训练问题：在多轮工具调用轨迹里，最终成功或失败只给整条轨迹一个结果，模型很难知道第 1 轮检索、第 3 轮参数构造、第 6 轮环境状态更新分别该被奖励还是惩罚。
- 论文把这个问题定义成 Tool-Integrated Reasoning 的 turn-level credit assignment：监督信号既要对齐 agent 实际访问过的 on-policy state，又要按“完整交互轮次”而不是零散 token 给出一致判断。
- TurnSight 的机制可以拆成四步：先从学生自己执行出的工具结果构造 hindsight；再把 token 级 teacher-student log-prob gap 聚合到 turn 级；随后用 1、2、3 步 lookahead teacher 做方向一致性选择；最后在同一 prompt 的 sibling rollouts 内归一化，并用有界、保号的权重调制 GRPO/MatchTIR 类 advantage。
- 关键公式是：`\delta = log pi_ref(y | c+H) - log pi_theta(y | c)` 表示看到执行后果后，冻结参考分支是否更相信学生当时生成的 token；turn 级平均得到 `bar_delta`；多数方向选择得到 `bar_delta*`；归一化后通过 `1 + eps_w tanh(sign(A_base) * hat_delta)` 调整 advantage 幅度。
- 实验使用 Qwen3-4B 和 Qwen3-8B，不经过额外 SFT，训练数据为 FTRL 的 2,215 个可执行工具任务；评测覆盖 FTRL、BFCL 和 ToolHop，其中 BFCL 与 ToolHop 是 out-of-domain。
- 主结果显示，Qwen3-8B + TurnSight 的整体平均分为 42.02，高于 MatchTIR 的 39.03；论文称这是相对上一最佳方法约 7.7% 的 overall average improvement。Qwen3-4B 上 TurnSight 的总体平均分为 37.51，也高于 MatchTIR 的 34.76。
- 消融表明三个模块都必要：去掉 turn-level aggregation 后 FTRL Avg 从 46.92 降到 43.23；去掉 group normalization 降到 43.65；去掉 multi-teacher selection 降到 45.62。
- 局限也很清楚：它的证据主要来自 FTRL 训练、Qwen3-4B/8B、最多 10 轮交互、8x A800 训练环境；论文没有证明这套 hindsight gap 在真实网页、长时开放世界、非确定性工具、对抗性工具反馈或跨模型家族上同样稳定。

## 研究问题：为什么 trajectory-level RL 不够？

### 论文真正要修的不是 reward，而是归因粒度

- 多轮工具型 Agent 的一次 rollout 通常包含这些组成：
  - 用户问题 `q`。
  - 当前自然语言推理 `n_k`。
  - 第 `k` 轮工具调用集合 `C_k`。
  - 工具返回或环境观察 `o_k`。
  - 最终答案或到达最大轮数 `L` 后终止。
- 如果只看最终 reward，训练算法知道“这条轨迹赢了还是输了”，但不知道：
  - 哪个工具选择是关键转折。
  - 哪个参数错误只是局部噪声。
  - 哪个早期冗余调用造成后续状态污染。
  - 哪个中间失败其实被后续调用修复了。

| 训练信号 | 它看见什么 | 对工具调用的主要缺口 |
| --- | --- | --- |
| outcome-only GRPO | 同一 prompt 下多条轨迹的最终 reward 差异 | 把同一条轨迹里的多个 turn 近似同等处理 |
| reference trajectory matching | 人工或程序构造的参考工具轨迹 | 学生偏离参考后，后续 state 已经不同，参考动作可能不再适配 |
| token-level self-distillation | 每个 token 的 teacher-student 差异 | 一个工具调用内部会有格式 token、参数 token、推理 token，信号可能互相冲突 |
| TurnSight | 学生自己执行过的工具结果，按 turn 聚合 | 仍依赖工具反馈质量，但更贴近 agent 实际走过的 state |

### “state-aligned” 是这篇论文的第一条主线

- 作者的出发点是：工具调用会改变外部环境。
- 这意味着：
  - 第 1 轮选择了不同工具，后面状态就不再等于参考轨迹。
  - 第 2 轮参数多填或少填，后面可见信息也会改变。
  - 第 3 轮拿到错误观察，后续推理可能沿着错误 evidence 继续放大。
- 因此，监督信号不能只告诉模型“标准答案是什么”。
- 更应该问的是：
  - 在学生当时实际看到的上下文里，这个工具调用是否合理？
  - 工具执行后的结果是否提高了对这一步的信心？
  - 后续一两步是否证明这一步有用、无用或有害？

### “turn-coherent” 是第二条主线

- 工具调用不是一个普通 token。
- 一次完整交互轮次通常包括：
  - 解释为什么要调用工具。
  - 选择工具名。
  - 构造 JSON 参数。
  - 接收工具返回。
  - 基于返回更新下一步计划。
- 如果训练只在 token 级调制 advantage，就会出现一个很实际的问题：
  - 工具名 token 被正向强化。
  - 参数里的一个字段被负向削弱。
  - 格式 token 又被另一个方向扰动。
- 论文认为这种 token 内部拉扯并不符合 TIR 的决策结构。
- 所以 TurnSight 把 hindsight gap 先聚合到 turn 级，再把同一个 turn 的信号分配给该 turn 内所有 policy token。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 多轮 TIR 需要 on-policy state-aligned supervision | 用学生自己执行出的工具调用和返回构造 hindsight block `H` | Introduction 和 Figure 1 对比 outcome RL、传统 OPSD、TurnSight | 如果工具返回本身错误或不可验证，hindsight 也可能放大噪声 |
| token 级 distillation 不适合作为工具交互的基本单位 | 把 `delta_t` 在同一 turn 内平均成 `bar_delta_{i,k}` | Table 2：去掉 turn-level aggregation，Qwen3-8B FTRL Avg 46.92 -> 43.23 | 平均聚合可能掩盖一个 turn 内的细粒度参数错误 |
| 单一 lookahead 不足以评估不同时间尺度的工具决策 | 构造 `D_H={1,2,3}` 的多个 teacher view | Figure 4：方向一致性选择在 Solve-P/R/F1/Avg 上最好 | 只试了 1/2/3，未证明更长 horizon 或动态 horizon 的最优性 |
| raw teacher gap 不可跨 prompt 直接比较 | 在同一 prompt 的 sibling rollouts 内做 group normalization | Table 2：去掉 group normalization，FTRL Avg 46.92 -> 43.65 | 归一化依赖同组 rollout 的多样性；如果 16 条 rollout 同质化，基线会弱 |
| hindsight 应调幅而不改 RL 方向 | 用 `sign(A_base)` 和有界 `tanh` 只放大或缩小 advantage | 公式设计 + Figure 6：`lambda=0.5`、`eps_w=0.5` 最优 | 仍由 base reward 决定正负方向；reward 定义错时不能自动纠偏 |

## 方法机制：TurnSight 到底怎么工作？

### 任务形式化

- 对一个 prompt `q ~ D`，模型策略 `pi_theta` 与工具环境交互。
- 轨迹写成：

```text
tau = (s_1, s_2, ..., s_K)
s_k = (n_k, C_k, o_k)
```

- 变量解释：
  - `n_k`：第 `k` 轮自然语言推理。
  - `C_k`：第 `k` 轮发出的工具调用集合。
  - `o_k`：工具执行后的观察或返回。
  - `K`：实际终止轮数。
  - `L`：最大交互轮数。
- 终止条件：
  - 模型输出最终答案。
  - 或达到最大 turn limit。

### 基础 RL：GRPO 给出 trajectory/group 级 advantage

- 论文沿用 GRPO 的基本想法：
  - 对同一个 prompt 采样 `G` 条轨迹。
  - 用同组 reward 的均值和标准差构造相对 advantage。
  - 不训练额外 critic。
- 这解决的是“同一 prompt 下哪条轨迹更好”。
- 但它没有解决“同一条轨迹里哪一轮工具调用更值得强化”。

公式可以概括为：

```text
rho_{i,t} = pi_theta(token_t | prefix) / pi_old(token_t | prefix)
J_GRPO = E[ min(rho * A, clip(rho) * A) - beta * KL(pi_theta || pi_ref) ]
```

- `rho` 控制新旧策略偏移。
- `A` 是同组相对 advantage。
- observation token 不参与 policy gradient。
- TurnSight 后面做的事情，是把这个 `A` 改成 `A_tilde`，而不是另起一个 imitation objective。

### 第一步：execution-conditioned hindsight

- 对第 `i` 条轨迹、第 `k` 个 turn，TurnSight 构造一个 hindsight block：

```text
H_{i,k}^{(d)} = ((C_{i,k}, o_{i,k}), ..., (C_{i,k+d-1}, o_{i,k+d-1}))
```

- 这里的 `d` 是 lookahead depth。
- 如果 `d=1`：
  - teacher 只看到当前工具调用和当前工具返回。
- 如果 `d=2`：
  - teacher 还能看到下一轮工具结果。
- 如果 `d=3`：
  - teacher 看到更长的执行后果。

把 hindsight block 拼到原上下文上：

```text
c_{i,t}^{+(d)} = c_{i,t} concat H_{i,k}^{(d)}
```

- 学生分支只看 rollout 当时可见的 `c_{i,t}`。
- teacher 分支在训练时多看 `H`。
- 论文实现里 teacher/reference branch 冻结，不让它变成另一个会漂移的优化目标。

### 第二步：用 log-prob gap 读出 hindsight 方向

对学生当时实际生成的 token `y_{i,t}`，计算：

```text
delta_{i,t}^{(d)}
  = log pi_ref(y_{i,t} | c_{i,t}^{+(d)})
    - log pi_theta(y_{i,t} | c_{i,t})
```

- 如果 `delta > 0`：
  - 看到执行后果后，teacher 更相信这个 token。
  - 它是对原动作的正向 hindsight evidence。
- 如果 `delta < 0`：
  - 看到执行后果后，teacher 更不相信这个 token。
  - 它是负向 evidence。
- 这个设计的关键不是让 teacher 直接规定答案。
- 它只是问：执行结果让原 token 的可信度上升还是下降？

### 第三步：token gap 聚合成 turn gap

同一个 turn 内的 token 集合写作：

```text
Y_{i,k} = { t : kappa_i(t) = k }
```

TurnSight 对每个 lookahead depth 计算 turn-level gap：

```text
bar_delta_{i,k}^{(d)}
  = (1 / |Y_{i,k}|) * sum_{t in Y_{i,k}} delta_{i,t}^{(d)}
```

- 这一步的意义：
  - 把工具名、参数、推理文本视为同一个交互决策。
  - 降低格式 token 对训练信号的扰动。
  - 防止同一个工具调用内部出现互相抵消或互相冲突的 token 级方向。

### 第四步：多 horizon teacher 不是融合，而是先投票再选最强

每个 depth 先映射成方向：

```text
s_{i,k}^{(d)} =
  +1, if bar_delta_{i,k}^{(d)} >= 0
  -1, if bar_delta_{i,k}^{(d)} < 0
```

再对 `d in {1,2,3}` 做多数投票，得到 `v_{i,k}`。

然后只在方向等于多数票的 teachers 里选择绝对值最大的一个：

```text
d*_{i,k}
  = argmax_{d: s_{i,k}^{(d)} = v_{i,k}} |bar_delta_{i,k}^{(d)}|

bar_delta*_{i,k} = bar_delta_{i,k}^{(d*_{i,k})}
```

- 为什么不简单平均？
  - 长 horizon 可能带来无关后果。
  - 短 horizon 可能看不见延迟收益。
  - 平均会把真正有方向的信息稀释。
- 为什么不只取绝对值最大？
  - 单个 teacher 可能被偶然未来状态误导。
  - 先做方向一致性，可以过滤孤立反向信号。

### 第五步：在 sibling rollouts 里归一化

raw `bar_delta*` 不能直接跨样本比较，因为它受这些因素影响：

- prompt 难度。
- 轨迹长度。
- turn 位置。
- 当前训练阶段。
- teacher 与 student 的整体校准差异。

所以作者把同一 prompt 的 sibling rollouts 放在一起，计算均值和标准差：

```text
hat_delta_{i,k}
  = (bar_delta*_{i,k} - mu_delta_q) / (sigma_delta_q + eps)
```

- 这与 GRPO 的组相对思想一致。
- 它关心的不是“这个 gap 绝对有多大”。
- 它关心的是“在同一问题的多条尝试里，这个 turn 的 hindsight evidence 相对是否更强”。

### 第六步：有界、保号地调制 advantage

TurnSight 构造权重：

```text
w_{i,t}
  = 1 + eps_w * tanh( sign(A_base_{i,t}) * hat_delta_{i,k} )
```

因此：

- `w > 1`：
  - hindsight 与 base advantage 方向一致。
  - 当前 turn 的更新幅度被放大。
- `w < 1`：
  - hindsight 与 base advantage 方向相冲。
  - 当前 turn 的更新幅度被削弱。
- `w in [1-eps_w, 1+eps_w]`：
  - 极端 gap 不会无限放大梯度。

最终 advantage：

```text
A_tilde_{i,t}
  = A_base_{i,t} * ((1 - lambda) + lambda * w_{i,t})
```

- `lambda` 控制 hindsight 介入强度。
- 论文默认 `lambda=0.5`。
- `eps_w=0.5`，所以权重范围是 `[0.5, 1.5]`。
- 这保留了 base RL 的优化方向，同时让 turn-level hindsight 决定“多推一把还是少推一把”。

## 伪代码：从 rollout 到 TurnSight advantage

```text
Input:
  prompt group Q
  policy pi_theta
  frozen reference pi_ref
  sampled trajectories {tau_i}_{i=1..G}
  base trajectory rewards R_i
  lookahead depths D_H = {1, 2, 3}
  lambda, eps_w

State:
  each trajectory tau_i has turns s_{i,k} = (n_{i,k}, C_{i,k}, o_{i,k})
  each turn owns policy-token positions Y_{i,k}

Loop:
  1. compute group-relative A_base for each trajectory under GRPO/MatchTIR backbone

  2. for each trajectory i:
       for each turn k:
         for each lookahead d in D_H:
           H = executed tool calls and observations from turn k to k+d-1
           c_plus = original context at token t plus H
           delta_t_d = log pi_ref(y_t | c_plus) - log pi_theta(y_t | original context)
           bar_delta_k_d = average delta_t_d over all t in Y_{i,k}

         signs = sign(bar_delta_k_d) over d
         consensus = majority_vote(signs)
         choose d* with largest |bar_delta_k_d| among teachers matching consensus
         store bar_delta_star_{i,k}

  3. for each prompt group:
       normalize all selected turn evidence across sibling rollouts
       hat_delta_{i,k} = (bar_delta_star_{i,k} - group_mean) / (group_std + eps)

  4. for each policy token t in turn k:
       w = 1 + eps_w * tanh(sign(A_base) * hat_delta_{i,k})
       A_tilde = A_base * ((1 - lambda) + lambda * w)

Output:
  PPO/GRPO objective using A_tilde instead of the original A_base

Failure boundary:
  if tool observations are wrong, non-deterministic, adversarial, or unrelated,
  hindsight evidence can be miscalibrated; the method attenuates magnitude but
  does not prove causal correctness of the tool environment.
```

## 实验设置：证据覆盖了什么？

### 训练与模型

| 项 | 设置 |
| --- | --- |
| backbone | Qwen3-4B, Qwen3-8B |
| 训练数据 | FTRL 全部训练环境，2,215 instances |
| 训练范式 | 直接从 base checkpoint 初始化；没有中间 SFT |
| 每 batch query 数 | 32 |
| 每个 query rollout 数 | 16 |
| 最大 prompt 长度 | 10,000 tokens |
| 最大 response 长度 | 13,000 tokens |
| 最大交互轮数 | 10 |
| 训练轮数 | 3 epochs |
| 硬件 | 8 x A800-80GB |
| rollout engine | vLLM |
| learning rate | 1e-6 |
| KL 设置 | 显式 KL 系数为 0 |
| TurnSight 超参 | `D_H={1,2,3}`, `lambda=0.5`, `eps_w=0.5` |

### Benchmark 与指标

| Benchmark | 用途 | 子集/规模 | 指标 |
| --- | --- | --- | --- |
| FTRL | in-domain post-training 与评测 | train 2,215；eval 为 Single-Hop、Parallel Single-Hop、Multi-Hop、Parallel Multi-Hop，各 50 | Solve-P、Solve-R、Solve-F1、Avg |
| BFCL | out-of-domain function calling/agentic 评测 | Base/Missing Function/Missing Parameter/Long Context 各 200；Web Search 200；Memory 465 | 官方 accuracy 与平均值 |
| ToolHop | out-of-domain 多跳工具组合 | 995 queries；3,912 locally executable tools | final-answer accuracy |

FTRL 的三个主要指标可以写成：

```text
Solve-P = N_solved / N_call, if N_call > 0; otherwise 1
Solve-R = N_solved / N_req
Solve-F1 = 2 * Solve-P * Solve-R / (Solve-P + Solve-R)
```

- `N_call`：模型发出的工具调用数。
- `N_solved`：成功解决的子任务数。
- `N_req`：任务所需子任务总数。
- Precision 约束乱调用工具。
- Recall 约束漏解子任务。
- F1 要求工具调用既有效又覆盖需求。

## 主结果：TurnSight 赢在哪里？

### Qwen3-4B：从小模型上看 credit assignment 是否真有用

| 方法 | FTRL Avg | BFCL Avg | ToolHop Acc | Overall Avg |
| --- | ---: | ---: | ---: | ---: |
| Vanilla | 28.76 | 22.91 | 23.22 | 24.96 |
| GRPO | 30.91 | 22.90 | 21.98 | 25.26 |
| ToolRL | 31.21 | 25.27 | 23.65 | 26.71 |
| MatchTIR | 35.91 | 30.82 | 37.56 | 34.76 |
| SDPO | 30.57 | 25.73 | 26.53 | 27.61 |
| RLSD | 32.65 | 27.11 | 33.30 | 31.02 |
| SDAR | 34.22 | 29.07 | 37.36 | 33.55 |
| SOD | 32.49 | 23.43 | 22.28 | 26.06 |
| TurnSight | 41.00 | 33.18 | 38.29 | 37.51 |

观察：

- TurnSight 对 Qwen3-4B 的提升不是只发生在训练同域 FTRL。
- 它在 ToolHop 上也达到 38.29，略高于 MatchTIR 的 37.56。
- BFCL Avg 为 33.18，高于 MatchTIR 的 30.82。
- 这说明 execution-conditioned hindsight 并非只记住 FTRL 的任务分布。
- 但 4B 的 BFCL Web Search 和 Memory 仍然不高：
  - Search 为 21.00。
  - Memory 为 24.73。
- 所以结论不能扩张成“TurnSight 解决了开放式 Agent”。

### Qwen3-8B：论文最强证据来自这里

| 方法 | FTRL Avg | BFCL Avg | ToolHop Acc | Overall Avg |
| --- | ---: | ---: | ---: | ---: |
| Vanilla | 31.46 | 29.26 | 34.07 | 31.60 |
| GRPO | 36.92 | 26.66 | 29.21 | 30.93 |
| ToolRL | 38.82 | 31.10 | 35.68 | 35.20 |
| MatchTIR | 42.78 | 33.78 | 40.54 | 39.03 |
| SDPO | 39.02 | 25.94 | 35.21 | 33.39 |
| RLSD | 38.14 | 30.63 | 38.29 | 35.69 |
| SDAR | 38.66 | 34.09 | 41.37 | 38.04 |
| SOD | 34.53 | 28.54 | 33.64 | 32.23 |
| TurnSight | 46.92 | 37.56 | 41.58 | 42.02 |

关键点：

- FTRL Avg：TurnSight 46.92，高于 MatchTIR 42.78。
- BFCL Avg：TurnSight 37.56，高于 SDAR 34.09 和 MatchTIR 33.78。
- ToolHop Acc：TurnSight 41.58，略高于 SDAR 41.37 和 MatchTIR 40.54。
- Overall Avg：TurnSight 42.02，高于上一最佳 MatchTIR 39.03。
- 按论文说法，这对应 overall average 上约 7.7% 的相对提升。

### 为什么 GRPO 在 out-of-domain 可能变差？

表里有一个值得细读的现象：

- Qwen3-8B Vanilla 的 Overall Avg 是 31.60。
- Qwen3-8B GRPO 的 Overall Avg 是 30.93。
- GRPO 在 FTRL 上从 31.46 升到 36.92。
- 但 BFCL Avg 从 29.26 降到 26.66，ToolHop 从 34.07 降到 29.21。

这正好支持作者的中心论点：

- outcome-only RL 可以让模型更适应训练环境。
- 但它不一定学到可迁移的“哪一步工具调用有因果贡献”。
- 如果 reward 只在轨迹末端给出，模型可能强化了与训练环境偶然相关的中间模式。
- TurnSight 的 hindsight 调制试图把学习压力转回“具体 turn 是否对后续执行有帮助”。

## 消融与失败边界：三个模块各自证明了什么？

### Table 2：核心组件不能随便删

| 变体 | Solve-P | Solve-R | Solve-F1 | Avg |
| --- | ---: | ---: | ---: | ---: |
| TurnSight | 46.99 | 50.71 | 43.07 | 46.92 |
| without turn-level aggregation | 41.61 | 47.53 | 40.54 | 43.23 |
| without group normalization | 42.84 | 48.02 | 40.09 | 43.65 |
| without multi-teacher selection | 44.26 | 50.24 | 42.35 | 45.62 |

解释：

- 去掉 turn-level aggregation 的跌幅最大。
  - 这说明 token 级 hindsight 不足以表达工具调用这种结构化动作。
  - 对 Agent 后训练来说，“决策单位”可能比“序列单位”更重要。
- 去掉 group normalization 也明显下降。
  - 这说明 raw teacher-student gap 的数值尺度不稳定。
  - 直接拿 gap 调 advantage，会把 prompt 难度、轨迹长度、模型校准误差混进 credit。
- 去掉 multi-teacher selection 的下降较小但仍稳定。
  - 这说明多 horizon 的价值主要在处理延迟后果。
  - 但选择策略要谨慎；不是看得越远越好。

### Figure 3：更多 privileged information 反而可能更差

论文比较三种 teacher context：

| Teacher context | Solve-P | Solve-R | Solve-F1 | Avg |
| --- | ---: | ---: | ---: | ---: |
| tool only | 46.99 | 50.71 | 43.07 | 46.92 |
| tool + answer | 40.87 | 43.92 | 37.89 | 40.89 |
| answer only | 39.72 | 47.81 | 40.87 | 42.80 |

这组结果很重要：

- 它反驳了一个直觉：teacher 看越多答案信息，监督越好。
- 在工具调用里，标准答案是 trajectory-level information。
- 它能告诉模型任务终点，但不一定告诉模型当前 turn 是否合理。
- 工具执行结果更贴近当前 state，所以 `tool only` 最好。
- 这也给安全与 Agent 评测一个启发：
  - 训练反馈不是越强越好。
  - 反馈必须贴近要归因的动作单位。

### Figure 4：固定 lookahead 与 teacher fusion 都不如方向一致性选择

| 方案 | Solve-P | Solve-R | Solve-F1 | Avg |
| --- | ---: | ---: | ---: | ---: |
| LA1 | 44.26 | 50.24 | 42.35 | 45.62 |
| LA2 | 42.37 | 49.47 | 42.66 | 44.83 |
| LA3 | 38.46 | 48.93 | 39.52 | 42.30 |
| Fusion | 44.10 | 49.96 | 43.03 | 45.70 |
| Ours | 46.99 | 50.71 | 43.07 | 46.92 |

解读：

- `LA1` 是固定 lookahead 中最强，说明当前工具结果往往已经包含足够反馈。
- `LA3` 明显变差，说明更长未来上下文会混入无关交互。
- `Fusion` 比 LA1 的 Avg 只略高，不能充分处理 teacher 之间方向冲突。
- `Ours` 最好，说明多数方向 + 最强一致 teacher 的组合是有意义的。

### Figure 5：只看前五轮或后五轮都不够

| 覆盖范围 | Solve-P | Solve-R | Solve-F1 | Avg |
| --- | ---: | ---: | ---: | ---: |
| first five turns | 41.89 | 49.40 | 42.40 | 44.56 |
| last five turns | 39.86 | 48.81 | 40.46 | 43.04 |
| all turns | 46.99 | 50.71 | 43.07 | 46.92 |

论文给出的含义：

- 早期 turn 比后期 turn 更重要，因为早期工具调用塑造后续 state。
- 但完整轨迹 supervision 仍最好。
- 对长程 Agent 来说，不能只在“看起来接近答案”的后半段做 credit。
- 很多成败已经在前半段的信息收集和状态构造里决定。

### Figure 6：超参最优点是中间值

- `lambda=0.5` 最好：
  - 太小则 hindsight 介入不足。
  - 太大则局部 credit 可能压过全局 task reward。
- `eps_w=0.5` 最好：
  - 太小则权重变化太弱。
  - 太大则 imperfect teacher gap 的噪声被放大。
- 这说明 TurnSight 不是用 hindsight 取代 RL。
- 它更像给 base advantage 加一个“局部可信度调速器”。

## 代码与可复现性：官方实现透露了什么？

### 发布状态

- GitHub 仓库在 2026-08-04 有初始 release/代码提交。
- README 在 2026-08-05 标记：
  - 论文已上 arXiv。
  - TurnSight model checkpoints 和 datasets 已发布到 Hugging Face collection。
  - full codebase released。
- 仓库结构包括：
  - `Code/`：VeRL 扩展与训练代码。
  - `Data/`：训练和验证 parquet。
  - `Scripts/`：训练与评测入口。
  - `images/`：README 图示。

### `Scripts/run.sh` 与论文设置能对上

训练脚本里的关键参数包括：

| 参数 | 值 | 对应论文机制 |
| --- | --- | --- |
| `algorithm.adv_estimator` | `grpo_sd` | 使用 self-distillation 调制后的 GRPO-style advantage |
| `data.train_batch_size` | 32 | 与论文 batch size 一致 |
| `actor_rollout_ref.rollout.n` | 16 | 每个 query 采样 16 条 rollout |
| `data.max_prompt_length` | 10000 | 与 Table 4 一致 |
| `data.max_response_length` | 13000 | 与 Table 4 一致 |
| `teacher_context_mode` | `tool_only` | 对应 Figure 3 最优配置 |
| `teacher_context_lookahead_list` | `[1,2,3]` | 对应 multi-lookahead teacher |
| `turn_level_delta_agg` | `True` | 对应 turn-level aggregation |
| `delta_group_normalize` | `True` | 对应 group normalization |
| `modulation_fn` | `tanh` | 对应 bounded sign-aware weighting |
| `grpo_sd_lambda` | 0.5 | 对应 Figure 6 最优中间值 |
| `grpo_sd_eps_w` | 0.5 | 对应 Figure 6 最优中间值 |

### 工程边界

- 这不是一个轻量 notebook 复现实验。
- 训练脚本默认依赖：
  - Ray Jobs server。
  - vLLM rollout。
  - Qwen3-8B 或 Qwen3-4B base checkpoint。
  - VeRL 训练框架。
  - 8 GPU 节点级训练配置。
- 因此，对普通读者而言：
  - 可以复核方法和脚本参数。
  - 可以下载 checkpoint 做评测。
  - 但完整训练复现成本较高。

## 相关工作位置：TurnSight 与几条路线的区别

### 与 ToolRL / MatchTIR 的区别

- ToolRL 与 MatchTIR 代表更显式的工具监督路线。
- 它们能提供细粒度工具调用信号。
- 但代价是更接近 reference 或 annotated trajectory。
- TurnSight 的区别是：
  - 不依赖 ground-truth tool trajectory。
  - 从学生自己的 on-policy execution 中取 hindsight。
  - 保留 RL exploration，而不是把训练变成纯 imitation。

### 与普通 OPSD 的区别

- OPSD 的核心是 teacher 用 privileged context 评价 student。
- 但普通 OPSD 可能使用：
  - 标准答案。
  - 成功轨迹。
  - 检索到的 skill。
  - 其他全局信息。
- 这些信息不一定对齐学生当前 state。
- TurnSight 把 privileged context 限定为工具执行结果，强调：
  - context 要来自学生实际走过的轨迹。
  - 监督要按工具交互轮次聚合。
  - teacher 只调制 RL 幅度，不夺走 RL 方向。

### 与近期 agent self-distillation 的关系

- 近期有多篇工作都在处理长程 Agent 的 hindsight 或 self-distillation。
- TurnSight 的独特性在于：
  - 它不是只在失败点生成文字反思。
  - 也不是只对某些 action span 做额外 imitation。
  - 它把 hindsight 变成可插入 policy-gradient objective 的 turn-level advantage modulation。
- 这个位置很适合后续扩展：
  - 从工具调用扩到网页操作。
  - 从确定性本地工具扩到真实 API。
  - 从结果 hindsight 扩到安全策略 hindsight。

## 证据边界与局限

### 已经证明了什么？

- 在 FTRL 训练、Qwen3-4B/8B、最多 10 轮工具交互设定下：
  - TurnSight 比 GRPO、ToolRL、MatchTIR、SDPO、RLSD、SDAR、SOD 都更强。
  - 提升不仅出现在 FTRL，也延伸到 BFCL 和 ToolHop。
- 消融证明：
  - turn-level aggregation 是必要模块。
  - group normalization 是必要模块。
  - multi-lookahead teacher selection 有稳定收益。
- Figure 3 证明：
  - 对工具 credit assignment 来说，tool result 比 ground-truth answer 更适合做 privileged context。

### 还没有证明什么？

- 没有证明在非 Qwen3 模型家族上同样有效。
- 没有证明在超过 10 轮的长时任务中仍然稳定。
- 没有证明在真实网页、真实数据库、真实 API side effect 环境中可直接迁移。
- 没有证明对非确定性工具返回、延迟工具返回或错误工具返回有鲁棒性。
- 没有证明 teacher log-prob gap 一定代表因果贡献。
- 没有给出训练成本、wall-clock 时间、失败 seed 方差的充分展开。

### 安全视角下的额外风险

- 如果工具返回被污染，TurnSight 会把污染后的执行结果当 hindsight。
- 如果 agent 在训练时学到“某类工具返回通常带来高 reward”，它可能对这类返回过拟合。
- 如果工具环境存在 prompt injection 或状态投毒，execution-conditioned hindsight 需要额外过滤。
- 因此，在 AI 安全场景里，TurnSight 更适合搭配：
  - 工具返回可信度评分。
  - 外部环境审计。
  - 对抗性工具反馈测试。
  - turn-level negative controls。

### 负控实验还可以怎样补强？

- 论文已经做了三类重要负控：
  - 去掉 turn-level aggregation。
  - 去掉 group normalization。
  - 去掉 multi-teacher selection。
- 但如果要把 TurnSight 放进更真实的 Agent 训练管线，还需要更多“反向检查”：
  - 把工具返回随机打乱到同一 prompt 的其他 rollout，观察 hindsight gap 是否仍然给出高权重。
  - 把正确工具名保留、参数字段打乱，检查 turn-level 平均是否会掩盖参数错误。
  - 把早期 turn 的观察延迟到后期 teacher context，测试方法是否过度依赖最近观察。
  - 在 BFCL Missing Function 子集里单独统计无效工具调用率，而不只看最终 accuracy。
  - 对 ToolHop 的多跳链路做分层统计，区分“第一跳选错”“中间跳参数错”“最后答案抽取错”。
- 这些检查能回答一个关键问题：
  - TurnSight 学到的是可迁移的工具归因。
  - 还是只学会了在特定 benchmark 里识别某些工具返回模式。

### 可复现性需要关注哪些文件？

| 复核点 | 官方材料里的位置 | 为什么重要 |
| --- | --- | --- |
| 训练入口 | `Scripts/run.sh` | 能看到 `grpo_sd`、`tool_only`、`[1,2,3]`、`lambda=0.5`、`eps_w=0.5` |
| reward 计算 | `Code/verl/utils/reward_score/tool.py` | FTRL 的 train/test 评分逻辑直接影响 base advantage |
| PPO/advantage 扩展 | `Code/verl/trainer/ppo/core_algos.py` | 能核对 teacher-student gap 如何进入 advantage |
| actor 扩展 | `Code/verl/workers/actor/sdsr_dp_actor.py` | 能核对 self-distillation 模式如何接入 actor update |
| 数据文件 | `Data/train.parquet`, `Data/test.parquet` | 需要检查训练/验证划分和工具环境是否与论文一致 |
| 评测入口 | `Scripts/eval_ftrl.sh`, `Scripts/eval_toolhop.sh` | 能复核 FTRL 与 ToolHop 的评测路径 |

- 这里最容易出错的是环境复现，而不是公式复现。
- 训练依赖 Ray job、vLLM rollout、VeRL 分布式训练和 Qwen3 checkpoint。
- 如果只运行 evaluation，而不重跑训练，只能验证 checkpoint 行为。
- 如果重跑训练，需要记录：
  - seed。
  - rollout sampling temperature。
  - 每个 checkpoint 的 validation 曲线。
  - 失败 rollout 的工具调用日志。
  - BFCL 和 ToolHop 的版本。
- 这些信息决定结果是否只是单次训练曲线上的高点。

## 研究者视角的领域延伸

### 1. Agent 后训练的单位可能要从 token 转向 action/turn

- 这篇论文最有价值的信号是“训练单位”的转移。
- 传统 LLM 训练天然以 token 为单位。
- 但 Agent 的真实决策单位常常是：
  - 一个工具调用。
  - 一次网页操作。
  - 一次文件修改。
  - 一次环境状态查询。
- 如果继续把这些行为拆成 token 做 reward 分配，训练信号会和行为结构错位。
- TurnSight 给出的答案是：先尊重行为边界，再把信号回填到 token。

### 2. Hindsight 不等于答案泄漏

- 论文用 Figure 3 说明：
  - ground-truth answer 不一定是好 hindsight。
  - 对工具调用而言，执行结果才是更贴近局部动作的反馈。
- 这对 RLVR 很重要。
- 如果训练目标只是让模型更接近答案，可能强化的是捷径。
- 如果训练目标能评估每个动作如何改变环境，模型更可能学到可迁移策略。

### 3. 保号调幅是一个稳健设计

- TurnSight 没有让 teacher 改变 policy-gradient 的正负方向。
- 这很保守，但合理。
- 因为 teacher gap 本身不是 reward。
- 它只是 hindsight evidence。
- 用它直接决定优化方向，容易让不可靠 teacher 控制训练。
- 用它调制幅度，则保留了 verifiable reward 的主导地位。

### 4. 下一步该问什么？

- 是否可以学习动态 lookahead，而不是固定 `{1,2,3}`？
- 是否可以对不同工具类型使用不同 hindsight horizon？
- 是否可以把工具返回的可信度纳入 `hat_delta`？
- 是否可以在安全任务中把“危险工具调用”作为负向 hindsight？
- 是否可以对网页 Agent 的 DOM 操作、命令行 Agent 的 shell 操作、代码 Agent 的 patch 操作统一建模？
- 是否可以把 turn-level credit 与 memory write/read credit 合并，解决“哪条记忆写入导致后续失败”的归因问题？

## 结论

- TurnSight 的核心贡献不是发明新的工具 benchmark，而是把工具型 Agent 的后训练问题重新写成“on-policy、turn-coherent、execution-conditioned credit assignment”。
- 它的主结果足够强：
  - Qwen3-8B overall average 42.02。
  - 相比 MatchTIR 39.03 有明显提升。
  - FTRL、BFCL、ToolHop 三类评测都有收益。
- 它的机制也足够可解释：
  - 工具结果提供 hindsight。
  - 多 horizon teacher 提供不同时间尺度。
  - 多数方向选择处理冲突。
  - sibling rollout 归一化处理尺度。
  - 有界 sign-aware weighting 保留 RL 方向。
- 但它仍是受控工具环境中的后训练方法。
- 真正进入开放式 Agent 训练前，还需要回答工具可信度、非确定性环境、长时任务、对抗性反馈和跨模型家族泛化这些问题。

## 参考链接

- arXiv: https://arxiv.org/abs/2608.04007
- arXiv HTML: https://arxiv.org/html/2608.04007
- GitHub: https://github.com/quchangle1/TurnSight
- Hugging Face paper page: https://huggingface.co/papers/2608.04007
- Deep Learning Monitor: https://deeplearn.org/arxiv/801525/turnsight%3A-turn-level-hindsight-self-distillation-for-tool-integrated-reasoning
- NLP arXiv Daily: https://monologg.kr/nlp-arxiv-daily/
