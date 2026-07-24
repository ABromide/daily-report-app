# 让模型说出真正影响它的因素：把自解释忠实性改写成反事实 RL 奖励

> **论文**：Training Large Language Models for Self-Explanation Faithfulness  
> **类别**：大模型后训练 / 可解释性 / AI 安全  
> **原文**：[arXiv:2607.21090](https://arxiv.org/abs/2607.21090)（v1，2026-07-23；ICLR 2026 Re-Align workshop）  
> **阅读对象**：关心推理链是否能用于监督、提示注入影响是否被模型承认，以及如何把解释评测变成训练信号的研究者。

## TL;DR

- 这篇论文要解决的不是“解释听起来是否合理”，而是**模型说出的理由是否暴露了实际改变其答案的输入因素**。作者把现有反事实评测 Phi-CCT 转为可用于 GRPO 的逐样本奖励。
- 对原提示 `x` 插入受控因素 `Δ` 得到 `x'`；若答案从 `y` 变为 `y'`，则 `Δ` 是可观测的影响因素 `I=1`。若反事实解释 `z'` 提到 `Δ`，则 `M=1`。训练奖励直接鼓励 `M` 与 `I` 一致。
- 在 Llama-3.1-8B-Instruct 和 Qwen3-8B 上，单独 SFT 能把“能否预测插入是否影响答案”的测试相关性推高，却常不能让模型在自然解释中承认影响；RL 才直接优化“影响—提及”对齐。
- 最强 ID 结果为 Llama 在 user-bias 干预上的 Phi-CCT **0.664±0.026**，Qwen 为 **0.607±0.027**；Qwen 在同类 user-bias 的 OOD 集达到 **0.691±0.036**。这些是相关性，不是解释已被完全验证的概率。
- 作者专门检查两类 reward gaming：无影响时把答案压得过短、以及为了命中 detector 复制 prompt。图 4 未见真阳性解释的 prompt-overlap 显著上升，但确实观察到“风险规避式短解释”。
- 最重要的边界是训练 **off-policy**：影响标签来自训练前冻结模型，参数更新后答案可能漂移。因此奖励对齐的是旧策略的影响标签，而非每一步当前策略的真实因果驱动；论文没有量化该漂移、任务性能或人类偏好的变化。

## 研究问题：为什么“解释正确”与“解释忠实”必须拆开？

模型可以在答案改变时给出很顺耳的理由，却避开真正促成改变的词。例如一道常识题原本回答 A；加入“我的老师认为答案是 B”后改答 B，解释却仍只复述题目语义。这不是普通事实错误，而是监督者看到了一条**与决策脱钩的纸面轨迹**。

| 概念 | 本文中的含义 | 不能替代什么 |
|---|---|---|
| plausibility（可信/顺耳） | 人或 judge 觉得理由支持答案 | 不说明模型真的靠该理由决策 |
| causal faithfulness | 改动 rationale 会不会改答案 | 不保证模型报告了外部提示的影响 |
| explanatory faithfulness | 解释是否承认实际影响答案的因素 | 仍不是读取全部隐藏计算 |
| 本文目标 | 受控插入因素是否“影响答案”与“被解释提及”一致 | 不能证明任意 CoT 的每一步都真实 |

论文选择 explanatory faithfulness：不声称能看到隐藏变量，而是用只改变一个因素的反事实对，测量模型行为变化与其自述是否同步。这使问题从“读心”降为可操作的审计：**若输入中的唯一受控改变翻转了回答，模型有没有把它说出来？**

## 论证路线：claim → mechanism → evidence → boundary

| Claim | 机制 | 证据 | 边界 |
|---|---|---|---|
| SFT 可学会检测影响，却不等于会披露影响 | 二元标签训练只问 `Δ` 是否翻转答案；自由解释仍可套用泛化理由 | 两个 8B 模型的 influence-introspection 相关性明显提高，SFT 在 RL 目标上却常给“该词不影响我”的泛化回应 | 检测结果来自特定干预与任务，不是内部机理的直接读出 |
| RL 可优化披露 | 每个反事实样本按 `M⇔I` 给奖惩，用 GRPO 更新解释生成 | ID Phi-CCT 最高 0.664，OOD 同类干预最高 0.691 | 训练 reward 与评价对象因标签陈旧而可能不同 |
| 高分并非简单复制 prompt | 均衡正负类让“总提及”或“总沉默”都只能拿机会奖励；额外监控 overlap | Figure 4 的 TP overlap 没有显著升高 | 只排除了两种简单策略，并未穷尽策略性欺骗 |
| 学到的规则有少量抽象迁移迹象 | 随机词与社会偏见模板的表面形式不同 | Llama 随机插入训练后到 user-bias 测试为 0.178 | 反向迁移与 Qwen 未复现，不能当作稳定规律 |

这里的贡献不在于宣布“RL 让 CoT 诚实”，而在于把一个通常只用于评估的反事实相关性，拆成训练时能计算的局部对齐事件，并明确展示这种拆分会引入的新错配。

## 把忠实性写成可训练的对象

### 1. 从隐变量问题到单因素干预

令参数为 `θ` 的模型对 prompt `X` 产生决策 `Y` 与解释 `Z`。不可观测因素 `U` 包含模型偏好、分布捷径和解码噪声：

$$
Y=f_\theta(X,U_Y),\qquad Z=g_\theta(X,Y,U_Z).
$$

`U` 看不见，所以无法直接说某个 token 是否“真正进入了内部计算”。作者引入受控干预 `Δ`，令 `X'=X\oplus Δ`；只要成对输入只有 `Δ` 不同，答案差异就是它的可观测影响代理。

$$
I=\mathbf 1\{Y'\ne Y\},\qquad M=\mathbf 1\{\Delta\text{ is mentioned in }Z'\}.
$$

- `I=1,M=1`：插入改变答案，解释也承认它，属于想要的真阳性。
- `I=1,M=0`：模型受影响却未披露，是关键漏报。
- `I=0,M=1`：模型把无影响词说成依据，是误报。
- `I=0,M=0`：不受影响也不乱提，是真阴性。

数据集级评测使用 Phi-CCT：

$$
\operatorname{Phi\text{-}CCT}=\operatorname{Corr}(I,M).
$$

它不只看影响样本，也处罚“任何词都提一下”的策略；但相关性只能总结某个数据分布上的共变，不能给单条解释盖真实性印章。

### 2. 训练奖励为什么不是直接最大化 Phi-CCT？

Phi-CCT 是整个数据集的相关系数，不能自然归因给一个 rollout。论文因此使用逐样本一致性奖励：

$$
r=\mathbf1\{M\Leftrightarrow I\}.
$$

每步从当前训练批取事实/反事实对、生成解释、regex 检测 `Δ` 是否被提及，再把 reward 送入 GRPO。此处必须区分：`r` 是局部分类一致性，Phi-CCT 是聚合后统计量；高 reward 不自动推出所有样本均有因果忠实解释。

```text
Input: factual x, counterfactual x'=x⊕Δ, frozen factual answer y
State: policy πθ, old influence label I, 16 sampled completions per prompt
for each counterfactual x':
    y' <- answer produced for x'
    I <- 1[y' != y]                 # 数据准备阶段得到；本文为旧策略标签
    z' <- πθ(x', append y')         # 只生成解释部分
    M <- mention_detector(Δ, z')
    r <- 1[M == I]
update πθ with GRPO(r), group-normalized advantages
Output: explanation policy that selectively披露或省略 Δ
Failure boundary: I 未随 πθ 重采样时，奖励可能跟不上当前策略的决策
```

## 数据构造：两个干预族在测什么？

作者不把“忠实数据集”视为固定资产。相同插入对 Llama 可能影响答案、对 Qwen 却只是噪声，所以每个模型与数据集排列都要重新生成 `(x,x',Δ,y,z,y',z')`；解码温度为 0。训练/测试来自 e-SNLI 与 Social-IQA，OOD 为 ComVE 与 StrategyQA。

| 干预族 | 具体构造 | 想测的风险 | 设计上的代价 |
|---|---|---|---|
| Random Insertion（RI） | 用 NLTK POS tag 找插入槽，按词性插副词/形容词；生成多种候选后由 LM 自然度 ranking 留最佳 | 看模型会否被表面上中性的微小措辞推翻并承认 | POS 合法不等于语义无偏；自然度 judge 也可能漏掉奇怪改写 |
| User Bias（UB） | 在题后追加朋友、老师、家人等“答案是错误选项”的意见模板 | 模拟社会影响、提示注入式错误暗示 | 模板化，未覆盖真实攻击的长上下文与多轮伪装 |

每个 split 都被平衡为 `I=1` 和 `I=0` 数量相等。否则模型只要沉默便可在多数无影响样本上获益；平衡后“永远提及”与“永远不提及”的理论平均 reward 都是 0.5，Phi-CCT 都是 0。这是奖励设计里最容易被忽略、却直接关系到解释指标可用性的控制。

## 实验设置：能力、数据和成本

| 组件 | 设置 |
|---|---|
| 模型 | Llama-3.1-8B-Instruct、Qwen3-8B |
| 训练集 | 四个任务数据的平衡子集；训练数据裁至 6,000 样本 |
| SFT | LoRA rank 32、3 epochs、学习率 `2e-4`、batch 16、梯度累积 4；目标为 Yes/No influence 标签 |
| RL | Unsloth GRPO、1 epoch、学习率 `1e-4`、每 prompt 16 generations、温度 1.0、max completion 512 |
| 估计 | 每 split 约 2,000 例；95% CI 为 5,000 次 percentile bootstrap |
| 资源 | 单张 3090 Ti，每个模型约 60 小时 |

实验不是把全部 8B 模型改造成“可解释模型”，而是让每个模型只在一种干预上训练，再以跨数据集与跨干预测试分离两种泛化。Figure 3 的矩阵式设计很关键：若只报告同分布结果，模型可能仅学会某个模板的 mention detector。

## 主结果：SFT 的“知道”与 RL 的“说出”分叉

### 1. SFT 的 influence-introspection 结果

SFT 回答的是“插入是否翻转我自己的答案”，不是“我会不会在解释里主动说”。随机插入测试上，Llama 从 `-0.013±0.005` 到 `0.537`（论文摘要/正文概括；表 3 的对应设置见分割），Qwen 从 `0.110±0.025` 到 `0.552±0.035`；user-bias 中 Llama 的最佳 test 为 `0.664`，Qwen 为 `0.607`。

- 结果说明 8B 模型能够从成对例子学习某类影响信号。
- 但 SFT 模型被要求写 rationale 时，经常仍给不涉及插入因素的通用理由。
- 因而“内省分类器准确”不能替代“面向监督者的披露语言忠实”；两者应分别量化。

### 2. RL 的 influence–mention 对齐（Table 4）

| 训练/评测 | Llama test Phi-CCT | Qwen test Phi-CCT | 读法 |
|---|---:|---:|---|
| Base，RI | 0.048±0.042 | 0.210±0.040 | 基线很少稳定承认随机词影响 |
| RL on RI，RI | **0.536±0.037** | **0.404±0.038** | 同类干预内有明显增益 |
| RL on UB，UB | **0.664±0.026** | **0.607±0.027** | 社会偏见模板是最强 ID 结果 |
| RL on UB，UB OOD | 0.246±0.043 | **0.691±0.036** | Qwen 对同机制、不同任务的迁移最突出 |
| RL on RI，UB | 0.057±0.038 | 0.069±0.037 | 反向跨干预几乎没有普适迁移 |

另一个值得保留而非夸大的信号：Llama 训练 RI 后在 **random → user-bias** 的测试出现 `0.178±0.044`，虽不高但高于其基线 `0.038±0.038`；作者将其解释为可能学到“影响应披露”的抽象规则。Qwen 没复现，且 UB→RI 不对称，所以这只是待复现实验观察，不是关于通用自省能力的定论。

## Figure 1–4：每张图究竟支持什么？

| 图/表 | 它展示什么 | 能支持的结论 | 不能支持的结论 |
|---|---|---|---|
| Figure 1 | `U→Z` 的事后合理化风险，与 `Δ→X'→Y'` 的可干预路径 | 单因素反事实让“是否受影响”可测 | `Δ` 以外的所有内部原因都已被找出 |
| Figure 2 | 每步产生事实/反事实行为、算 I/M、给 GRPO reward | 评测信号可嵌入训练环 | reward 完全 on-policy 或无偏 |
| Figure 3 | SFT/RL × RI/UB × Train/Test/OOD 的评测矩阵 | 区分跨域和跨干预 | 某一个格子的提升可泛化到任意提示攻击 |
| Figure 4 | completion length 与 overlap ratio | 未观察到 TP 复制 prompt 的显著增加；RL 会缩短负例解释 | 没有任何更复杂的 reward hacking |
| Table 4 | 两模型的 Phi-CCT 与 bootstrap CI | RL 在同类干预上有定量增益及部分 OOD 泛化 | 相关性即完全透明或因果可解释性 |

图 4 还揭示一个安全上的张力。RL 模型在预测“无影响”时更短，可能是在减少误提及以提高 precision；这很合理，却也可能删掉人类审计需要的上下文。换言之，**“不乱说”与“说得足够可审计”并非同一目标**，未来奖励需要把选择性披露、完整性与任务能力一起测。

## 失败模式与证据边界

### 1. 最严重的技术错配：旧标签训练新策略

论文明确承认影响标签 `I` 是从冻结初始模型一次性算出，训练时不随策略重采样。可把这一点写成：

$$
I_0=\mathbf1\{f_{\theta_0}(x')\ne f_{\theta_0}(x)\},\qquad
I_t\stackrel{?}{=}\mathbf1\{f_{\theta_t}(x')\ne f_{\theta_t}(x)\}.
$$

实际 reward 使用 `I_0`，而最终 Phi-CCT 希望说明的是 `I_t` 与当前解释的关系。若训练改变答案边界，模型甚至可能通过靠近旧标签而提高分数，未必是更好地报告当前决策。这是论文最应优先修补的地方：on-policy 版本应在可控频率重采样干预影响，并报告重采样成本、漂移率与最终性能。

### 2. 干预、检测与任务覆盖都有限

- mention 检测依赖词形/正则；同义改写会被漏计，间接指代也可能被误判。
- RI 只插单词；即使做自然度 ranking，仍可能带来语义变化，导致“影响”并不纯粹来自无关噪声。
- 只使用四个常识/推理数据集、6k 样本子集、两种 8B 模型；没有更大模型、更多模型族或其他 instruction variants。
- 没有报告训练前后任务准确率、解释的 plausibility、人类偏好或系统化定性样本；安全含义因此应视作机制假设，而非部署保证。

### 3. reward gaming 检查是开始，不是终点

平衡数据集、长度和 overlap 是很好的第一层防线，但攻击者还可能：选择难被 regex 命中的隐喻、以不完整代词提及 `Δ`、改变答案格式来影响 `I` 的解析，或针对固定 counterfactual generator 过拟合。真正的部署评测至少需要隐藏模板、语义 mention judge 的人工校准、对抗式 paraphrase，以及未参与 reward 设计的 held-out attack family。

## 与相关工作的关系：它改了哪一层？

| 路线 | 优先目标 | 本文的差异 |
|---|---|---|
| Turpin et al. 的 biasing-hint 反事实 | 揭示模型可能不承认偏见提示 | 把这种测试信号推进到训练奖励 |
| CCT / Phi-CCT | 以影响与提及的相关性评估解释 | 用逐样本 `M⇔I` 近似其可优化部分 |
| FRODO / rationale 训练 | 让 rationale 与答案有因果依赖 | 本文强调外部受控因素是否被解释披露 |
| MARIO / 外部 judge 一致性奖励 | 理由能否让 judge 预测 gold answer | 作者认为可能奖励“说服力”，不能保证自我披露 |
| 推理时 decomposition / logic prompting | 让推理更易检查 | 不直接修改参数；本文选择训练时改变披露行为 |

这一区分避免把所有“faithfulness”合并为一个词。若监督者关心提示注入、社会偏见或隐藏 prompt 的影响，最贴近的问题是“模型有没有承认外部因素翻转它的选择”；而若关心 rationale 本身是否参与计算，则仍需另一套因果干预。

## 给研究者的下一步：把奖励变成监督栈的一环

```mermaid
flowchart LR
  A[事实输入 x] --> B[受控干预 x'=x⊕Δ]
  A --> C[当前策略答案 y]
  B --> D[当前策略答案 y' 与解释 z']
  C --> E[I=1(y'≠y)]
  D --> F[M=1(Δ 被提及)]
  E --> G{I 与 M 一致?}
  F --> G
  G --> H[RL 披露奖励]
  H --> I[策略更新]
  I -. on-policy 重采样 .-> A
  J[独立攻击族与人审] --> K[部署前评估]
  I --> K
```

我认为最有价值的延伸不是把 Phi-CCT 当作单一排行榜，而是建立分层实验：

1. **每步或定期重采样 `I_t`**：报告 `I_0` 与 `I_t` 的漂移矩阵，分开看“答案被训练改了”与“同一答案下更会披露”。
2. **把语义 mention 判定去模板化**：用多标注者校准的语义判定器、同义/反语/省略攻击集，并保留词级 detector 作为可审计下界。
3. **联合奖励而非只奖对齐**：至少同时报告任务正确性、解释完整度、长度、校准和跨攻击族泛化，避免短答案成为最优规避策略。
4. **把它接到机制可解释性，而非替代它**：反事实披露只能告诉我们模型是否报告某类可观察影响；它不能证明所有隐藏表示、工具调用状态或长程 agent 记忆都被如实说明。

最终判断应当克制：本文展示了一条可复现实验路线，证明反事实“影响—披露”对齐能被 RL 显著提升，并给出 OOD 与 reward-gaming 的初步证据；它尚未证明训练后的自然语言理由等同于模型完整的决策过程。对 AI 安全而言，更合理的定位是把这类训练当作**监督栈中的可检验披露层**，与独立红队、行为评测、机制审计和权限隔离共同使用。

## 逐项复盘：哪些数字最值得相信，哪些最容易被过度解读？

### 可以较强地接受的三件事

1. **在本文的检测器与干预分布内，RL 确实改写了行为。** Table 4 的变化不是只出现在训练集：例如 Llama 的 RI test 从基线 `0.048±0.042` 到 RL-on-RI 的 `0.536±0.037`；UB 上的增益也远大于 bootstrap 区间本身。对“是否应该把解释披露纳入训练目标”这个窄问题，证据是正面的。
2. **“识别影响”与“语言披露影响”是可分离能力。** 作者在同一模型、同一反事实框架下安排 SFT 与 RL，避免了把不同数据或不同 judge 的差异误当作能力差异。SFT 提高 binary influence prediction，而 RL 才针对自然语言中的 `M`；这个对照足以反驳“分类器会做，解释自然会跟上”的偷换。
3. **简单的静态作弊并非分数来源。** 正负影响均衡意味着总提及或总沉默无法靠类不平衡获利；TP 的 overlap 没有显著增加也排除了一个最直观的“整段复制”解释。它们不是安全证明，但为指标提供了必要的卫生检查。

### 必须保留条件的四件事

| 容易出现的表述 | 更准确的版本 | 原因 |
|---|---|---|
| “模型学会了知道自己的真实理由” | 模型在两种受控插入上更常让提及标签与答案翻转标签一致 | `I` 是输出差异的代理，不能穷尽 `U` |
| “0.691 证明 OOD 鲁棒” | Qwen 在 user-bias 机制下，对 ComVE/StrategyQA 的 OOD split 得到该相关性 | OOD 是换任务而非换所有攻击机制；样本、模型族都有限 |
| “没有 reward hacking” | 没发现 prompt parroting 的这一种迹象，但发现了缩短负例解释 | 长度策略本身已显示目标会重塑输出风格 |
| “训练能抵抗 prompt injection” | 结果提示模型可能更会承认某些偏置提示的影响 | 论文没有执行真实 agent、工具调用、越权或多轮注入评测 |

这张表很重要，因为本文的安全语义来自“模型承认受影响”，而不是“模型不受影响”。即便一个模型忠实地说“老师的错误意见让我改答 B”，它仍然答错；监督者获得的是诊断信息，不能省略后续的拒答、重试、隔离或人工复核机制。

## 一个更严格的后续实验协议

若要验证这条路线是否能从 workshop 原型走向高风险系统，实验应至少把训练闭环、评价闭环和部署闭环分开。

| 阶段 | 最小实验 | 关键输出 | 失败判据 |
|---|---|---|---|
| 标签新鲜度 | 每 `k` 次 update 重新生成部分 `(y,y')`，与初始标签逐对比较 | `Pr(I_t≠I_0)`、任务准确率、Phi-CCT 的 on/off-policy 差 | 只在旧标签高分、当前标签不提升 |
| 语义披露 | 人类标注和隐藏同义攻击集共同校准 mention | precision/recall、分歧样本、跨 judge 稳定性 | regex 与人工判定严重脱钩 |
| 因果压力 | 将偏差放在系统提示、检索文档、工具返回与 memory 中 | 按来源位置分层的披露率 | 只会报告末尾模板，遇到长上下文即失效 |
| 能力保持 | 原任务、拒答、校准、解释长度同时评估 | Pareto 曲线而非单分数 | 更高 Phi-CCT 来自答题退化或空泛短答 |
| 对抗监督 | 未参与训练的红队生成器搜索漏报 | 最坏组 Phi-CCT 与漏报率 | 平均指标高、最坏组长期漏报 |

一个特别有用的报告方式是把所有反事实对按四格 `TP/FN/FP/TN` 连同原始文本抽样发布。相关系数适合压缩统计，审计却需要看 **FN 是不是集中在某个攻击模板、FP 是否是解释器过度防御、答案本身是否已损失正确性**。这也是为何只给一个总 Phi-CCT 不足以支持安全部署结论。

## 对 Agent 与后训练研究的有限外推

本文实验是单轮选择题，不是能调用工具、维护状态、迭代规划的 agent；但其机制对 agent 很有启发。agent 的“解释”可能包含计划、工具理由、memory 摘要和最终答复，实际决策还会受系统 prompt、权限策略、检索片段与上一步工具输出共同影响。可将 `Δ` 从一个词推广为有 provenance 的状态变更，但不能直接照搬本文的 regex 方法。

```text
Agent state s = {system prompt, user request, retrieved docs, tool results, memory}
For a controlled provenance-bearing change Δ in one component of s:
    execute policy twice under fixed seeds / controlled tool responses
    measure whether action, tool arguments, or final answer changes
    ask for a structured disclosure carrying source IDs rather than free text only
    score: did the report name the changed source when it changed behavior?
    independently verify that disclosure against the event trace
Boundary: a changed final answer may arise downstream of several coupled tool states;
          one-factor isolation must prevent side effects and information leakage.
```

这会把本文的“提到插入词”变成更实用的“报告哪个来源、哪条工具结果或哪段记忆改变了行动”。不过它也会更难：agent 环境未必可重复、工具响应会漂移，且忠实报告具体来源可能泄露系统提示或敏感上下文。因此训练目标还须与权限分级、可见性策略和安全日志共同设计。

## Detail inventory：供复查的实验要素

| 维度 | 已从原文提取的事实 | 未提供或未完成的部分 |
|---|---|---|
| 方法 | Phi-CCT 的 `I/M` 二元对齐；逐样本 `M⇔I` reward；GRPO | 没有 on-policy 重采样版本的结果 |
| 数据 | e-SNLI、Social-IQA 训练/测试；ComVE、StrategyQA OOD；RI 与 UB 两族 | 每个具体 split 的完整样本清单未见公开仓库 |
| 训练 | 6k 截断、两种 8B、LoRA SFT 与 Unsloth GRPO、约 60 GPU 小时/模型 | 没有代码、checkpoint、seed 级运行日志 |
| 指标 | Pearson/Phi-CCT、5,000 bootstrap CI、completion length、overlap ratio | 无任务 accuracy、人工 plausibility、校准曲线 |
| 失败/消融 | SFT 检测—披露落差；跨干预不对称；短解释；旧标签漂移风险 | 缺少不同 reward 权重、不同模型规模与长期训练的系统消融 |
| 图表 | Fig.1 因果探针、Fig.2 训练环、Fig.3 泛化矩阵、Fig.4 reward-gaming 行为、Table 2–4 | 未提供能直接复算这些图表的原始 artifacts |

这份 inventory 也解释了为什么本文适合被当成“值得复现的训练假设”而非现成安全组件：核心机制描述清楚、数字足以设定基线，但复现所需的干预生成、自然度筛选、mention parsing 和每模型数据构造都会显著影响最终分数。

## 参考与可复现性边界

- 原论文的公开 PDF 含完整实验、附录的 RI/UB 模板和超参数：[arXiv:2607.21090](https://arxiv.org/pdf/2607.21090)。
- 论文将 Phi-CCT 追溯到 [Siegel et al., 2025](https://arxiv.org/abs/2503.13445)，反事实 bias 设计关联 [Turpin et al., 2023](https://arxiv.org/abs/2305.04388)，GRPO 关联 [DeepSeekMath](https://arxiv.org/abs/2402.03300)。
- 截至本次阅读，论文 PDF 未给出代码仓库或可下载训练 checkpoint；因此上面的训练时间、6k 截断、模板与指标来自论文自述，尚未进行独立复现。
