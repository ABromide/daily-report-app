# OPOD：把多模态后训练从“混在一起训”改成“按模态路由、按差距放手”

## 元信息与 TL;DR

- **论文**：OPOD: On-Policy Omni Distillation
- **作者**：Tong Zhao、Yuyang Hu、Reed Li、Yu Lu、Haibo Shi、Yutao Zhu、Zhicheng Dou
- **时间**：arXiv v1 提交于 2026-07-23 04:55:04 UTC
- **方向**：大模型后训练、多模态/omni-modal 模型、on-policy distillation、GRPO
- **原文**：[arXiv 摘要](https://arxiv.org/abs/2607.20918)，[arXiv HTML](https://arxiv.org/html/2607.20918)，[PDF](https://arxiv.org/pdf/2607.20918)

### TL;DR

- **这篇论文解决什么问题**：omni-modal 模型已经能同时处理文本、图像、音频，但后训练时把三类数据简单池化，常常不能同时继承三个模态专家的优势；一个共享 backbone 会被不同教师的更新方向拉扯。
- **核心方法是什么**：作者提出 **OPOD, On-Policy Omni Distillation**。学生模型先生成自己的回答，再按样本模态路由到文本、图像或音频专家教师；教师不生成标准答案，而是在学生自己的轨迹上给 token 级、模态级和轨迹级反馈。
- **三个机制怎么配合**：第一，one-sided guidance 只保留教师概率高于学生的 token 差距，学生追上后不再被教师拉回；第二，adaptive modality control 为文本、图像、音频分别维护约束预算和权重；第三，verification reward 让同一个教师同时评估最终答案置信度和推理轨迹是否让正确答案更可得。
- **实验怎么做**：30B 主实验用 Qwen3-Omni-30B-A3B-Instruct，另外用 Qwen2.5-Omni-7B 和 3B 做规模迁移；教师由同一 base 分别在文本、图像、音频数据上用 GRPO 训练。评测覆盖 12 个 benchmark：AIME25、AIME26、HotpotQA、MMLU-Pro、GPQA、MMMU、MathVista、ChartQA、A-OKVQA、MMAU、AVQA、OmniBench。
- **关键数字是什么**：OPOD 在 30B、7B、3B 三个学生上平均分分别达到 **70.8、51.7、46.2**，相对最强比较方法分别高 **2.1、1.8、1.7** 点。30B 上它超过 base 和混合数据 GRPO 的全部 12 项指标，并且在纳入三个 specialist teacher 比较时，12 项里 11 项排名第一或第二。
- **消融说明了什么**：30B 上去掉 one-sided guidance、adaptive modality control、verification reward 后，平均分分别下降 **1.8、2.2、2.0** 点；最大跌幅来自模态控制，说明“每个模态用同一教师压力”不是无害简化。
- **局限在哪里**：论文证明的是特定 Qwen-Omni 系列、三个模态、12 个 benchmark、32 张 H20 集群上的训练配方；它没有证明任意多模态模型都能复现同样收益，也没有给出训练成本、教师服务延迟、数据构成和开放代码的完整可复现路径。

## 研究问题：为什么“多模态统一模型”仍然需要分模态后训练？

### 作者真正关心的矛盾

- 现在的 omni-modal 模型有一个很诱人的叙事：
  - 一个模型接收文本、图像、音频；
  - 一个推理接口服务所有任务；
  - 一个后训练流程把能力继续推高。
- 但论文指出，**共享接口不等于共享优化方向**：
  - 文本推理任务可能需要数学、事实检索、多跳问答；
  - 视觉任务可能需要图表、空间、OCR、视觉常识；
  - 音频任务可能需要声音事件、语音内容和跨模态对齐；
  - omni-modal 任务还要求模型把多个通道合并成一个答案。
- 如果把这些样本池化后直接用 GRPO 训练一个共享学生，训练信号会被压成一个平均目标：
  - 某个模态的收益可能掩盖另一个模态的损失；
  - 某个教师的更新方向可能和另一个教师冲突；
  - 平均分上涨不一定意味着跨模态能力被平衡保留。

### 论文的诊断起点

- 作者先训练三个 specialist：
  - **Text teacher**：只在文本数据上用 GRPO 后训练；
  - **Image teacher**：只在图像数据上用 GRPO 后训练；
  - **Audio teacher**：只在音频数据上用 GRPO 后训练。
- Figure 1 的作用不是展示最终算法，而是建立问题：
  - 三个 specialist 各自有互补优势；
  - 简单 pooled GRPO 不能稳定追上各模态专家；
  - 三个教师相对同一个 base 的参数位移方向经常不一致。
- 这个诊断把问题从“怎么蒸馏多个教师”收紧为：
  - **如何让一个学生在自己的 on-policy 轨迹上接收多个教师信号，同时避免一个模态教师长期主导共享 backbone？**

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 多模态后训练不能只做数据池化 | 将文本、图像、音频分别训练成 specialist，再作为 routed teachers | Table 1 中 pooled GRPO 30B 平均分 67.3，仅比 base 67.0 高 0.3；OPOD 达到 70.8 | 诊断依赖作者选择的数据和 GRPO 设置，不等于所有池化训练都会失败 |
| 多教师 OPD 需要避免教师“追过头” | one-sided guidance 只保留正的教师-学生 log-prob margin | 去掉该项后 30B 平均分从 70.8 降到 69.0，跌 1.8 | 它假设教师概率更高的 token 更值得约束；若教师本身偏差强，这个假设会变弱 |
| 三个模态不能共享同一个教师压力 | adaptive modality control 为每个模态维护 `beta_m` 和预算 `epsilon_m` | 去掉模态控制后平均分降到 68.6，跌 2.2，是三个核心组件中最大跌幅 | 论文只展示三模态；更多模态或更稀疏 batch 下控制器稳定性仍需验证 |
| 只看最终正确性不足以训练推理轨迹 | verification reward 同时奖励正确答案置信度和 reasoning gain | 去掉 verification reward 后跌 2.0；拆掉 reasoning gain 或 answer confidence 分别跌 1.6、1.4 | 教师同时当 distiller 和 verifier，可能继承教师偏见；论文没有独立人类过程标注 |
| OPOD 的收益不是单一尺度偶然 | 在 30B、7B、3B 三个学生上重复评测 | 三个平均分分别为 70.8、51.7、46.2，均为各自尺度最高 | 三个学生都来自 Qwen-Omni 家族，跨模型家族泛化还没有证明 |

## 方法机制：OPOD 到底把教师信号拆成了哪三层？

### 基本设定

- 学生策略记作 `pi_theta`，它有一个共享 omni-modal backbone。
- 每个训练样本包含：
  - 输入 `x_i`；
  - 模态标签 `m_i in {text, image, audio}`；
  - 学生自己采样出的回答轨迹 `y_i = (y_i,1, ..., y_i,T_i)`。
- 对每个模态 `m`，有一个固定的 specialist teacher `pi_T^m`。
- 路由规则很简单：
  - 文本样本交给文本教师；
  - 图像样本交给图像教师；
  - 音频样本交给音频教师。

### 第一层：one-sided token guidance

论文从标准 OPD 的 token 级 log-ratio 出发：

```text
r_i,t^opd =
  log pi_T^{m_i}(y_i,t | x_i, y_i,<t)
  -
  log pi_theta(y_i,t | x_i, y_i,<t)
```

- 变量解释：
  - `pi_T^{m_i}` 是被路由到的模态教师；
  - `pi_theta` 是当前学生；
  - `y_i,t` 是学生自己生成的第 `t` 个 token；
  - 这个差值越大，表示教师比学生更支持该 token。
- 标准 OPD 会把这个差值作为密集反馈。
- OPOD 的关键改动是只保留正值：

```text
c_i,t = ReLU(r_i,t^opd)
c_i   = (1 / T_i) * sum_t c_i,t
```

- 这一步的含义：
  - 如果教师比学生更确信某 token，保留约束；
  - 如果学生已经等于或强于教师，不再继续施压；
  - 因而教师不再像一个上限，而像一个只在弱点处出现的校正器。

### 第二层：adaptive modality control

- 单个 token 约束还不够，因为不同模态的 `c_i` 分布可能差异很大。
- OPOD 对每个 mini-batch 按模态分组：

```text
B_m = { i in B : m_i = m }
bar_c_m = (1 / |B_m|) * sum_{i in B_m} c_i
```

- 每个模态有自己的目标约束预算 `epsilon_m`。
- 预算由 10-step warm-up 的平均约束估计，并用 `epsilon_min` 设下界。
- 每个模态的 dual weight 按如下规则更新：

```text
beta_m <- clip(
  beta_m + eta * (bar_c_m - epsilon_m),
  beta_min,
  beta_max
)

L_tc = (1 / |B|) * sum_{i in B} beta_{m_i} * c_i
```

- 直观理解：
  - `bar_c_m > epsilon_m`：该模态学生还落后教师太多，增加教师压力；
  - `bar_c_m < epsilon_m`：该模态已经进入预算，降低教师压力；
  - 每个模态独立更新，避免文本、图像、音频被同一个退火日程绑在一起。

### 第三层：verification reward

- OPOD 让 routed teacher 继续扮演 verifier。
- 它不只看答案是否正确，还看推理轨迹是否帮助教师更倾向正确答案。
- 答案置信度项：

```text
A_i = (1 / |S_i|) * sum_{t in S_i}
      log pi_T^{m_i}(y_i,t | x_i, y_i,<t)

tilde_A_i = 1[a_i = a_i*] * clip(A_i, -C, 0)
```

- 其中：
  - `a_i` 是学生最终答案；
  - `a_i*` 是 gold answer；
  - `S_i` 是最终答案 token 的位置集合；
  - 正确性门控避免模型因为错误但自信的答案被奖励。
- 推理增益项：

```text
B_i = log pi_T^{m_i}(a_i* | x_i, z_i)
      -
      log pi_T^{m_i}(a_i* | x_i)

tilde_B_i = clip(B_i, -C, C)
```

- 其中 `z_i` 是最终答案前的推理轨迹。
- 这项不被最终正确性门控，因为作者希望困难样本也能提供信号：
  - 即使最终答案错了；
  - 只要推理过程让教师更容易推出正确答案；
  - 轨迹仍然可能包含可学习的局部结构。
- 总过程奖励：

```text
r_i^proc = w_A * tilde_A_i + w_B * tilde_B_i
r_i      = r_i^task + r_i^proc
```

## 算法流程：把论文公式改写成可执行的训练循环

```text
Input:
  student policy pi_theta
  fixed teachers {pi_T^text, pi_T^image, pi_T^audio}
  modality-labeled prompts {(x_i, m_i)}
  reference policy pi_ref
  budgets epsilon_m, controller weights beta_m

State:
  beta_text, beta_image, beta_audio
  warm-up estimates for epsilon_m
  task reward function and gold answers

Loop over training iterations:
  1. Sample a mini-batch B.
  2. For each sample i in B:
       y_i <- rollout from pi_theta(. | x_i)
       teacher <- pi_T^{m_i}
       compute token margin r_i,t^opd on the student's own tokens
       c_i,t <- max(r_i,t^opd, 0)
       c_i <- average_t c_i,t
  3. For each modality m present in B:
       bar_c_m <- average c_i over B_m
       beta_m <- clip(beta_m + eta * (bar_c_m - epsilon_m))
  4. For each rollout:
       extract final answer a_i and reasoning trace z_i
       compute answer confidence tilde_A_i
       compute reasoning gain tilde_B_i
       r_i <- task reward + w_A * tilde_A_i + w_B * tilde_B_i
  5. Normalize rewards within rollouts from the same prompt:
       R_hat_i <- (r_i - mu_i) / (sigma_i + delta)
  6. Optimize:
       L_rl  from normalized rollout reward
       L_tc  from beta_m * c_i
       L_ref from KL(pi_theta || pi_ref)
       L = L_rl + L_tc + alpha * L_ref

Output:
  a single student policy pi_theta
  teachers are discarded at inference

Failure boundary:
  if a teacher is systematically wrong,
  if modality labels are noisy,
  or if a modality is too sparse for stable beta_m updates,
  OPOD's routing and control assumptions may fail.
```

## 实验设置：作者如何把“协调教师”变成可检验问题？

### 模型与教师

- 主实验学生：
  - **Qwen3-Omni-30B-A3B-Instruct**。
- 规模迁移学生：
  - **Qwen2.5-Omni-7B**；
  - **Qwen2.5-Omni-3B**。
- 教师构造：
  - 从同一 base 出发；
  - 分别在文本、图像、音频训练数据上应用 GRPO；
  - 得到三个固定的 modality-specialized teachers。
- 这很重要：
  - 教师不是来自完全不同家族；
  - 冲突来自同一 base 在不同模态数据上的后训练方向；
  - 因而论文能更清楚地讨论“共享 backbone 如何吸收异质优化信号”。

### Baseline

| Baseline | 它代表的假设 | OPOD 要反驳或改进的点 |
|---|---|---|
| Base | 不做额外后训练 | 证明后训练确实有空间 |
| GRPO | 把文本、图像、音频数据池化，用任务奖励训练一个学生 | 检验“混在一起训”是否足够 |
| Native OPD | 按模态路由教师，但使用标准 on-policy distillation | 检验仅有 routed teacher 是否足够 |
| ExOPD | 使用 reward extrapolation 鼓励超越教师方向 | 检验更强教师方向是否能处理多模态冲突 |
| Specialist teachers | 各模态单独训练的专家 | 检验单学生能否接近或超过专家组合 |

### Benchmark

- 文本：
  - AIME25、AIME26、HotpotQA、MMLU-Pro、GPQA。
- 视觉：
  - MMMU、MathVista、ChartQA、A-OKVQA。
- 音频：
  - MMAU、AVQA。
- Omni-modal：
  - OmniBench。
- 指标：
  - 12 个 benchmark 均报告 accuracy；
  - Overall 是 12 项平均。

### 训练细节

- 计算资源：
  - 32 张 NVIDIA H20 GPU；
  - 学生训练使用 16 张；
  - 剩余 GPU 托管文本、音频、图像教师服务。
- rollout 设置：
  - 每个 prompt 采样 8 个响应；
  - rollout batch size 为 16；
  - global batch size 为 64；
  - prompt 和 response 最大长度均为 8192 token。
- OPOD 超参数：
  - `w_A = 0.2`；
  - `w_B = 0.1`；
  - clipping threshold `C = 2.0`；
  - dual controller 用 10-step warm-up 估计 `epsilon_m`；
  - `epsilon_min = 0.02`；
  - 所有 on-policy run 保留 reference KL。

## 主结果：OPOD 不是只赢平均分，而是在跨模态平衡上赢

### Table 1 的核心数字

| Backbone | Base Avg. | GRPO Avg. | Native OPD Avg. | ExOPD Avg. | OPOD Avg. | OPOD 相对最强 comparator |
|---|---:|---:|---:|---:|---:|---:|
| Qwen3-Omni-30B-A3B | 67.0 | 67.3 | 67.9 | 68.6 | **70.8** | +2.1 |
| Qwen2.5-Omni-7B | 46.9 | 48.1 | 49.5 | 49.9 | **51.7** | +1.8 |
| Qwen2.5-Omni-3B | 40.7 | 42.4 | 44.0 | 44.5 | **46.2** | +1.7 |

- 30B 上最关键的观察：
  - OPOD 超过 base **3.8** 点；
  - 超过 pooled GRPO **3.5** 点；
  - 超过 native OPD **2.9** 点；
  - 超过 ExOPD **2.2** 点；
  - 超过最强 specialist teacher **2.1** 点。
- 这不是“找一个特别弱的 baseline”：
  - ExOPD 已经是更进取的 OPD 变体；
  - specialist teachers 直接代表各模态单独后训练能力；
  - OPOD 还能在单学生推理形态下达到更高平均。

### 为什么“超过 oracle teacher 平均”值得注意？

- 作者还比较了一个 benchmark-level oracle：
  - 对 12 个 benchmark 中每一项都选择最强 specialist teacher；
  - 这个 oracle 平均分为 **70.3**。
- OPOD 30B 平均分是 **70.8**。
- 这个 0.5 点差距的意义不在于数值很大，而在于它改变了结论：
  - OPOD 不是简单复制三个教师里最好的一个；
  - 它可能在共享学生里重组了跨模态能力；
  - 单模型在某些任务上超过了“逐任务挑教师”的保守上界。
- 但边界也要写清：
  - 这是作者定义的 oracle；
  - 它只在 12 个 benchmark 上成立；
  - 如果换任务、换数据、换教师，oracle 和学生的关系可能变化。

### 跨模态平衡证据

- 相对 base，OPOD 30B 的分组收益为：
  - 文本：+7.0；
  - 视觉：+1.4；
  - 音频：+2.2；
  - omni-modal：+0.8。
- 对照组显示了不平衡风险：
  - GRPO 在 omni-modal 上下降 0.6；
  - native OPD 在视觉上下降 2.9；
  - ExOPD 在音频上下降 3.3，在 omni-modal 上下降 1.5。
- 因而 Table 1 支撑的是一个更细的 claim：
  - OPOD 不只是总分更高；
  - 它更少通过牺牲某个模态来换取另一个模态的提升；
  - 这正对应论文开头对多教师冲突的担忧。

## 消融与失败边界：三个组件都不是装饰

### Table 2 的消融结果

| 30B 变体 | Avg. | 相对 Full OPOD |
|---|---:|---:|
| Full OPOD | **70.8** | - |
| 去掉 One-Sided Guidance | 69.0 | -1.8 |
| 去掉 Modality Control | 68.6 | -2.2 |
| 去掉 Verification Reward | 68.8 | -2.0 |
| 去掉 Reasoning Gain | 69.2 | -1.6 |
| 去掉 Answer Confidence | 69.4 | -1.4 |

### 这张表说明了什么？

- **one-sided guidance 的贡献**：
  - 如果把教师差距对称使用，学生可能在已经追上教师的 token 上继续被束缚；
  - 去掉后跌 1.8，说明“只在教师领先处施压”确实减少了教师上限问题。
- **modality control 的贡献**：
  - 去掉后跌 2.2，是最大跌幅；
  - 说明不同模态教师的约束尺度不能用同一个固定权重解释；
  - 统一权重不是中性假设，而是会制造广泛的跨模态 trade-off。
- **verification reward 的贡献**：
  - 去掉后跌 2.0；
  - 说明 token 级教师概率不足以表达完整回答质量；
  - 轨迹级 verifier 提供了最终答案和推理过程之间的桥。
- **reward decomposition 的贡献**：
  - reasoning gain 和 answer confidence 分别跌 1.6、1.4；
  - 前者在 AVQA、OmniBench 上作用更大；
  - 后者在 AIME25、AIME26、GPQA 上作用更大；
  - 这暗示不同任务对“过程是否推向正确答案”和“最终答案是否被教师支持”的依赖不同。

## Figure/Table 逐项证据解读

### Figure 1：为什么要从 pooled training 转向 specialist consolidation？

- Figure 1(a)：
  - 三个 specialist 呈现互补强项；
  - pooled model 不能稳定匹配对应 specialist；
  - 这证明“把数据合起来训练”不等于“把优势合起来继承”。
- Figure 1(b)：
  - 三个 specialist 相对 base 的参数位移方向经常冲突；
  - 这把问题从数据混合推进到优化几何；
  - 即使教师都来自同一 base，后训练方向仍可能互相抵消。
- Figure 1(c)：
  - native OPD 和 ExOPD 有提升但 profile 不均；
  - OPOD 的优势是更宽的 benchmark gain；
  - 这为后续 Table 1 的跨模态平衡结果铺垫。

### Figure 2：OPOD 的 pipeline 图支撑什么？

- Figure 2 展示的是训练闭环：
  - 学生 rollout；
  - 按模态路由到 offline teacher；
  - one-sided token constraint；
  - modality-specific control；
  - teacher-based verification；
  - policy loss、teacher constraint、reference KL 联合优化。
- 它支撑的 claim 是机制完整性：
  - OPOD 不是简单加一个 reward；
  - 它同时改了 token 约束、模态权重和 trajectory reward；
  - 三层都在学生自己的 on-policy 样本上发生。

### Table 1：主结果证明到哪里？

- 它证明：
  - OPOD 在三种 backbone size 上平均分最高；
  - 30B 上超过 base 和 GRPO 的全部 12 项 benchmark；
  - 30B 纳入 specialist 比较后，12 项中 11 项第一或第二。
- 它不能证明：
  - 所有 omni-modal 模型都适用；
  - 成本收益在生产部署中一定划算；
  - 数据池化方法没有改进空间；
  - 教师错误不会被学生继承。

### Table 2：消融证明到哪里？

- 它证明：
  - 三个组件都对平均分有稳定贡献；
  - 模态控制是最关键的单个组件；
  - verification reward 内部的两个子项都不是冗余项。
- 它不能证明：
  - 这些组件的超参数已最优；
  - 更复杂 controller 不会更好；
  - verification reward 不会在开放式任务里诱导 reward hacking。

### Figure 3 与 Figure 4：规模和控制器动态

- Figure 3：
  - OPOD 在 3B、7B、30B-A3B 上都提供最大 base-relative gain；
  - 具体增益为 5.5、4.8、3.8；
  - 容量越大，所有方法的增益都变小，但 OPOD 仍保留优势。
- Figure 4：
  - warm-up 后冻结的预算为：
    - `epsilon_text = 0.020`；
    - `epsilon_image = 0.191`；
    - `epsilon_audio = 0.254`。
  - 最大预算约为最小预算的 **12.7 倍**；
  - 三个 `beta_m` 到达 `beta_min = 0.1` 的步骤不同：
    - audio：24；
    - text：54；
    - image：80。
- 这组动态说明：
  - 模态权重不是人工设定的共同退火；
  - controller 真的在根据每个模态的约束缺口释放或保留教师压力；
  - 这为 Table 2 中“去掉 modality control 跌 2.2”提供机制解释。

## 相关工作位置：OPOD 和普通 OPD、RLHF、multi-teacher distillation 的区别

### 和普通 OPD 的区别

- 普通 OPD 的核心是：
  - 学生生成自己的轨迹；
  - 教师在学生轨迹上提供监督；
  - 避免 off-policy distillation 中学生训练分布和自身生成分布不一致。
- OPOD 保留这个优点，但进一步处理：
  - 多模态教师冲突；
  - 教师上限；
  - 模态约束尺度不同；
  - 只看最终 reward 不够细。

### 和 pooled GRPO 的区别

- pooled GRPO 假设：
  - 把多模态数据混合；
  - 用统一奖励优化；
  - 共享 backbone 会自然吸收能力。
- OPOD 的反驳是：
  - 多模态不是统一 reward 的简单采样问题；
  - 不同模态 teacher 的约束强度需要单独估计；
  - 共享模型需要被保护，避免某个模态的信号过度支配。

### 和 multi-teacher distillation 的区别

- 很多 multi-teacher 方法关注：
  - 多个语言领域教师；
  - 文本与视觉教师；
  - teacher routing 或 teacher arbitration。
- OPOD 的新意在于：
  - 同时处理 text、image、audio；
  - 让教师在学生轨迹上工作；
  - 引入模态级 dual control；
  - 把教师用作 trajectory verifier，而不仅是 token supervisor。

## 证据边界、局限与可复现性

### 证据强的部分

- **机制完整**：
  - 公式给出 token margin、one-sided constraint、dual update、verification reward、policy loss、reference KL 和总目标。
- **实验覆盖较宽**：
  - 12 个 benchmark 覆盖文本、视觉、音频、omni-modal；
  - 三个 backbone size 覆盖 3B、7B、30B-A3B。
- **消融清楚**：
  - 三个核心组件和 verification reward 的两个子项都有单独移除结果。
- **动态分析有解释力**：
  - Figure 4 展示 `epsilon_m` 和 `beta_m` 的训练轨迹，而不是只报告最终分数。

### 论文里隐含的失败案例

- **池化训练的失败不是完全失败，而是“平均目标掩盖局部退化”**：
  - 30B 的 GRPO 平均分从 67.0 到 67.3，看起来没有坏；
  - 但 omni-modal 分组下降 0.6，说明共享 reward 可以让总表略升，同时让最需要跨模态整合的能力变弱；
  - 这类失败在生产里最难发现，因为 dashboard 的总体均值会让人误判训练有效。
- **native OPD 的失败不是没有教师，而是教师信号没有生命周期**：
  - 学生在某些 token 上追上教师后，继续对称匹配教师可能把学生拉回教师边界；
  - 在多模态场景中，某个教师的强信号还可能挤占共享 backbone 的更新空间；
  - 这解释了为什么“按模态路由”本身仍不够。
- **ExOPD 的失败不是方向太弱，而是跨模态方向仍可能冲突**：
  - reward extrapolation 试图沿更强教师方向推进；
  - 但如果音频、图像、文本的方向本来就不一致，单纯加强方向可能放大冲突；
  - Table 1 中 ExOPD 在音频和 omni-modal 上的下降，正是这种风险的可见表征。
- **verification reward 的潜在失败是教师可判别性被误当成真实推理质量**：
  - reasoning gain 衡量的是推理轨迹是否让教师更容易推出 gold answer；
  - 这比只看最终答案细，但仍然以教师为裁判；
  - 如果学生学会生成更迎合教师判别习惯的中间过程，而不是更可靠的因果推理，benchmark 收益可能高估开放场景收益。

### 复现实验时应该优先检查什么？

| 检查项 | 为什么重要 | 失败信号 |
|---|---|---|
| 三个 specialist 是否真的互补 | OPOD 的前提是教师有互补能力，而不是三个相似教师 | specialist 之间几乎无差异，OPOD 退化成普通 OPD |
| `epsilon_m` 的 warm-up 是否稳定 | controller 依赖早期约束尺度估计 | 某模态样本过少，`beta_m` 震荡或长期贴边 |
| 教师服务延迟是否可承受 | 训练时每个 rollout 都要教师评估 | GPU 资源被 teacher server 吞掉，训练吞吐不可接受 |
| verification reward 是否与 task reward 冲突 | 过程奖励可能改变优化方向 | 正确率提升但开放生成变啰嗦、模板化或迎合教师 |
| 分组指标是否同步上升 | OPOD 的主张是平衡而非单点突破 | 平均分上升但某一模态组持续下降 |

### 证据弱或仍需追问的部分

- **模型家族限制**：
  - 论文主要在 Qwen-Omni 系列上验证；
  - 还不能推出对 Gemini、GPT、Claude、多编码器开源模型等家族的普遍结论。
- **教师成本限制**：
  - 训练时需要在线访问三个 teacher servers；
  - 主实验使用 32 张 H20，其中 16 张训练学生、其余托管教师；
  - 论文强调推理时丢弃教师，但训练成本仍是实际门槛。
- **数据透明度限制**：
  - 原文给出 benchmark 和训练流程，但对训练数据组成、过滤、模态比例的可复现细节仍不如完整开源 recipe。
- **教师偏差限制**：
  - routed teacher 同时是 token supervisor 和 verifier；
  - 如果教师对某类推理路径存在系统性偏差，OPOD 可能把这种偏差写进学生。
- **安全边界限制**：
  - verification reward 奖励“教师更容易推出正确答案”；
  - 这在 benchmark 上有效，但开放式推理中可能鼓励迎合教师可判别性的过程，而不一定等于真实因果推理。

## 研究者视角的延伸思考

### 对后训练的启发

- OPOD 把后训练中的一个常见问题讲得更具体：
  - 不是所有训练信号都应该被汇成一个标量；
  - 不是所有教师都应该共享一个权重；
  - 不是所有教师监督都应该在学生追上后继续生效。
- 这对 RLHF、RLAIF、GRPO、DPO 之后的多能力整合都很重要：
  - 当一个模型同时服务代码、数学、视觉、语音、检索、工具调用；
  - 后训练目标很可能天然多中心；
  - 一个统一 reward model 可能掩盖能力之间的梯度冲突。

### 对 Agent 后训练的类比

- 虽然论文对象是 omni-modal 模型，不是工具 Agent，但机制可以类比到 Agent：
  - 不同任务域的 expert policy 可能对应搜索、编码、浏览、数据分析；
  - Agent 的轨迹也可以按任务类型路由给不同 critic；
  - critic 压力也不应该永久固定，而应随轨迹质量和任务域分布变化。
- 但类比不能直接当结论：
  - Agent 轨迹更长；
  - 工具调用有外部状态；
  - 失败不只是答案错，还包括权限、成本、数据泄露、不可逆动作。
- 因而 OPOD 更像一个信号组织范式：
  - **按来源路由**；
  - **按差距施压**；
  - **按域独立控制**；
  - **按轨迹质量补充过程奖励**。

### 后续最值得追问的问题

- 如果模态标签不可靠，controller 是否会把错误模态的教师压力放大？
- 如果某个模态样本很少，`beta_m` 的估计是否会高方差？
- 如果教师强于学生但带有偏见，one-sided guidance 是否会更稳定地传播偏见？
- 如果 verification reward 被模型学会迎合，reasoning gain 是否会变成另一种 reward hacking 通道？
- 如果把模态换成工具域、权限域或用户意图域，OPOD 的 dual-control 结构是否仍然成立？
- 如果训练成本成为主要瓶颈，能否用离线缓存、低秩教师、周期性教师刷新替代在线 teacher server？

## 结论

- OPOD 的价值不在于提出“多教师蒸馏”这个大方向，而在于把多教师后训练拆成三个可验证的控制面：
  - token 上只修正学生落后的地方；
  - 模态上分别估计教师压力；
  - 轨迹上同时看最终答案和推理增益。
- 论文的证据链比较完整：
  - Figure 1 说明为什么池化训练和直接多教师 OPD 不够；
  - Figure 2 给出机制闭环；
  - Table 1 证明三种尺度和 12 个 benchmark 上的主收益；
  - Table 2 证明三个组件都在贡献；
  - Figure 4 解释为什么模态控制不是装饰。
- 它的边界同样明确：
  - 仍是单模型家族、有限 benchmark、较高训练成本下的结果；
  - 教师质量、数据透明度和开放式部署风险没有被完全解决。
- 对后训练研究来说，OPOD 最值得带走的一点是：
  - 当一个共享模型承载多个能力域时，训练信号本身也需要被建模为有来源、有预算、有生命周期的对象；
  - 后训练不只是“加更多 reward”，而是要设计信号如何进入、何时退出、在哪个域内被约束。
