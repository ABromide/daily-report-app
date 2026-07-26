# OR Else：把 PPO/GRPO 的 clipping 换成可微饱和项后，后训练到底稳了什么

| 项目 | 内容 |
|---|---|
| 论文 | OR Else: A Differentiable Trust Region for Policy Optimization |
| 作者 | Chinmay Rane, Kanishka Tyagi, Michael Manry |
| 首次公开 | 2026-07-20 17:07:40 UTC |
| 主题 | 大模型后训练、PPO、GRPO、Output Reset、policy optimization |
| 原文 | https://arxiv.org/abs/2607.18163v1 |
| PDF | https://arxiv.org/pdf/2607.18163v1 |
| 代码 | https://github.com/ChicoR-Dr/PPO-GRPO-OR |

## TL;DR

- **这篇论文做什么**：作者把分类任务里的 Output Reset（OR）改造成 LLM 后训练里的策略优化目标，提出 **PPO-OR** 和 **GRPO-OR**，用一个可微的单边平方 margin 替代 PPO/GRPO 常见的 clipped surrogate policy loss。
- **为什么要做**：PPO/GRPO clipping 在“有利方向已经越过边界”时会让标量目标的导数突然变化；作者想测试一个平滑饱和规则能否改变 RLHF/偏好优化中的训练动态。
- **核心机制**：对每个生成 token 计算 rollout policy 到 current policy 的 log-ratio `rho_t`，用 advantage 符号决定希望 token 概率升还是降；当 `sign(A_t) * rho_t` 越过 OR margin 后，该 token 的 OR residual 被置零。
- **实验设置**：`Llama-3.2-1B-Instruct`，Anthropic `hh-rlhf`，一个共享冻结 reward model，LoRA 约 400 万可训练参数；PPO-clip、PPO-OR、GRPO、GRPO-OR 各跑 seeds 42/43/44，rollout step 500。
- **关键数字**：GAE 家族里，PPO-OR 终点训练时 reward-model score 为 `0.500±0.158`，PPO-clip 为 `0.195±0.110`，差值 `+0.305`；group-relative 家族里，GRPO 为 `0.488±0.080`，GRPO-OR 为 `0.457±0.027`，均值不升但观测 seed spread 变小。
- **更重要的负结果**：GRPO-OR 的 OR residual 接近 0、overshoot fraction 下降，但 **没有** 消除 group-relative 方法更大的 rollout-to-current log-ratio displacement；GRPO/GRPO-OR 的 `|rho_t|` 仍大约在 `5-13`，GAE 方法约 `0.3-0.5`。
- **边界**：所有分数都是训练时同一个冻结 reward model 的 proxy measurement，不是 held-out human preference；每个方法只有 3 个 seed；GRPO 只用 `G=2`；作者没有证明 OR 是真正的 policy-level trust region。

## 研究问题：clipping 的尖角，真的是后训练不稳定的关键吗

这篇论文不是又提出一个“更强 RLHF 算法”的常规故事。它关心的是一个更窄的问题：

- PPO 和 GRPO 的 clipped surrogate 目标常被当成近似 trust-region 控制。
- 但 clipping 本身会带来分段目标，尤其在有利方向越过 clipping 区间后，目标对样本的直接贡献进入饱和区。
- 作者的问题是：如果把这个分段饱和替换成一个可微的一侧 margin loss，训练动态、reward proxy、seed 变化和 policy drift 会怎么变？

这里的关键词是 **替换 policy loss 的局部几何**，不是替换整套 RLHF pipeline。

| 维度 | PPO/GRPO clipping | OR Else 的提问 |
|---|---|---|
| 控制对象 | probability ratio 或 surrogate objective 的 clipped contribution | rollout-relative token log-ratio 的单边 margin |
| 饱和方式 | 越过 clipped 区间后，favorable direction 不再继续增加 surrogate gain | 越过 favorable OR margin 后，该 token residual 变 0 |
| 作者要观察 | clipping 是否导致尖锐导数变化和目标轨迹波动 | 平滑零残差是否改变 reward、loss、drift、seed spread |
| 作者不声称 | clipping 是 PPO/GRPO 一切问题的根源 | OR 是全局 trust region 或单调改进保证 |

这使论文的证据边界很清楚：

- 它不是用大规模 benchmark 证明 PPO-OR 或 GRPO-OR 全面优于原方法。
- 它是在一个小模型、小数据、共享 reward model 的受控环境里，观察“局部目标函数替换”会改变哪些训练信号。
- 因此，最值得读的是作者如何反复把 **局部 OR 饱和** 和 **整体策略漂移** 区分开。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| PPO/GRPO clipping 的 favorable-direction saturation 可以被一个平滑替代项重写 | 用 OR squared-margin loss 替代 clipped policy term，并在 log-ratio 空间定义目标 | 公式给出 `L_OR`，导数在 margin 处连续，active branch 的方向与 advantage 符号一致 | 只证明 scalar loss 的性质，不证明 AdamW minibatch 更新等价于真实 policy gradient |
| PPO-OR 在 GAE 对照里改变了 reward proxy | 保留 GAE、value head、reference-shaped rewards，只替换 policy loss | PPO-OR `0.500±0.158`，PPO-clip `0.195±0.110`，差 `+0.305` | seed 只有 3 个，spread 还更大；不是显著性检验或 held-out 人类偏好 |
| GRPO-OR 在 group-relative 对照里改变了诊断量，但没有提升 reward proxy | 保留 group-relative advantages，`G=2`，不用 critic，只替换 clipped surrogate | GRPO `0.488±0.080`，GRPO-OR `0.457±0.027`；GRPO-OR spread 更小、terminal OR residual 接近 0 | `G=2` 受硬件限制；均值略低，不能宣称 GRPO-OR 更好 |
| OR 不是 policy-level trust region | OR 只让单个 token 的 favorable branch residual 归零，不约束整体 KL、参数位移或 adverse direction | GRPO/GRPO-OR 的 `|rho_t|` 仍约 `5-13`，远大于 GAE 方法的 `0.3-0.5` | `|rho_t|` 也不是完整 categorical KL，只是 sampled-token displacement proxy |
| 运行时间数字有参考价值，但不是算法本征优势 | 具体实现里 reward model CPU/GPU transfer、response 数量、logging 都影响耗时 | 单代表 run：PPO-OR 22 min、PPO-clip 42 min、GRPO 77 min、GRPO-OR 49 min | 不是跨硬件、跨实现、跨 batch size 的稳定结论 |

这条论证路线的好处是，它没有把“一个漂亮目标函数”直接包装成“更可靠对齐算法”。作者反而不断提醒：  

- score 是 reward model proxy；
- OR residual 小不等于 policy 真的没漂；
- GRPO-OR 的诊断更平滑不等于 reward 更高；
- clipping 和 OR 的数值不能直接按 loss magnitude 排名。

## 方法机制：Output Reset 如何变成 token-level policy loss

### 1. 从 probability ratio 转到 log-ratio

PPO 常写在 ratio 空间：

```text
r_t = pi_theta(a_t | s_t) / pi_old(a_t | s_t)
```

OR Else 改用 token log-ratio：

```text
rho_t = log pi_theta(a_t | s_t) - log pi_rollout(a_t | s_t)
```

这一步很关键：

- log-ratio 是实数空间里的标量，比较适合定义对称 margin；
- OR 原本处理的是神经网络输出与 target 的距离，作者需要给策略优化找一个类似“输出”的量；
- `rho_t` 表示当前 policy 相对 rollout policy 对同一个 sampled token 的概率变化。

### 2. advantage 只提供方向，不提供幅度权重

作者定义：

```text
sigma_t = sign(A_t)
```

解释如下：

- `sigma_t = +1`：这个 token 的 advantage 为正，希望当前 policy 增加它的 log-probability；
- `sigma_t = -1`：advantage 为负，希望当前 policy 降低它的 log-probability；
- `sigma_t = 0`：不给 OR policy loss 直接方向更新。

这个设计有一个非常强的取舍：

- 好处：OR loss 对 advantage 的正比例缩放不敏感，只看方向；
- 风险：只要 advantage 符号错了，目标方向就会反过来；
- 代价：它丢掉了 `|A_t|` 这个样本强弱信息，和原始 PPO/GRPO 的 magnitude-weighted policy gradient 不等价。

### 3. OR target：越过 favorable margin 后把 target 重置为当前输出

论文里的核心目标可以简化成：

```text
if sigma_t != 0 and sigma_t * rho_t <= alpha_OR:
    tau_t = sigma_t * alpha_OR
else:
    tau_t = rho_t
```

对应的 per-token OR loss 是：

```text
L_OR,t = [max(0, alpha_OR - sigma_t * rho_t)]^2,  if sigma_t != 0
L_OR,t = 0,                                      if sigma_t == 0
```

变量含义：

| 变量 | 含义 |
|---|---|
| `rho_t` | 当前 policy 相对 rollout policy 的 sampled-token log-ratio |
| `A_t` | GAE 或 group-relative 得到的 advantage |
| `sigma_t` | advantage 符号，决定 token 应该更可能还是更不可能 |
| `alpha_OR` | OR margin，论文默认和 PPO epsilon 都取名义值 0.2 |
| `tau_t` | OR-adjusted target；越过 favorable margin 后跟随 `rho_t` |
| `L_OR,t` | 单 token 的平方 margin loss |

直觉是：

- 如果 token 还没有朝 advantage 方向走够，OR 会继续推；
- 如果已经走过 margin，OR 不再让这个 token 继续获得直接 residual；
- 这种“走够就停”的机制模仿 clipping 的 favorable-direction saturation，但导数在边界处连续。

### 4. 导数性质：C1 但不是 C2

对非零 advantage，论文给出的导数可以写成：

```text
d L_OR,t / d rho_t =
    -2 * sigma_t * (alpha_OR - sigma_t * rho_t),  if sigma_t * rho_t < alpha_OR
     0,                                           if sigma_t * rho_t >= alpha_OR
```

它说明三件事：

- 在 active branch 上，负梯度方向会增加正 advantage token 的 log-probability，降低负 advantage token 的 log-probability；
- 到 margin 边界时，一阶导数连续地走到 0；
- 但二阶导数在边界处改变，所以它是 `C1` 不是 `C2`。

这也是标题里 “Differentiable Trust Region” 容易误读的地方。  
更准确的说法是：

- OR 是 **token-level scalar loss 的可微单边饱和规则**；
- 它不是 TRPO 那种 explicit KL-constrained optimization；
- 它也不保证 aggregate neural-network update 位于某个 trust region 内。

## 算法流程：PPO-OR 与 GRPO-OR 只是替换 policy term

```text
Input:
  - frozen reward model r_phi
  - frozen reference policy pi_ref
  - trainable policy pi_theta
  - prompts from hh-rlhf
  - method in {PPO-clip, PPO-OR, GRPO, GRPO-OR}

State:
  - rollout policy pi_rollout
  - LoRA policy parameters
  - value head only for PPO/PPO-OR
  - reward scores and token log-ratios

Loop for rollout steps:
  1. Sample responses from current rollout policy.
  2. Score responses with the shared frozen reward model.
  3. If method is PPO/PPO-OR:
       - build reference-shaped rewards;
       - compute GAE advantages and return targets;
       - update policy term plus value loss and entropy term.
  4. If method is GRPO/GRPO-OR:
       - sample G=2 responses for the same prompt;
       - compute group-relative advantages;
       - exclude zero reward-variance groups;
       - update policy term plus reference log-ratio penalty.
  5. If method uses OR:
       - replace clipped policy loss with L_OR.
  6. Log reward-model score, policy-loss diagnostics, OR residual/overshoot, and |rho_t|.

Output:
  - final training-time reward-model score at rollout step 500;
  - optimization diagnostics across seeds 42, 43, 44.

Failure boundary:
  - Higher reward-model score may be reward-model over-optimization.
  - Near-zero OR residual may coexist with large policy drift.
  - G=2 group-relative estimates may not represent larger group behavior.
```

这段流程里，最容易被忽略的是两个“保留”：

- PPO-OR **保留** PPO 家族的 GAE、value head、reference-shaped rewards；
- GRPO-OR **保留** GRPO 家族的 group-relative advantages、critic-free 结构和 reference penalty。

所以论文的对照不是：

- PPO vs GRPO 谁强；
- OR vs clipping 谁全面强；
- critic vs no critic 谁更稳定。

它真正能回答的是：

- 在 GAE 家族内部，把 clipping 换成 OR 后观察到了什么；
- 在 group-relative 家族内部，把 clipping 换成 OR 后观察到了什么。

## 实验设置：小而明确，但不能外推太远

| 项目 | 设置 |
|---|---|
| policy backbone | `meta-llama/Llama-3.2-1B-Instruct` |
| reward/prompt 数据 | Anthropic `hh-rlhf` |
| reward model | 冻结 4-bit Llama-3.2-1B backbone + 一层 MLP scalar head |
| reward model 训练 | 8,000 对 `hh-rlhf` preference pairs，Bradley-Terry objective |
| policy adaptation | LoRA，rank `r=16`，约 400 万可训练参数 |
| seeds | 42、43、44 |
| rollout steps | 500 |
| GRPO group size | `G=2` |
| response cap | group-relative runs 使用 64-token cap |
| 硬件 | RTX 4060 Ti，约 16.7 GB 可用 VRAM |

作者把局限写得很直接：

- reward model pairwise accuracy 约 `60-61%`，说明 preference signal 本身不强；
- `hh-rlhf` 同时用于 reward-model pairs 和 policy-optimization prompts，prompt overlap 没有完整隔离；
- 没有独立 held-out preference evaluation；
- 没有任务特定 SFT 阶段；
- method-specific hyperparameter tuning 不充分；
- `G=2` 是硬件约束下的选择，不是 group-relative 方法的充分探索。

这些不是小脚注，而是理解结果的前提。

## 主结果：PPO-OR 提高 proxy reward，GRPO-OR 没提高均值

| Method | Advantage family | Final training-time reward-model score | Terminal policy-loss behavior | Mean `|rho_t|` drift |
|---|---|---:|---|---:|
| PPO-clip | GAE | `0.195±0.110` | terminal region 近零 | `0.3-0.5` |
| PPO-OR | GAE | `0.500±0.158` | terminal region 近零 | `0.3-0.5` |
| GRPO | group-relative | `0.488±0.080` | 大且高变，单 seed 峰值可到 hundreds | `5-13` |
| GRPO-OR | group-relative | `0.457±0.027` | terminal region 近零 | `5-13` |

### GAE 对照：PPO-OR 的积极结果

PPO-OR 相对 PPO-clip 的核心观察是：

- final reward-model score 从 `0.195` 到 `0.500`；
- 绝对差值 `+0.305`；
- PPO-OR 在 500 rollout steps 里逐渐和 PPO-clip 拉开；
- 但 PPO-OR 的 across-seed std 也从 `0.110` 增到 `0.158`。

这意味着：

- OR 替换在这个 GAE 设置里确实改变了训练结果；
- 但它不是“更稳且更高”的简单故事；
- 更高均值伴随更大 seed spread，不能直接说 variance 更好。

### Group-relative 对照：GRPO-OR 的负结果更有信息量

GRPO 与 GRPO-OR 的对照更接近后训练社区关心的 GRPO 线：

- GRPO final score：`0.488±0.080`；
- GRPO-OR final score：`0.457±0.027`；
- 均值差值：`-0.031`；
- GRPO-OR 的 seed spread 约三分之一，但不是显著结论；
- GRPO-OR 的 OR residual 接近 0，overshoot fraction 下降；
- 这些诊断没有转化成 reward-score gain。

这条结果提醒我们：

- 目标函数曲线变得更平滑，不等于 reward proxy 更高；
- residual 小，不等于策略更新真的保守；
- group-relative advantage 的估计、`G=2`、response cap、reference penalty 位置，可能比 scalar policy loss 的边界形状更支配结果。

## 图表证据解读：五张图各自支撑什么

| 图/表 | 支撑的结论 | 不能证明什么 |
|---|---|---|
| Table 1 main results | 四种方法在三 seed 下的 final score、loss behavior、`|rho_t|` drift 总览 | 不能做显著性判断；不能跨 GAE/GRPO 家族做严格 factorial 排名 |
| Figure 1 reward curves | PPO-OR 在 GAE 对照里从训练中期开始高于 PPO-clip | 不能说明 held-out human preference 也更好 |
| Figure 2 policy-loss traces | GRPO raw loss 大且高变，GRPO-OR terminal OR loss 接近 0 | clipped loss 和 OR-MSE 单位不同，不能直接按数值比较“优化得更好” |
| Figure 4 OR diagnostics | PPO-OR/GRPO-OR 的 overshoot branch 占比和 OR target magnitude 变化不同 | overshoot fraction 不是 trust-region 指标，也不是 convergence 证明 |
| Figure 5 policy drift | GAE 方法 `|rho_t|` 约 `0.3-0.5`，group-relative 方法约 `5-13` | sampled-token log-ratio 不是完整 KL；只能说明相对位移量级 |
| Runtime table | 当前实现里 PPO-OR/GRPO-OR 比 clipped 版本更快 | 不能说明 OR objective 本征更省算；CPU offload 和实现细节影响很大 |

这组图表的内在逻辑是：

1. 先看 reward proxy：OR 在 PPO 家族里有正向观察，在 GRPO 家族里没有均值提升。
2. 再看 loss trace：OR objective 的 residual 可以很小，但原始 loss 数值不可跨 objective 比较。
3. 再看 policy drift：group-relative 方法整体漂移量级更大，OR 替换没解决这个问题。
4. 最后看 runtime：实现层面有差异，但不是算法普遍性结论。

## 公式细读：为什么 OR 不是 clipping 的平滑版这么简单

PPO clipping 的正负边界在 log-ratio 空间并不对称。若 `epsilon=0.2`：

```text
lower boundary = log(0.8) ≈ -0.223
upper boundary = log(1.2) ≈ +0.182
```

而 OR 默认用对称 margin：

```text
[-alpha_OR, +alpha_OR] = [-0.2, +0.2]
```

这意味着：

- 即使名义上都写 `0.2`，PPO clipping 和 OR margin 也不是同一个边界；
- PPO-OR 不是把 PPO clip curve “磨平”这么简单；
- 它还把 ratio 空间换成 log-ratio 空间，把 advantage magnitude 变成 advantage sign，把 clipped surrogate 换成 squared margin。

用一个更研究化的拆法：

| 改动 | 影响 |
|---|---|
| ratio → log-ratio | 改变目标变量的几何尺度 |
| clipped surrogate → squared margin | 改变 active branch 的梯度系数 |
| `A_t` magnitude → `sign(A_t)` | 丢掉样本强弱，只保留方向 |
| favorable overshoot → zero residual | 控制单 token 直接贡献，不控制整体 policy move |
| symmetric margin | 与 PPO asymmetric log clipping boundary 不严格匹配 |

所以，当 PPO-OR 比 PPO-clip reward proxy 更高时，不能把原因简单归结为“可微所以更好”。可能因素包括：

- OR 的 sign-only weighting 降低了 noisy advantage magnitude 的影响；
- squared margin 对尚未走够的 token 给了不同强度的拉动；
- margin 的对称性改变了正负方向的饱和区域；
- value head、GAE、entropy、reference shaping 与 OR policy term 发生了组合效应。

## 消融与失败：最有价值的是作者没有把结果讲满

论文的讨论部分反复强调一个核心边界：

> local OR saturation does not by itself control aggregate policy movement.

这句话可以拆成三层：

### 1. 单 token residual 为 0，不代表 minibatch gradient 为 0

一个 token 在 favorable branch 越过 margin 后，它对 `L_OR` 的直接 residual 为 0。  
但训练更新还受到：

- 其他 token；
- entropy 项；
- reference-policy penalty；
- PPO-OR 的 value loss；
- AdamW optimizer state；
- weight decay；
- LoRA 参数空间；
- reward model noise。

因此，OR residual 小只能说明 **OR policy term 对某些 token 的直接贡献小**，不能说明整个 policy 不再动。

### 2. GRPO-OR residual 小，但 `|rho_t|` 仍大

这是论文最关键的反例：

- GRPO-OR terminal OR residual 接近 0；
- 但它的 rollout-to-current log-ratio displacement 和 GRPO 同一量级；
- 两者都远大于 GAE 方法；
- 因而 OR 没有替代 group-relative pipeline 里其他稳定控制。

如果把 OR 当成 trust-region，就会误读这组结果。  
更稳妥的解释是：

- OR 改变了样本层面的饱和几何；
- 它可能改变 reward proxy 和 loss trace；
- 但在 `G=2` group-relative setting 里，policy displacement 主要仍由 advantage construction、sampling、reference penalty 和 critic-free 结构共同决定。

### 3. G=2 是一个很窄的 GRPO 实验

GRPO 类方法常常依赖 group 内 reward 差异来构造 advantage。  
当 `G=2` 时：

- reward variance 估计非常粗；
- 两个 response 的差异可能放大偶然性；
- zero-variance group 被排除后，样本利用也会变化；
- larger group 是否改变 GRPO-OR 的结果，论文没有回答。

所以这篇文章对 GRPO-OR 的结论应该写成：

- 在 `G=2`、1B policy、hh-rlhf、共享 reward model、三 seed 下，GRPO-OR 没有提升 final reward-model score；
- 它显示了较小 observed spread 和更平滑的 OR diagnostics；
- 但这不足以推出 “GRPO-OR 稳定而且更强”。

## 相关工作位置：它和 PPO、GRPO、DPO/RLOO 的关系

| 方向 | 论文如何放置自己 |
|---|---|
| PPO/TRPO | PPO 用 clipped objective 近似控制策略更新；OR Else 不做 KL constraint，只替换 clipped policy term |
| GRPO | GRPO 用同 prompt group 内 reward 标准化来避免 learned critic；GRPO-OR 保留 group-relative advantage，只替换 clipped surrogate |
| DPO | DPO 直接从 preference pairs 学习，不训练 explicit reward model，也不在线采样；OR Else 仍是 online reward-driven policy optimization |
| RLOO | RLOO 用 leave-one-out baseline 简化 variance reduction；OR Else 不是 baseline 方法，而是 policy loss 几何替换 |
| Output Reset | OR 原用于分类输出 target adjustment；论文把它映射到 token log-ratio 与 advantage direction |

它的独特位置是：

- 不争夺“最强 alignment recipe”；
- 不把 DPO/PPO/GRPO 全部重新组织；
- 只问 clipping-style surrogate 的局部几何是否能用 OR 改写，以及这种改写在两个 advantage family 里产生什么可观测差异。

这种论文对后训练研究很有用，因为它迫使我们把“算法名字”拆成更小的部件：

- advantage 怎么来；
- reward 怎么来；
- policy term 怎么饱和；
- reference regularization 在 reward 里还是 loss 里；
- value head 是否存在；
- group size 如何影响 rollout variance；
- 训练时 reward proxy 和真实偏好是否分离。

## 证据边界与可复现性

### 论文自己承认的边界

| 边界 | 影响 |
|---|---|
| 每方法 3 个 seed | 只能描述观察到的均值和标准差，不能做稳定显著性结论 |
| 单冻结 reward model | proxy reward 可能与真实偏好分离 |
| reward model accuracy 约 60-61% | scorer 噪声不小，可能影响 policy 排名 |
| 无 held-out human preference | 不能说人类真的更喜欢 PPO-OR 输出 |
| `hh-rlhf` 同源复用 | reward-model 训练和 RL prompts 可能有分布重叠 |
| `Llama-3.2-1B-Instruct` 单模型 | 不能外推到 7B/70B 或不同 chat template |
| `G=2` | GRPO/GRPO-OR 的 group-relative 行为可能受限 |
| 未做 method-specific tuning | PPO-clip 较低不代表 PPO 调不好 |
| runtime 单代表 run | 不能说明 OR 本征更省算 |

### 我认为最需要后续补的实验

1. **更大 group size 的 GRPO-OR**：至少 `G=4/8`，观察 reward diversity、advantage magnitude、`|rho_t|` 和 OR residual 是否一起变化。
2. **独立 held-out preference evaluation**：用独立 judge 或人类偏好评估，看 `+0.305` proxy gain 是否真的转化。
3. **asymmetric OR margin**：直接匹配 PPO 的 `log(0.8)` 和 `log(1.2)` 边界，排除“边界不等价”造成的差异。
4. **advantage-magnitude weighted OR**：把 `|A_t|` 部分放回 active tokens，测试 sign-only 是优势还是损失。
5. **强 reward model 与更大 policy**：小 reward model 噪声可能遮蔽或制造 observed gain。
6. **同一数据源严格切分**：分开 reward model train、RL prompts、final eval prompts，降低 prompt overlap 风险。

## 领域延伸：后训练论文应该少报“更高分”，多报“哪条控制链变了”

这篇论文对当前后训练研究的启发，不在于立刻采用 PPO-OR 或 GRPO-OR，而在于它的诊断方式。

### 0. Detail inventory：这篇论文真正给出的材料

| 类别 | 论文里的具体内容 | 读者应该如何使用 |
|---|---|---|
| 方法名 | PPO-OR、GRPO-OR、Output Reset policy loss | 把它看成 policy loss 替换实验，而不是完整 RLHF recipe |
| 核心变量 | `rho_t`、`A_t`、`sigma_t`、`alpha_OR`、`tau_t`、`L_OR,t` | 逐项检查 token-level margin 是否真的和 policy-level trust region 有关 |
| 数据 | Anthropic `hh-rlhf` preference pairs 与 human turns | 可复现实验起点，但不是独立泛化评测 |
| 模型 | `Llama-3.2-1B-Instruct`、冻结 4-bit reward backbone、MLP reward head | 适合轻量机制验证，不适合推出大模型后训练排序 |
| 训练 | LoRA rank 16、约 400 万可训练参数、500 rollout steps、seeds 42/43/44 | 能看趋势和诊断，不够做强统计结论 |
| benchmark | final training-time reward-model score | 这是 proxy，不是 AlpacaEval、Arena、人类偏好或任务成功率 |
| baseline | PPO-clip、GRPO matched comparison | 只能在各自 advantage family 内读，不能把四列当统一排行榜 |
| 消融/诊断 | OR overshoot fraction、OR target magnitude、policy drift、runtime/VRAM | 重点看“机制是否按预期变化”，不要只看最终分数 |
| 失败案例 | GRPO-OR residual 小但 reward 不升、drift 不降 | 说明局部目标平滑不等于全局稳定 |

如果按 claim -> mechanism -> evidence -> boundary 的方式复述，论文最硬的库存不是某个 SOTA 数字，而是以下几组对应关系：

- **claim：OR 可以平滑 favorable saturation**  
  mechanism：用单边 squared margin 让一阶导数在边界处连续。  
  evidence：公式证明 `L_OR,t` 在 margin 处 `C1`，且 overshoot branch residual 为 0。  
  boundary：`C1` 是 scalar loss 性质，不是 KL 约束。

- **claim：PPO-OR 在 GAE 设置里有 reward proxy 提升**  
  mechanism：同样 GAE/value/reference-shaped reward 下只换 policy loss。  
  evidence：`0.195±0.110` 到 `0.500±0.158`。  
  boundary：三 seed、同一个 reward model、无 held-out human preference。

- **claim：GRPO-OR 改变优化诊断但不提高均值**  
  mechanism：同样 `G=2` group-relative advantage 下只换 policy loss。  
  evidence：score `0.488±0.080` 到 `0.457±0.027`，spread 更小但均值不升。  
  boundary：`G=2` 太窄，不能说明更大 group 也如此。

- **claim：OR 不能替代 trust-region 控制**  
  mechanism：单 token overshoot 后只清零 direct residual。  
  evidence：GRPO-OR 的 `|rho_t|` 仍约 `5-13`。  
  boundary：`|rho_t|` 不是完整 KL，但足够证明 sampled-token displacement 没被 OR 消掉。

### 失败案例怎么读：不是“GRPO-OR 失败”，而是“诊断量和目标量脱钩”

这篇论文最值得单独拿出来讲的失败案例，是 GRPO-OR 的三重脱钩：

1. **OR residual 脱钩 reward score**  
   GRPO-OR 的 terminal OR residual 接近 0，说明许多 token 已经处于 OR 的零残差状态，或者当前 log-ratio 与 OR target 接近。可是 final reward-model score 没有比 GRPO 高，反而略低。这说明局部 residual 的消失不等于策略找到了更好回答。

2. **overshoot fraction 脱钩 policy drift**  
   overshoot fraction 下降，看起来像“越界 token 越来越少”。但 group-relative 方法的 `|rho_t|` 仍比 GAE 方法大一个数量级。换句话说，OR 分支占用率描述的是 **OR objective 内部状态**，不是整个策略相对 rollout policy 的位移约束。

3. **loss trace 脱钩可比较优化质量**  
   GRPO raw clipped objective trace 大而抖，GRPO-OR 的 OR-MSE trace 接近 0。直觉上很容易说 GRPO-OR 更稳定，但论文没有这么说，因为两个 objective 的单位、缩放、gradient coefficient 不同。loss trace 可以帮助解释同一 objective 内部动态，不能直接跨 objective 排名。

这种脱钩对后训练研究尤其重要。很多论文会把 reward 曲线、loss 曲线、KL 曲线放在一起，然后用一段话说“训练更稳定”。OR Else 的写法更严格：

- reward 曲线回答模型是否获得更高 proxy score；
- loss 曲线回答该 objective 自己是否进入某种 terminal region；
- drift 曲线回答 sampled policy 是否相对 rollout policy 大幅移动；
- 三者可以一致，也可以不一致。

### 与近期 Agent/RL 后训练线的关系

从本周候选看，很多论文都在处理长程 Agent 或 RL 后训练的同一个矛盾：

- 稀疏或噪声 reward 难以指导长程轨迹；
- group-relative 或 on-policy rollouts 能提供自生成状态，但容易带来更大方差和策略漂移；
- 简单的过程奖励、脚手架、memory reward、reward channel 改造，都可能引入新的代理目标。

OR Else 在这条线上承担的是一个更底层的角色：

| 相邻问题 | OR Else 的贡献 | 仍缺什么 |
|---|---|---|
| GRPO clipping 是否合适 | 给出 OR 替代并做 matched comparison | 更大 group、更强模型、真实任务 |
| 长程 Agent credit assignment | 提醒 policy loss 几何不等于轨迹级 credit | 没有 Agent 环境或多步工具任务 |
| reward hacking | 明确 reward score 只是 proxy | 没有独立 judge/human preference |
| policy drift 控制 | 报告 rollout-to-current log-ratio | 没有完整 KL 或 trust-region guarantee |
| 训练稳定性 | 拆开 residual、overshoot、loss、drift | 没有多 seed 大样本统计 |

因此，如果把它放到 Agent 后训练里，最谨慎的延伸是：

- 可以考虑把 OR 作为 policy term 变体，在 Agent RL 的 small-scale ablation 里测试；
- 不能把它当作解决长程工具调用 instability 的直接方案；
- 更不能用 OR residual 接近 0 证明 Agent 行为已经受控。

### 一个可执行的后续实验设计

如果我要基于这篇论文继续做一轮更有说服力的实验，会把设计拆成四组。

| 实验组 | 目的 | 最关键指标 |
|---|---|---|
| `G in {2,4,8}` 的 GRPO/GRPO-OR | 验证 group size 是否改变 GRPO-OR 均值和 drift | final held-out preference、`|rho_t|`、full KL、zero-variance group 比例 |
| symmetric vs asymmetric OR margin | 排除 PPO clipping 边界不对称带来的混淆 | PPO-OR 与 PPO-clip 的 matched reward/diff |
| sign-only vs magnitude-weighted OR | 测试丢掉 `|A_t|` 是优势还是损失 | advantage sign flip sensitivity、reward proxy、seed spread |
| same-source vs disjoint-source reward/eval | 评估 reward model over-optimization | held-out judge、人工偏好、小样本人工审计 |

这四组实验能回答当前论文没有覆盖的关键问题：

- OR 的积极结果来自 margin 几何，还是来自 sign-only reweighting？
- GRPO-OR 在 `G=2` 没有均值提升，是 OR 不适合 group-relative，还是 group 太小？
- reward-model score 的提升是否只是同源 proxy 的自我强化？
- policy drift 如果用完整 KL 或 reference distribution 计算，是否仍呈现同样对比？

### 审稿人视角：哪些结论可以接受，哪些必须降级

站在审稿人视角，这篇论文最稳的结论是 **机制存在性**，不是 **方法优越性**：

- 可以接受：OR 可以被定义为 token log-ratio 空间里的单边可微饱和项。
- 可以接受：在作者的 GAE 对照里，PPO-OR 的训练时 reward-model 终点均值更高。
- 可以接受：在作者的 `G=2` group-relative 对照里，GRPO-OR 的 residual 和 seed spread 诊断更平滑，但均值没有更高。
- 必须降级：PPO-OR 更对齐，因为没有独立人类偏好评测。
- 必须降级：GRPO-OR 更稳定，因为 policy displacement 没有下降。
- 必须降级：OR 是 trust region，因为它没有给出 KL、参数位移或分布级约束。

这个降级并不削弱论文价值。相反，它让论文成为一个合格的机制论文：作者提出一个可检验替代项，报告有利结果，也保留负结果，并告诉读者哪些指标不能互相替代。后训练领域现在很需要这种写法，因为很多“奖励更高”的结论其实只证明了某个 proxy scorer 被优化得更充分，而没有证明模型行为更符合人的稳定偏好。

### 1. 把 objective-level smoothness 和 policy-level stability 分开

很多 RLHF/GRPO 讨论会把目标函数稳定、loss 好看、KL 小、reward 高混在一起。  
OR Else 给了一个很好的反例：

- GRPO-OR 的 OR residual 很小；
- 但 policy displacement 仍然大；
- reward proxy 也没有超过 GRPO。

所以一个后训练方法如果宣称“更稳”，至少要分别报告：

| 层级 | 应报告什么 |
|---|---|
| token objective | residual、overshoot、active/saturated branch occupancy |
| sampled policy displacement | rollout-to-current log-ratio、reference log-ratio |
| distribution control | KL 或近似 KL，而不是只看 sampled token |
| reward behavior | reward model score、reward hacking 迹象 |
| preference behavior | held-out judge、人类偏好或任务指标 |
| seed behavior | 多 seed 均值、方差、失败 seed 案例 |

### 2. GRPO 的问题不一定在 clipping

这篇论文和近期 GRPO 相关工作形成了一个有用对照：

- 如果换掉 clipping 后，GRPO-OR 仍有大位移；
- 那么 group-relative 后训练的关键问题可能更靠近 group size、reward normalization、reference penalty、response cap、sampling distribution；
- 只优化 scalar surrogate 的边界形状，不一定触及主因。

这对 Agent/RL 后训练尤其重要。长程 Agent 的 reward 通常更稀疏、更嘈杂，group-relative advantage 更可能被偶然成功轨迹支配。OR 这样的局部饱和项也许能减少某些 token 的直接推动，但未必能修复轨迹级 credit assignment。

### 3. “训练时 reward-model score”必须降级表达

论文反复提醒 final score 是 training-time reward-model measurement。  
这点应该成为后训练论文的写作规范：

- 不要把 reward-model score 写成“偏好胜率”；
- 不要把同源 reward model 的提升写成“alignment improvement”；
- 不要省略 reward model accuracy、训练/评测 prompt 切分、held-out judge 设计；
- 如果只在 proxy 上提升，就明确叫 proxy gain。

### 4. 一个更完整的后训练诊断表

如果把 OR Else 的精神推广到后训练系统评测，我会要求每篇 RLHF/GRPO/RLVR 论文至少给出：

| 模块 | 最小诊断 |
|---|---|
| reward model | pairwise accuracy、calibration、held-out split、OOD 检查 |
| advantage | magnitude distribution、sign flip sensitivity、zero-variance group 比例 |
| policy ratio | current/reference、current/rollout、sampled-token 与 full KL 区分 |
| loss branch | clipped/saturated/active token 比例，按正负 advantage 分开 |
| seed | 最好/最差 seed 的具体失败形态 |
| evaluation | training proxy、held-out judge、人工偏好或任务成功率分开报告 |

## 结论：OR 是一个值得研究的局部几何替代，不是后训练稳定性的银弹

这篇论文的结论可以压缩成三句话：

- **PPO-OR 有正向观察**：在 GAE 家族内部，它把 final training-time reward-model score 从 `0.195±0.110` 提到 `0.500±0.158`，但 seed spread 更大，且没有 held-out 人类偏好验证。
- **GRPO-OR 的诊断更平滑但均值不升**：在 `G=2` group-relative 家族内部，它让 observed spread 更小、OR residual 接近 0、overshoot fraction 下降，但 final score 从 `0.488±0.080` 到 `0.457±0.027`，没有 reward gain。
- **OR 不等于 trust region**：它控制的是单 token 的 OR residual 和 favorable-direction saturation，不控制 aggregate policy movement；group-relative 方法的 `|rho_t|` 大位移仍然存在。

因此，OR Else 最值得带走的不是“用 PPO-OR 替代 PPO”，而是一个更严谨的后训练研究姿势：

- 把目标函数改动拆到 token-level；
- 把 advantage 家族分开比较；
- 把 reward proxy、loss trace、policy drift、runtime、human preference 分开报告；
- 把负结果写清楚，而不是用一个漂亮公式掩盖没有提升的部分。
