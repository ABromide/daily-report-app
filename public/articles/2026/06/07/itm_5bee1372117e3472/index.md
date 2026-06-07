# TrOPD：把 On-Policy Distillation 的不稳定拆到 token 级

> 研究者精读 · TrOPD 的重点不是“换一种 KL 就更好”，而是区分 student token 是否处在 teacher 支持区域：可信 token 用低成本 reverse-KL，outlier token 改用 teacher top-k forward-KL，并用 teacher prefix 稳住早期 rollout。

| 字段 | 内容 |
|---|---|
| 论文 | [Trust Region On-Policy Distillation](https://arxiv.org/abs/2606.01249) |
| 作者 | Xingrun Xing, Haoqing Wang, Boyan Gao, Ziheng Li, Yehui Tang |
| 机构 | Samsung Research Beijing, University of Oxford, Peking University |
| 版本 | arXiv v1: 2026-05-31；v2: 2026-06-03 |
| 项目 | [Xingrun-Xing2/TrOPD](https://github.com/Xingrun-Xing2/TrOPD/tree/main) |
| 领域 | reasoning model distillation、on-policy distillation、post-training stability |

## 一句话结论

TrOPD 研究 reasoning-oriented On-Policy Distillation 的训练不稳定。vanilla OPD 让 student 在自己的 rollout 上学习 teacher 信号，能缓解 off-policy imitation 的 exposure bias；但如果 student 采到 teacher 几乎不支持的 token，`K1` reverse-KL 的 token reward 会产生极端负梯度。

论文的解决方案是：

- 用 `P_trust(x)=min(pi_T(x)/pi_S(x), 1)` 判断 student token 是否在 teacher 支持区域；
- trust region 内继续用 sampled-token RKL，保持低显存；
- outlier region 内改用 teacher top-k FKL，回收 teacher 支持 token 的监督；
- 训练早期让 teacher 先写 prefix、student continuation，并按 schedule 退火到 fully on-policy。

主结果上，TrOPD 在 DeepSeek-R1-Distill-Qwen-1.5B 和 Qwen3-SFT-1.7B 上都优于 OPD-family baseline。Qwen3 多域平均从 OPD 48.29 提到 51.73；DeepSeek 单数学域从 OPD 37.11 提到 40.63。

## 研究问题

Reasoning distillation 有两个经典方向：

- **Off-policy KD**：teacher 生成完整轨迹，student 学 teacher trajectory。问题是部署时 student 会走自己的轨迹，偏离后监督变弱。
- **On-policy distillation**：student 生成自己的轨迹，teacher 给这些 token 或 trajectory 评分。问题是 student 早期会采到 teacher 不支持的 token，监督信号可能变得极端。

TrOPD 追问的不是“RKL 还是 FKL 更好”，而是：

1. student 当前 token 是否值得 teacher 用 sampled-token RKL 监督？
2. 如果 student token 已经偏离 teacher support，要丢掉、clip，还是换 estimator？
3. 训练早期 student rollout 太差时，如何让它进入可学习区域？

## 方法机制

### 1. Token-level trust region

对 student 生成的 token `x`，计算：

```text
P_trust(x) = min(pi_T(x) / pi_S(x), 1)
```

直觉：

- 如果 teacher 对这个 token 的概率不低于 student，说明 teacher 支持它，监督可信。
- 如果 teacher 概率远低于 student，说明这个 token 可能是 outlier，继续用 RKL 容易产生异常负梯度。

### 2. Trust region 内：继续用 sampled RKL

RKL 的优点是便宜。它只需要 student rollout token 上的 teacher/student logprob，不需要完整 vocabulary。

它的问题在 outlier 上暴露：

```text
log(pi_T(x) / pi_S(x)) 很小甚至趋向 -infinity
```

这会让 policy gradient 出现异常大负信号。

### 3. Outlier 区：teacher top-k FKL

在 outlier token 上，TrOPD 不再沿着 student 采样 token 做 RKL，而是取 teacher top-k token distribution，用局部 FKL 让 student 回到 teacher support 附近。

这里的关键是“局部使用 FKL”。论文的反例显示，standalone top-k FKL 几乎崩溃；只有在 outlier region 用它，才起到修正偏离的作用。

### 4. Teacher-prefix off-policy guidance

训练早期 student 太弱，on-policy rollout 质量可能低。TrOPD 让 teacher 先生成一段 prefix，student 接着生成 continuation。prefix 长度按 schedule 逐步退火到 0。

这个设计不是回到纯 off-policy KD，而是让训练从更可学的状态分布开始，再逐步过渡到 fully on-policy。

## 伪代码

```text
For each prompt:
  l = prefix_length_schedule(step)

  if l > 0:
    prefix = teacher.generate(prompt, length=l)
    continuation = student.generate(prompt + prefix)
    add beta-weighted teacher-prefix imitation loss
  else:
    continuation = student.generate(prompt)

  for token x in continuation:
    pS = pi_S(x | context)
    pT = pi_T(x | context)
    p_trust = min(pT / pS, 1)
    M = Bernoulli(p_trust)

    if M == 1:
      apply sampled-token RKL / K1 loss
    else:
      get teacher top-k distribution
      apply top-k FKL loss on teacher-supported tokens

  update student
```

## 实验设置

### 模型配置

| 配置 | Student | Teacher | 任务 |
|---|---|---|---|
| 单数学域 | DeepSeek-R1-Distill-Qwen-1.5B | Skywork-OR1-Math-7B | math-focused |
| 多域 1 | DeepSeek-R1-Distill-Qwen-1.5B | Skywork-OR1-7B | math / code / STEM / instruction |
| 多域 2 | Qwen3-SFT-1.7B | Qwen3-Nemotron-4B | math / code / STEM / instruction |

### 训练设置

- OPD training steps：200；
- learning rate：`5e-6`；
- teacher top-k：`k=64`；
- off-policy guidance weight：`beta=0.001`；
- prompt batch size：128；
- rollouts per prompt：4；
- max generation length：8096 tokens；
- AIME evaluation：32 次评估平均。

### Benchmark

- AIME 2024；
- AIME 2025；
- AMC 2023；
- LiveCodeBench v6；
- GPQA Diamond；
- MMLU-Redux v2；
- IFBench。

## 主结果

### DeepSeek 1.5B 单数学域

| 方法 | Avg | 结论 |
|---|---:|---|
| Base | 34.69 | 未经 OPD |
| OPD | 37.11 | 有提升但不稳定 |
| REOPOLD | 38.79 | clipping 有帮助 |
| TrOPD | 40.63 | 相比 OPD +3.52 |

TrOPD 仍远低于 teacher 58.48，说明它提升的是蒸馏稳定性，不是消除容量差距。

### DeepSeek 1.5B 多域

| 方法 | Avg | 解读 |
|---|---:|---|
| Base | 高于 OPD | naive OPD 可能伤害已有能力 |
| OPD | 32.99 | 多域下不稳定更明显 |
| REOPOLD | 35.58 | clipping 改善 |
| TrOPD | 37.61 | 相比 OPD +4.62 |

这组结果说明 TrOPD 的价值不是只在数学题上，而是在 teacher/student 分布错配更复杂时更明显。

### Qwen3-SFT-1.7B 多域

| 方法 | Avg |
|---|---:|
| Base | 39.87 |
| OPD | 48.29 |
| EOPD | 48.86 |
| Entropy OPD | 48.10 |
| REOPOLD | 48.56 |
| TrOPD | 51.73 |

这组是论文最强结果。TrOPD 在 AIME、AMC、GPQA、MMLU-Redux、IFBench、LiveCodeBench 上都给出跨域提升。

## 消融与反例

### 1. Standalone FKL 几乎失败

Table 1 里最重要的反例是：

| Objective | Avg |
|---|---:|
| OPD / RKL | 46.79 |
| standalone top-k FKL | 1.40 |
| JSD | 47.90 |
| Mask Outlier | 47.72 |
| Clip Outlier | 47.86 |
| FKL Outlier | 49.00 |
| TrOPD FKL | 49.85 |

这说明 FKL 不能粗暴替代 OPD。它只有在 outlier region 作为局部纠偏项时有效。

### 2. Mask / Clip 有用，但会浪费 teacher 信号

Mask Outlier 和 Clip Outlier 都能降低异常梯度，但它们对 outlier token 的处理更像“减少伤害”。FKL Outlier 则尝试把 teacher top-k 支持 token 重新提供给 student，因此比 mask/clip 更强。

### 3. Teacher-prefix guidance 与 outlier objective 互补

TrOPD Mask、TrOPD Clip、TrOPD FKL 都比各自无 guidance 版本更好。说明早期 rollout bootstrap 是独立收益来源。

### 4. 与 AOPD 可叠加

| 方法 | Avg |
|---|---:|
| OPD | 37.11 |
| AOPD | 39.79 |
| TrOPD | 40.63 |
| TrOPD + AOPD | 41.67 |

这说明 TrOPD 解决的是 token supervision reliability，AOPD 解决的是另一部分 sample / objective 问题。

## 图表怎么读

### Figure 1：跨 benchmark 摘要

它说明 TrOPD 的提升不是单一数学集上的偶然。但图里没有置信区间，也不是多 seed 统计，所以小幅差距还需要复现。

### Figure 2：方法图

这张图要看两个分区：

- on-policy trust region：根据 teacher/student 概率比切分 token；
- off-policy guidance：teacher prefix 引导 early rollout。

### Figure 3：entropy 与 gradient norm

Figure 3(b) 支持作者的问题诊断：outlier token 会导致 OPD gradient norm 更高，mask/clip 能压低异常梯度。Figure 3(a) 则说明不同 outlier objective 会影响 policy entropy 和探索。

### Table 1：最关键证据

Table 1 不是普通榜单，而是在告诉读者 objective 的位置很重要。FKL 全局失败，FKL outlier 成功，这正是 TrOPD 方法成立的核心证据。

## 局限

1. `P_trust=min(pi_T/pi_S,1)` 是 teacher support 的启发式，不是 token 正确性证明。
2. 实验主要在 OPD-family 内比较，缺少 RLVR、GRPO、PPO、SFT-only continued training 等更广义强基线。
3. 没有训练多 seed 和置信区间，部分提升需要第三方确认。
4. 缺少 bad trajectory 和 outlier token 类型分析，读者还不知道哪些错误最常被修正。
5. 项目 README 仍有模型、训练/eval code、demo 等 ToDo，可复现性还不完整。
6. teacher 本身可能错，trust region 只表示 teacher 支持，不表示事实或推理正确。

## 对后训练的启发

TrOPD 把 OPD 的问题从“选哪个 KL”推进到“在哪个 token 区域用哪个监督信号”。这对 reasoning model 很重要，因为 student rollout 中并不是所有 token 都同样可学。

值得在复现中监控的量：

- outlier token ratio；
- trust-region token 占比；
- gradient norm；
- policy entropy；
- teacher prefix length 退火曲线；
- teacher top-k FKL 在 outlier 上的数值稳定性；
- student 与 teacher gap 是否随训练缩小。

## 还要继续追问

1. outlier token 主要来自事实错误、格式错误、推理岔路还是语言风格差异？
2. trust probability 是否可用 calibration、verifier 或 process reward 改进？
3. top-k `k=64`、`beta=0.001` 和 prefix schedule 对不同模型规模是否敏感？
4. TrOPD 与 RLVR / GRPO 的组合是否能稳定提升，而不是只在 OPD-family 内占优？
5. 如果 teacher 比 student 大很多或领域不匹配，outlier ratio 是否会过高而导致训练退化？

## 阅读定位

TrOPD 是一篇后训练稳定化论文。它不解决 reasoning model 的全部蒸馏问题，也不替代 RLVR；但它把一个经常被笼统归因于“OPD 不稳定”的问题拆到了 token-level teacher support，这个拆法很值得后续蒸馏和小模型后训练借鉴。

打开原文：[arXiv:2606.01249](https://arxiv.org/abs/2606.01249)
