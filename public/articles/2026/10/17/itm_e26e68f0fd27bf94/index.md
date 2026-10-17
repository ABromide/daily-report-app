# PACT：把扩散语言模型的 RL 信号对齐到自己的去噪轨迹

- **论文**：[RL Post-Training Diffusion Language Models Along Their Own Generation Paths](https://arxiv.org/abs/2610.17266)
- **版本**：Vaibhav Singh、Eugene Belilovsky；arXiv v1，2026-10-12 18:22 UTC。
- **类别**：大模型后训练；基座：LLaDA-8B-Instruct；任务：可验证奖励的推理 RL。
- **一句话**：PACT 用中间状态势函数，把一次实际揭示 token 的相对概率变化约束成该步骤对未来成功希望的增益，而不是将一个整题奖励平铺给所有去噪步骤。

## TL;DR

- **问题**：扩散语言模型同一答案可以走过许多 unmasking 路径。完整答案概率要对所有路径求和；给整条 completion 同一个 advantage，又会让有益与有害转移互相抵消。
- **方法**：PACT 为部分答案学习势函数 f=log h，让已提交 token 相对冻结参考模型的 log 概率比匹配前后势能差；终局 verifier reward 为锚。因此不需估计整句 likelihood 或进行 ratio clipping。
- **证据**：GSM8K、MATH500、Countdown、4×4 Sudoku 的 256-token 结果相对 LLaDA-8B-Instruct 分别提高 **9.9、12.0、55.7、72.6** 点；四任务均值 **78.2%**，高于 DTM 的 74.5%。
- **效率**：GSM8K 上 PACT 在 **28.6 GPU-hours** 首次达到 AGRPO 最佳 85.1%，AGRPO 需 53.4 GPU-hours；但 PACT 每 batch 为 41.3 秒，AGRPO 为 37.5 秒，不能把该曲线外推成普遍减半成本。
- **局限**：仅一个 8B 基座和四项 verifier-friendly 数学/合成任务；MATH500、Sudoku 的领先约一个标准误，Countdown-256 落后 DTM 1.4 点；部分基线是文献自报，AGRPO Countdown rerun 还存在作者未解释的差异。

## 1. 研究问题：为什么 completion 级奖励太粗？

### DLLM 的路径不是固定左到右序列

从全 mask 状态 x_T 到答案 x_0=y，第 t 步选择还遮挡的位置集合 S_t，并写入 token：

$$
P_\theta(x_{t-1}\mid x_t,S_t)=\prod_{i\in S_t}\pi_\theta(a_i\mid x_t,i).
$$

| 量 | 含义 | 对训练的后果 |
| --- | --- | --- |
| x_t | 当前半成品答案 | 同一个最终文本可由不同中间态到达 |
| S_t | 此步提交的位置集合 | reveal order 也是决策自由度 |
| a_i | 写到位置 i 的 token | 可从这次前向传播直接评分 |
| pθ(y\|q) | 所有到达 y 的路径之和 | 精确边际化难以承担 |

序列级 RL 因而同时面对两件事：

1. **likelihood 问题**：若目标依赖完整 pθ(y|q)，必须处理全部 unmasking orders。
2. **credit 问题**：正确答案里早期坏转移与后期修复转移会共享同一 reward；全路径残差可很小，局部错误依然很大。

作者称第二种遗漏为 trajectory blindness。它并不是说已有方法完全不看中间步，而是它们通常不显式要求：这个具体转移让未来可得 reward 增加了多少。

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 局部转移应有局部信用 | 势能差约束 token log-ratio | 四任务、TraFL 对照 | 仅约束实际采样转移 |
| 不必估整句 likelihood | 评分已揭示 token | Eq.1、Eq.5 | 仍有采样与表示近似 |
| 局部项防止抵消 | 每一步独立平方 residual | 消融 | 不等于所有基线统一重跑 |
| 有效率潜力 | 更早达到 AGRPO best | Figure 4 | 只在 GSM8K 条件 |

## 2. 方法：从 reward tilt 到局部 path consistency

### 理想分布：偏向好答案，仍以参考模型为锚

给定冻结参考 p_ref、终局奖励 r(y)∈[0,1]、温度 β，KL 正则化的理想轨迹分布为：

$$
p^*(\tau\mid q)=\frac{1}{Z_q}p_{ref}(\tau\mid q)e^{r(y)/\beta},\quad
Z_q=\sum_\tau p_{ref}(\tau\mid q)e^{r(y)/\beta}.
$$

- β 小会更猛烈偏向高 reward，也放大梯度与方差。
- 该目标对**轨迹**倾斜；相同 completion 下，理想情况仍保留参考模型对路径的条件偏好。
- 困难在于 Z_q 和任意半成品的未来回报都无法枚举。

PACT 定义势函数：

$$
h(x)=\mathbb E_{p_{ref}}[e^{r(y)/\beta}\mid x],\qquad f_\phi(x)=\log h_\phi(x).
$$

理想 Doob h-transform 为：

$$
P^*(x'\mid x)=P_{ref}(x'\mid x)\frac{h(x')}{h(x)},\quad
\log\frac{P^*(x'\mid x)}{P_{ref}(x'\mid x)}=f(x')-f(x).
$$

这里的因果解释很精确：不是把正确答案的全部 token 都抬高概率；而是只有**提高部分答案未来成功势能的步骤**应相对参考被放大。

### 实际目标：理论 h-transform 不是直接可得的

作者用两层 MLP potential head，从 answer window 的 mean-pooled hidden state 预测 fφ。对一次记录的转移：

$$
u_t=\sum_{i\in S_t}\log\frac{\pi_\theta(a_i\mid x_t,i)}{\pi_{ref}(a_i\mid x_t,i)},\quad
g_t=f_\phi(x_{t-1})-f_\phi(x_t),\quad
\delta_t=u_t-g_t.
$$

$$
\mathcal L=\mathbb E[\delta_t^2+
\sum_{x\in\{x_t,x_{t-1}\}}(f_\phi(x)-r(y)/\beta)^2].
$$

| 组成 | 直接作用 | 不能保证什么 |
| --- | --- | --- |
| consistency residual | token 相对变化匹配势能增益 | 不自动等于真实 reference 条件期望 |
| reward anchors | 用观测到的终局 reward 标定中间值 | 更接近 rollout 的 Monte-Carlo value fit |
| frozen reference | 限制更新不要无锚漂移 | 不是安全或质量 verifier |
| token-only residual | 避免训练顺序 likelihood | 默认不直接优化 order |

论文明确说明 r/β 只是可操作的回归 target。理想的 log E_ref[exp(r/β)|x] 与 rollout 分布下估计不同；Jensen 不等式意味着两者不能混同。因此 PACT 是理论 h-transform 的近似工程实现，而非精确解。

## 3. 训练流程：如何把终局 reward 变成局部监督？

~~~text
Input: prompts D, policy πθ, frozen reference πref, potential head fφ
State: tilt β, N rollouts/prompt, K sampled transitions/path
for each optimization step:
  sample prompt batch
  sample xT → ... → x0=y with stochastic-confidence order
  verify y and set terminal target r(y)/β
  choose K transitions stratified along the path
  compute token log-ratio u and potential gain g
  add (u-g)^2 and two endpoint anchors
  update θ and φ
Output: πθ; potential head is training-only
~~~

~~~mermaid
flowchart LR
  Q[Prompt] --> XT[全 mask x_T]
  XT --> X[采样位置顺序与 token]
  X --> Y[完成答案]
  Y --> R[verifier reward]
  X --> F1[potential f(x_t)]
  Y --> F0[potential f(x_t-1)]
  F1 --> L[局部一致性损失]
  F0 --> L
  R --> L
~~~

- 位置顺序来自模型 confidence 的 stochastic order，τo=0.2；趋零时近似 confidence decoding。
- 每条路径仅分层评分 K 个步骤。作者认为路径内步骤共享同一终局边界、相关性高，更多独立 rollout 比更多同路径点更能减少主要噪声。
- potential head 只在训练期使用；推理仍由 policy 单独解码。

## 4. 实验设置：什么是公平对照？

| 设置 | PACT 取值 | 意义 |
| --- | --- | --- |
| 基座 / 微调 | LLaDA-8B-Instruct；LoRA rank 128 | 无 SFT，只训 LoRA 与 potential head |
| 预算 | 900 batches；16 prompts×8 rollouts | 每 25 batch 评一次 |
| 生成 | 长 256、block 32、128 去噪步 | 训练与主评测对齐 |
| 采样 | τo=0.2；T=0.6，Countdown 为 0.9 | top-p 0.99、top-k 150 |
| 硬件 | 16 H100 | per-device batch 8 |
| 评测 | greedy Pass@1，T=0 | 对可重跑项统一协议 |

GSM8K/MATH500 用格式加 exact match；Countdown 验证算式、目标和数字使用；Sudoku 按空格正确率给 reward。这些任务很适合验证 credit assignment，却不覆盖开放偏好、长文事实性和真实 Agent outcome 的噪声 reward。

基线要分两层：

1. **统一重跑**：AGRPO、wd1、DMPO 均用 900 rollout rounds，标记为 †；它们是最强的预算匹配证据。
2. **文献自报**：d1、SPG、UniGRPO、RSPO、MAPG、DAM、DTM 使用原论文行。训练数据、split、checkpoint 选择仍可能不同。

附录披露的 AGRPO 异常不能跳过：当前 rerun Countdown-256 是 42.2，早期版本 40.0，而本文文字还出现 79.7；作者没有找到来源。这不自动否定 PACT，却阻止读者把表内每个差异都当作确定算法因果。

## 5. 结果：平均领先与逐项边界

### 相对 base 的增益

| Benchmark，256 | Base | PACT | 增量 | 可支持的结论 |
| --- | ---: | ---: | ---: | --- |
| GSM8K | 79.2 | 89.1 | +9.9 | 数学文字题有实质提升 |
| MATH500 | 32.4 | 44.4 | +12.0 | 竞赛数学提升，绝对水平仍有限 |
| Countdown | 24.2 | 79.9 | +55.7 | verifier-friendly 算术收益最大 |
| Sudoku | 26.9 | 99.5 | +72.6 | 小棋盘任务接近饱和 |

Figure 3 中，PACT 四项 rollout reward 均高于同 rollout budget 的 AGRPO；Sudoku 约 step 291 已到 0.90，AGRPO 同时约 0.39、到 step 900 才到 0.84。这是训练 reward 的优势，不应直接读成所有开放推理都泛化。

| 指标 | PACT | 最强其他 | 正确解读 |
| --- | ---: | ---: | --- |
| 平均，256 | **78.2** | DTM 74.5 | +3.7，是最稳健的总览 |
| GSM8K，256 | **89.1** | SPG 86.1 | +3.0，约 3 个标准误 |
| MATH500，256 | **44.4** | MAPG 42.2 | +2.2，约 1 个标准误 |
| Countdown，256 | 79.9 | **DTM 81.3** | PACT 不是每列第一 |
| Sudoku，256 | **99.5** | DTM 99.2 | +0.3，接近单题尺度 |
| 平均，512 | **78.7** | DTM 75.4 | +3.3 |

Figure 1/Table 1 的正确结论是跨任务平均优势和一致 base gain，而不是“全部指标压倒”。Countdown-512 的 80.7 才是最高；Sudoku-512 与 DTM 都是 99.4。

### Figure 4 的算力含义

PACT 每评分转移额外有两次有梯度 forward、一次无梯度 reference pass，故每 batch 41.3 秒，AGRPO 37.5 秒；900 batches 是 165 对 150 GPU-hours。

更有用的同算力读法是：AGRPO 最佳 GSM8K 85.1% 发生于 53.4 GPU-hours，PACT 在 28.6 GPU-hours 首次触及；在 50、100、150 GPU-hours，PACT 分别领先 2.6、4.0、5.1 点。作者也提醒 crossing 受 checkpoint noise 影响，所以“约 2×”只能限定在这条曲线。

## 6. 消融与失败：PACT 的收益不是来自什么？

| 改动 | GSM8K best | 代价或现象 | 可得结论 |
| --- | ---: | --- | --- |
| K=8/16/32/64 | 88.4/89.1/88.6/89.4 | 32.8/41.1/58.3/92.0 秒每步 | K=16 是成本折中 |
| τo=0.05/0.2/1/5 | 88.8/89.1/88.3/89.3 | 近随机时 rollout reward 更差 | 准确率对顺序温度不敏感 |
| 显式 order gradient | shared 87.7；head 88.6 | 都低于 89.1 | 未证明学顺序有益 |
| β=0.05/0.1/0.2/0.5 | 89.1/89.1/87.3/86.0 | 过强先不稳，过弱欠训 | β 最敏感 |

这是一项有价值的负结果：reveal order 是 DLLM 特有自由度，但不能把 PACT 成功归因于“学到更佳顺序”。证据更支持局部 token credit。

TraFL 共享 tilted target、frozen reference 和平方残差，却以每个 completion 一个残差、masked-reconstruction surrogate 近似序列 likelihood。作者 matched implementation 下：

- β=0.05 时 residual 基本不动，四-mask 噪声盖过 target gap。
- 最好的 β=1 在约 step 300 到 83.4 后下降；β=10 使自身样本 log-ratio 变负，reward collapse。
- 最后三分之一训练里，PACT 领先两个可用设置 8.6、12.8 点；但这是作者 sampler、复合 reward 与 greedy Pass@1，不是对 TraFL 原始 Pass@5 的直接裁决。

## 7. Figure/Table 证据地图

| 图表 | 支持什么 | 不支持什么 |
| --- | --- | --- |
| Figure 1 / Table 1 | 四任务、两长度、平均与逐列结果 | 所有单项显著优于所有基线 |
| Figure 2 | head、anchor、residual 信息流 | 实际 loss 精确等于理想 h |
| Figure 3 | 同 rollout budget 的 reward 曲线 | 开放任务泛化 |
| Figure 4 | GSM8K 到 AGRPO best 的时间点 | 普遍 2× 成本节省 |
| Figure 5 / Table 2 | K、顺序、β 消融 | 穷尽模型规模和超参 |
| Figure 6 | PACT 对本地 TraFL 实现更稳 | 对所有 trajectory balance 定论 |

## 8. 相关工作与结论边界

- **likelihood-based DLLM RL**：d1、wd1、SPG、RSPO、AGRPO、MAPG 近似 completion likelihood 或共享 completion advantage。PACT 的增量是让实际 reveal transition 显式对应相邻势能变化。
- **likelihood-free matching**：DMPO、DTM、DAM 同样避开整句 likelihood，却使用 reward 加权去噪、构造状态或 adjoint；PACT 只约束采样器实际走过的状态对。
- **GFlowNet / path consistency**：逐步势能比可视为 reference-relative detailed balance。所有 residual 相加会得到 trajectory balance；PACT 的主张是不要只约束和为零，因为中间错误可以抵消。

PACT 最值得带走的是局部 credit-assignment 假设：生成器的动作顺序不等于文本位置顺序时，reward 应通过中间状态未来可完成性回传。它在 LLaDA-8B 与四个可验证任务上有强而有限的证据。

后续研究需检验四点：

1. 偏好、事实性、长程 Agent outcome 的 noisy reward 下，rollout anchor 偏差会否放大；
2. 单一 8B、256-token geometry 能否推广到更大 DLLM、长上下文和不同 block；
3. order gradient 的失败来自 objective、confidence parameterization，还是任务本身；
4. 应公开 seed、verifier、checkpoint、compute trace，并解释 AGRPO Countdown 差异。

最谨慎的结论是：PACT 是一个有说服力的局部信用分配方案，在受控可验证推理中显示平均优势；它尚不是扩散模型通用推理、开放 reward 或 Agent RL 的统一答案。


## 9. 从公式到训练动态：每个设计为什么存在？

### 为什么不直接学习一条完成答案的值？

把终局 reward 回归到一个 completion value 看似足够，但扩散解码的一次输出不是单步动作，而是一串「选位置—填 token—更新可见上下文」的连续决策。若只在终局放一个标量，模型看不到哪些局部提交真的降低了后续 completion 的不确定性。

PACT 以势函数增量处理这个问题。若一次转移把冲突的算式、错误的数字位置或不一致的 Sudoku 候选变得更容易完成，理论上它应有正势能增益；如果只是写入无帮助甚至妨碍后续的 token，其相对参考模型的偏移就不应被同样奖励。这比「答案正确，所以整条轨迹都好」更细。

势函数不是神谕。它从同一模型 hidden state 读出，由采到的终局结果监督，可能把格式、数据集模式或 rollout 偏好当价值。冻结 reference 与 anchor 能缓和漂移，却没有用独立 reward model 证明势函数语义完全可解释。

### 为什么是参考相对的 log-ratio？

直接最大化 reward 容易让分布突然坍向少数高分格式。参考相对项把问题改成：「相对 base，这一步 token 概率应改多少？」这保留 KL 正则化的行为锚。

对实际提交位置集合，u_t 是各 token log 概率比之和。有两个好处：不必对未提交位置与其他顺序积分；所需概率来自当前 policy forward。代价是默认只评分 token factor，position order 仍由 confidence 抽样影响轨迹。

论文尝试加入 order log-ratio，结果降分。这说明「理论上存在可学习信号」和「此参数化、此任务下可以稳定学」不是同一件事。不要把 PACT 的成果归因于 learned reveal order。

### 为什么 local residual 比 trajectory balance 更严格？

把每步 residual 相加时，中间势能项 telescope，只剩轨迹级比值、reward 和初始 normalizer。trajectory balance 的优点是简洁；弱点也在这里：早期过度偏移可被后期反向偏移抵消，总和正确而局部错误仍大。

PACT 对每步先平方再相加，要求每个局部守恒尽量成立。它不是无条件更强：若势函数错误、reward 噪声大或采样不足，强局部约束也会过拟合坏估计。TraFL 对照支持 PACT 在作者设置中较稳定，还需在其他长度、sampler 和非二值 reward 下复验。

## 10. 数据、奖励与评测协议的细节

| 任务 | reward | 它测试的机制 | 它没有测试的机制 |
| --- | --- | --- | --- |
| GSM8K | 格式+最终答案 | 多步符号推理信用 | 长文事实检索 |
| MATH500 | 格式+最终答案 | 更难数学泛化 | 真实用户偏好 |
| Countdown | 算式、目标、数字使用 verifier | 组合约束局部修复 | 自然语言帮助性 |
| 4×4 Sudoku | 空格正确比例 | 密集部分 reward | 大尺度规划 |

Countdown 与 Sudoku 的巨大增幅有双重意义：明确 verifier、局部结构强的任务正适合展示势函数信用分配；同时 base 很低时改善空间也大，接近饱和的 Sudoku 不代表已得到可迁移开放推理能力。

论文统一使用 greedy Pass@1，避免不同采样数的混淆；这是优点。每 25 batches 评 checkpoint 并报告最佳 test accuracy 仍有选择效应：反复查看测试集的 best-of-many 会高于固定 step 的预注册估计。Table 1 应理解为给定该选择规则的最优可达表现，而不是无条件线上期望。

训练 budget 的两种横轴都不能省：

- 相同 rollout 数衡量是否更有效使用相同环境交互与奖励；
- 相同 GPU-hours 衡量工程成本是否值得；
- 两者都好才最有说服力。

PACT 在前者每 batch 更贵，在 GSM8K 后者更快跨过 AGRPO 最好点，并不矛盾：更好信用信号能少用 batch 达目标，但每 batch 要更多 forward。

## 11. 复现清单与失败模式

1. **基座与 geometry**：LLaDA-8B、256 length、block 32、128 去噪步；改变它们会同时改变路径长度与局部项数量。
2. **参考语义**：LoRA disabled 的冻结 policy 是 reference；若误用更新模型，log-ratio 锚会移动。
3. **reward 实现**：格式、exact match、Countdown 数字合法性、Sudoku 已填格处理必须固定。
4. **transition 抽样**：K=16 的分层评分不能随意变成只抽早期或末尾，否则信用覆盖不同。
5. **head 优化**：潜力 head 有独立学习率与 gradient clip；遗漏会把不稳定误归因给方法。

| 失败 | 表现 | 诊断 | 缓解 |
| --- | --- | --- | --- |
| β 太小 | 信号弱、欠训练 | reward/accuracy 均低 | 调高 tilt 或搜索学习率 |
| β 太大 | 早期 overshoot | log-ratio、reward 波动 | 降低 tilt |
| 势函数误校准 | 局部高分、终局不升 | anchor 对 held-out reward | 增加 rollout 与独立校验 |
| order 干扰 | 显式梯度降分 | shared/head 消融 | 保持 token-only |
| 基线不可比 | 优势难复现 | 同 budget 重跑 | 明示自报与重跑 |
| reward hack | 格式分升、真正确性不升 | 分解奖励 | 强 verifier |

## 12. 对后训练和 Agent 的有限延伸

PACT 的局部势能视角可能启发 Agent：工具调用、计划步骤和状态摘要同样构成非左到右的动作轨迹，最终任务成功也不能公平平均分给每步。但这只是机制类比，不是本文现有实证。

迁往 Agent 前至少要验证：

- Agent 终局 reward 延迟、稀疏且受环境随机性影响，potential anchor 方差可能远高于数学 verifier；
- 状态含工具观测、外部副作用与权限，reference-relative probability 不代表安全；
- 局部提高成功率的动作也可能提高危害，必须与动作风险约束、审批或 sandbox 联合。

对 AI 安全而言，教训是：更好的 credit assignment 不自动等于更安全的 credit assignment。若 reward 未编码权限、外部副作用与人类确认，势函数会忠实优化被度量目标，而不是未度量的边界。

## 13. 最终判断

可信核心是清晰的机制主张：在 DLLM 多路径去噪中，让实际转移的相对概率变化对齐估计势能变化，可以减少 completion-level 信号过粗造成的信用错配。它有完整公式、直接实现、对紧邻轨迹平衡方法的受控对照，以及四项可验证任务上的强结果。

边界同样明确：未证明对多模型规模、开放语言任务、真实偏好 reward 或工具 Agent 的泛化；部分比较是自报；best checkpoint 与 AGRPO 不一致数字需要独立复现。把它作为 DLLM 后训练中优先复验的局部 credit-assignment 方案是合理的；把它当作通用 RL 答案则超出证据。
