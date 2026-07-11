# SIS：把后训练里的 off-policy token 逐个“验明正身”

| 字段 | 内容 |
| --- | --- |
| 论文 | Turning Off-Policy Tokens On-Policy: A Plug-in Approach for Improving LLM Alignment |
| arXiv | <https://arxiv.org/abs/2607.04728> |
| 版本时间 | 2026-07-06 06:59:44 UTC |
| 作者 | Yu Li, Xiuyu Li, Mingyang Yi, Jiaxing Wang, zhangliangxu, Zhaolong Xing, Zhen Chen |
| 方向 | 大模型后训练；RL post-training；off-policy correction |
| 核心方法 | Selective Importance Sampling, SIS |

## TL;DR

1. **这篇论文解决什么问题**：LLM 后训练常用“先 rollout、再多轮 update”的工程范式。因为 rollout 来自旧策略 `pi_old`，训练时目标策略已经变成 `pi_theta`，所以 token 实际上是 off-policy；长序列里重要性采样比率连乘会放大方差，clip 又会丢掉有用梯度。
2. **作者的核心想法**：不要只把 off-policy ratio 压小，而是用 rejection sampling 在 token 级别判断一个旧策略 token 是否也可以视作当前策略 token。通过验收的 token 被赋予权重 `1`，没通过的 token 保留原始 importance ratio。
3. **方法机制**：SIS 把旧策略 `pi_old` 当 proposal distribution，把当前策略 `pi_theta` 当 target distribution；对每个 token 计算 `w_t = pi_theta(y_t|prefix) / pi_old(y_t|prefix)`，再用 top-K envelope 近似接受概率。
4. **理论证据**：论文证明被接受 token 的条件分布等于目标策略分布；同时把 token-level surrogate 和 sequence-level correction 之间的误差界从 `D = sum |log w_t|` 收紧到 `D_SIS = sum (1-z_t)|log w_t|`。
5. **实验设置**：作者在 Qwen3-8B-Base、Qwen3-14B-Base、Qwen3-30B-A3B-Base 以及附录里的 Llama-3.2-3B-Instruct 上测试；训练覆盖 DAPO-Math-17K、NQ+HotpotQA agentic search，评测覆盖 MATH500、AMC23、AIME24/25、NQ、TriviaQA、PopQA、HotpotQA、Musique、Bamboogle。
6. **关键数字**：主表里 SIS 在数学任务最高带来 **+6.37** 平均准确率提升，在 agentic search 最高带来 **+3.05**；Qwen3-8B 数学上 `DAPO+SIS` 平均 **55.14**，相对 GRPO 的 **49.05** 为 **+12.4%**。
7. **稳定性证据**：SIS 在 rollout 复用次数 `N=4/8/16` 下持续高于基线；在 MoE train-inference routing mismatch 中缓解 entropy collapse 和梯度尖峰；无 clipping 的 `GRPO+SIS` 仍超过带 clipping 的 GRPO。
8. **局限**：SIS 依赖当前策略和旧策略 logits、top-K 缓存、同一前缀下的 token 概率可比性；论文主要展示数学和检索式 agent benchmark，尚未证明对偏好建模、多轮对话安全、真实异步集群所有 failure mode 都足够。

## 研究问题：off-policy 不是“训练细节”，而是后训练的主矛盾

### 为什么 rollout-then-update 会制造偏差？

LLM RL 后训练为了吞吐量，通常不会每更新一步都重新采样当前策略：

1. rollout 阶段用某个旧 checkpoint 生成响应；
2. trainer 阶段复用这些响应做多轮梯度更新；
3. actor 更新后，当前策略 `pi_theta` 已经偏离生成数据的 `pi_old`；
4. 如果仍把旧响应当作当前策略样本，policy gradient 就带有 off-policy bias。

这个问题在短 horizon RL 里可以靠重要性采样修正，但 LLM 有两个特殊放大器：

| 放大器 | 对 off-policy 的影响 |
| --- | --- |
| 长序列 | sequence ratio 是所有 token ratio 的乘积，方差随长度快速放大 |
| 工程复用 | 异步 rollout、sample reuse、多 mini-batch update 都会扩大 `pi_old` 和 `pi_theta` 的距离 |
| MoE 路由 | rollout engine 和 trainer 可能在同 checkpoint 下走不同 expert，产生额外 log-prob mismatch |
| agent 轨迹 | 检索、工具调用和长回答让 token 分布更分散，接受率天然低于纯数学推理 |

### 旧方法为什么不够？

作者把现有方法概括成一个共同动作：**限制 off-policy 数据的影响**。

| 路线 | 做法 | 问题 |
| --- | --- | --- |
| GRPO/PPO clipping | 把 `w` 截断到信任区间 | 降低方差，但高偏移 token 的梯度信号被压掉 |
| DAPO Clip-Higher | 放宽上界，保留更多正优势更新 | 仍是启发式 clip，不能说明哪些 token 真可当 on-policy |
| GSPO sequence-level ratio | 用几何平均形式平滑序列 ratio | 缓解连乘爆炸，但没有把 token 本身重新分布化 |
| DPPO-TV / Clip-Cov | 用 TV 或 entropy/covariance mask 部分 token | 更像过滤或门控，仍是“少用坏数据” |
| R3 / IcePop 等系统修复 | 处理 MoE routing 或 engine mismatch | 与 policy-gradient estimator 的 token 级 bias 不是同一层 |

SIS 的研究问题因此更具体：

> 对于一个来自 `pi_old` 的 token，能不能通过一个可验证的采样测试，证明它在条件分布上也像是来自 `pi_theta`，从而不再需要 importance correction？

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| off-policy token 不必全部被 clip 或保留 ratio | 把 `pi_old` 视作 proposal，把 `pi_theta` 视作 target，做 token-level rejection sampling | Proposition 1 证明 accepted token 的条件分布等于 `pi_theta` | 需要拿到旧策略和当前策略在同一 prefix 上的概率 |
| SIS 能收紧 token-level surrogate 的误差界 | accepted token 的 `log w_t` 被置零，累计偏差从 `D` 降为 `D_SIS` | Theorem 1 与 Proposition 3 给出指数误差界比较 | bound 依赖 advantage、score norm 和 ratio 可估计性；不是直接泛化保证 |
| top-K 近似足够实用 | 只在旧策略 top-K token 集合里估 envelope，集合外 token 保留 off-policy | Figure 2B 显示 residual mass 小；表格显示 K=10/50/100 平均差异约 1 点内 | agentic search 的分布更散，接受率低于数学推理 |
| SIS 是 plug-in 而不是新 RL 算法 | 只替换 `w_{i,t}` 为 `w_tilde_{i,t}`，GRPO/DAPO/GSPO 其余目标不变 | Table 1 在三种算法、dense/MoE 和 math/agent 上都有提升 | 实现仍需保存 top-K logits 和做额外 per-token 计算 |
| SIS 还是稳定化机制 | 减小 ratio 偏移后，训练更抗 stale rollout 和 MoE mismatch | staleness 图、MoE 图、无 clipping 表 | 不能消除 stale rollout 本身带来的性能下降，只是减轻 |

## 方法机制：从 importance ratio 到 token 验收

### 背景公式：sequence ratio 为什么危险？

给定 prompt `x` 和 response `y = (y_1, ..., y_T)`，当前策略的目标是最大化期望奖励：

```text
J(theta) = E_{x ~ D, y ~ pi_theta(.|x)} [ r(x, y) ]
```

真实 on-policy policy gradient 可以写成：

```text
grad J(theta)
  = E_{y ~ pi_theta} [ A(x,y) grad log pi_theta(y|x) ]
```

但训练数据实际来自旧策略 `pi_old`。于是标准 importance sampling 用：

```text
w(theta) = pi_theta(y|x) / pi_old(y|x)
```

自回归模型把序列概率拆成 token 概率：

```text
pi_theta(y|x) = product_t pi_theta(y_t | x, y_<t)

w(theta) = product_t w_t(theta)
w_t(theta) = pi_theta(y_t | x, y_<t) / pi_old(y_t | x, y_<t)
```

关键问题在 `product_t`：

1. 只要少数 token 的 ratio 偏离 1，长序列连乘就会爆；
2. 实践中常把 sequence-level ratio 换成 token-level ratio，但这会引入 approximation gap；
3. clip 可以控制爆炸，却把那些“偏离但有信息”的 token 一起钳住。

### SIS 的核心：接受就置 1，拒绝才保留 ratio

SIS 对每个 token 位置 `t` 做如下判断：

1. 定义 envelope：

```text
M_t = max_{v in V} pi_theta(v | x, y_<t) / pi_old(v | x, y_<t)
```

2. 对观测 token `y_t` 计算 ratio：

```text
w_t = pi_theta(y_t | x, y_<t) / pi_old(y_t | x, y_<t)
```

3. 抽一个 Bernoulli 验收变量：

```text
z_t ~ Bernoulli(w_t / M_t)
```

4. 修改训练里的 token 权重：

```text
w_tilde_t =
  1,    if z_t = 1
  w_t,  if z_t = 0
```

这不是“随便把一些 token 权重改成 1”。论文的 Proposition 1 证明：

```text
P(y_t = v | z_t = 1) = pi_theta(v | x, y_<t)
```

也就是说，被验收 token 的条件分布正是当前策略分布。它虽然原本由旧策略采样，但在 `z_t=1` 的条件下，可以被视作当前策略样本。

### top-K envelope：为什么不需要扫完整词表？

完整 `M_t` 要对全词表最大化，成本太高。SIS 用旧策略 top-K 集合近似：

```text
V_K = TopK(pi_old(. | x, y_<t), K)

M_hat_t = max_{v in V_K} pi_theta(v | x, y_<t) / pi_old(v | x, y_<t)
```

集合外 token 不做验收，继续保留 off-policy ratio。论文给出一个清楚的误差解释：

```text
xi_K = sum_{v notin V_K} pi_theta(v | x, y_<t)

D_TV(pi_hat_theta, pi_theta) = xi_K
```

直觉是：

1. 如果当前策略的大部分概率质量也落在旧策略 top-K 里，top-K 近似就紧；
2. 如果当前策略和旧策略差异很大，集合外质量 `xi_K` 增大，SIS 会更保守；
3. 这比无条件把所有 token 置 1 更稳，因为集合外 token 仍需要 correction。

## 算法流程：SIS 如何插入现有 RL 目标？

```text
Input:
  prompt x
  old-policy responses {y_i}_{i=1..G} ~ pi_old(.|x)
  top-K parameter K
  current policy pi_theta

State:
  old logits or top-K old-policy probabilities
  current-policy token probabilities
  modified ratios {w_tilde_{i,t}}

For each response y_i:
  For each token position t:
    1. compute w_{i,t} = pi_theta(y_{i,t}|prefix) / pi_old(y_{i,t}|prefix)
    2. build V_K = TopK(pi_old(.|prefix), K)
    3. compute M_hat_t = max_{v in V_K} pi_theta(v|prefix) / pi_old(v|prefix)
    4. if y_{i,t} is in V_K:
         accept with probability w_{i,t} / M_hat_t
       else:
         reject
    5. if accepted:
         w_tilde_{i,t} = 1
       else:
         w_tilde_{i,t} = w_{i,t}

Output:
  replace w_{i,t} by w_tilde_{i,t} in GRPO, DAPO, GSPO or similar objectives

Failure boundary:
  if old/current logits are missing, prefixes differ, or top-K mass is poor,
  SIS becomes less reliable and should leave more tokens in rejected/off-policy mode.
```

以 GRPO 为例，原目标里每个 token 的 ratio 被替换成 `w_tilde`：

```text
J_GRPO^SIS(theta)
  = E [
      1/G sum_i 1/|y_i| sum_t
      min(
        w_tilde_{i,t} A_i,
        clip(w_tilde_{i,t}, 1-eps, 1+eps) A_i
      )
      - beta KL(pi_theta || pi_ref)
    ]
```

这个形式说明 SIS 的工程定位：

| 组件 | 是否改变 |
| --- | --- |
| rollout 数据 | 不改变，仍来自旧策略 |
| reward / advantage | 不改变 |
| GRPO/DAPO/GSPO 外层目标 | 不改变 |
| token correction ratio | 改成 `w_tilde` |
| 额外前向 | 不需要额外模型 forward，复用 old/current logits |
| 额外成本 | 附录 profile 约 **5.2 秒/step**，约 **1%** step time |

## 理论解释：SIS 到底收紧了什么？

### token-level surrogate 的误差界

论文把 sequence-level correction 和 token-level surrogate 的差异写成一个 bound。令：

```text
D = sum_{t=1..T} | log w_t(theta) |
s_t = grad log pi_theta(y_t | x, y_<t)
```

Theorem 1 给出：

```text
E <= |A(x,y)| (exp(D) - 1) sum_t ||s_t||
```

这个 bound 的意义不是提供一个可直接优化的 tight estimate，而是指出失稳的主变量：

1. `D` 是整个序列上 token ratio 偏离 1 的累计量；
2. 误差随 `exp(D)` 放大；
3. stale rollout、长 reasoning、agent tool-use 都会推高 `D`。

### SIS 如何降低 D？

SIS 对 accepted token 设置 `w_tilde_t = 1`，因此：

```text
log w_tilde_t = 0, if z_t = 1
```

新的累计偏差是：

```text
D_SIS = sum_t |log w_tilde_t|
      = sum_t (1 - z_t) |log w_t|
      <= D
```

所以误差界变成：

```text
E_SIS <= |A(x,y)| (exp(D_SIS) - 1) sum_t ||s_t||
     <= |A(x,y)| (exp(D) - 1) sum_t ||s_t||
```

这就是论文中最值得保留的理论贡献：

| 旧 correction 思路 | SIS 思路 |
| --- | --- |
| 让 `w_t` 不要太大或太小 | 先判断 token 是否已经可视为 on-policy |
| 用 clip 换稳定性 | 用 rejection certificate 删除一部分 correction 需求 |
| 控制 ratio 的数值 | 控制 ratio 偏离对误差界的累计贡献 |
| 牺牲部分梯度信号 | 对 accepted token 不牺牲，因为权重 1 是分布条件保证 |

## 实验设置：作者如何证明它不是只在一个算法上有效？

### 模型、任务、训练集

| 维度 | 设置 |
| --- | --- |
| Dense math | Qwen3-8B-Base |
| MoE math | Qwen3-30B-A3B-Base |
| Agentic search | Qwen3-8B-Base, Qwen3-14B-Base |
| 附录泛化 | Llama-3.2-3B-Instruct |
| 数学训练集 | DAPO-Math-17K |
| agent 训练集 | NQ + HotpotQA merged training sets |
| agent 环境 | Search-R1 设置，E5 retriever，2018 Wikipedia dump |
| training engine | FSDP |
| rollout engine | vLLM |

### 评测集

| 类别 | Benchmarks | 指标 |
| --- | --- | --- |
| Math | MATH500, AMC23, AIME24, AIME25 | 多数 Avg@1；AMC/AIME 用 Avg@32 |
| General QA agent | NQ, TriviaQA, PopQA | Avg accuracy |
| Multi-hop QA agent | HotpotQA, Musique, Bamboogle | Avg accuracy |

### 对照方法

| 方法 | 核心 ratio 处理 |
| --- | --- |
| GRPO | token-level ratio clipping |
| DAPO | asymmetric clip-higher |
| GSPO | sequence-level IS / group-sequence ratio |
| CISPO | clipped-IS |
| DPPO-TV | TV-based mask |
| Clip-Cov | entropy/covariance-based mask |
| SIS variants | accepted token 置 1，rejected token 接上任意 `g(w)` |

## 主结果：SIS 的收益在哪里最大？

### Table 1：三类算法都能受益

| 设置 | Baseline Avg | SIS Avg | 绝对提升 |
| --- | ---: | ---: | ---: |
| Qwen3-8B math, GRPO | 49.05 | 52.59 | +3.54 |
| Qwen3-8B math, DAPO | 51.24 | 55.14 | +3.90 |
| Qwen3-8B math, GSPO | 52.44 | 53.54 | +1.10 |
| Qwen3-30B-A3B math, GRPO | 51.29 | 57.66 | +6.37 |
| Qwen3-30B-A3B math, DAPO | 53.34 | 58.12 | +4.76 |
| Qwen3-30B-A3B math, GSPO | 53.19 | 56.14 | +2.95 |
| Qwen3-8B agent, DAPO | 44.59 | 47.64 | +3.05 |
| Qwen3-14B agent, DAPO | 48.11 | 49.86 | +1.75 |

几个现象值得细读：

1. **MoE math 的 GRPO 提升最大**：`+6.37` 暗示 SIS 对系统级 off-policy mismatch 特别敏感，尤其当 MoE routing 让 log-prob 对不上时。
2. **DAPO+SIS 在 Qwen3-8B math 达到最高平均 55.14**：说明 SIS 不排斥已有 trick，反而可以作为底层 ratio converter 接到更好的 `g(w)` 上。
3. **agentic search 提升较小但稳定**：这与论文的 accept-rate 解释一致，工具/检索轨迹使分布 shift 更大，能被验收的 token 比例低于数学推理。
4. **GSPO+SIS 有时不是单项最优**：例如 Qwen3-8B math 的 MATH500 从 85.6 到 85.2，说明 SIS 不是所有 metric 单调提高；作者主张的是平均和稳定性改进。

### Table 2：SIS 不是另一个 clipping trick

Qwen3-8B 数学 trick-free 表很关键，因为它把各种方法放在同一个 `w_{i,t}=g(w)` 框架里：

| 方法 | Avg | 相对 GRPO |
| --- | ---: | ---: |
| w/o IS | 47.26 | -3.65% |
| w/o clip | 48.13 | -0.92% |
| GRPO | 49.05 | -- |
| DAPO Clip-Higher | 51.24 | +4.46% |
| GSPO Seq-level IS | 52.44 | +6.91% |
| CISPO | 54.44 | +11.0% |
| SIS vanilla | 51.81 | +5.63% |
| SIS + GRPO | 52.59 | +7.22% |
| SIS + DAPO | 55.14 | +12.4% |

这个表说明两点：

1. 只把 accepted token 置 1、rejected token 用原始 `w` 的 `SIS vanilla` 已经超过 GRPO/DAPO；
2. `SIS + DAPO` 超过 CISPO，说明“先做分布验收，再对 rejected token 用 clip-higher”比单纯设计新 clip 更强。

## 消融与失败边界

### policy staleness：SIS 不能消除 stale 的伤害，但能缓冲

作者把每轮 rollout 被复用的 mini-batch update 数 `N` 从 4 增加到 16。结论有两个层次：

| 观察 | 含义 |
| --- | --- |
| `N` 增大时所有方法都下降 | stale rollout 本身确实伤害 RL，不是 SIS 能完全抹掉的系统问题 |
| 每个 `N` 下 SIS 都高于对应 baseline | SIS 能在给定 stale 程度下减少 off-policy correction 的误差 |
| accept rate 在 `0.80-0.95` 范围 | 即使 N=16，大多数数学 token 仍可被视作当前策略附近 |

这给工程实践的启发是谨慎的：SIS 不是让无限复用 rollout 变合理，而是在吞吐量和新鲜度之间提供更好的缓冲层。

### MoE mismatch：SIS 和 R3 是互补关系

MoE 模型里，rollout engine 和 trainer 可能同一 checkpoint 下路由到不同 expert。论文用 Qwen3-30B-A3B-Base + DAPO 做 stress test：

| 现象 | 论文证据 |
| --- | --- |
| vanilla DAPO 崩溃 | accuracy 先升后降，entropy 接近 0，gradient norm 出现两个数量级尖峰 |
| R3 有帮助 | replay inference routing 可以缓解一部分系统 mismatch |
| SIS 有帮助 | ratio conversion 也能缓解一部分 policy mismatch |
| SIS + R3 最稳 | 两者处理不同来源的 off-policy divergence |

这部分很重要，因为它把 SIS 放到系统现实里：后训练失稳不只来自算法选择，也来自 rollout/trainer engine 的不一致。

### 无 clipping：SIS 本身就是稳定器

附录 Table 5 关闭 clipping 后比较：

| 设置 | Baseline | SIS 后 |
| --- | ---: | ---: |
| Math GRPO | 49.05 | 51.81 |
| Agent GRPO | 45.85 | 46.91 |

这说明 SIS 不是依赖 clip 才生效。即使把 GRPO 的 clipping 去掉，SIS 仍能通过 token 验收降低 ratio 偏差。

### top-K 敏感性：一个超参数，但不太脆

论文 sweep `K in {10,50,100}`：

| 方法 | K=10 Avg | K=50 Avg | K=100 Avg | 变化 |
| --- | ---: | ---: | ---: | --- |
| GRPO+SIS | 52.59 | 52.53 | 52.24 | 小于 0.4 |
| DAPO+SIS | 54.23 | 54.56 | 54.51 | 小于 0.4 |
| GSPO+SIS | 52.26 | 53.54 | 52.46 | 约 1.3 |

作者正文说平均准确率至多约 1 点内波动，这让 SIS 更像可部署组件，而不是靠精细调参的 benchmark trick。

## Figure / Table 逐项证据解读

| 图表 | 支撑什么 | 不能证明什么 |
| --- | --- | --- |
| Figure 1 SIS overview | token 级验收、置 1、保留 ratio、插入目标函数的流程 | 只是机制示意，不证明收益 |
| Figure 2A accept rate | 数学和 agent 场景都有相当比例 token 可被验收 | 不说明被验收 token 一定对最终 reward 最关键 |
| Figure 2B residual mass / coverage | top-K envelope 有较小遗漏质量 | 依赖所测模型和任务，不能保证所有 vocab 分布 |
| Figure 2C log-importance deviation | SIS 降低 `D`，对应理论误差界更紧 | bound 与真实训练效果之间仍有间接性 |
| Table 1 主结果 | dense/MoE、math/agent、多算法平均提升 | 有些单项指标非单调，不是全面支配 |
| Table 2 trick-free | SIS 可组合，`SIS+DAPO` 最强 | 只在 Qwen3-8B math 主表呈现 |
| Figure staleness | SIS 在 N=4/8/16 下持续高于 baseline | staleness 本身仍有害 |
| Figure MoE | SIS 与 R3 互补稳定 MoE training | 没覆盖所有 MoE routing 系统实现 |
| Table top-K | K 不太敏感 | agent 长工具轨迹下是否仍稳需更多任务 |
| token word cloud | accepted token 偏数学推理，rejected token 含格式/web artifacts | word cloud 是解释性证据，不是因果证明 |

## 相关工作位置判断

### 和 GRPO/DAPO/GSPO 的关系

SIS 不是替代这些算法，而是替换它们内部的 ratio：

```text
old objective: use w_{i,t}
SIS objective: use w_tilde_{i,t}
```

这让它和后训练算法的关系更像：

| 层级 | 例子 | SIS 的位置 |
| --- | --- | --- |
| reward / advantage | outcome reward, process reward, group advantage | 不处理 |
| policy objective | GRPO, DAPO, GSPO | 可插入 |
| ratio stabilization | clipping, soft clipping, sequence ratio | 直接竞争或组合 |
| rollout systems | vLLM, async rollout, R3 | 互补 |
| data filtering | rejection sampling for preference pairs, best-of-N | 不同层级 |

### 和“过滤坏样本”的区别

很多 rejection sampling 在 LLM 里用于：

1. preference pair 筛选；
2. best-of-N response rerank；
3. 去掉 OOD 或 unsafe 样本；
4. 推理阶段重采样。

SIS 的不同点在于：它不筛整条 response，也不重排候选，而是在训练目标内部处理每个 token 的 correction ratio。

## 结论与局限

### 我认为最强的贡献

SIS 把 off-policy correction 从“数值稳定 trick”改写成一个分布问题：

1. **如果 token 能通过 rejection certificate**，它就不是需要 correction 的旧数据；
2. **如果 token 不能通过**，它仍然保留传统 ratio；
3. **如果 top-K 覆盖不足**，SIS 会自然变保守；
4. **如果系统 mismatch 很强**，SIS 可和 R3 等系统修复组合。

这个视角比单纯设计新的 clipping 函数更清楚，因为它解释了哪些 token 可以放心用、哪些 token 仍需 correction。

### 证据边界

| 边界 | 为什么重要 |
| --- | --- |
| 任务范围 | 主实验集中在数学和检索式 agent QA，不等于覆盖所有 alignment preference 数据 |
| 模型范围 | Qwen3 和 Llama-3.2 证明一定泛化，但还缺少更多闭源/多模态/长对话系统 |
| 安全目标 | 论文标题说 improving alignment，但实验指标主要是任务准确率和训练稳定性，不是安全偏好或拒答质量 |
| top-K 假设 | 如果当前策略概率质量大量落在旧策略 top-K 外，accepted distribution 的 TV 误差会增大 |
| 工程依赖 | 需要缓存或重算 old/current logits；大规模异步系统里日志一致性是前提 |
| 随机验收 | rejection sampling 引入额外随机性，实际实现需要控制种子、并行一致性和统计方差 |

### 对后训练研究的延伸问题

1. **SIS 能否用于偏好优化？**  
   DPO/IPO/KTO 这类离线偏好方法没有 rollout-then-update 的同样结构，但也有 reference/current policy ratio。值得问：token-level distribution conversion 是否能用于偏好对里的 response token？

2. **SIS 能否和 process reward 结合？**  
   数学推理里 accepted token 多为 reasoning token。如果 process reward 能标出高价值步骤，SIS 的验收变量 `z_t` 是否可以和 step-level credit assignment 结合？

3. **agent 轨迹里的 tool token 怎么处理？**  
   论文显示 agentic search 接受率更低。工具调用 token 可能不是普通语言 token，而是 schema、URL、检索 query 或环境动作。SIS 对这些 token 的验收是否需要结构化 envelope？

4. **安全后训练里的 tail risk 是否会被 accepted token 掩盖？**  
   如果少数高风险 token 在 top-K 内被验收，权重置 1 是否可能弱化对危险偏移的惩罚？这需要用安全 reward 和红队数据单独检验。

5. **异步集群里如何定义 `pi_old`？**  
   真实系统可能同时存在多个 rollout worker、多个 checkpoint、partial update。SIS 需要精确知道 token 来自哪个 behavior policy，否则 ratio 解释会混乱。

## 最后判断

SIS 这篇论文最值得带走的不是“又一个让 AIME 分数涨几点的 trick”，而是一个更干净的后训练问题表述：

> off-policy token 不一定只能被 clip、mask 或丢弃；其中一部分可以通过 token-level rejection sampling 被重新认证为当前策略样本。

这个表述把工程吞吐、理论误差和训练稳定性连了起来：

1. 工程上，它允许 rollout 复用继续存在；
2. 理论上，它直接降低 `sum |log w_t|`；
3. 实验上，它在 dense、MoE、math、agent、GRPO、DAPO、GSPO 上都有平均收益；
4. 局限上，它仍依赖 logits 一致性、top-K 覆盖和任务分布，不能替代新鲜 rollout 或真实安全评测。

如果后训练继续走向更长 reasoning、更重工具调用、更异步的 rollout 系统，SIS 这类“ratio 之前先做分布认证”的方法会越来越重要。它提醒研究者：稳定 RL 不只是把梯度压小，也可以先问一个更基础的问题——这个 token 到底还算不算当前策略会生成的 token？

## 进一步细读：把 SIS 放回一次真实训练循环

### 一次 rollout 周期里，SIS 到底改变了哪个环节？

可以把常见 RL 后训练循环拆成五步：

1. **采样**：rollout worker 用旧参数生成 `G` 条回答；
2. **打分**：reward 或规则判定给出每条回答的 advantage；
3. **重放**：trainer 在同一批回答上执行一次或多次 mini-batch update；
4. **修正**：因为回答来自旧策略，需要 `w_t` 或 `s_i` 这类 ratio；
5. **稳定**：为了不让 ratio 失控，GRPO/DAPO/GSPO 再做 clip 或序列平滑。

SIS 插入在第 4 步之前：

| 环节 | 没有 SIS | 加入 SIS |
| --- | --- | --- |
| token 来源 | 全部视为旧策略 token | 先判断哪些旧 token 可条件化为当前策略 token |
| ratio 使用 | 所有 token 都进入 `g(w)` | accepted token 直接设为 1，rejected token 才进入 `g(w)` |
| clip 角色 | 主要稳定器 | 只处理没被验收的残余 off-policy token |
| 梯度信号 | 大 ratio 可能被压扁 | accepted token 不被压扁，rejected token 仍受保护 |
| 理论变量 | `D = sum |log w_t|` | `D_SIS` 删除 accepted token 的 log-ratio 贡献 |

这也是为什么论文反复强调 plug-in：SIS 没有重新定义 reward，也没有要求新环境或新 benchmark；它只是在训练 loss 读 ratio 之前，先做一次“分布来源审计”。

### 为什么 accepted token 不会引入偏差？

这里最容易误解。SIS 不是说“这个 token 的概率看起来差不多，所以设成 1”。它实际使用了 rejection sampling 的条件分布性质：

```text
old policy q(v) = pi_old(v | prefix)
target policy p(v) = pi_theta(v | prefix)
envelope M >= max_v p(v)/q(v)
accept probability a(v) = p(v) / (M q(v))
```

当我们只看被接受的样本时：

```text
P(v | accepted)
  = P(accepted | v) q(v) / P(accepted)
  = [p(v)/(M q(v)) q(v)] / [1/M]
  = p(v)
```

这个推导的重点是分母里的 `q(v)` 被抵消了。只要 envelope 合法，accepted set 的条件分布就是目标策略。SIS 因此不是经验性地“宽容旧 token”，而是在采样论意义上把一部分旧 token 转换成目标分布 token。

### top-K 近似带来的偏差如何理解？

完整 envelope 要看整个词表，但 LLM 词表很大。SIS 用旧策略 top-K，当 token 不在 `V_K` 里时直接拒绝，这会产生一个截断版目标分布：

```text
pi_hat_theta(v) = pi_theta(v) / sum_{u in V_K} pi_theta(u), if v in V_K
pi_hat_theta(v) = 0, otherwise
```

因此误差只来自当前策略落在 `V_K` 外的概率质量：

```text
D_TV(pi_hat_theta, pi_theta) = xi_K
xi_K = sum_{v notin V_K} pi_theta(v)
```

这个结论有两个实践含义：

1. **当旧策略和当前策略接近时**，top-K 重叠高，SIS 的近似很紧；
2. **当策略漂移过大时**，集合外质量上升，SIS 自动拒绝更多 token，而不是盲目置 1；
3. **当任务 token 分布更开放时**，例如检索 query、网页片段、工具参数，接受率下降是合理信号；
4. **当系统缓存 top-K logits 不完整时**，应把 SIS 当保守修正，而不是强行把所有 token on-policy 化。

### 如何读“agentic search 提升较小”？

论文把 agentic search 放进主实验很有价值，因为它比纯数学更接近工具型 LLM 后训练：

| 差异 | 数学推理 | agentic search |
| --- | --- | --- |
| token 分布 | 公式、数字、推理连接词更集中 | query、实体、网页片段、答案格式更分散 |
| prefix 稳定性 | 同题多回答共享较强结构 | 检索结果会改变后续上下文 |
| off-policy 来源 | 主要来自参数更新和 rollout 复用 | 还来自工具调用路径和外部文本 |
| 接受率 | 较高 | 较低 |
| SIS 收益 | 数学平均提升更大 | agent 平均提升更温和但稳定 |

这不削弱 SIS，反而说明它没有过度乐观。一个严肃的 on-policy certificate 应该在分布更散时变得保守。对 Agent 后训练来说，后续研究可以把工具调用拆成几类 token：

1. **自然语言 reasoning token**：适合当前 SIS；
2. **检索 query token**：需要考虑 query 语义等价，而非只看表面 token；
3. **工具 schema token**：可能应按结构字段验收；
4. **外部观察 token**：通常不是模型采样结果，不应直接进入同一 ratio 机制。

### 消融结果背后的失败模式

SIS 的失败边界可以从论文消融反向读出来：

| 消融/压力测试 | 如果 SIS 失败，可能说明什么 |
| --- | --- |
| `N=16` stale rollout | 当前策略已经远离旧策略，top-K 交集下降，accepted token 不足 |
| MoE routing mismatch | ratio 偏差不只来自策略更新，还来自 engine 路由不一致 |
| no clipping | 如果无 clip 下仍崩，说明 rejected token 的残余 ratio 还太不稳定 |
| K sweep | 如果 K 极敏感，说明概率质量不集中或旧/新策略 top-K 排序错位 |
| agent word cloud | 如果 rejected token 主要是关键动作 token，SIS 可能错过任务成功所需梯度 |

这些失败模式也给出实现建议：

1. 记录每批训练的 accept rate，而不是只看最终 accuracy；
2. 分开统计自然语言、代码、工具调用、结构化字段的 accept rate；
3. 对 MoE 模型同时记录 expert routing mismatch；
4. 对长轨迹按位置画 `D_SIS / D`，看误差削减集中在开头还是结尾；
5. 对安全任务单独检查高风险 token 是否被系统性 accepted 或 rejected。
6. 对每个阶段保留可复查样本，确认 accepted token 服务于正确推理，而不是只因概率高就被误判为安全可靠；这一步尤其适合用于安全后训练审计。

### 为什么它对 alignment 仍需谨慎命名？

论文标题里有 improving LLM alignment，但从证据结构看，它更直接证明的是：

| 已证明较强 | 证明较弱 |
| --- | --- |
| off-policy correction 更稳定 | 人类价值对齐更好 |
| 数学和检索 agent benchmark 更高 | 安全拒答更可靠 |
| MoE mismatch 下训练不易崩 | 长期部署风险更低 |
| ratio 误差界更紧 | reward misspecification 被解决 |

这并不是缺点，而是边界要讲清楚。SIS 处理的是“给定 reward 和 rollout 数据后，如何更可靠地做 policy update”。如果 reward 本身奖励了错误行为，SIS 可能让错误学习更稳定。因此在 AI 安全或偏好对齐场景中，SIS 必须和 reward auditing、数据覆盖、红队样本、分布外评测一起看。

### 与近期后训练趋势的连接

把 SIS 放到 2026 年后训练方法谱系里，它对应的是一个正在变清楚的主题：**训练稳定性不再只是 optimizer 问题，而是 rollout 系统、策略分布和 token 级证据共同决定的问题**。

| 趋势 | SIS 给出的回答 |
| --- | --- |
| 更长 reasoning | 用 `D = sum |log w_t|` 解释长序列 ratio 累积风险 |
| 更高 rollout 吞吐 | 允许复用旧样本，但用 rejection certificate 降低偏差 |
| 更多 MoE 模型 | 与 R3 互补处理 routing mismatch |
| 更多 Agent RL | 在 agentic search 中显示保守但正向收益 |
| 更多算法 trick | 把 GRPO/DAPO/GSPO/CISPO 等统一到 `g(w)` 视角 |

如果未来的后训练框架内置 SIS 类机制，最有价值的产物可能不是某个固定超参数，而是一组新的 observability 指标：

1. accepted token ratio；
2. rejected token 的平均 `|log w_t|`；
3. `D_SIS / D`；
4. top-K residual mass；
5. agent 工具 token 的分类 accept rate；
6. accepted token 对最终 reward gain 的贡献。

这些指标能让研究者更早发现“训练看似稳定，但其实只是在 clip 掉大量有效梯度”或“任务分数上涨，但高风险 token 的 ratio 没被正确处理”。
