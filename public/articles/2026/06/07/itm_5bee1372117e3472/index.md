# TrOPD：把 On-Policy Distillation 的不稳定性拆到 token 级信任区域

> 研究者精读 · TrOPD 不是简单把 OPD 换一个 KL，而是把 student rollout 中每个 token 按 teacher/student 分布一致性分区：可信区域继续用低显存 RKL，异常区域改用 teacher top-k FKL，再用 teacher prefix 帮助早期训练进入更好的 on-policy 状态。

| 字段 | 内容 |
|---|---|
| 论文原题 | Trust Region On-Policy Distillation |
| 作者 | Xingrun Xing, Haoqing Wang, Boyan Gao, Ziheng Li, Yehui Tang |
| 机构 | Samsung Research Beijing, University of Oxford, Peking University |
| arXiv | [2606.01249](https://arxiv.org/abs/2606.01249), v1 submitted 2026-05-31, v2 revised 2026-06-03 |
| 项目 | [Xingrun-Xing2/TrOPD](https://github.com/Xingrun-Xing2/TrOPD/tree/main) |

## TL;DR：这篇论文真正说了什么

TrOPD 研究 reasoning-oriented On-Policy Distillation 的稳定训练问题。Off-policy distillation 让学生模仿 teacher 生成的轨迹，容易在长链路推理里产生 exposure bias；OPD 改为在 student 自己生成的轨迹上训练，但当 teacher 与 student 分布差异较大时，teacher 会给某些 student token 极低概率，基于 `K1` reverse-KL 的 token reward 会变成极端负值，从而制造异常策略梯度。

论文的核心方案是 token-level trust region。对 student 生成的 token `x`，用 `P_trust(x)=min(pi_T(x)/pi_S(x),1)` 衡量 teacher 对该 token 的相对支持度。trust region 内继续用 memory-efficient `K1` reverse-KL；outlier region 内不再沿用 student-sampled RKL 梯度，而改用 teacher top-k forward-KL 近似，回收 teacher 支持 token 的监督。训练早期还加入 teacher-prefix off-policy guidance：teacher 先生成一段 prefix，student 接着写，prefix 长度按 cosine schedule 退火到 0。

实验上，TrOPD 在 DeepSeek-R1-Distill-Qwen-1.5B 和 Qwen3-SFT-1.7B 两类 student、数学/代码/STEM/指令多域 benchmark 上优于 OPD、EOPD、Entropy OPD、REOPOLD 等 OPD-family baseline。Qwen3 多域设置中，平均分从 OPD 的 48.29 提升到 51.73；DeepSeek 单域设置中，从 OPD 的 37.11 提升到 40.63。最关键反例是 standalone top-k FKL 几乎崩溃到 Avg 1.40，但只在 outlier 区域使用 FKL Outlier 可到 Avg 49.00，叠加 guidance 的 TrOPD FKL 达到 Avg 49.85。

## 研究问题：作者为什么要写这篇论文

Reasoning model 蒸馏的痛点是长轨迹。传统 sequence-level KD 让 teacher 先生成完整答案，再让 student 学这些 teacher trajectories；部署时 student 生成自己的中间步骤，一旦偏离 teacher 分布，后续监督就变弱，错误会沿 chain-of-thought 积累。

OPD 的想法是训练时就让 student 采样自己的 trajectories，再用 teacher 给这些 token 或 trajectory 打监督信号。这样训练分布更接近推理分布，但引入了新问题：teacher 不一定能对 student 的所有 token 给出可靠监督。尤其 student 早期能力弱时，会采到 teacher 几乎不支持的 token，导致 `log(pi_T(x)/pi_S(x))` 极端为负，policy-gradient signal 不稳定。

所以作者真正问的是：student 当前采样的 token 是否处在 teacher 能给出可信监督的区域？如果不可信，应该 clip、mask，还是换一种估计器？TrOPD 的答案是先按 teacher/student agreement 做区域划分，再对不同区域使用不同 KL 估计，并通过 teacher prefix 改善训练早期的 rollout 质量。

## 论文主张与论证路线

| claim | mechanism | evidence | boundary |
|---|---|---|---|
| vanilla OPD 的不稳定来自 token-level teacher/student mismatch | 当 `pi_T(x) << pi_S(x)` 时，`K1` RKL reward 极端负，梯度异常 | Figure 3(b) 显示 Mask/Clip 的 gradient norm 低于 OPD | 论文缺少具体 bad trajectory 与 token 错误类型分析 |
| trust region 可以区分可靠监督与异常 token | `P_trust=min(pi_T/pi_S,1)`，再采样 `M_x ~ Bernoulli(P_trust)` | Mask/Clip Outlier 都比 OPD 有提升，说明 outlier 抑制有效 | trust region 是启发式分布一致性代理，不是正确性证明 |
| outlier 区不应简单丢弃全部 teacher 信号 | outlier 区使用 teacher top-k FKL，而不是继续 student-sampled RKL | FKL Outlier Avg 49.00，高于 Mask 47.72 和 Clip 47.86 | standalone top-k FKL 崩到 Avg 1.40，说明 FKL 不能全局替代 OPD |
| teacher-prefix guidance 能改善早期 on-policy 数据质量 | teacher 生成 prefix，student continuation，prefix 长度 cosine 退火到 0 | TrOPD FKL 达到 Avg 49.85，高于 FKL Outlier 49.00 | beta、prefix schedule、teacher-student gap 缺少系统敏感性 |
| TrOPD 是 OPD-family 稳定化组件，而非后训练全局答案 | 可与 AOPD 叠加 | TrOPD + AOPD Avg 41.67，高于 AOPD 39.79 与 TrOPD 40.63 | 缺少 RLVR/GRPO/PPO/SFT-only 等更广义强基线 |

## 方法机制：输入、状态、模块与目标函数

TrOPD 的输入包括 prompt、student policy `pi_S`、teacher policy `pi_T`、最大生成长度、teacher top-k 大小 `k=64`、off-policy imitation weight `beta=0.001`，以及 prefix annealing schedule。训练状态包括 student rollout tokens、每个 token 的 teacher/student log probability、trust mask、outlier mask、teacher top-k distribution 和 prefix 长度。

基础 OPD 目标来自 reverse KL：

$$
D_{KL}(\pi_S || \pi_T)
=
\mathbb{E}_{x \sim \pi_S}
\left[
\log \frac{\pi_S(x)}{\pi_T(x)}
\right]
$$

训练时常等价最大化：

$$
\log \frac{\pi_T(x)}{\pi_S(x)}
$$

当 `pi_T(x)` 接近 0 时，论文指出 `K1` estimator 的 policy-gradient signal 可能趋向极端：

$$
\nabla J
=
\frac{1}{\pi_S(x)}
\log \frac{\pi_T(x)}{\pi_S(x)}
\rightarrow -\infty
$$

full-vocabulary KL 对 reasoning model 很昂贵。若序列长度为 `n`，词表大小为 `k_vocab`，复杂度约为：

$$
\mathcal{O}(n \cdot k_{vocab})
$$

TrOPD 因此保留 sampled-token RKL 的低显存优势，只在 outlier 区域引入 teacher top-k FKL，复杂度约为 `O(nk)`，其中 `k=64`。

## 算法流程、公式与伪代码

Trust probability 定义为：

$$
P_{trust}(x)
=
\min
\left(
\frac{\pi_T(x)}{\pi_S(x)}, 1
\right)
$$

并采样 trust mask：

$$
M_x \sim Bernoulli(P_{trust}(x))
$$

on-policy 分区目标可整理为：

$$
J_x^{On}
=
- M_x \log \frac{\pi_S}{\pi_T}
- \bar{M}_x
\sum_{v \in V_T^k}
\pi_{T,v}
\log \frac{\pi_{T,v}}{\pi_{S,v}}
$$

teacher-prefix guidance 的整体目标为：

$$
J_x
=
- \beta
KL_{x[:l] \sim \pi_T}
(\pi_T || \pi_S)
+
J_{x[l:]}^{On}
$$

```text
Algorithm TrOPD(prompt batch P, student pi_S, teacher pi_T)
Input:
  P: prompt batch
  pi_S: student policy
  pi_T: teacher policy
  k: teacher top-k size, default 64
  beta: off-policy guidance weight, default 0.001
  L_schedule: cosine schedule for teacher prefix length

State:
  step <- current training step
  l <- L_schedule(step)
  loss <- 0
  diagnostics <- {outlier_ratio, gradient_norm, entropy}

For each prompt p in P:
  If l > 0:
      prefix <- TeacherGenerate(pi_T, p, length=l)
      continuation <- StudentGenerate(pi_S, p + prefix)
      Add beta-weighted FKL imitation loss on prefix
  Else:
      prefix <- empty
      continuation <- StudentGenerate(pi_S, p)

  For each token x_t in continuation:
      pS <- pi_S(x_t | context)
      pT <- pi_T(x_t | context)
      P_trust <- min(pT / pS, 1)
      M_t <- Bernoulli(P_trust)

      If M_t == 1:
          Add sampled-token RKL/K1 loss:
              loss <- loss - log(pT / pS)
      Else:
          V_T^k <- top-k tokens under pi_T at current context
          If pi_S assigns near-zero mass to V_T^k:
              mark failure boundary: numerical FKL instability
              apply implementation safeguard such as epsilon floor
          Add teacher top-k FKL loss:
              loss <- loss - sum_{v in V_T^k} pi_T(v) log(pi_T(v) / pi_S(v))

  Update diagnostics with token masks, entropy, and gradient norm

If outlier_ratio is extremely high for many steps:
  mark failure boundary: student rollout too far from teacher support

Backpropagate loss and update pi_S

Output:
  updated student pi_S
  diagnostics for trust-region and outlier behavior
```

这个伪代码把论文的失败边界显式化：如果 student 长期远离 teacher 支持区域，trust region 会过窄；如果 teacher top-k token 在 student 下概率近零，outlier FKL 需要数值保护；如果 teacher 本身错误，trust mask 也可能强化错误模式。

## 实验设置：数据、模型、指标与评测协议

论文有三组 teacher-student 配置。单数学域使用 DeepSeek-R1-Distill-Qwen-1.5B 作为 student，Skywork-OR1-Math-7B 作为 teacher。多域设置一仍用 DeepSeek-R1-Distill-Qwen-1.5B 作为 student，teacher 为 Skywork-OR1-7B。多域设置二使用 Qwen3-SFT-1.7B 作为 student，Qwen3-Nemotron-4B 作为 teacher。

Qwen3-Nemotron-4B teacher 初始化自 Qwen3-4B-Base；SFT 数据为 Nemotron 3 Nano 公开数据，清理后约 14M samples；SFT 设置包括 Adam、learning rate `5e-5`、weight decay `0.1`、warmup `10%`、batch size `512`。RLVR 数据包括 math 22,056、coding 19,169、science 19,670、instruction 16,575；RLVR 设置包括 GRPO group size `16`、batch `128`、每 2048 rollouts 更新、max length `32K`、temperature `1.0`。

统一 OPD 训练设置为 200 steps、learning rate `5e-6`、teacher top-k `k=64`、`beta=0.001`、prompt batch size 128、每个 prompt 4 个 rollouts、max generation length 8096 tokens。AIME evaluation 使用 32 次评估平均 accuracy。

Benchmark 覆盖数学、代码、STEM 和指令遵循：AIME 2024、AIME 2025、AMC 2023、LiveCodeBench v6、GPQA Diamond、MMLU-Redux v2、IFBench。Baseline 包括 base student、teacher、OPD、EOPD、Entropy OPD、REOPOLD / REOPOLD 2Stage、FKL、JSD、Clip Outlier、Mask Outlier、FKL Outlier、AOPD、TrOPD + AOPD。

## 主结果：哪些结论被数据支持

DeepSeek 1.5B 单数学域中，Base Avg 为 34.69，OPD 为 37.11，REOPOLD 为 38.79，TrOPD 为 40.63，相比 OPD 提升 +3.52。TrOPD 分项为 AIME24 38.54、AIME25 32.50、AMC23 77.03、LiveCodeBench v6 18.86、GPQA Diamond 36.24。

DeepSeek 1.5B 多域中，OPD Avg 为 32.99，REOPOLD 为 35.58，TrOPD 为 37.61，相比 OPD 提升 +4.62。这里 OPD 甚至低于 base average，说明 naive OPD 在 domain shift 下可能伤害已有能力。

Qwen3-SFT-1.7B 多域是论文最强主结果。Base Avg 为 39.87，OPD 为 48.29，EOPD 为 48.86，Entropy OPD 为 48.10，REOPOLD 为 48.56，TrOPD 达到 51.73。分项上，TrOPD 在 AIME24 52.08、AIME25 44.06、AMC23 83.04、GPQA 35.98、MMLU-Redux 68.74、IFBench 42.18、LiveCodeBench v6 36.00。它相比 OPD 平均 +3.44，相比 REOPOLD +3.17，并在 math、STEM、instruction、code 上都有提升。

需要同时看到 teacher-student 差距。DeepSeek 单域 teacher Avg 58.48，TrOPD 40.63，差 17.85；DeepSeek 多域 teacher 58.80，TrOPD 37.61，差 21.19；Qwen3 多域 teacher 73.43，TrOPD 51.73，差 21.70。TrOPD 提升了 OPD 稳定性，但没有把小模型蒸馏到 teacher 水平。

## 消融、失败案例与反例

Table 1 是最关键消融。OPD (RKL) 在 AIME24/AIME25/AMC23 上 Avg 46.79。Standalone top-k FKL 在 AIME24 和 AIME25 都是 0.00，AMC23 只有 4.21，Avg 1.40，几乎训练失败。JSD Avg 47.90，Entropy OPD 20% 为 46.13，Clip Outlier 为 47.86，Mask Outlier 为 47.72，FKL Outlier 为 49.00，TrOPD 为 49.85。

这个反例非常重要：teacher top-k FKL 不能粗暴替代全局 OPD 目标。FKL 作为 standalone objective 会失败，但只在 outlier 区域承担“恢复 teacher 支持 token 信息”的局部角色时，反而优于 mask/clip。

Outlier objective 与 off-policy guidance 的消融显示，三类 guidance variant 都有收益：TrOPD Mask Avg 48.79，TrOPD Clip 48.73，TrOPD FKL 49.85。说明 teacher-prefix guidance 与 outlier objective 互补。

与 AOPD 的叠加也说明机制不完全重合。OPD Avg 37.11，AOPD 39.79，TrOPD 40.63，TrOPD + AOPD 41.67。OPD 稳定化可能同时涉及 token supervision reliability、positive sample selection、teacher prefix / behavior blending、reward variance reduction 和 calibration。

## Figure / Table 逐项证据解读

Figure 1 的证据功能是给出跨域收益的视觉摘要。它展示 TrOPD、OPD、REOPOLD 与 Qwen3-1.7B 在 AIME25、LiveCodeBench、IFBench、GPQA 上的差异，说明提升不是单一数学 benchmark 的偶然结果。但它不是全模型全任务结论，也没有给出置信区间。

Figure 2 的证据功能是解释机制分区。上半部分是 on-policy trust region：student token 被分成 trust region 与 outlier；下半部分是 off-policy guidance：teacher draft prefix 提供早期路径，student 再 continuation。读图时关键是 KL 的位置不同，而不是“用了两个 KL”。

Figure 3(a) 比较 entropy，支持作者关于 Mask Outlier 保留更高 policy entropy、维持探索能力的解释。Figure 3(b) 比较 gradient norm，显示 Mask/Clip 低于 OPD，支持“outlier token 会造成异常梯度”的问题诊断。

Table 1 的证据功能是展示 objective 选择的反例结构：standalone FKL 失败，outlier-only FKL 成功。Table 3/4 的功能是展示 DeepSeek 与 Qwen3 两类 student 的主结果，Table 5 则证明 TrOPD 与 AOPD 可叠加。

## 相关工作与位置判断

TrOPD 位于 OPD-family 的稳定化路线。Sequence-level KD 使用 teacher generations，主要问题是 exposure bias；full-vocab OPD / GKD 使用 student generations 加 full KL/JSD，但长 reasoning 显存开销高；REOPOLD 使用 reward clipping，但阈值敏感；Entropy OPD / EOPD 使用高熵 token selection，但普通 token 也可能有监督价值；AOPD 强调 positive samples 和 objective 增强，与 TrOPD 的 trust-region 分区不同。

同类方向在 2026 年很密集，例如 Trust-Region Behavior Blending for On-Policy Distillation、KL for a KL、Extreme Region Policy Distillation、The Illusion of Certainty。这说明 OPD 研究重点正在从“是否用 student rollouts”转向更细的问题：哪些 token 值得信任，teacher 在哪些区域给出的监督有效，如何避免 token-level estimator 的方差和偏差，训练早期如何从 off-policy 逐步过渡到 fully on-policy。

TrOPD 的位置不是替代 RLVR，而是可能作为 SFT 与 RLVR 之间的稳定蒸馏组件，或作为 RL 前的 teacher-guided warmup。它给小 reasoning model 后训练提供的是更稳的 distribution alignment，而不是完整的 verifier-based reasoning optimization。

## 证据边界、局限与可复现性

第一，`P_trust=min(pi_T/pi_S,1)` 衡量的是 teacher 对 student token 的相对支持度，不是答案正确性验证器、过程 reward model、formal safety guarantee，也不是 TRPO 式严格策略改进区域。它是 token-level supervision reliability 的启发式代理。

第二，实验证据强在 OPD-family 内部比较，但缺少 RLVR/GRPO/PPO/SFT-only continued training 等更广义后训练强基线。消融主要集中在 math-domain distillation，top-k、beta、prefix annealing、teacher-student gap、training steps 的敏感性还不充分。

第三，AIME 等报告 32 次评估平均，但没有训练多 seed 或置信区间。小幅提升需要后续复现确认。论文也缺少具体 bad trajectory、outlier token 类型和错误推理路径分析。

第四，可复现性目前有限。项目 README 仍把 Release Huggingface models、Training and evaluation code、Demos and applications 标为 ToDo。因此当前只能说发布了技术报告与项目页，不能说模型和训练代码已经完整开源。

## 领域延伸思考：它改变了什么问题

TrOPD 对后训练研究的改变，是把 OPD 的不稳定性从“KL objective 选哪个”细化为“在哪些 token 区域使用哪种监督估计器”。这对 on-policy distillation 很关键，因为 student rollout 并不是均匀可信的：有些 token 处在 teacher 支持区域，可以用 sampled RKL；有些 token 已经偏离 teacher 分布，继续用 RKL 只会放大异常梯度。

对 reasoning model 稳定性而言，TrOPD 给出三个可迁移监控量：outlier token ratio、trust-region loss / gradient norm、policy entropy。若一个后训练管线只看最终 benchmark 分数，很难判断模型是稳定靠近 teacher distribution，还是短期调参获得局部优势。真正值得复现的是训练曲线：outlier ratio 是否下降，gradient norm 是否低于 vanilla OPD，entropy 是否过早 collapse，teacher prefix 是否平滑退火。

对小模型部署而言，TrOPD 的意义是降低 teacher 昂贵、student 便宜的蒸馏失败率。它不消除容量差距，也不保证事实性或安全性，但可能让端侧 reasoning assistant、coding assistant 小模型、企业内部多域问答模型在进入 RLVR/GRPO 前获得更稳定的 teacher-aligned reasoning distribution。

打开原文：[arXiv:2606.01249](https://arxiv.org/abs/2606.01249)
