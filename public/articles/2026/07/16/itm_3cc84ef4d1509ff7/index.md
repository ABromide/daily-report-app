# GFlowRL：把 GFlowNet 式后训练从“学一个归一化器”改成“批内估计”

| 项目 | 内容 |
| --- | --- |
| 论文 | GFlowRL: Scaling Distribution-Matching RL to Large Language Models |
| 作者 | Xiaodong Liu, Michael Xu, Jack W. Stokes, Paul Smolensky, Doug Burger, Jianfeng Gao |
| 机构 | Microsoft Research |
| 日期 | 2026-07-15 arXiv v1 |
| 原文 | https://arxiv.org/abs/2607.13394 |
| HTML | https://arxiv.org/html/2607.13394v1 |
| 代码 | https://github.com/microsoft/gflowrl |
| 类型 | 大模型后训练 / GFlowNet-style RL / 推理模型 |

### TL;DR

- **这篇论文做什么**：GFlowRL 试图把 GFlowNet 的“按奖励分布采样”思想扩展到大模型后训练，而不是继续沿 PPO、GRPO 这类 reward-maximizing 目标只追逐单一高奖励模式。它关注数学推理、代码、对抗红队以及 MoE 模型这些更接近现代 reasoning post-training 的高噪声、长 rollout、分布式训练场景。
- **核心诊断是什么**：此前 FlowRL/FOR 类方法通常保留一个 prompt-conditional learned partition function，也就是需要额外学习的 `log Z(x)`。作者认为这个归一化器在 LLM 后训练里反而成了不稳定源：policy 来自预训练模型，只需小幅更新；`log Z` 随机初始化，却要在有限步数内估计复杂归一化常数，导致梯度尖峰、同步开销和 MoE 下的 off-policy mismatch。
- **方法怎么做**：GFlowRL 删除辅助 partition network，用每个 prompt 本来就要采样的一组 rollout 做 **in-batch Monte Carlo estimate**。目标仍保留 trajectory balance 的分布匹配语义，再加两个稳定化项：sequence-level importance sampling 修正 rollout policy 与 trainer policy 的漂移；asymmetric flow-gap clipping 限制异常 residual，但给正向修正更大空间。
- **实验关键数字**：在 Qwen2.5-7B 数学任务上，GFlowRL 平均 Avg@16 为 **40.92**，高于 GRPO 的 **32.48** 和 FlowRL 的 **35.63**；对抗红队中 FlowRL 不收敛，GFlowRL 在 AdvBench / HarmBench 的平均 ASR@1 分别达到 **82.5% / 79.5%**；14B 代码模型 Codeforces rating 达 **2048**，接近 o3-mini 的 2073；MoE 上 Qwen3-30B-A3B 与 Qwen3-235B-A22B 也复用同一 recipe 稳定训练。
- **局限和边界**：论文证明的是 GFlowRL 保留了 trajectory balance 的 fixed-point character，不保证有限 batch、非凸训练一定收敛。批内估计在小 group size 时理论上方差更高；实验主要在作者可控训练栈、特定 reward/verifier 与 benchmark 上成立。代码页面当前是承诺发布入口，真正复现还要等训练配置、数据处理和分布式实现完整开放。

### 1. 研究问题：为什么“分布匹配式 RL”在 LLM 后训练里难扩展？

当前 reasoning model 的后训练主线大多是：

- 采样多条解答；
- 用 verifier 或 reward model 给分；
- 用 PPO、GRPO、R++、OMD 等方法提高高奖励回答概率；
- 通过 KL、clip、advantage normalization 或 entropy 类项控制更新。

这条路线的结构性倾向是 **reward maximization**：

- 如果某条推理路径拿到最高 reward，训练会持续把概率质量推向它；
- 其他同样正确但不那么常见的路径会被挤掉；
- 数学、代码、科学推理里“多种有效解法”本来有价值，模式坍缩会降低泛化和鲁棒性。

GFlowNet-style RL 的吸引力在于换了一个目标：

```math
p^*(y | x) proportional R(x, y)
```

变量解释：

- `x`：prompt，例如数学题、代码题或红队攻击任务；
- `y`：模型生成的完整 reasoning trajectory；
- `R(x, y)`：verifier 或 reward 函数给出的非负奖励；
- `p^*`：理想策略，不只最大化最高 reward，而是按奖励大小覆盖多条高质量轨迹。

这相当于把“找到一个最高分答案”改成：

- 高奖励答案都应该被覆盖；
- 奖励越高，被采样概率越高；
- 低奖励答案仍被压低，但不是用单峰最优解吞掉整个分布。

问题是：早期把 GFlowNet 思想放进 LLM RL 时，常常需要学习一个归一化常数：

```math
Z(x) = sum_y R(x, y)
```

在小模型、小搜索空间或短轨迹任务里，学习 `Z(x)` 也许还能承受；但在现代后训练里，条件同时变坏：

| 放大因素 | 对 `log Z(x)` 的影响 | 对训练系统的影响 |
| --- | --- | --- |
| 模型变大 | policy 参数已经有强先验，partition head 却随机初始化 | 两个学习速度不匹配 |
| rollout 变长 | trajectory log-prob 的尺度变大 | residual 更容易爆炸 |
| reward 更噪 | 数学 verifier、代码测试、红队 classifier 都会有稀疏或离散信号 | `Z` 更难从有限样本中稳定估计 |
| 分布式更复杂 | rollout policy 与 trainer policy 存在延迟 | off-policy mismatch 放大 |
| MoE 路由 | 路由和并行系统引入更多非确定性 | 学到的 normalizer 更容易滞后 |

作者的关键判断是：

- FlowRL 的问题不是 GFlowNet 目标本身；
- 真正拖累扩展的是“另外学习一个 prompt-conditioned partition function”；
- 如果能去掉这个模块，同时保留 trajectory balance 的 fixed point，就能把 GFlowNet-style RL 接到 GRPO 类基础设施上。

### 2. 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| learned partition function 是扩展瓶颈 | `log Z(x)` 随机初始化，要和亿级/十亿级 policy 同步学习 | FlowRL 梯度爆炸，Appendix E 记录 55 次 gradient explosion，从 step 106 开始 | 这是对本文训练设定的经验诊断，不等于所有 GFlowNet 任务都不该学 `Z` |
| 批内 Monte Carlo 估计可以替代 `Z` | 对同一 prompt 的 rollout group 直接估计 reward 总量 | GFlowRL 数学、代码、红队和 MoE 都稳定训练 | group size 小时方差可能变大 |
| 分布匹配语义没有丢 | loss 在 clip inactive 时仍保持 trajectory balance fixed point | Appendix B 给出 fixed-point characterization | 不是有限步收敛证明 |
| 稳定性来自两个补丁 | importance sampling 修正 policy drift；asymmetric clipping 控制 outlier residual | 红队任务中 FlowRL 不收敛，GFlowRL 有最高平均 ASR@1 | clipping 会引入近似，长度归一化也有条件 |
| 工程价值在于复用 GRPO 栈 | 不再训练辅助网络、optimizer state 和同步逻辑 | MoE 30B/235B 复用同一 recipe | 分布式细节仍需要开源代码验证 |

### 3. 方法前置：trajectory balance 到底在平衡什么？

把大模型生成看成从 prompt `x` 到完整 response `y` 的轨迹采样：

- policy `pi_theta(y | x)` 生成回答；
- frozen reference `pi_ref` 约束更新不要离原模型太远；
- rollout policy `pi_old` 负责采样训练 batch；
- reward `R(x, y)` 衡量回答质量。

传统 reward-maximizing 方法大致推动：

```math
maximize E_{y ~ pi_theta(.|x)}[R(x, y)]
```

GFlowNet 的目标更像：

```math
pi_theta(y | x) = R(x, y) / Z(x)
```

也就是：

- 如果两个回答 reward 分别是 10 和 5，理想概率也应大约保持 2:1；
- 不是只把概率压到 reward=10 的那条路径；
- 多解、多策略、多攻击路径的任务会更受益。

trajectory balance 通常会让一条 trajectory 的 log-flow 与 reward 对齐：

```math
log Z(x) + log pi_theta(y | x) ~= log R(x, y)
```

残差可以写成：

```math
Delta(x, y) = log Z(x) + log pi_theta(y | x) - log R(x, y)
```

训练就是让 `Delta` 接近 0。

这里的危险点非常直观：

- `log pi_theta(y | x)` 来自一个已经训练好的大模型；
- `log R(x, y)` 来自 verifier 或 reward；
- `log Z(x)` 却常是一个新初始化的小网络；
- 只要 `log Z` 估错，残差平方就会让 policy 被错误梯度牵着走。

### 4. 失败诊断：为什么学出来的 `Z` 没帮上忙？

论文的诊断有两层。

#### 4.1 表示层面的不对称

policy 和 partition network 的起点完全不同：

| 组件 | 初始化 | 学习任务 | 风险 |
| --- | --- | --- | --- |
| `pi_theta` | 大规模预训练模型 | 在原有能力上微调概率分布 | 更新幅度相对小 |
| `log Z_phi(x)` | 新增 MLP 或标量 | 从 prompt 表示估计不可枚举的 reward 总量 | 早期估计噪声很大 |

作者观察到两个现象：

- 把 learned `Z` 换成随机噪声时，性能并没有明显坏到不可接受；
- FlowRL 的 gradient norm 比 GRPO 大得多，且会出现数量级级别的尖峰。

这说明 `Z` 在本设定中更像训练噪声源，而不是有效归一化器。

#### 4.2 系统层面的额外负担

一个 learned partition network 不只是数学符号，还会带来工程成本：

- 需要额外参数；
- 需要 optimizer state；
- 需要跨设备同步；
- 需要学习率、初始化、warmup 等超参；
- 在 MoE 中还要面对 rollout 与 trainer 之间的路由差异。

如果最终收益不清楚，这些开销会变成后训练系统里的脆弱点。

### 5. GFlowRL：用 rollout group 自己估计归一化常数

GFlowRL 的核心替换非常保守：

- 不再引入 `log Z_phi(x)`；
- 对每个 prompt 仍采样一组 responses；
- 用这组 responses 的 reward 做批内 Monte Carlo 估计；
- 该估计直接来自训练本来需要的 rollout group。

可以把它理解为：

```math
hat Z_B(x) = sum_{y_i in B(x)} R(x, y_i)
```

其中：

- `B(x)`：对同一个 prompt 采样出来的 group；
- `R(x, y_i)`：第 `i` 条 response 的 reward；
- `hat Z_B(x)`：批内归一化估计，不新增参数。

这一步的意义不是“估计更精确”，而是“尺度更相称”：

- 估计和当前 batch 的 reward 在同一尺度；
- 不会出现随机初始化网络主导残差；
- 不需要额外同步；
- 和 GRPO 已经使用 group rollout 的训练流程天然兼容。

### 6. 两个稳定化项：policy drift 和异常 residual 分别怎么处理？

删除 `Z` 后，GFlowRL 仍要处理两个现实问题。

#### 6.1 Importance sampling：修正 rollout/trainer 漂移

分布式 RL 中，样本通常由较旧的 rollout policy 生成：

```math
y ~ pi_old(. | x)
```

但梯度更新作用在当前 policy：

```math
pi_theta(. | x)
```

如果不修正，训练目标会把“旧策略下常见的样本”当成“当前策略下常见的样本”。

GFlowRL 使用 sequence-level importance sampling weight：

```math
w(y) = pi_theta(y | x) / pi_old(y | x)
```

直观解释：

- 如果当前 policy 比旧 policy 更倾向这条 trajectory，权重要调高；
- 如果当前 policy 已经远离这条 trajectory，权重要调低；
- 这不是消除所有 off-policy 问题，而是给延迟采样一个一阶修正。

#### 6.2 Asymmetric flow-gap clipping：给正确低频解更大上调空间

残差平方对 outlier 很敏感。

如果某条 rollout 的 flow gap 极端大：

- 梯度会被少数样本主导；
- 训练可能追着 reward 噪声或 verifier 偶然错误跑；
- 长 reasoning trajectory 的 log-prob 尺度会进一步放大问题。

GFlowRL 把 flow gap 做非对称裁剪：

```math
clip(Delta, -c_-, c_+), where c_+ > c_-
```

非对称的原因是：

- 数学和代码任务早期可能低采样到正确解；
- 对“被低估的正确轨迹”，应该允许更强的正向概率修正；
- 对“已经偏高或异常的负向 residual”，要更严格限制下推或震荡。

这和 trust-region 思想类似：

- 不是禁止策略更新；
- 而是限制单个异常 trajectory 把整个 batch 拉歪；
- 在 fixed point 附近，flow gap 约为 0，clip inactive，不改变目标 stationary distribution。

### 7. 算法流程：从 GRPO 基础设施到 GFlowRL loss

下面用伪代码重写论文方法的训练循环。

```text
Input:
  prompts D
  trainable policy pi_theta
  rollout snapshot pi_old
  frozen reference pi_ref
  reward function R
  group size G

State:
  no learned partition network
  replay/rollout batch with G responses per prompt
  clipping bounds c_minus, c_plus
  IS threshold tau

Loop:
  for each prompt x in batch:
    sample y_1 ... y_G from pi_old(. | x)
    compute rewards r_i = R(x, y_i)
    estimate batch normalizer hat_Z_B(x) from {r_i}

    for each response y_i:
      compute log pi_theta(y_i | x)
      compute log pi_old(y_i | x)
      compute importance weight w_i
      compute flow gap Delta_i using hat_Z_B(x), log pi_theta, reward
      clip Delta_i asymmetrically
      accumulate weighted squared residual loss

  update pi_theta
  periodically refresh pi_old from pi_theta

Output:
  policy that approximates reward-proportional sampling

Failure boundary:
  if rewards are too sparse, group size too small, or verifier noise dominates,
  hat_Z_B can still be high-variance and clipping can only damp the failure.
```

这个流程的工程含义很明确：

- 相比 FlowRL，少了一个可训练模块；
- 相比 GRPO，保留同样的 group sampling 形态；
- 相比纯 reward maximization，目标仍关心 reward distribution matching；
- 相比“熵奖励补丁”，多样性不是额外正则，而是目标的一部分。

### 8. 实验设置：作者如何证明不是只在一个任务上好看？

论文覆盖三组能力场景。

| 场景 | 模型/任务 | 评价指标 | 为什么重要 |
| --- | --- | --- | --- |
| 数学推理 | Qwen2.5-7B、32B；AIME24/25、AMC23、MATH500、Minerva、Olympiad | Avg@16 accuracy | 多解推理，适合检查模式坍缩和泛化 |
| 代码与竞赛编程 | DeepSeek-R1-Distill-Qwen-7B、14B；LiveCodeBench、Codeforces、HumanEval+ | Avg@16、Pass@16、rating、percentile | 长推理 + 测试驱动 reward，接近高价值后训练 |
| 对抗红队 | AdvBench、HarmBench；Qwen2.5-3B、Llama-3.1-8B、GPT-4.1-mini victim | ASR@1 | reward 噪声更强，能检验稳定性 |
| Sparse MoE | Qwen3-30B-A3B、Qwen3-235B-A22B | 数学 Avg@16、Codeforces | 检查分布式和路由非确定性下是否仍可扩展 |

训练配置里有几个值得注意的细节：

- 每个 prompt 的训练 rollout 数量是 **16**；
- training temperature 为 **1.0**；
- evaluation top-p 为 **0.7**；
- KL coefficient 和 entropy coefficient 在列出的配置中为 **0.0**；
- importance sampling 是 **sequence-level**；
- IS threshold 为 **2.0**；
- MoE 30B 的超参、数据和 schedule 被复用于 235B。

这些细节说明论文不是用大量新正则堆出结果，而是想展示“目标函数和 normalizer 处理方式”本身的变化。

### 9. 主结果：数学、代码、红队和 MoE 分别说明什么？

#### 9.1 数学推理：7B 上从 32.48 到 40.92

Qwen2.5-7B 数学主表的平均结果：

| 方法 | 平均 Avg@16 |
| --- | ---: |
| Backbone | 23.02 |
| R++ | 31.52 |
| PPO | 31.98 |
| GRPO | 32.48 |
| FlowRL | 35.63 |
| FlowRL-RandomLogZ | 36.19 |
| GFlowRL | 40.92 |

这张表支撑三点：

- GFlowNet-style 目标确实比纯 reward-maximizing baseline 更强；
- 仅把 `log Z` 随机化也能接近 FlowRL，说明 learned `Z` 的贡献可疑；
- GFlowRL 比 FlowRL 高 **5.29** 点，比 GRPO 高 **8.44** 点，说明去掉 learned `Z` 不是只换来稳定性，也换来了准确率。

#### 9.2 代码任务：Codeforces rating 到 2048

论文报告：

- 7B 代码任务中，GFlowRL 在 LiveCodeBench、Codeforces、HumanEval+ 都是最佳；
- Codeforces 上，GFlowNet-style 方法相对 GRPO 有 200-330 Elo 优势；
- 14B setting 中，GFlowRL 达到 **2048** rating；
- 对比对象包括 DeepCoder-14B、FlowRL-14B、o1 和 o3-mini；
- 作者强调 14B GFlowRL 比 DeepCoder 训练步数更少：400 total steps vs DeepCoder 的 600。

这个结果的含义不是“14B 开源模型整体超过闭源 frontier”，而是：

- 在 Codeforces rating 这个单一评测上，distribution matching 对代码搜索有强信号；
- 代码任务有多个有效思路和实现路径，压到单一高分模式未必最优；
- GFlowRL 的优势更像“采样分布质量”提升，而不只是 pass/fail reward 拉高。

#### 9.3 红队任务：FlowRL 不收敛时，GFlowRL 还能训练

对抗红队主表：

| 方法 | AdvBench 平均 ASR@1 | HarmBench 平均 ASR@1 |
| --- | ---: | ---: |
| X-Teaming | 36.0 | 37.3 |
| SEMA | 80.1 | 75.0 |
| FlowRL | 不收敛 | 不收敛 |
| GFlowRL | 82.5 | 79.5 |

这组结果是论文最有说服力的稳定性证据：

- 红队 reward 比数学更噪、更稀疏；
- 攻击成功率可能被 victim model 和 classifier 共同影响；
- 如果 learned `Z` 会放大 residual，红队任务会更早暴露；
- GFlowRL 不只是“哪里 FlowRL 能跑就略好”，而是在 FlowRL 直接失败的场景里仍能工作。

#### 9.4 Sparse MoE：30B-A3B 和 235B-A22B 的压力测试

MoE 数学结果摘要：

| 模型 | Backbone Avg | GRPO Avg | GFlowRL Avg | FlowRL |
| --- | ---: | ---: | ---: | --- |
| Qwen3-30B-A3B | 74.52 | 75.78 | 78.32 | 不收敛 |
| Qwen3-235B-A22B | 81.29 | 82.40 | 83.35 | 不收敛 |

这里的重点是：

- 30B 的 recipe 复用于 235B，没有为更大模型重新设计；
- FlowRL 在两种 MoE 上都不收敛；
- GFlowRL 的提升绝对值不如 7B 数学夸张，但稳定性和可迁移性更重要；
- 对已经很强的 MoE backbone，后训练收益变小是合理现象。

### 10. 消融和失败案例：哪些证据最能支撑作者诊断？

#### 10.1 Estimation method 消融

Appendix F.1 比较不同估计方式在 Qwen2.5-7B 六个数学 benchmark 上的平均准确率：

| 方法 | 平均准确率 |
| --- | ---: |
| Backbone | 23.02 |
| ConstantLogZ | 25.34 |
| FOR | 29.53 |
| GFlowRL | 40.92 |

这张表告诉我们：

- 仅用常数 `log Z` 几乎没有释放潜力；
- FOR 比 backbone 好，但离 GFlowRL 差 **11.39** 点；
- 批内估计不是一个小工程 trick，而是目标可用性的关键。

#### 10.2 RandomLogZ 消融

FlowRL-RandomLogZ 在 7B 数学平均 **36.19**，略高于 FlowRL 的 **35.63**。

这个结果很有诊断价值：

- 如果 learned `Z` 是核心建模能力，随机化应显著变差；
- 结果没有这样发生；
- 说明 FlowRL 的收益主要来自 distribution matching 框架，而不是 partition model 本身；
- 进一步支持“删除 partition network”这个方向。

#### 10.3 Gradient norm 证据

Appendix E 的训练曲线报告：

- 在 Qwen2.5-7B 数学任务上；
- FlowRL 从 step 106 开始出现梯度爆炸；
- 总计记录 **55** 次 gradient explosion；
- GFlowRL 和 GRPO 的 gradient norm 始终更平滑。

这张图的作用不是证明 GFlowRL 一定最优，而是回答：

- 为什么同一个 GFlowNet 思想换一种 normalizer 就稳定了？
- 为什么 failure 不是随机 seed 或某个 benchmark 偶然坏掉？
- 为什么 MoE 和红队这种更噪任务会放大 FlowRL 的不收敛？

### 11. Figure/Table 证据如何串起来？

| 证据 | 支持的论点 | 不能证明什么 |
| --- | --- | --- |
| Table 2 数学 7B | GFlowRL 在多数学 reasoning benchmark 上优于 GRPO/FlowRL | 不能证明所有 verifier 质量下都成立 |
| Table 3 代码任务 | distribution matching 对代码搜索有价值 | 不等于真实软件工程任务已解决 |
| Table 4 红队 ASR@1 | 噪声 reward 下 GFlowRL 比 FlowRL 稳定 | ASR 高是攻击能力指标，不是安全防御指标 |
| Figure 2 Codeforces | 14B GFlowRL 接近 frontier rating | 单一竞赛评测不能代表通用推理能力 |
| Table 5 MoE | 同一 recipe 能跨 sparse scale 迁移 | 仍缺更广泛 MoE 架构和训练栈验证 |
| Appendix E gradient norm | learned `Z` 和梯度爆炸相关 | 相关性强，但不是完整因果证明 |
| Appendix F estimation ablation | 批内估计明显优于常数/FOR | 不说明最佳 group size 或 clipping bounds |

### 12. 与 GRPO、FlowRL、FOR 的位置关系

可以把这篇论文放在一个二维坐标里：

| 方法 | 目标倾向 | 是否学习 `Z` | 多样性来源 | 扩展风险 |
| --- | --- | --- | --- | --- |
| PPO/GRPO | reward maximizing | 否 | 主要靠采样、clip、group advantage | 模式坍缩 |
| FOR | distribution matching | 较简化 | flow objective | 估计能力有限 |
| FlowRL | distribution matching | 是 | trajectory balance + learned partition | 梯度和系统不稳定 |
| GFlowRL | distribution matching | 否，批内估计 | reward-proportional fixed point + group rollout | 小 group/high noise 下方差 |

因此 GFlowRL 的新意不是发明 GFlowNet，也不是否定 GRPO。

更准确地说：

- 它承认 GRPO 的工程形态很好用；
- 它保留 GFlowNet 的分布匹配目标；
- 它删除 FlowRL 中最难扩展的 learned normalizer；
- 它把“多样性”从 entropy bonus 转成训练目标的一部分。

### 13. 对 AI 安全和红队训练的特殊含义

论文把红队作为 benchmark，而不是安全防御论文。

但这个结果对 AI safety 仍有两层含义。

#### 13.1 攻击模型训练会更强

GFlowRL 在 AdvBench/HarmBench 上提高 ASR@1，说明：

- 分布匹配可以让攻击策略覆盖更多成功路径；
- 红队 attacker 不必只收敛到某类模板；
- 多样攻击路径对评测 frontier model 的安全边界更有压力。

这对防御方是提醒：

- 未来 automated red teaming 不一定只是 PPO/GRPO 风格；
- 高 ASR 的同时还可能有更强策略多样性；
- 防御评测要关注攻击分布，而不只是平均成功率。

#### 13.2 高 ASR 不是“更安全”的直接结论

需要区分：

- 作为 attacker trainer，ASR 越高说明红队能力越强；
- 作为安全部署，ASR 越高意味着如果技术被滥用也有风险；
- 论文没有给出 misuse mitigation 或 release policy 的完整讨论。

因此，这篇的安全价值更像：

- 提供更强评测工具；
- 暴露更难防的攻击多样性；
- 促使防御方在高多样性攻击下验证 guardrail。

### 14. 可复现性与局限

论文的局限可以分成四类。

| 局限 | 具体表现 | 读者应如何看 |
| --- | --- | --- |
| 理论边界 | fixed-point characterization 不是收敛证明 | 方法合理，但仍需经验验证 |
| 估计方差 | 批内 Monte Carlo 在 group size 小时可能更 noisy | group size=16 是当前经验点，不一定最优 |
| benchmark 范围 | 数学、代码、红队较集中 | 对长程 agentic task、工具调用、交互任务仍未知 |
| 代码开放 | 论文写 code will be released | 复现要等 repo 中训练脚本、数据和配置完整 |

论文自己也承认：

- clipping 和长度归一化会带来近似；
- 如果 response length 差异很大，length normalization 的假设更弱；
- reward/verifier 的质量会限制分布匹配目标；
- 高 ASR 红队能力有 broader impact 风险。

### 15. 研究者视角：这篇文章真正改变了什么问题？

我认为 GFlowRL 最值得带走的不是某个单表分数，而是一个后训练设计原则：

> 当一个目标函数需要额外学习归一化器时，先问这个归一化器是否真的带来信息，而不是默认它是理论形式中不可缺的组件。

对 LLM 后训练来说，这个原则有三点延伸。

#### 15.1 后训练算法要区分“理论必要”和“工程可学”

`Z(x)` 在 GFlowNet 理论里很自然。

但在 LLM 后训练里：

- 它的可学习性受模型规模、batch、reward 噪声、训练步数限制；
- 它的优化动态和 policy 不对称；
- 它的系统开销会进入真实训练成本。

这提醒我们：

- 不能把小模型或离散任务里的模块原样搬到大模型 RL；
- 也不能只看 fixed point，而不看到达 fixed point 的训练路径；
- scalable post-training 的算法设计必须和分布式系统一起考虑。

#### 15.2 多样性应当进入目标，而不只是事后修补

许多后训练方法把 diversity 当作：

- entropy bonus；
- temperature 调参；
- rejection sampling 保留多样候选；
- evaluation-time best-of-n。

GFlowRL 的路线不同：

- 目标分布本身按 reward 分配概率；
- 多条高奖励路径天然有概率质量；
- 训练不是先坍缩再补 entropy。

这对 agent 和 reasoning 尤其重要：

- agent 任务常有多种工具调用路径；
- 代码任务常有多种实现策略；
- 安全红队常有多种攻击语言和场景；
- 单一最优模式不一定最稳。

#### 15.3 下一个问题是“交互式轨迹”的分布匹配

本文的 `y` 主要还是完整 response 或 attack string。

更开放的问题是：

- 多轮 agent 轨迹能否用同样的 in-batch normalizer？
- tool call 的离散动作、环境状态和失败恢复如何定义 reward-proportional distribution？
- 如果 reward 来自延迟任务成功，而不是单次 verifier，flow gap 怎么分配到中间步骤？
- 在安全场景里，如何防止更强红队训练方法被直接转成滥用攻击器？

这些问题会把 GFlowRL 从 reasoning post-training 推向 agent post-training。

### 16. 结论

- GFlowRL 的核心贡献是把 GFlowNet-style RL 的扩展瓶颈从“学好 `log Z(x)`”改成“用 rollout group 做批内估计”。
- 这不是简单删模块，而是保留 trajectory balance 的分布匹配语义，并用 importance sampling 与 asymmetric clipping 处理真实训练中的 drift 和 outlier。
- 实验上，它在数学、代码、红队、MoE 四类场景都给出稳定性和性能证据；最强证据是 FlowRL 在红队与 MoE 不收敛时，GFlowRL 仍能训练。
- 证据边界也清楚：理论上是 fixed-point characterization，不是全局收敛；复现依赖代码发布；更复杂 agentic 交互还需要重新定义 trajectory、reward 和归一化估计。
- 对后训练研究而言，这篇论文把一个重要问题摆到台面上：**大模型 RL 的目标函数不仅要“理论上对”，还要在有限 batch、长 rollout、噪声 reward 和分布式系统里可学、可稳、可复用。**

### 17. 复现时最该盯住哪些变量？

如果后续代码和训练脚本开放，复现不应只看最终 benchmark 分数。

更有价值的是把下面几组变量单独拉出来：

| 复现变量 | 为什么关键 | 建议观察 |
| --- | --- | --- |
| rollout group size | 批内 `hat Z_B` 的方差直接取决于每个 prompt 的样本数 | 8、16、32 组下的准确率、diversity、gradient norm |
| reward sparsity | 数学、代码、红队的 reward 噪声不同 | 二值 reward、pass-rate reward、classifier reward 分别测试 |
| clipping 上下界 | 非对称裁剪决定正负 residual 的更新空间 | 记录正确低频解是否被过度压制 |
| rollout lag | 分布式系统中 `pi_old` 与 `pi_theta` 的差距会变化 | 观察 importance weight 分布和截断比例 |
| response length | 长推理会改变 log-prob 尺度 | 检查长度归一化在短答/长答混合任务上的偏差 |
| verifier 错误 | reward distribution matching 会按错误 reward 分配概率 | 人工抽检高 reward 错误样本是否被放大 |

这张清单背后的判断是：

- GFlowRL 的收益不只来自一个公式；
- 它依赖 batch 内样本、reward、clip、policy lag 的共同平衡；
- 如果迁移到新任务，最先坏掉的也往往是这些变量，而不是论文主表里的平均分。

### 18. 对后训练系统设计的三个实际启发

第一，**把辅助模块当成系统负债审查**。

- 新增 reward model、value head、partition head、critic 或 judge，都不只是“多一个小网络”；
- 它们会带来初始化、同步、学习率、checkpoint、监控和故障恢复成本；
- 如果辅助模块不能稳定贡献信号，就应该优先寻找无参数估计或批内统计替代。

第二，**把分布目标和采样预算一起设计**。

- Distribution matching 需要看到足够多的候选轨迹；
- 如果每个 prompt 只采样很少回答，`hat Z_B` 会变成高方差估计；
- 如果采样预算足够，分布匹配才可能真正覆盖多条高质量路径。

第三，**把失败模式放进训练监控**。

- 平均 reward 上升不代表分布健康；
- Codeforces rating 上升不代表所有题型都变稳；
- ASR@1 上升不代表攻击分布更可解释；
- 复现时应同时监控 gradient norm、importance weight、clip 命中率、response diversity 和 verifier disagreement。

### 19. 还值得继续追问的问题

| 问题 | 可能的研究方向 |
| --- | --- |
| `hat Z_B` 能不能跨 batch 平滑？ | 用 moving average 或 prompt cluster 缓存降低方差，但要避免重新引入滞后 normalizer |
| 多轮 agent 轨迹怎么定义 reward distribution？ | 把 tool call、observation、失败恢复都纳入 trajectory，而不只看最终文本 |
| 安全红队如何限制滥用？ | 发布 attacker training recipe 时配套受控评测、访问限制和防御基准 |
| 和 DPO/IPO/OPD 能否结合？ | 用 preference 或 on-policy distillation 产生 reward，再用 GFlowRL 保持多样高分路径 |
| 能否用于数据合成？ | 让模型按 reward 分布生成多样解法，再筛给 SFT 或 verifier training |

这些追问说明 GFlowRL 更像一个方向开口：

- 它不是后训练的终点；
- 它把 GFlowNet-style 目标带回到可扩展训练栈里；
- 下一步要看它能否从单轮 reasoning 扩展到 agentic decision making、工具使用和安全评测。
