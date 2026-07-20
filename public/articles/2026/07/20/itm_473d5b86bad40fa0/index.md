# Understanding Reasoning from Pretraining to Post-Training：把后训练收益重新接回预训练

### 元信息与 TL;DR

- 原文：Jingyan Shen 等，`Understanding Reasoning from Pretraining to Post-Training`
- arXiv：<https://arxiv.org/abs/2607.16097>
- 官方代码与模型数据入口：<https://github.com/pavelslab-nyu/pre2post-chess>
- 发布时间：arXiv v1 于 2026-07-17 提交，Hugging Face Daily Papers 于 2026-07-20 收录，代码仓库在 2026-07-20 仍有更新。
- 主题归类：大模型后训练，兼具可验证 RL、推理能力形成机制、compute allocation 三条线。

**TL;DR：**

- 这篇论文要回答的不是“RL 后训练有没有用”，而是两个更基础的问题：
  - 预训练阶段的模型大小、token 数和 loss，如何决定 RL compute 的边际收益？
  - RL 到底是在放大 SFT 已经偏好的答案，还是能把 SFT 几乎没有考虑过的正确动作拉出来？
- 作者选择国际象棋作为受控试验场：
  - 用 Lichess 人类棋局做预训练；
  - 用合成搜索树 reasoning trace 做 SFT；
  - 在可验证 chess puzzle 环境里用 GRPO 做 RL；
  - 模型族从 5M 到 1B 参数，棋类预训练语料约 54B token，后训练用 156K puzzles，评测集为 1,480 个按难度分桶的 tactical puzzles。
- 主要结论有三层：
  - 给定 RL compute 后，post-RL 表现可以由预训练 loss 强预测；在参考 RL compute 上，loss 与 reward 的 Spearman 相关从约 -0.93 收紧到 -0.99。
  - RL 曲线的局部斜率与预训练 token 数近似线性相关；联合使用 `log10 T` 与 `log10 N` 拟合斜率时，论文报告 `R^2=0.84`、Pearson `r=0.92`。
  - RL 不是单纯 temperature sharpening：简单幂变换可以解释一部分 SFT 到 RL 的变化，但全局 `R^2` 只有中等水平；在难题上出现 tail discovery，同时也出现 wrong-mode amplification。
- 论文还做了一个数学域迁移验证：
  - 训练 1.48B 总参数的 OLMo-2 系列 checkpoint；
  - 预训练锚点从 10B 到 200B token；
  - SFT 用 NuminaMath-CoT；
  - RL 用 24.9K 个 GSM8K、MATH、DeepScaler 混合题；
  - 500 题 held-out、GSM8K 和 MATH 测试上，用 16 个采样 completion 估计 pass@1；
  - 结果显示类似的 loss-to-post-RL 预测形态。
- 局限也很明确：
  - 国际象棋词表只有 81 个 token，验证是精确且二值的；
  - puzzle 有唯一指定解，不代表自然语言的部分奖励和开放式推理；
  - chess 主实验最大到 1B 参数，数学迁移也只是 1.48B OLMo-2；
  - 拟合律是观测范围内的局部近似，不能解释为 RL 收益无限增长。

![论文 overview 图：预训练、SFT、RL、scaling law 与 policy evolution](/daily-report-app/data/assets/2026/07/20/itm_473d5b86bad40fa0/figure.png)

### 研究问题：为什么后训练不能只看 RL 曲线？

这篇论文的切入点很克制：

- 现有后训练讨论常把预训练 checkpoint 当成固定起点。
- 现有 scaling law 又常把预训练 loss 当成终点或通用质量代理。
- 但 reasoning model 的真实训练流水线是：
  - 先用大规模数据形成 prior；
  - 再用 SFT 把输出格式和 reasoning trace 拉到目标分布；
  - 最后用 RL 在可验证任务上优化 outcome。

作者认为，真正的问题应写成一个接口问题：

```text
pretraining choices  ->  SFT starting policy  ->  RL learning curve  ->  post-RL reasoning behavior
```

这个接口至少包含两个未知量：

| 问题 | 论文中的具体化 | 为什么重要 |
|---|---|---|
| 预训练如何影响 RL 收益？ | 给定模型大小 `N`、预训练 token `T`、预训练 loss `Lpt`，预测 RL 后 reward | 决定固定 compute 下应该多训 base 还是多跑 RL |
| RL 改变了什么？ | 对比 SFT 与 RL 后的 legal-move 分布、reasoning tree、正确 move 的概率迁移 | 区分“放大已有能力”和“发现新行为” |

这与许多“RL 后训练 recipe”论文不同。

- 它不把结论停在 pass@1 提升。
- 它也不只调 KL、rollout 数、reward shape。
- 它把 RL 看成一个依赖初始策略质量的学习动力系统。

### 为什么选择国际象棋，而不是直接用数学或代码？

作者的核心取舍是可控性。

国际象棋并不是自然语言推理的等价替代，但它提供了几件自然语言难以同时满足的条件：

- **状态可序列化**：棋局可以写成 move token 序列。
- **动作空间可枚举**：每个 board state 下的 legal moves 是有限集合。
- **奖励可验证**：puzzle 的 ground-truth continuation 可以直接判定。
- **搜索过程可解析**：模型 CoT 中的候选 move line 可以还原成 prefix tree。
- **数据泄漏可处理**：可以用 board-position 层面的匹配做 decontamination。

这让论文能够观察一个通常被隐藏的问题：

> RL 后的模型不是只在“最终答案正确率”上变化，它在每个 state 的候选动作概率、搜索树宽度、commit move 质量上都发生了可测的重新分配。

### 训练流水线：从人类棋局到可验证 RL

论文的棋类实验模仿标准 LLM 训练路线，但每个阶段都被压缩到可控域内。

| 阶段 | 输入数据 | 训练目标 | 关键设计 |
|---|---|---|---|
| 预训练 | 2022 年 Lichess Blitz/Rapid 人类棋局，约 54B token | 语言模型式 next-token prediction | 棋子、起点、终点等被 token 化，context length 为 1024 |
| SFT | 合成 reasoning trace + 最佳 continuation | 学会显式搜索格式与最终落子 | reasoning trace 用 `<T>...</T>` 包住，多条候选 continuation 用 `<sep>` 连接 |
| RL | 质量过滤后的 Lichess puzzles | 用 verifiable reward 优化多步解题轨迹 | GRPO，只有整条 solution line 全部匹配才给 reward 1 |

SFT 的一个细节很重要：

- 训练序列包含 reasoning trace `r` 与解答 continuation `τ*`。
- `τ*` 里包含玩家动作和环境动作。
- 对手动作在推理时由环境提供，因此训练时对 opponent-move token 做 mask。
- 损失主要施加在模型自己的 reasoning 与 player move 上。

可以写成：

```text
输入：棋局状态 s、合成 reasoning trace r、目标 continuation τ*
状态：loss mask M_t
循环：对每个 token w_t
  如果 w_t 属于 reasoning 或模型应输出的 player move，则 M_t = 1
  如果 w_t 是环境给出的 opponent move，则 M_t = 0
目标：最小化 - Σ M_t log πθ(w_t | s, w_<t)
输出：能按搜索格式思考并给出候选 move 的 SFT policy
```

### RL 奖励：为什么二值 reward 反而有分析价值？

RL 阶段从 SFT policy 出发。

作者定义 trajectory：

```text
ζ = reasoning trace + executed move sequence
```

ground-truth solution line 写成：

```text
(a*_1, a*_2, ..., a*_H)
```

奖励函数是严格二值：

```text
R(ζ, s0) = 1[a1 = a*_1, ..., aH = a*_H]
```

变量解释：

- `s0`：puzzle 起始局面。
- `a_i`：模型在第 `i` 个 player turn 执行的 move。
- `a*_i`：标准解中的第 `i` 个 player move。
- `H`：该 puzzle 需要玩家连续做出的 move 数。
- 只要任何一步错，整条 trajectory reward 为 0。

这种设置对自然语言来说过于干净，但它正好让作者避免 reward model 噪声：

- 如果 RL 提升了，不能归因于 reward model 偏好漂移。
- 如果 RL 失败了，也不能归因于评分器无法识别答案。
- 每个 move 的 legal set、ground-truth move 和模型概率都可以被复盘。

### 数据与模型规模：这不是单点实验

论文没有只训练一个小模型。

关键规模信息如下：

| 维度 | 论文设置 |
|---|---|
| 棋类预训练语料 | 约 54B token，来自 Lichess 2022 人类棋局 |
| 后训练 puzzle | 156K 质量过滤 Lichess puzzles |
| 测试 benchmark | 1,480 tactical puzzles |
| 难度分桶 | B1: 308，B2: 298，B3: 267，B4: 287，B5: 320 |
| 汇总指标范围 | 主 aggregate pass@k 通常报告 B1-B4，因为 B5 对当前模型过难 |
| 模型族 | 5M、10M、20M、32M、50M、100M、200M、410M、680M、1B |
| 主文 RL sweep 图 | 重点展示 20M、50M、200M、680M |

架构上，所有棋类模型都是 Qwen-style decoder-only Transformer。

- 使用 grouped-query attention。
- 不 tie input/output embedding。
- 预训练用 8 张 NVIDIA H200。
- context length 1024。
- AdamW，峰值学习率 `1e-3`，最小学习率 `1e-4`。
- cosine decay，warmup ratio `0.05`。
- per-device batch 32，gradient accumulation 2。
- 有效 batch 是 512 sequences，即每个 optimizer step 约 524,288 tokens。

这组规模设置让论文能做两类 sweep：

- 固定模型大小，改变预训练 token 与 RL compute。
- 固定总 compute，比较 pretraining 与 RL 的分配边界。

### 主张一：预训练 loss 能预测 RL 后表现

论文最值得拿走的第一条结论是：

> 在给定 RL compute 水平下，post-RL reward 与预训练 validation loss 强相关。

作者把每条 RL 曲线局部写成：

```text
R(C_RL, N, T) = R_ref(N, T) + B(N, T) · (log10 C_RL - log10 C_ref)
```

变量解释：

- `C_RL`：RL compute。
- `N`：模型参数规模。
- `T`：预训练 token 数。
- `R_ref(N,T)`：在参考 RL compute `C_ref` 处的 reward。
- `B(N,T)`：每增加一个数量级 RL compute 带来的局部 reward 斜率。

然后用预训练 loss 预测 `R_ref`：

```text
R_ref(N,T) ≈ f(Lpt(N,T))
```

Fig.3 的证据非常直接：

- 当 `log10 C_ref` 从 16 增至 20，pretraining eval loss 与 `R_ref` 的 Spearman 相关从约 `-0.93` 到 `-0.99`。
- 这意味着 RL 跑得越充分，最终表现越像是被预训练 loss 排序。
- 换句话说，强 prior 不只是提高 SFT 起点，也改变了 RL 后能到达的位置。

这对后训练研究有一个重要提醒：

- 不同 base checkpoint 上的 RL gain 不能直接横向比较。
- “某个 RL recipe 提升更多”可能只是因为 starting prior 更差或更好。
- 报告后训练结果时，需要同时报告 pretraining loss、token budget 与模型规模。

### 主张二：更多预训练 token 让 RL 学得更快

第二条结论更像 compute allocation 指南：

> RL 曲线的局部斜率 `B(N,T)` 与预训练 token 数近似线性相关。

Fig.3 给出的联合拟合为：

```text
B(N,T) = 0.208 + 0.017 · log10 T + 0.009 · log10 N
```

论文报告：

- 只看 `log10 T` 时，斜率拟合 `R^2=0.70`。
- 联合使用 `log10 T` 与 `log10 N` 时，`R^2=0.84`。
- 相关性指标为 Spearman `+0.90`、Pearson `+0.92`。
- `log10 T` 的系数约为 `log10 N` 的两倍，暗示 token 数对 RL 学习速度的解释更强。

这不是说“模型大小不重要”。

更准确的解释是：

- 参数规模提供容量。
- 预训练 token 让这个容量形成可被 RL 调动的 prior。
- 在该 chess testbed 的观测范围内，RL 更像是在一个已经被充分训练过的策略空间里寻找可验证改进。

### 主张三：最优 RL compute 占比会随总 compute 增长

论文用 joint law 加 Chinchilla-style loss surface 做 compute-optimal frontier 外推。

主文 Fig.4 给出的趋势是：

| 模型规模附近 | 预测最优 RL compute 占比 |
|---|---|
| 50M | 约 20% |
| 100M-200M | 约 21%-22% |
| 400M-500M | 约 25%-27% |
| 680M | 约 28% |

这条结论容易被误读。

它不是说所有 LLM 都应该拿 20%-28% compute 做 RL。

更稳妥的读法是：

- 在这个受控域内，越大的总 compute 预算越能支撑较高比例的 RL。
- 低 compute 区间里，继续预训练仍然是更强的使用方式。
- 但随着 base prior 变强，RL 的边际收益开始值得分配更大份额。
- 最优点附近 reward surface 很平，论文附录也强调该结论应看成 allocation trend，而不是精确比例。

### 机制分析：RL 不是简单 sharpening

论文最有意思的部分，是把模型 policy 从 token 空间转成 legal-move 空间。

对一个 board state `s`：

- 枚举所有 legal moves `A(s)`。
- 用 teacher forcing 估计每个 legal move 的 log probability。
- 归一化得到 move policy：

```text
πθ(a | s), a ∈ A(s)
```

然后问一个具体问题：

> RL policy 是否只是 SFT policy 的 temperature sharpening？

如果是，那么应该存在一个幂指数 `α`：

```text
π_RL(a | s) ∝ π_SFT(a | s)^α
```

解释：

- `α = 1`：不变。
- `α > 1`：高概率动作更高，低概率动作更低，即 sharpening。
- 如果 RL 只是把 SFT 已经偏好的答案推得更尖，这个式子应能很好拟合。

结果更复杂。

Table 11/12 显示：

- SFT 到 RL 的 `α*` 和 centered-logit slope `β` 的确随 RL step 增加。
- 例如 `SFT→RL_750` 的全局 `α*` 到约 `1.35`，全局 `β` 到约 `1.13`。
- 但 global `R^2` 从 `0.68` 逐步降到约 `0.56`，per-state IQR 很宽。

这说明：

- RL 有 sharpening 成分。
- 但它不是统一温度变换。
- 它会按 state 重新移动概率质量。
- 某些难题上，正确 move 原本几乎不在 SFT top candidates 里，RL 后才进入 top-k。

### 三种局部 policy 变化：amplification、discovery、wrong-mode

论文把 SFT 到 RL 的 move distribution 更新分成几类。

最关键的是三类：

| 类别 | 条件 | 研究意义 |
|---|---|---|
| Ground-truth amplification | 正确 move 原本就在 SFT top-k，RL 后仍在 top-k 且概率上升 | RL 放大已有正确模式 |
| Tail discovery | 正确 move 原本不在 SFT top-k，且概率低于 `ε_tail=0.05`，RL 后进入 top-k | RL 找到原本几乎没被 SFT 考虑的正确 move |
| Wrong-mode amplification | 正确 move 仍不在 top-k，原本偏好的错误 move 被进一步强化 | RL 也会强化错误捷径 |

Fig.5 的结论按难度分化：

- B1/B2 这类容易 puzzle 上，ground-truth amplification 占主导。
- B4/B5 这类难题上，tail discovery 增加。
- 但 wrong-mode amplification 也同步增加。

这给“RL 会不会发现新推理能力”一个更精确的回答：

- 会，但不是单向好事。
- RL 可以把正确 move 从低概率尾部拉上来。
- 同一机制也可能把错误 mode 强化。
- 观察 pass@1 提升不足以区分这两种变化。

### reasoning trace 结构：更宽，不一定更深

论文还把 CoT 解析成 prefix tree。

一个 trace 可能写成：

```text
<T>
  candidate line 1
  <sep>
  candidate line 2
  <sep>
  candidate line 3
</T>
final move
```

解析后可以统计：

| 指标 | 含义 |
|---|---|
| `candidate_count` | root depth-1 处的不同候选 move 数 |
| `num_nodes` | 搜索树里的唯一 move-prefix 节点数 |
| `max_depth` | 最深候选线长度 |
| `effective_branching` | 类似 `num_nodes^(1/D)` 的有效分支因子 |
| `revisit_rate` | 重写已访问 prefix 的比例 |
| `dfs_consistency` | 写作顺序与 DFS preorder 的 Kendall τ |
| `selected_norm_rank_self` | 模型最终 commit move 的 Stockfish 归一化排名 |
| `target_in_any_depth` | ground-truth move 是否出现在搜索树任一层 |

Fig.22-25 给出的机制线索是：

- RL 后 proposed moves 和 opponent replies 的 Stockfish 质量提高。
- 模型更可能在 CoT 树里覆盖 ground-truth move。
- 模型更可能 commit 到自己考虑过的最佳候选。
- 但搜索深度没有明显增长，宽度和 branching 增长更明显。
- 对超过 5 moves 的 continuation，恢复能力仍然困难。

这点对后训练特别关键：

- RL 可能先改善候选生成与选择，而不是形成真正深层搜索。
- 如果目标是长链 reasoning，只靠 outcome reward 可能不够。
- SFT 数据构造可能需要更明确地鼓励深度、回溯、反事实分支和错误剪枝。

### 数学迁移实验：证据是正面的，但还只是定性 case study

为了避免“这只是 chess 特例”的质疑，作者做了数学域实验。

设置如下：

| 维度 | 数学实验 |
|---|---|
| base 架构 | OLMo-2 |
| 参数规模 | 1.48B 总参数，1.07B non-embedding 参数 |
| 预训练 token | 10B 到 200B 的 14 个 checkpoint |
| 预训练语料 | 70% Nemotron-CC-Math-v1，30% Dolma3 |
| annealing | 每个锚点用 5B Dolma3 token 做学习率退火 |
| SFT | NuminaMath-CoT，一 epoch |
| RL 题集 | 24.9K 个 GSM8K、MATH、DeepScaler 混合问题 |
| 评测 | 500 题 held-out、GSM8K、MATH |
| 指标 | temperature 0.7，16 sampled completions 估计 pass@1 |

Fig.6 显示类似模式：

- pretraining eval loss 越低，post-RL 高 compute 表现越好。
- 这种关系随 RL compute 增加而更紧。
- RL 斜率 `B_T` 与 `log10 T` 近似线性，论文给出线性拟合 `R^2=0.90`。

但作者把这部分称为 qualitative case study 是合理的：

- 只有一个 1.48B 架构。
- 只改变预训练 token 锚点。
- 没有像 chess 那样跨 10 个模型规模和完整 compute allocation grid。
- 数学任务的 reward 与 reasoning trace 不像 chess move policy 那样可枚举分析。

所以它支持“结构可能迁移”，但还不能支撑“具体比例和指数可迁移”。

### Figure/Table 证据逐项解读

| 图表 | 支撑的 claim | 不能证明什么 |
|---|---|---|
| Fig.1 | 整体 pipeline：预训练、SFT、RL、scaling law、policy evolution 在一个受控框架内闭合 | 不能证明 chess 与自然语言完全同构 |
| Fig.2 | pass@1 上 RL 持续改善；pass@16 上额外预训练常更有效 | 不能单独给出最优 compute 分配，需要 Fig.3/4 的拟合 |
| Fig.3 | pretraining loss 预测 post-RL reward；token 数预测 RL slope | 局部线性假设只覆盖观测 compute 范围 |
| Fig.4 | 拟合律外推出 RL compute share 随总 compute 增长 | 不能外推到任意大模型或开放式自然语言任务 |
| Fig.5 | 容易题上 amplification，难题上 tail discovery 与 wrong-mode amplification 同时增加 | 不能说明所有 tail discovery 都可稳定复现 |
| Fig.6 | 数学域出现类似 pretraining-to-post-training 预测形态 | 只是单架构迁移 case study |
| Table 1 | 测试集 B1-B5 的大小与 Elo 区间 | 不代表所有 chess reasoning 难度 |
| Table 2/3 | 模型族与预训练配置可复现 | 不能说明超 1B 后趋势不变 |
| Table 11/12 | sharpening 存在但解释不充分 | 不能把 RL 简化成 temperature tuning |
| Table 13 | policy update taxonomy 让机制分析可操作 | 分类阈值和 top-k 选择会影响比例 |

### 消融与失败案例：真正有价值的是“哪里没有被 RL 修好”

这篇论文的实验价值不只在正向 scaling 曲线。

更重要的是，它把几个常被平均指标掩盖的失败形态拆了出来：

| 失败或反例 | 论文中的证据形态 | 对后训练研究的提醒 |
|---|---|---|
| pass@16 的 RL gain 较小 | Fig.2 中 pass@16 曲线显示，额外预训练经常比继续 RL 更有效 | 如果 base policy 的采样集合已经包含正确答案，RL 主要改善 top-1 排序；更大 `k` 下边际收益会变小 |
| hard puzzles 上 wrong-mode amplification 增加 | Fig.5(c) 难度升高时错误 mode 强化比例上升 | RL 的 outcome reward 会把局部看似成功的错误启发式也推高，需要 state-level 分类 |
| 搜索深度没有同步增加 | Fig.22-25 显示 branching、候选质量改善更明显，max depth 与深层 continuation 覆盖仍受限 | 只奖励最终答案，可能优先学会更好地挑候选，而不是学会系统性深搜 |
| fitted law 的 `g(N,T)` 更 noisy | 附录 G.8 指出 RL slope 受未建模因素影响更大 | RL 曲线不能只由 loss、token、参数解释，optimizer、SFT trace、reward 和 rollout 配置仍是关键变量 |
| 数学迁移仍是单架构验证 | Fig.6 只在 1.48B OLMo-2 token 锚点上观察类似形态 | 迁移结论应被看作“值得进一步扫规模”的线索，而不是直接替代多尺度实验 |

这里可以看到作者没有把 RL 描述成统一的能力发现器。

- 在容易题上，RL 常常只是把 SFT 已经会的正确 move 推到更高概率。
- 在难题上，RL 确实能从尾部分布里拉出正确 move。
- 但同一难度区域也更容易强化错误 mode。
- 因此，“RL 发现能力”这个说法必须绑定一个更细的条件：正确动作原本是否在候选集中、概率有多低、RL 后是否进入 top-k、错误 top mode 是否同步变强。

如果把这套分析搬到数学题，类似变量可以是：

- 正确 proof step 是否原本出现在 sampled reasoning paths 中；
- RL 后正确 step 的 rank 是否上升；
- 错误但高 reward 相关的 shortcut 是否被强化；
- 长证明链的后半段覆盖率是否随训练改善。

如果搬到代码 Agent，类似变量可以是：

- 正确文件、命令、测试或补丁策略是否原本在 SFT 的候选工具链中；
- RL 后模型是否只是更快执行已有工具链，还是发现新的调试路径；
- 错误路径是否表现为更自信地跳过测试、过早提交或重复运行无效命令。

这就是论文的机制贡献：它把“平均成功率提升”拆成可观察的动作分布变化。

### 相关工作位置：它填的是 pretraining-RL interface 的空白

论文把自己放在三条研究线之间：

- **预训练 scaling law**：
  - Kaplan、Chinchilla 系列把 loss、参数、数据、compute 关联起来。
  - 但通常不回答后续 RL 曲线如何随 base prior 改变。
- **后训练 RL scaling**：
  - 近期工作会拟合 RL 曲线、比较 GRPO/采样/验证 reward recipe。
  - 但常把 pretrained initialization 当固定条件。
- **RL 机制争论**：
  - 一派认为 RL 主要放大 base model 已有模式。
  - 一派认为 RL 能组合或发现新能力。
  - 这篇论文用 move distribution 和 prefix tree 给出折中答案：两者都会发生，并且随难度变化。

它的贡献不在“棋类模型有多强”，而在实验仪器：

- 能同时扫预训练和 RL。
- 能从 policy 层面解释 reward 变化。
- 能把 compute allocation 和机制分析放在同一条流水线里。

### 证据边界与局限：哪些结论不能直接搬到大模型？

需要把这篇论文的边界说清楚。

1. **任务域差异**

- Chess vocabulary 只有 81 token。
- legal moves 可枚举。
- reward 精确且二值。
- 自然语言推理涉及开放答案、表达质量、世界知识、工具使用和模糊评分。

2. **reward 形态差异**

- puzzle 要求唯一 solution line。
- 错一步就是 0 分。
- 现实数学、代码、Agent 任务常有部分 credit。
- RLHF/RLAIF 还会引入 reward model 偏差。

3. **规模边界**

- chess 主实验最大 1B 参数。
- 数学迁移实验是 1.48B OLMo-2。
- frontier LLM 的数据混合、能力迁移和 optimizer 稳定性可能改变斜率。

4. **拟合边界**

- `R(C_RL,N,T)` 对 `log10 C_RL` 的线性形式是局部近似。
- 论文附录明确说不能解释为 RL improvement 无界。
- `g(N,T)` 比 `f(L)` 更 noisy，说明 RL slope 还受 optimizer、SFT/RL 数据、reward 设置等未建模因素影响。

5. **reasoning trace 格式边界**

- 论文使用树状 CoT 序列化。
- 换成自然语言 scratchpad、代码执行、工具调用或 verifier-guided trace 后，policy evolution 可能不同。

### 对后训练研究的启发：报告 RL 结果时应多给哪些量？

这篇论文给后训练实验设计提出了一个更高标准。

如果要让 RL 结果可解释，至少应报告：

- base checkpoint 的预训练 token、loss、参数规模；
- SFT 数据量、trace 格式、mask 策略；
- RL compute、rollout 数、reward 定义；
- pass@1 与 pass@k 同时报告；
- 按难度分桶的结果，而不是只给平均数；
- policy-level 分析：
  - 正确答案原本是否在 top-k；
  - RL 是 amplification 还是 tail discovery；
  - wrong-mode 是否也被强化；
  - 采样 trace 是否更深，还是只是更宽。

对 Agent 和工具使用任务也可以类比。

例如：

- tool-use RL 中，某个正确 tool call 是否原本已经在 SFT top-k？
- RL 是让模型更坚定地调用正确工具，还是发现了新的工具组合？
- 对复杂工作流，RL 增加的是 plan depth，还是只增加候选 breadth？
- wrong-mode amplification 是否表现为更自信地走错工具链？

这些问题比“平均成功率涨了几点”更接近后训练机制。

### 可复现性：官方仓库已经把流水线拆成阶段，但成本边界很高

官方代码仓库不是一个单脚本 demo，而是按论文实验拆成多个阶段。

| 目录 | 作用 | 复现时的主要门槛 |
|---|---|---|
| `data_preprocessing/` | 从 Lichess 棋局、puzzle 数据生成清洗后的 parquet 与 tokenized shard | 需要原始 Lichess 数据、去重和 board-position decontamination |
| `pretraining/` | 用 Qwen-style decoder-only 模型做一轮 token budget 预训练 | 默认配置面向 8 张 H200，token shard 与 checkpoint 存储成本很高 |
| `sft/` | 生成搜索树 CoT 数据，并对预训练 checkpoint 做多轮 SFT | 需要 Stockfish、puzzle CSV、CoT 生成预算和 GPU |
| `rl/` | 基于 verl fork 做多轮 GRPO，支持 multi-turn chess environment | 需要 CUDA、vLLM 或 SGLang rollout backend、Ray/FSDP 训练栈 |
| `cot_analysis/` | 解析 CoT prefix tree，计算宽度、深度、revisit、DFS consistency 与 Stockfish 质量 | 需要保存 rollout JSONL，并准备 Stockfish 排名缓存 |
| `policy_evolution/` | teacher-forcing 所有 legal moves，分析 SFT 到 RL 的 move distribution 变化 | 需要逐 checkpoint 重新评分所有 legal moves，GPU 成本不低 |

这说明论文的可复现性是“结构可复现”，不是“低成本一键复现”。

- 数据和 checkpoint 分发在 Hugging Face 上，能降低入口难度。
- 但完整 scaling sweep 涉及多模型、多 token budget、多 RL step。
- 如果研究者只想复用方法，最现实的是先复现 `policy_evolution` 或 `cot_analysis` 的分析，而不是重训全部模型。
- 对其他领域迁移时，也应该优先保留这种阶段化记录：训练数据、SFT trace、RL rollout、policy scoring、结构指标必须能互相追溯。

### 结论：这篇论文把 RL 后训练从 recipe 讨论拉回科学测量

我认为这篇论文最值得保留的判断是：

- RL 后训练的收益不是一个孤立的 recipe 属性。
- 它取决于预训练 prior 的质量、token 数、模型规模和 SFT 后的动作分布。
- 好的预训练不只是提高起点，也让 RL 的后续斜率更高。
- RL 既能放大已知正确模式，也能从尾部分布发现正确动作。
- 但同一过程会强化错误 mode，因此机制分析必须跟随 pass@k 一起做。

如果把它放到大模型后训练路线里，它更像一个实验框架提示：

```text
不要只问：
  RL 提升了多少？

还要问：
  起点 prior 是什么？
  正确行为原本在哪里？
  RL 把概率质量从哪里搬到哪里？
  它改善了搜索深度，还是只改善了候选宽度？
  错误模式是否同步被放大？
```

这也是它和近期“后训练 scaling”“reasoning RL recipe”论文的区别：

- 它给出一套可测的 pretraining-to-post-training interface。
- 它把 compute allocation 与行为机制合在一起。
- 它承认 chess 只是受控试验场，但用数学域 case study 说明该结构值得迁移检验。

下一步最有价值的延伸不是简单把模型放大，而是把这种测量方式迁移到：

- 数学证明任务中的 step-level proof action；
- 代码 Agent 中的 tool-call/legal-action 分布；
- 浏览器 Agent 中的安全 gate 与 action trace；
- 多轮规划任务中的 search depth、branching、rollback 和 verifier feedback。

只有当这些结构量也被报告出来，后训练研究才不会停留在“某个 recipe 在某个 benchmark 上涨了几分”的层面。
