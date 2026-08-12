# MMDiff：用多模态 SAE 找到、验证并控制视觉语言模型的内部特征

- 原文：<https://arxiv.org/abs/2608.09928>
- HTML：<https://arxiv.org/html/2608.09928>
- 论文：Multimodal Model Diffing for Feature Discovery and Control
- arXiv：2608.09928v1，2026-08-10 提交
- 类型：论文，ICML 2026 Trustworthy AI for Good Workshop 预印本
- 关注方向：AI 安全、多模态可解释性、模型控制、稀疏自编码器

### TL;DR

- 这篇论文提出 **MMDiff**：把 base language model 的 SAE 字典迁移到视觉语言模型，再比较 base-LM SAE 与 multimodal SAE 的特征方向变化，找出被多模态训练重塑的内部特征。
- 方法不是只做 post-hoc 可视化，而是把特征变成三类接口：
  - **发现**：识别视觉响应强、decoder 方向发生旋转的 adapted features；
  - **诊断**：用 per-token contrastive firing 在空间关系、安全提示、OCR 分布中筛出 task-specific features；
  - **控制**：通过 causal removal 抑制目标能力，或通过 MMDiff-CAA steering 增强空间/OCR 表现。
- 实验覆盖三类 MLLM family：LLaVA-MORE、PaliGemma 2、InternVL3.5-2B；任务覆盖 visual-spatial understanding、multimodal safety、OCR。
- 关键数字：
  - causal removal 平均让空间任务目标能力下降约 12%，OCR 目标能力下降约 17%；
  - multimodal safety attacks 的 attack success rate 平均下降 24%，同时 VQA 几乎不受影响；
  - MMDiff-CAA 相比单层 CAA，在空间与 OCR 上平均提升约 +3.6% 和 +1.8%。
- 证据边界同样清楚：
  - 它证明了 selected SAE directions 对若干任务有 causal handle；
  - 但没有证明所有多模态能力都能被 sparse feature 分解，也没有证明 steering 在生产模型、开放长对话或视频/音频模态上稳定。

### 研究问题：为什么普通 SAE 还不够？

- 多模态大模型已经能完成：
  - 看图问答；
  - 读取场景文字；
  - 判断物体空间关系；
  - 在图像条件下生成安全或不安全回答。
- 但论文指出，一个关键解释性缺口仍然存在：
  - 模型表现出这些能力；
  - 研究者却不知道哪些 internal features 支撑了它们；
  - 更不知道这些特征是语言模型原本就有，还是多模态训练后被重塑出来。
- 直接在 MLLM activations 上训练 SAE 会遇到一个混合问题：
  - 一部分特征继承自 language backbone；
  - 一部分特征来自视觉 projector、视觉 token 与 multimodal fine-tuning；
  - 如果不区分这两类来源，后续解释容易把“语言中已有的概念方向”误读成“视觉训练新增的特征”。
- 因此 MMDiff 的核心问题不是“SAE 能不能解释多模态模型”，而是：
  - **如何把 base-LM 到 MLLM 的训练阶段变化投影到 feature level；**
  - **如何确认某个 feature 既被多模态训练改变，又与具体视觉行为有关；**
  - **如何把这个 feature 变成可干预的控制方向。**

### 作者的论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 多模态训练会重塑一部分 language-backbone features | 从 base-LM SAE warm-start，训练 multimodal SAE，并比较 decoder cosine 与 visual energy | adapted set 约占 MMDiff-Llama 5%、MMDiff-Gemma 20%、MMDiff-Qwen 13% | 依赖 base LM 与 MLLM 共享语言骨架；若训练导致整体 residual space 旋转，特征对齐会变弱 |
| 任务相关特征不能只靠 prompt 词触发来判断 | 用 target distribution 与 VQAv2 baseline 的 per-token firing 差异，再做 lexical-invariance filter | 空间特征中约 60% 通过 lexical filter；安全/OCR 也能得到千级候选 | filter 只能降低词面伪相关，不能完全证明 feature 的语义单一性 |
| selected features 有因果作用 | 对 decoder direction 做 causal removal，检查目标任务、VQA 与 control split 的 delta | 空间/OCR 目标能力下降，VQA 变化小；安全 ASR 下降 17%-28% per category | removal 是强干预，可能改变未测任务；结果主要是短任务 benchmark |
| 特征可用于 steering | 把多层 CAA direction 与 feature decoder direction 组合为 MMDiff-CAA | 空间平均 +3.6%，OCR 平均 +1.8%，若干 relation/category 提升更明显 | steering scale 需要调参；没有证明在长对话或 adversarial interaction 中稳定 |

### Figure 1：这不是解释性海报，而是 audit/control interface

![MMDiff Figure 1：多模态 SAE 特征作为审计与控制接口](/assets/2026/08/10/itm_5d75f21d116a2b3d/mmdiff-figure1.png)

- Figure 1 承载的是整篇论文的主张：
  - 先从多模态训练中隔离出被改变的 SAE features；
  - 再把这些 feature 与空间、OCR、安全行为绑定；
  - 最后通过 removal 或 steering 改变模型输出。
- 这张图的重要性在于：
  - 它把 interpretability 从“看懂模型”推进到“用 feature 做实验”；
  - 如果删除某个方向只影响 unsafe generation，而不影响 VQA，那么这个方向就不只是漂亮标签，而是一个可检验的 causal handle。
- 证据边界：
  - 图展示 pipeline 的整体 claim；
  - 真正支持 claim 的，是后文 causal removal、MMDiff-CAA、control split 与 ablation 表格。

### Figure 2：MMDiff pipeline 拆成三步

![MMDiff Figure 2：从 base-LM SAE 到 task-specific feature discovery](/assets/2026/08/10/itm_5d75f21d116a2b3d/mmdiff-figure2.png)

- Figure 2 的三步可以按数据流理解：
  - **Step 1：Train multimodal SAE**
    - 输入 frozen MLLM activations；
    - 从 base-LM SAE 初始化；
    - 目标是得到仍然能和 base dictionary 对齐的 multimodal dictionary。
  - **Step 2：Identify adapted features**
    - 比较 base-LM SAE 与 multimodal SAE 的 decoder direction；
    - 找出视觉响应强、方向旋转明显的特征。
  - **Step 3：Discover task-specific features**
    - 在空间、安全、OCR target distribution 上看 token-level firing；
    - 去掉只因为 prompt 词面触发的 lexical artifacts；
    - 保留既 adapted 又 task-specific 的特征。
- 这条 pipeline 的关键设计是“交集”：
  - 只看 adapted features，容易得到多模态训练改变过但任务无关的方向；
  - 只看 task firing，容易得到词面相关或语言已有特征；
  - 两者取交集，才接近“多模态训练重塑、且对目标行为有用”的候选。

### 方法机制一：SAE 给 residual stream 一个稀疏词表

- 论文使用 SAE 把 hidden state 分解为稀疏 feature activations：

```text
x in R^D
h(x) = ReLU(W_enc x + b_enc) in R^F
x_hat = W_dec h(x) + b_dec
v_f = (W_dec)[:, f]
```

- 变量解释：
  - `x`：某层 residual stream 中的 token hidden state；
  - `h_f(x)`：feature `f` 在该 token 上的激活强度；
  - `v_f`：decoder column，对应 feature direction；
  - `F`：dictionary width，通常大于 hidden dimension，用稀疏性处理 superposition。
- 对 MMDiff 来说，`v_f` 是最重要的对象：
  - 它可以和 base-LM 中同 index 的 direction 比较；
  - 它可以作为 removal 的投影方向；
  - 它也可以作为 steering 时注入的 feature-specific vector。

### 方法机制二：model diffing 用 decoder geometry 识别改变

- MMDiff 比较两个 SAE 字典：
  - `W_dec^(0)`：base-LM SAE；
  - `W_dec^(1)`：multimodal SAE。
- 对同一个 feature index `f`，计算 decoder direction 的 cosine：

```text
s_f = <v_f^(0), v_f^(1)> / (||v_f^(0)|| ||v_f^(1)||)
Delta a_f = E[h_f^(1)(x)] - E[h_f^(0)(x)]
```

- 直觉解释：
  - `s_f` 高：feature direction 保持稳定，可能是语言模型已拥有的方向；
  - `s_f` 低：feature direction 发生旋转，可能被多模态训练改写；
  - `Delta a_f` 或 visual energy 高：该 feature 更响应视觉输入。
- 论文定义 adapted features 时同时要求：
  - visual energy `E_v > epsilon`；
  - cosine similarity 位于该层 bottom `p_cos = 25%`。
- 这个选择标准的含义：
  - 不把所有视觉响应都算作“多模态新特征”；
  - 也不把所有方向旋转都算作“有视觉意义”；
  - 只有“视觉响应 + 方向重塑”的交集进入后续任务筛选。

### 方法机制三：task-specific feature discovery 要防词面伪相关

- 在 adapted set `A` 内，MMDiff 做 per-token contrastive firing。
- 先定义 feature `f` 在数据集 `D` 上的 firing frequency：

```text
p_f(D) = (1 / n(D)) * sum_{x in D} sum_t 1{ h_f(x_t) > 0 }
Delta p_f = p_f(D_tgt) - p_f(D_base)
```

- 其中：
  - `D_base` 固定为 generic VQAv2；
  - `D_tgt` 可以是 spatial、multimodal safety 或 OCR 分布；
  - `n(D)` 是 token 数，而不是样本数。
- 论文再用 odds ratio 和 Fisher exact test 做筛选：
  - 保留 `OR_f >= 3`；
  - 保留 `Delta p_f >= 0.05`；
  - 对 firing / non-firing 与 baseline / target 的列联表做显著性校正。
- 为什么按 token 计数？
  - 因为多模态任务里同一个样本包含图像 token、问题 token、生成 token；
  - 按样本计数会把“短暂但关键的 token-level 激活”抹平；
  - 按 token 计数更容易定位 feature 在决策位置附近是否真正参与。
- lexical-invariance filter 的作用：
  - 把原始问题替换成 neutral prompts；
  - 例如空间任务不再直接问 “left of/right of”，而问物体如何排列；
  - 如果 feature 仍然 firing，说明它更可能响应图像关系，而不只是响应 prompt 里的词。

### 方法机制四：causal removal 是强检验

- 对目标 feature `f`，MMDiff 在推理时把 residual stream 中沿 `v_f` 的分量投影掉：

```text
y <- y - (y^T v_f) v_f
```

- 干预位置有三个：
  - attention-block output；
  - MLP-block output；
  - layer residual output。
- 干预范围：
  - 所有 transformer layers；
  - 只作用于 text-token positions；
  - image tokens 不直接被改动。
- 这比“看 top activating samples”更强：
  - 如果 removal 后目标任务下降；
  - 同时 VQA 与 control split 基本不变；
  - 才能说 feature 不只是相关，而是对目标行为有因果贡献。
- 但它也带来边界：
  - removal 是显式强干预，不等于自然运行中这个 feature 总是唯一原因；
  - 未测任务可能受影响；
  - 多 feature 组合效应没有被完全穷尽。

### 方法机制五：MMDiff-CAA 把任务 steering 和 feature direction 合并

- vanilla CAA 的形式是：

```text
h' <- h + alpha d
d_l = E[h_pos^l] - E[h_neg^l]
```

- MMDiff-CAA 做两个改变：
  - 不只在一个固定中间层加方向，而是在 task-selected layer set `L_task` 上加多层 CAA direction；
  - 在 feature 所在层 `l_f` 额外注入 SAE decoder direction `v_f`。
- 简化写法：

```text
for l in L_task:
    h_l' <- h_l + alpha * d_l

at l_f:
    h_lf' <- h_lf + alpha * d_lf + gamma_f * v_f
```

- 这解释了为什么 MMDiff-CAA 不是普通 activation steering 的换名：
  - CAA direction 提供 task-level 的正负样本差异；
  - SAE direction 提供 feature-level 的具体控制点；
  - 二者组合后，steering 不再完全依赖一个平均方向。

### 实验设置：三类模型、三类任务、三个控制指标

| 维度 | 设置 |
|---|---|
| 模型 family | LLaVA-MORE、PaliGemma 2、InternVL3.5-2B |
| SAE 类型 | LLaMA/InternVL 使用 TopK SAE；PaliGemma 2 使用 Gemma-Scope JumpReLU SAE |
| 训练数据 | 50,000 个 VQAv2 image-question pairs 的 cached activations |
| 优化细节 | Adam，学习率 7e-5，1,000-step warmup；PaliGemma 2 使用 16,384-feature dictionary |
| 任务 | visual-spatial understanding、multimodal safety、OCR |
| baseline | generic VQAv2 作为 `D_base` |
| 目标指标 | target-task delta、Delta VQA、domain-specific Delta Ctrl |

- 这里最值得注意的是 control split：
  - 空间任务用非空间关系样本作为 control；
  - 安全任务用 MSSBench-safe split；
  - OCR 用 VQA-clean non-OCR yes/no subset。
- 这让论文的证据结构更稳：
  - 目标任务下降或提升本身不够；
  - 还要证明不是 general VQA capability 被一并损坏；
  - 也要证明不是同域但非目标行为被明显牵连。

### 结果一：空间关系特征能被删除，也能被增强

- 对空间关系任务，论文报告了 top spatial features 的 causal removal。
- 典型现象：
  - 在 MMDiff-Llama 中，`above`、`across from`、`below`、`under` 等 relation feature 被删除后，VSR 目标表现下降；
  - 在 MMDiff-Gemma 中，`right side of` feature 的 VSR delta 达到约 -30.62；
  - 多数对应 `Delta VQA` 很小，说明不是简单破坏视觉问答能力。
- 这组结果支持的 claim：
  - MMDiff 找到的 feature 不是随机 dictionary unit；
  - 至少在这些 relation 子任务中，它们对模型做出空间判断有可测贡献。
- MMDiff-CAA steering 的证据：
  - PaliGemma 2 base 上，MMDiff-CAA 对 top spatial features 的平均提升约 +3.6%；
  - 部分 relation 的增益更大，例如 `ahead of` 达到约 +30.77，而 vanilla CAA 约 +15.38。
- 边界：
  - 论文主要报告 selected feature 上的 per-feature evaluation；
  - 它不能直接推出所有空间推理都能靠少量 feature 修好；
  - relation 之间可能共享 head、共享视觉区域或共享语言模板，仍需组合干预实验。

### 结果二：multimodal safety 的 unsafe feature 可以压低 ASR

- 安全实验聚焦 VLSBench categories，包括：
  - Self-Harm；
  - Erotic；
  - Privacy；
  - Violent；
  - Hate；
  - Illegal Activity。
- 对 PaliGemma 2 的 per-category top unsafe features，论文报告：

| Category | ASR drop | Delta VQA | Delta Ctrl | OR |
|---|---:|---:|---:|---:|
| Self-Harm | -28.14 | +0.90 | +1.00 | 8.12 |
| Erotic | -26.59 | -0.70 | 0.00 | 9.35 |
| Privacy | -25.99 | -0.10 | 0.00 | 4.15 |
| Violent | -24.43 | -0.10 | 0.00 | 5.66 |
| Hate | -21.08 | -0.80 | +1.00 | 5.06 |
| Illegal Activity | -17.96 | +0.70 | 0.00 | 8.17 |

- 这张表的含义：
  - removal 能把 unsafe attack success rate 拉低 17%-28%；
  - VQA 与 MSSBench-safe control 基本不动；
  - odds ratio 显示这些 feature 在 unsafe target distribution 中明显更常 firing。
- 对 AI 安全的关键价值：
  - 它不是训练一个新 refusal classifier；
  - 也不是在输出层加规则；
  - 而是把安全行为关联到模型内部 feature direction，并用 removal 验证 causal contribution。
- 证据边界：
  - ASR drop 不等于安全问题解决；
  - 攻击者可能绕过当前 benchmark；
  - removal 可能影响未测的 benign sensitive help；
  - feature-level suppression 不提供完整 policy reasoning，只提供一个内部控制旋钮。

### 结果三：OCR 特征也呈现可删除和可 steering 的结构

- OCR 任务用 OCRBench 子类别检验 feature specificity。
- causal removal 的例子：

| Layer | Feature | Category | Delta OCRBench | Delta VQA | Delta Ctrl |
|---:|---:|---|---:|---:|---:|
| 19 | 10089 | Scene Text | -28.0 | +0.2 | -0.4 |
| 17 | 13602 | Scene Text | -16.5 | +0.9 | +0.6 |
| 20 | 10687 | Non-Sem. | -16.0 | +0.6 | +0.4 |
| 21 | 9577 | Digit | -14.0 | -1.6 | -1.8 |
| 19 | 14093 | Irregular | -10.0 | -0.5 | -1.0 |

- OCR steering 的平均结果：
  - vanilla CAA 平均约 +2.21；
  - MMDiff-CAA 平均约 +4.02；
  - 因此 feature-specific direction 带来额外贡献。
- 论文还特别处理了 OCR 的开放生成问题：
  - 将任务改成 4-way multiple choice；
  - 在 decision token 上 steering；
  - 正负方向来自 `(GT, distorted-GT)` answer pairs。
- 这个设计说明作者没有简单把空间任务的 steering recipe 硬套到 OCR：
  - OCR 的输出形式不同；
  - token decision 位置也不同；
  - 因此需要把 feature intervention 对齐到可判定的答案 token。

### 消融与诊断：为什么 warm-start 和 text-only masking 重要？

- MMDiff 的 stage-wise diffing 有一个前提：
  - base-LM SAE 与 multimodal SAE 的 feature index 仍可比较。
- 如果 multimodal SAE 从随机初始化开始，或者训练目标让 dictionary 大幅旋转，那么同 index cosine 就失去解释意义。
- 作者做了几个诊断：
  - random-init SAE 的 reconstruction quality 更差；
  - text-only masking 最能保持与 base-LM dictionary 的对齐；
  - image-only 与 full-sequence regime 在早层更容易旋转；
  - PaliGemma 2 full dictionary 中 relocation 为 0.00%，cross-seed relocation rate 约 0.44%，mean same-index decoder cosine 约 0.93。
- 这组诊断支持的方法选择：
  - MMDiff 关注 language-backbone features 如何被视觉上下文重塑；
  - 因此它不追求“最会重构 image tokens”的 SAE；
  - 它追求“仍能与 base-LM 字典对齐、同时吸收视觉上下文”的 SAE。
- 这也是论文最重要的边界之一：
  - 如果某个 MLLM 的多模态训练改变了 backbone architecture；
  - 或者视觉信息主要通过不同 residual subspace 表达；
  - MMDiff 的 aligned feature comparison 可能不再可靠。

### 失败模式一：只看 firing 会把“题目词”误当成“视觉概念”

- MMDiff 特别强调 lexical-invariance filter，是因为多模态任务里有一个常见陷阱：
  - 题目问 “What is on the left?”；
  - 某个 feature 对 `left` 这个词强烈 firing；
  - 如果研究者只看 target distribution 中的 firing 频率，就可能误以为它是视觉空间 feature。
- 论文的处理方式是把 prompt 改成更中性的问法：
  - 不直接暴露目标 relation 的词；
  - 仍要求模型根据图像描述 arrangement；
  - 只有继续 firing 的 feature 才更可能是 image-grounded。
- 这个设计的意义在于：
  - 它把 feature discovery 从“相关性排序”推进到“伪相关剔除”；
  - 它承认语言 token 本身会污染多模态解释；
  - 它给安全任务也提供了类比：unsafe feature 不能只是对危险词汇敏感，还要和图像条件下的 unsafe behavior 绑定。
- 但 filter 仍然有限：
  - neutral prompt bank 的覆盖范围有限；
  - prompt 改写可能改变模型的解题策略；
  - 某些真实安全场景本来就依赖词面、图像和上下文三者共同触发。
- 因此更稳妥的解释是：
  - lexical filter 让候选 feature 更可信；
  - 但它不是语义纯度证明；
  - 最终仍要靠 removal、control split、跨 prompt 稳定性和人工解释一起判断。

### 失败模式二：删除 feature 后目标下降，不等于找到了唯一机制

- causal removal 是强证据，但不能被过度解读。
- 一个 feature 被投影掉后目标任务下降，至少有三种可能：
  - 它确实是目标行为的核心方向；
  - 它是多个相关机制中的一个瓶颈方向；
  - 它和目标行为共享了局部表示空间，删除它同时扰动了未枚举的邻近计算。
- MMDiff 通过 `Delta VQA` 和 `Delta Ctrl` 降低第三种解释的风险：
  - 如果 general VQA 基本不变，说明不是简单把模型打坏；
  - 如果 control split 基本不变，说明不是整类视觉能力都被破坏；
  - 如果 target subset 明显下降，因果解释更可信。
- 但未测空间仍然存在：
  - 复杂图表理解可能依赖 OCR 与空间关系的组合；
  - safety refusal 可能和合法敏感帮助共享视觉触发；
  - 多轮对话中，早轮 feature activation 可能通过上下文记忆影响后轮输出。
- 因此这篇论文最好的用法不是给 feature 贴一个永久标签，而是建立一个实验协议：
  - 先做 diff；
  - 再做 target firing；
  - 再做 lexical filter；
  - 再做 causal removal；
  - 最后报告 target、general、control 三组 delta。

### 失败模式三：steering 提升平均分，也可能掩盖分布外代价

- MMDiff-CAA 的空间和 OCR 提升很有价值，因为它说明 feature direction 不只可删除，也可用于增强。
- 但 steering 比 removal 更接近部署时会遇到的问题：
  - steering scale 过小，效果不明显；
  - steering scale 过大，可能造成过度自信、模板化输出或局部能力偏置；
  - 多个 feature 同时注入时，directions 可能相互抵消或叠加出新副作用。
- 论文用单 feature 和 per-feature subset 展示可控性，这适合验证机制。
- 如果要变成部署工具，还需要额外实验：
  - 不同 `alpha`、`gamma_f` 的 dose-response 曲线；
  - 多 feature 同时 steering 的交互矩阵；
  - 分布外图像、低质量图像、遮挡图像上的鲁棒性；
  - 对长回答、解释型回答、工具调用前决策 token 的影响。
- 对安全场景尤其要保守：
  - 增强 refusal-like feature 可能压低 ASR；
  - 但也可能提高 benign refusal；
  - 如果只看攻击 benchmark，不看合规求助任务，就容易把“更拒绝”误读成“更安全”。

### 对 AI 安全评测的直接启发

- 传统安全评测通常记录输入输出：
  - 给模型一组攻击图像或越狱 prompt；
  - 统计 ASR、refusal rate、helpfulness；
  - 用模型版本或 prompt 模板做横向对比。
- MMDiff 提供了另一层证据：
  - 对每个攻击簇，定位 firing 明显上升的 adapted features；
  - 删除这些 feature，检查 ASR 是否下降；
  - 同时检查 VQA、safe split 和 benign sensitive split。
- 这样能回答更细的问题：
  - 某个安全失败是输出策略失败，还是视觉证据通道激活了不安全方向？
  - 某次后训练是否把安全 feature 压低了？
  - 某个模型版本 ASR 改善，是因为更会拒绝，还是因为内部 unsafe feature 被重塑？
- 最小可执行评测表可以是：

| 评测层 | 记录内容 | 目的 |
|---|---|---|
| 行为层 | ASR、refusal、helpfulness、OCR/spatial accuracy | 观察用户可见变化 |
| 特征层 | target firing、OR、Delta p、adapted-set intersection | 定位内部风险通道 |
| 干预层 | removal delta、steering delta、control split delta | 验证 feature 是否可控 |
| 稳定层 | prompt paraphrase、图像扰动、跨模型 family | 排除单一模板偶然性 |

### 对后训练的延伸：把 feature diff 当作 regression test

- 后训练常关注 reward、benchmark 和人工偏好，但内部表征可能发生非预期漂移。
- 如果把 MMDiff 的思想用于后训练，可以形成一个 regression workflow：
  - 训练前保存关键 SAE dictionary 或 feature bank；
  - RLHF/DPO/RLVR/SFT 后重新训练或适配 SAE；
  - 对 safety、reasoning、tool-use 相关 feature 计算 cosine、firing、control delta；
  - 把异常旋转或异常沉默的 feature 作为审计信号。
- 这对多模态模型尤其重要：
  - 后训练可能提升文字遵循；
  - 但削弱图像证据的使用；
  - 或者让模型在安全图像上更容易被 prompt 词牵引。
- MMDiff 不能直接告诉我们“应该怎样训练”，但能提出一个更细粒度的问题：
  - 不是只问 benchmark 是否涨了；
  - 而是问涨分过程中哪些内部方向被改写；
  - 这些改写是否集中在我们愿意承担风险的区域。

### 对 Agent 的延伸：从单轮视觉问答走向动作前审计

- 多模态 Agent 的风险不止是回答一句话。
- 典型链条更像：
  - 看图或屏幕；
  - 读文字；
  - 判断目标；
  - 选择工具；
  - 执行动作；
  - 根据反馈继续规划。
- 如果某个 unsafe 或 OCR feature 在早期视觉理解阶段被激活，它可能影响后续 action selection。
- MMDiff 可以提供一个研究入口：
  - 在 action decision token 前后记录 feature firing；
  - 对错误工具调用、误读屏幕文字、绕过确认步骤等失败案例做 target distribution；
  - 用 removal 检查某些 feature 是否会降低错误动作；
  - 用 control split 检查是否牺牲正常任务完成率。
- 但这需要新的实验协议：
  - 单轮 VQA 的 feature 不一定迁移到长 horizon；
  - 工具调用日志、屏幕状态和模型 hidden state 必须对齐；
  - 安全评估还要加入权限、确认、沙箱和外部副作用边界。

### 复现时应重点检查什么？

- 如果读者想复现或扩展 MMDiff，最该优先检查的是四件事：
  - **字典对齐**：same-index feature 是否仍可比较，relocation 是否接近零；
  - **候选筛选**：`E_v`、bottom cosine、`OR_f`、`Delta p_f` 的阈值是否对模型 family 稳定；
  - **控制副作用**：target、VQA、control 三组 delta 是否同时报告；
  - **prompt 稳定性**：换 prompt、换图像风格、换语言后 feature 是否仍保持语义。
- 最不应该只复现的是：
  - top activating samples 截图；
  - 自动解释 label；
  - 单一 benchmark 的平均提升。
- 原因很简单：
  - 这些材料能帮助理解；
  - 但不足以建立 causal claim；
  - MMDiff 的真正价值来自“diff + firing + filter + intervention”的证据链。

### 伪代码：从候选 feature 到控制实验

```text
Input:
  S_base: base-LM SAE dictionary
  M_vlm: frozen multimodal model
  D_base: generic VQAv2 distribution
  D_tgt: target distribution, e.g. safety/OCR/spatial
  prompts_neutral: lexical-invariance prompt bank

State:
  S_vlm: SAE adapted from S_base on M_vlm activations
  A: adapted feature set
  T: task-specific feature set

Procedure:
  1. Train S_vlm with warm start from S_base.
  2. For each feature f:
       compute visual energy E_v(f)
       compute decoder cosine c_f between S_base and S_vlm
       if E_v(f) > epsilon and c_f in bottom 25%:
           add f to A
  3. For each f in A:
       compute p_f(D_tgt) and p_f(D_base)
       compute Delta p_f and odds ratio OR_f
       run Fisher exact test with correction
       if Delta p_f >= 0.05 and OR_f >= 3:
           test firing under neutral prompts
           if firing remains image-grounded:
               add f to T
  4. For selected f in T:
       run causal removal y <- y - (y^T v_f) v_f
       evaluate target delta, Delta VQA, Delta Ctrl
  5. For steering:
       build multi-layer CAA directions d_l
       inject alpha d_l across task layers
       inject gamma_f v_f at feature layer l_f

Output:
  task-specific feature handles
  causal removal evidence
  MMDiff-CAA steering result

Failure boundary:
  If dictionaries are not aligned, lexical filter fails, or control split shifts,
  the feature should be treated as a weak correlate rather than a control handle.
```

### Figure/Table 证据如何支撑主张？

| Evidence | 支持什么 | 不能证明什么 |
|---|---|---|
| Figure 1 | MMDiff 的目标是把 feature discovery 变成 audit/control interface | 不单独证明 causal effect |
| Figure 2 | pipeline 包含 SAE adaptation、adapted feature selection、task-specific firing | 不证明每个模型 family 都同等适用 |
| Spatial removal tables | selected features 对 VSR relation 有因果贡献 | 不证明所有空间推理都可由少量 features 解释 |
| Safety Table 4 | top unsafe features removal 可降低 ASR 且 VQA/control 变化小 | 不等于完整安全防护，也不覆盖 adaptive attacks |
| OCR Tables 5/6 | OCR feature 可被抑制，也可用于 steering | 不证明开放式 OCR 生成长期稳定 |
| SAE training diagnostics | text-only warm-start preserves dictionary alignment | 不保证其他 backbone 或模态 transition 同样成立 |

### 相关工作中的位置

- MMDiff 连接了三条线：
  - **SAE mechanistic interpretability**：用稀疏字典把 residual stream 拆成 feature directions；
  - **model diffing**：比较训练阶段前后的特征变化；
  - **activation steering / causal intervention**：把解释结果转成可操作的干预。
- 和普通 VLM SAE 工作相比：
  - 重点不是训练一个可解释字典；
  - 而是问“哪些 feature 是多模态训练改出来的”。
- 和 crosscoder 式 model diffing 相比：
  - MMDiff 更强调 stage-wise dictionary 与 same-index feature tracking；
  - 作者认为 crosscoder 对稀疏 adapted features 可能更不敏感。
- 和 safety classifier 或 refusal tuning 相比：
  - MMDiff 不直接学习 policy；
  - 它提供的是内部 unsafe feature handle；
  - 因此更像 audit/control 工具，而不是完整 alignment pipeline。

### 局限与可复现性边界

- 第一，feature alignment 是前提：
  - 论文在共享 language backbone 的 LM -> MLLM transition 上做实验；
  - 如果模型结构、tokenizer、residual geometry 改动更大，same-index comparison 未必成立。
- 第二，benchmark 范围有限：
  - 空间、VLSBench、OCRBench 能覆盖关键能力；
  - 但不能代表开放式多轮视觉对话、视频理解、实时 agent 操作或 adversarial prompt search。
- 第三，control split 只能证明“已测副作用小”：
  - Delta VQA 和 Delta Ctrl 很重要；
  - 但它们不是全能力保持证明；
  - sensitive benign use、跨语言 OCR、复杂图表理解等任务仍需额外检查。
- 第四，steering 的部署风险没有完全解决：
  - `alpha` 与 `gamma_f` 需要选择；
  - 多 feature 同时 steering 可能相互干扰；
  - 用户输入分布变化后，原先 feature direction 是否仍有效还未知。
- 第五，安全方向尤其要谨慎：
  - 降低 ASR 是有价值的审计信号；
  - 但不应把 feature removal 当成绕过 policy training、red teaming、monitoring 的替代品；
  - 更合适的定位是辅助定位内部风险通道，并为后续训练或审计提供证据。

### 研究者视角的延伸问题

- 对 AI 安全：
  - 能否把 unsafe feature discovery 纳入 red-team loop？
  - 每次发现新攻击簇后，不只统计 ASR，还定位对应 internal directions；
  - 再检查这些 directions 是否与 benign sensitive assistance 纠缠。
- 对后训练：
  - RLHF、DPO、RLVR 或多模态 SFT 后，哪些 features 被旋转、稀释或 repurpose？
  - 如果某些 safety features 在后训练中被削弱，能否提前作为 regression signal？
- 对 Agent：
  - 多模态 agent 的风险常来自“看图 -> 读文本 -> 执行动作”的链式决策；
  - MMDiff 这类方法可用于定位视觉证据如何进入 action planning 的中间层；
  - 但必须扩展到长上下文、工具调用状态和多步记忆，而不只是单轮 VQA。
- 对可解释性方法：
  - 未来不应只问 feature label 是否好看；
  - 更应问 feature 是否有三类证据：
    - distribution shift；
    - causal intervention；
    - control split preservation。

### 结论

- MMDiff 的贡献是把多模态可解释性向前推进了一步：
  - 它不仅说“这里有一个看似对应空间/OCR/安全的 feature”；
  - 它还问这个 feature 是否来自多模态训练的重塑，是否在目标分布中更常 firing，是否经得起 lexical filter，是否能通过 removal/steering 改变行为。
- 最值得带走的判断：
  - **多模态安全审计不能只停留在输入输出测试；**
  - **如果能把行为差异映射到内部 feature direction，就能得到更细粒度的诊断和干预入口。**
- 最重要的边界也同样明确：
  - feature-level control 是证据工具，不是完整安全系统；
  - 它需要和模型训练、评测、红队、监控、部署策略一起使用，才能真正降低多模态模型在现实场景中的风险。
