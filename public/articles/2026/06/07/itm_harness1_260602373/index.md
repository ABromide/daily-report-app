# Harness-1: Reinforcement Learning for Search Agents with State-Externalizing Harnesses

> 研究者精读 · 搜索 Agent / 状态外置 Harness / 强化学习后训练 / 证据检索

| 字段 | 内容 |
|---|---|
| 论文 | [Harness-1: Reinforcement Learning for Search Agents with State-Externalizing Harnesses](https://arxiv.org/abs/2606.02373) |
| 发布 | arXiv v1: 2026-06-01 15:21:41 UTC |
| 作者 | Pengcheng Jiang, Zhiyi Shi, Kelly Hong, Xueqiang Xu, Jiashuo Sun, Jimeng Sun, Hammad Bashir, Jiawei Han |
| 代码与模型 | [GitHub](https://github.com/pat-jj/harness-1), [Hugging Face](https://huggingface.co/pat-jj/harness-1) |
| 研究对象 | 一个 20B 搜索子 Agent，学习在显式外置状态的 search harness 中检索、阅读、精选、验证和停止 |

## TL;DR：这篇论文真正说了什么

Harness-1 的核心不是“又训练了一个会搜索的大模型”，而是把搜索 Agent 的长期状态从自然语言 transcript 里拿出来，放进一个可编辑、可压缩、可验证的 harness。模型 policy 不再负责记住所有候选、全文、验证记录和证据关系；它负责在每一轮基于渲染后的工作记忆选择结构化动作，例如搜索、回看、精选、验证和结束。

论文的主张是：长程搜索任务的难点不只是语义检索，而是状态管理。传统 agent 把搜索结果、历史推理、候选证据和最终证据集都塞进上下文，policy 既要做语义判断，又要恢复一张隐含账本。Harness-1 让环境侧维护候选池、curated set、importance tags、全文库、证据图、验证缓存、去重压缩和预算标记，从而让 RL 学到更稳定的状态编辑行为。

实验上，Harness-1 在 8 个检索 benchmark 上达到平均 curated recall `0.730`、trajectory recall `0.756`，比下一强 open search subagent 的平均 curated recall 高 `+11.4` 点。更有意思的是迁移形态：source-family benchmark 平均增益 `+7.9` 点，而 held-out benchmark 平均增益 `+17.0` 点，约为前者 `2.2x`。作者用它支持一个判断：模型学到的不是单一语料域技巧，而是“发现、保留、验证、排序证据”的通用状态操作。

这篇论文最值得研究者读的地方，是它把 agent harness 变成了可训练系统的一部分。reward 不只奖励最终答案，也奖励 trajectory 中见过 gold evidence、最终 curated set 保留 answer evidence、工具使用多样性，并惩罚“见过答案证据但没有放进最终证据集”。Figure 5 的训练曲线显示，没有 diversity reward 时 agent 会塌缩成 search-heavy 策略，trajectory recall 可以升高，但 curated recall 约停在 `0.53`；加入 diversity reward 后工具组合更均衡，final curated recall 约到 `0.60`。

## 研究问题：作者为什么要写这篇论文

作者要解决的是检索型 Agent 的一个结构性问题：当任务需要多轮搜索、多文档阅读、跨文档连接和最终证据筛选时，模型上下文不应该同时承担工作台、数据库、验证日志和最终输出缓冲区的角色。

这类任务至少有两种不同能力。第一种是语义搜索决策：下一步该查哪个子问题、读哪篇文档、验证哪个 claim、保留哪些证据、何时停止。第二种是机械状态管理：哪些候选已经见过、哪些文档是重复的、哪些文档已经进入最终 evidence set、哪些实体跨文档连接、哪些 claim 已经验证过。传统 agent 常把两类能力都交给模型，导致 policy 在长 transcript 中反复恢复隐含状态。

强化学习也会因此变得困难。如果 reward 只奖励“过程中见过证据”，policy 可能学会不断搜索而不整理证据。如果 reward 只看最终 answer，credit assignment 又过于稀疏。如果没有显式 curated state，模型可能见过正确文档却没有把它交付给下游生成器。Harness-1 因此把研究问题改写为：能否让 harness 外置可恢复状态，让 RL 训练 policy 学会编辑这些状态，而不是在自然语言历史里隐式维护它们？

## 论文主张与论证路线

| claim | mechanism | evidence | boundary |
|---|---|---|---|
| 搜索 Agent 的长期状态应由 harness 管理，而不是全靠模型上下文记忆 | 候选池 `P_t`、curated set `C_t`、importance `I_t`、全文库 `D_t`、证据图 `G_t`、验证缓存 `V_t` 和预算标记 `B_t` 由环境维护，renderer 只把可行动视图放进 prompt | 8 个 benchmark 平均 curated recall `0.730`，trajectory recall `0.756`；held-out 增益 `+17.0` 点 | 状态对象设计主要面向证据检索子 Agent，不自动覆盖开放创作或非证据型任务 |
| RL 应优化“状态编辑质量”，而不是只优化是否搜到文档 | terminal reward 同时包含 `F_beta`、trajectory recall、final-answer recall、工具多样性、answer evidence bonus 和 missed-evidence penalty | 没有 diversity reward 时工具多样性从约 `6` 降到约 `3.5`，curated recall 约停在 `0.53`；有 diversity reward 时工具多样性约 `4.3`，curated recall 约到 `0.60` | reward 权重是手工设定，是否能跨任务自适应仍未解决 |
| Auto-seeding、importance、compression、evidence graph、verify/review 共同构成可训练工作台 | 第一次成功搜索后 top `k=8` 自动进 curated set；importance tags 支持容量内排序；Sentence-BM25 每结果取 top `K=4` 句；verify 写入缓存 | BrowseComp+ 消融中 full 为 `0.584/0.667` Recall/FA Recall；关闭全部 Harness-1 机制后为 `0.513/0.624`，Recall 相对下降 `12.2%` | 单项消融并非全部单调提升；去掉 content fingerprint dedup 反而 nominal 上升，暴露 qrel 近重复影响 |
| 小规模训练也可能学到可迁移的搜索状态操作 | SFT 用 `899` 条 teacher trajectories 学接口，RL 在 SEC split 上用 `3,453` queries、约 `82K` rollouts 做 on-policy CISPO | Harness-1 unique training items `4,352`，少于 Context-1 的 `8K+` SFT tasks / `9,159` RL queries，也远少于 Search-R1 的 `221,328` rows，却在 held-out 任务上增益更大 | 迁移解释依赖 benchmark 分组；还需要第三方复现和不同 retrieval backend 下的拆分实验 |

## 方法机制：输入、状态、模块与目标函数

Harness-1 把搜索任务建模为一个由 policy 和 stateful harness 共同完成的序列决策问题。输入是用户 query 或 benchmark query，输出不是直接答案，而是一个按重要性排序的 curated evidence set。模型是 `openai/gpt-oss-20b` 基座上的 20B policy；harness 是环境侧状态机和渲染器。

核心状态可以拆成七组：

| 状态 | 含义 | 对 policy 的作用 |
|---|---|---|
| `P_t` | 压缩、去重后的 candidate pool | 让模型在有限候选中选择阅读、精选或继续搜索 |
| `C_t` | 当前 curated output set | 表示最终准备交付给下游生成器的证据包 |
| `I_t` | 每个 curated item 的 importance tag | 支持 `very_high`、`high`、`fair`、`low` 的显式排序与容量裁剪 |
| `D_t` | 所有检索到的全文 document store | 通过 `read_document` / `review_docs` 重新进入 prompt-facing view |
| `G_t` | 由实体、年份、日期共现构成的 evidence graph | 暴露 bridge documents、singleton entities 和跨文档线索 |
| `V_t` | claim 到 doc_ids 的验证记录 | 让 verify 结果成为 durable cache，而不是一次性自然语言解释 |
| `H_t, B_t` | 搜索历史、动作统计、预算安全标记 | 控制 renderer 在长 episode 中提供紧凑、可恢复的工作记忆 |

动作空间分为五类。检索动作包括 `fan_out_search`、`search_corpus`、`grep_corpus`、`read_document`；回看动作 `review_docs` 读取外层全文库；精选动作 `curate(add, remove, importance)` 编辑最终证据集；验证动作 `verify(doc_ids, claim)` 写入验证缓存；结束动作 `end_search(reasoning)` 返回 curated set。

几个机制在论文中尤其关键。Auto-seeding 会在第一次成功搜索后，把 top `k=8` reranked candidates 自动加入 `C_t`，初始 importance 为 `fair`，让 early rollout 不至于全是空 evidence set。Curated cap 为 `M=30`，超出容量时优先淘汰低 importance 文档。Sentence-BM25 compression 对每个检索结果选 top `K=4` 句并保持原文顺序。去重包括 chunk ID dedup 与 content fingerprint dedup；其中 MinHash-LSH 近重复阈值为 `0.85`，这也是消融中 dedup 影响 qrel 计数的原因。

目标函数是 terminal reward，而不是每一步 dense reward。它同时奖励 curated set 质量、过程中见过证据、最终保留答案证据和工具多样性，并惩罚见过答案证据却没有保留：

```text
R =
  w_F F_beta
  + w_tau rho_tau
  + w_A rho_A
  + w_tauA rho_tauA
  + B_A 1[rho_A > 0]
  + w_div min(nu / nu_0, 1)
  - w_miss (rho_tauA - rho_A)_+
  - turn_penalty
```

其中 `F_beta` 使用 `beta=2`，让 recall 权重约为 precision 的 4 倍；`rho_tau` 是 trajectory recall；`rho_A` 是 curated final-answer recall；`rho_tauA` 是 trajectory final-answer recall；`nu` 是工具多样性。论文给出的权重为 `w_F=0.7`、`w_tau=0.3`、`w_A=0.8`、`w_tauA=0.4`、`B_A=1.0`、`w_miss=0.35`，empty-set penalty 为 `-0.2`，reward floor 为 `10^-3`，KL anchor 为 `0.0`，diversity target `nu_0=6`。

## 算法流程、公式与伪代码

状态转移可以写成：

```text
(s_t, a_t) -> (s_{t+1}, o_{t+1})
```

`s_t` 是 harness 的完整外置状态，`a_t` 是 policy 输出的结构化动作，`o_{t+1}` 是 renderer 基于新状态生成的下一轮 observation。关键点是：模型看见的是 prompt-facing working memory，不是全部全文和所有内部账本。

```text
Algorithm: Harness-1 Search Episode

Input:
  query q
  retrieval corpus and optional reranker
  policy pi_theta
  max_turns = 40
  curated_cap M = 30
  auto_seed_k = 8

State:
  P_0 = empty candidate pool
  C_0 = empty curated set
  I_0 = empty importance map
  D_0 = empty document store
  G_0 = empty evidence graph
  V_0 = empty verification cache
  H_0 = empty action/search history
  B_0 = initial context-budget marker
  seeded = false

Loop for t = 0 ... max_turns - 1:
  1. Render WORKINGMEMORY_t from P_t, C_t, I_t, G_t, V_t, H_t, B_t.
  2. Ask pi_theta to emit one structured action a_t.
  3. If a_t is fan_out_search/search_corpus/grep_corpus:
       retrieve candidates;
       compress each result with Sentence-BM25 top K = 4 sentences;
       deduplicate by chunk id and content fingerprint;
       add new candidates to P_t and full text to D_t;
       update G_t with entity/year/date co-occurrence links;
       if seeded is false and retrieval succeeded:
          add top auto_seed_k reranked candidates to C_t;
          set their importance I_t to fair;
          seeded = true.
  4. Else if a_t is read_document/review_docs:
       fetch requested documents from D_t;
       if document is absent or budget cannot render it:
          return a failure observation and keep durable state unchanged;
       else render selected excerpts into next WORKINGMEMORY.
  5. Else if a_t is curate(add/remove/importance):
       edit C_t and I_t;
       if |C_t| > M:
          evict lowest-importance or lowest-ranked items until |C_t| = M.
  6. Else if a_t is verify(doc_ids, claim):
       if doc_ids are missing from D_t:
          record unsupported verification boundary;
       else evaluate claim against selected documents and append result to V_t.
  7. Else if a_t is end_search(reasoning):
       break and return C_t ordered by importance and policy reasoning.
  8. Else:
       record malformed or unsupported action in H_t;
       continue unless repeated failures exhaust the episode budget.

Failure boundaries:
  - no valid retrieval results and empty curated set;
  - repeated malformed actions;
  - context budget cannot render useful observations;
  - max_turns reached before end_search;
  - retrieved evidence was seen in trajectory but omitted from C_t, penalized by missed-evidence term.

Output:
  importance-ordered curated evidence set C_T
  terminal reward R computed from final set, trajectory hits, answer evidence, diversity and miss penalty
```

训练分两段。SFT 阶段使用 LoRA rank `32`、学习率 `5e-6`、batch size `128`、max sequence length `32,768`，训练 `3` 个 epoch。Teacher 是 GPT-5.4 live agent，轨迹保留条件包括格式有效、至少返回一个文档、final output recall `>=0.10`，最终筛出 `899` 条 trajectory，并按 turn 展开为监督样本。

RL 阶段从 SFT step `550` 初始化，用 on-policy CISPO，clip 区间 `[0,5]`，只用 SEC training split。训练 query 数量为 `3,453`，每步 `128` queries，每 query `8` rollouts，所以每步 `1,024` rollouts；总 `80` 步，约 `82K` rollouts。episode 上限 `40` turns，generation budget `2,048` tokens，没有 KL anchor，constant-reward group 会被丢弃。

## 实验设置：数据、模型、指标与评测协议

训练数据规模不大，但结构很明确。Harness-1 的 unique training items 为 `4,352`。作为参照，Context-1 报告超过 `8K` SFT tasks 和 `9,159` RL queries，Search-R1 使用 `221,328` merged rows。作者想证明的不是数据量优势，而是稳定状态接口带来的迁移性。

评测覆盖 8 个检索 benchmark，包括 BrowseComp+、Web synthetic、SEC filings、USPTO office actions、LongSealQA、Seal0QA、FRAMES 和 HotpotQA。这些任务覆盖网页浏览、金融文件、专利审查和长上下文多跳问答。指标以 evidence set 为中心，而不是最终自然语言答案为中心：

| 指标 | 含义 |
|---|---|
| Recall | final curated set 覆盖 annotated relevant docs 的比例 |
| Trajectory Recall | episode 中任意时刻见过 relevant docs 的比例 |
| Final-Answer Recall | final set 覆盖 answer docs 的比例 |
| Precision/F1 | curated set 的精度与综合质量，作为辅助观察 |

实验还区分 source-family 与 held-out transfer。Source-family 包括 BC+、Web、Patents、SEC；held-out 包括 LongSealQA、Seal0QA、FRAMES、HotpotQA。这个分组用于判断 policy 是否只学到训练域策略，还是学到了更通用的状态操作。

## 主结果：哪些结论被数据支持

最直接的主结果是：Harness-1 在 8 个 benchmark 上平均 curated recall `0.730`，平均 trajectory recall `0.756`。相较 Tongyi DeepResearch 30B，Harness-1 curated recall 高 `+11.4` 点。论文还报告它高于 GPT-5.4、Sonnet-4.6、Kimi-K2.5、GPT-OSS-120B 等多个 frontier retriever，但 Opus-4.6 的平均 curated recall 仍更高。

更关键的是迁移形态。Source-family benchmark 的平均增益为 `+7.9` 点，held-out benchmark 平均增益为 `+17.0` 点，held-out/source 比率约 `2.2x`。如果模型只是记住 SEC 或 BrowseComp+ 风格，held-out 增益通常不应更大。作者据此认为 policy 学到的是一组领域无关状态操作：细化 auto-seeded set，沿 evidence graph 追 bridge entity，回看不确定候选，verify 后 promote，把最终 evidence set 压紧。

BrowseComp+ 上的消融进一步支持“harness 不是普通包装层”。Full Harness-1 是 `0.584/0.667` Recall/FA Recall；关闭全部 Harness-1 机制后为 `0.513/0.624`，Recall 相对下降 `12.2%`。这说明外置状态机制和训练过的 policy 是耦合的：去掉状态后，policy 仍能搜索，但不再稳定地整理和保留证据。

## 消融、失败案例与反例

BrowseComp+ 100-query 消融给出了各组件的边际作用：

| 配置 | Recall | FA Recall | 证据含义 |
|---|---:|---:|---|
| Full Harness-1 | `0.584` | `0.667` | 完整状态接口 |
| 去掉 importance tags | `0.560` | `0.614` | FA Recall 相对下降 `7.9%`，说明排序/优先级对答案证据保留关键 |
| 去掉 Sentence-BM25 compression | `0.585` | `0.620` | Recall 近似不变但 FA Recall 下降 `7.0%`，说明压缩主要改善下游可用证据 |
| 去掉 auto-seed | `0.582` | `0.624` | FA Recall 下降 `6.4%`，说明早期非空 curated set 能缓解 sparse reward |
| 隐藏 evidence graph | `0.569` | `0.631` | FA Recall 下降 `5.4%`，说明图索引对跨文档连接有帮助 |
| verify 不可用 | `0.566` | `0.641` | 验证缓存影响最终答案证据选择 |
| review docs 不可用 | `0.598` | `0.641` | Recall nominal 上升但 FA Recall 下降，说明回看更服务证据质量而非 qrel 数量 |
| 去掉 content fingerprint dedup | `0.611` | `0.678` | nominal 上升，暴露近重复 qrels 与 dedup 之间的度量冲突 |
| 关闭全部机制 | `0.513` | `0.624` | 状态接口整体缺失导致 Recall 相对下降 `12.2%` |

失败或反例不只是“模型差”。第一，去掉 content fingerprint dedup 反而使数字上升，说明 benchmark qrels 可能包含 near-duplicate gold docs，MinHash-LSH 阈值 `0.85` 的合并会损失 qrel 计数；这不是 dedup 必然有害，而是度量与上下文预算之间的 tradeoff。第二，隐藏某个工具时，policy 的行为分布也会变化：论文观察到关闭机制后 `search_corpus` 使用增加，`read_document` 和 `verify` 使用下降，agent 更宽、更浅、更像搜索循环。第三，evidence graph 是 regex-based，多语言、别名合并和隐式关系上可能脆弱。

最重要的反例是 search-only 塌缩。没有 diversity reward 时，agent 快速学会大量调用 `fan_out_search`，trajectory recall 可以升高，但 curated recall 停在约 `0.53`，工具多样性从约 `6` 降到约 `3.5`。这说明“找到了相关文档”不等于“交付了正确证据包”。

## Figure / Table 逐项证据解读

Figure 1 的证据功能是给出论文问题和 benchmark 总览：Harness-1 不是回答生成器，而是搜索子 Agent，它输出 curated evidence set。读这张图时应关注“subagent”定位，而不是把它理解为端到端问答模型。

Figure 2 展示 policy 与 stateful harness 的边界，是全论文的方法图。它的关键证据功能是说明状态不在模型内部：candidate pool、curated set、full document store、evidence graph、verification cache 和 renderer 都是 harness 对象。该图支撑“状态外置”主张，但不直接证明性能增益；性能增益需要 Table 2 和消融表支持。

Table 2 是主结果表，证据功能是比较 Harness-1 与 open search subagents、frontier retrievers 和不同 benchmark family 的 recall。平均 curated recall `0.730` 和 trajectory recall `0.756` 支撑总体有效性；source-family 与 held-out 的增益差异支撑迁移论点。

Figure 5 展示训练动态，证据功能是说明 reward 设计会改变工具使用模式。没有 diversity reward 的曲线揭示 search-heavy collapse；加入 diversity reward 后 curated recall 更高，说明 RL 目标必须和状态编辑动作空间匹配。

消融表的证据功能是拆解 harness 组件，而不是证明每个组件单独都单调改善。importance tags、compression、auto-seeding、evidence graph、verify/review 都主要影响 FA Recall；content dedup 的 nominal 反例提醒读者，检索 benchmark 的 qrel 计数可能奖励重复证据。

## 相关工作与位置判断

相对 Context-1，Harness-1 的推进在于把 search subagent 的 harness state 写成明确研究对象，并补上状态符号、工具签名、reward weights、训练超参和 inference-time component ablation。Context-1 已经强调把搜索子 Agent 从生成器中解耦，Harness-1 更进一步问：子 Agent 的状态边界应该如何设计，RL 又应该如何优化这些状态编辑？

相对 Search-R1、WebSeer 这类多轮搜索 RL 工作，Harness-1 的层级不同。Search-R1/WebSeer 更强调 agent 通过 RL 学会多轮搜索；Harness-1 强调 RL 应发生在显式状态接口上。换句话说，它不只是让模型更会调用搜索工具，而是重设“搜索工具调用后发生了什么”的 runtime 抽象。

相对传统 retriever-reranker，Harness-1 也不是单纯 reranking。它输出的是一个经过多轮发现、回看、验证、剪裁和排序的 evidence set。它的评价也不是单次检索 top-k，而是 episode-level trajectory recall、final curated recall 和 final-answer recall。

## 证据边界、局限与可复现性

技术边界首先来自 harness 自身。Evidence graph 是 regex-based，主要抽取多词大写专名、四位年份或年代、数字日期，并用同文档共现建边；它不等价于可靠实体链接或关系抽取。`M=30` curated cap 对不同任务是否合适也未被充分探索。verify tool 的错误传播同样值得警惕：如果验证缓存把错误证据提升为高 importance，外置状态会把错误稳定化。

实验边界来自数据和后端。BrowseComp+、SEC、USPTO、LongSealQA、Seal0QA、FRAMES、HotpotQA 的组合覆盖了多类检索任务，但并不等于所有开放网页或专业检索场景。Chroma/OpenAI/reranker backend 对结果贡献仍需要单独拆分。去重消融的反例说明 qrel 近重复会影响 recall 读数，因此不能只用一个 recall 数字判断证据质量。

可复现性方面，公开仓库提供 harness、training、inference、datagen、model export 和 tests 目录，也提供 `pat-jj/harness-1` 权重。直接可做的是加载权重、用 vLLM 启 raw `/v1/completions` smoke test、在具备数据和索引时跑 BrowseComp+ evaluation、查看 ablation 和 baseline runner。完整复现需要 Linux、Python `3.11+`、`uv`、CUDA NVIDIA GPU、vLLM with GPT-OSS support、BrowseComp+ query/qrel/answer 文件、Chroma collection 且 document IDs 对齐 qrels、OpenAI credentials，以及可选 Baseten reranker credentials。21B BF16 checkpoint 和 Tinker 路径也对硬件与工程环境有门槛。

## 领域延伸思考：它改变了什么问题

Harness-1 改变的研究问题，是把“搜索 Agent 是否会调用工具”推进到“搜索 Agent 的状态对象应如何被训练、渲染和评价”。这对 Agent/Web RL/search agent 研究至少提出四个后续方向。

第一，search agent 的状态接口能否标准化？如果候选池、证据集、验证缓存、失败记录和预算标记都能成为跨环境 API，那么 SFT、RL、eval 可以共享同一个 renderer，减少 train-test interface mismatch。

第二，reward 是否可以从手工权重走向可学习或任务自适应？Harness-1 的 reward 很细，但 `w_F`、`w_tau`、`w_A`、`w_tauA`、`w_miss` 和 diversity target 都是人工设定。不同任务中，trajectory discovery、final evidence retention 和 precision 的权重可能不同。

第三，证据图能否从 regex 共现升级为可校准的多跳证据结构？当前 `G_t` 的价值是让 bridge 和 singleton 可见，但实体链接、别名、跨语言关系和时序约束仍弱。更强的 graph state 可能让 search policy 更会规划多跳检索。

第四，Web RL 与 search RL 能否共享“外置状态”思想？浏览器 Agent 有 DOM state、form state、tab history、失败动作和约束进度；搜索 Agent 有 candidate/evidence/verification state。两者都说明长程 Agent 不应把全部状态塞进上下文窗口，而应学习在可编辑 runtime state 上行动。

打开原文：[arXiv](https://arxiv.org/abs/2606.02373)
