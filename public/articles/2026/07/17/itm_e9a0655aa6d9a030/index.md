# Bridge Evidence：为什么静态检索相关性预测不了 Agent 真正需要的证据

## 元信息与 TL;DR

- 标题：Bridge Evidence: Static Retrieval Utility Does Not Predict Causal Utility in Multi-Step Agentic Search
- 作者：Debayan Mukhopadhyay、Utshab Kumar Ghosh、Shubham Chatterjee
- 机构：University of Calcutta、Missouri University of Science and Technology
- 链接：https://arxiv.org/abs/2607.15253
- 版本：arXiv:2607.15253v1，2026-07-16
- 方向：大模型 Agent / agentic retrieval / multi-hop search evaluation

### TL;DR

- 这篇论文问了一个很具体的问题：**一个文档对静态 RAG reader 有用，是否就等于它对多步搜索 Agent 有因果价值？**
- 作者的回答是否定的。他们在 HotpotQA 上让一个 ReAct 风格搜索 Agent 执行多步检索，然后对每个已读文档做“删掉它再重放后续轨迹”的 counterfactual intervention。
- 核心指标有两个：Static RAG Utility（SRU）看文档单独给 reader 是否提高答案 F1；Counterfactual Trajectory Utility（CTU）看删掉文档后 Agent 的最终答案、下一步查询质量和搜索轮数是否变差。
- 在 1000 个 HotpotQA development questions、23,322 个 document observations 上，SRU 与 CTU 几乎不相关：Spearman rho = -0.0257；作者将这解释为静态相关性和轨迹因果效用在 Agentic search 中是两种不同量。
- 最醒目的现象是 bridge evidence：文档本身不能让静态 reader 答题，但删除它会伤害 Agent 后续轨迹。按 SRU/CTU 四象限切分，35.72% 的已读文档落在 bridge cell；换成 BM25 + cross encoder proxy 后，bridge cell 仍有 27.16%。
- 作者没有把 35.72% 当成独立第二发现。他们明确指出 SRU 轴很偏，只有 3.30% 的观测 ΔSRU > 0，所以 bridge 占比很大程度上是“近似独立 + 边际分布”的结果；更稳的证据是 rho 近零和 proxy quadrant 复现。
- 机制解释来自 Observable Entity Relevance（OER）：高 OER entity 进入 Agent 下一步 query 的概率为 6.1%，低 OER entity 为 1.5%，比值 4.02x，n = 227,139。这说明 bridge document 的价值不是“包含答案”，而是把可区分实体交给 Agent，让下一步搜索改道。
- 局限同样重要：CTU 是某个 Agent、prompt、retrieval stack 和 step state 的性质，不是文档的固有属性；counterfactual replay 昂贵；Qwen2.5-7B-Instruct + HotpotQA + Wikipedia 的结论还不能自动外推到所有 Agent；H2“传播实体是否特别集中在 bridge cell”没有复现。

## 研究问题：作者真正要拆掉哪个默认假设？

### 传统检索评价默认了什么？

传统 RAG 和 IR 评价常把文档价值写成一个静态问题：

- 给定问题 `q`；
- 给 reader 一个候选文档 `d`；
- 看 reader 的答案是否变好；
- 用 nDCG、MAP、MRR、reader F1 或 reranker score 近似文档价值。

这个定义在单轮 reader 场景里相当自然，因为 reader 的输入就是问题和文档：

```text
question + document -> answer
```

但 Agentic search 的使用方式不是这样。一个 ReAct agent 会：

1. 读问题；
2. 生成第一步 query；
3. 读取 top documents；
4. 基于已读内容生成下一步 query；
5. 多轮后才给答案。

因此，一个文档可以出现这种状态：

| 文档表面属性 | 对 reader 的静态价值 | 对 Agent 的轨迹价值 |
| --- | --- | --- |
| 不含最终答案 | 低 |
| 引入下一步应搜的实体 | 静态指标看不见 |
| 删除后 Agent 搜错方向 | 因果价值高 |

这就是作者称为 **bridge evidence** 的对象。

### Bridge evidence 的精确定义

论文给出的定义可以改写为：

> Bridge evidence 是一种文档，它引入了某个实体或关系；这个实体或关系出现在 Agent 的下一步 query 中，此前 query 没出现过；删除该文档会让轨迹变差；但文档本身在 BM25、静态 reader utility 或 answer containment 这些静态 proxy 上得分低。

这一定义抓住了 Agent retrieval 的关键差异：

- 静态检索问：**这篇文档现在是否回答问题？**
- Agent 检索问：**这篇文档是否让下一步搜索变得可能？**

作者用论文里的 Hawaii 问题解释这一点：

- 问题问的是某位 Hawaii 第六任州长所属政党；
- 第一步文档只告诉 Agent Linda Lingle 是第六任州长；
- 这个文档不含“Republican”答案，静态 reader 答不出；
- 但它把 “Linda Lingle” 这个实体交给 Agent；
- 后续 query 可以围绕 Linda Lingle 搜 party affiliation。

因此，这个文档不是答案文档，而是**路径文档**。

## 论文主张与论证路线

### Claim -> mechanism -> evidence -> boundary

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 静态文档效用不能预测 Agent 轨迹因果效用 | 对每个已读文档做 omission intervention，重放后续轨迹 | SRU 与 CTU 在 23,322 个观测上 Spearman rho = -0.0257 | 只测一个 Agent、一个 retrieval stack、HotpotQA/Wikipedia |
| Bridge evidence 是常见而不是轶事 | SRU 低但 CTU 高的 Cell C 被单独计数 | Reader-based quadrant 中 Cell C = 8,331 / 23,322 = 35.72% | SRU 轴严重偏斜，35.72% 不能被当成独立确认 |
| 结果不完全依赖弱 reader | 用 BM25 normalized + cross encoder normalized 替代 reader SRU | Proxy quadrant 中 bridge cell = 2,607 / 9,600 = 27.16% | 需要 BM25 与 CE 同向，丢弃了 58.84% disagree records |
| Bridge document 的作用是传播实体 | 用 OER 判断实体是否区分 relevant / non-relevant candidates | 高 OER entity 进入下一步 query 的概率 6.1%，低 OER 为 1.5%，ratio = 4.02x | H2 没复现，不能说传播实体一定集中在 bridge cell |
| 现有 ranker label 可能不适合 Agent | 静态 label 优化的是 reader-visible usefulness，不是 trajectory causal utility | reader F1 with-doc 仅 0.0170，without-doc 0.0122；answer containment 仅 7.50% records | CTU 太贵，不能直接放进训练循环 |

### 论证节奏

作者不是先提出一个新系统，而是先做测量：

1. **概念拆分**：把文档单独答题价值和轨迹因果价值拆开。
2. **干预设计**：删掉一个已读文档，重放后续轨迹。
3. **指标构造**：用 SRU 描述静态 reader 改善，用 CTU 描述删文档后的轨迹损失。
4. **四象限检验**：看 SRU 高/低与 CTU 高/低是否对齐。
5. **机制验证**：用 OER 测实体是否真的进入下一步 query。
6. **边界修正**：主动解释 SRU 轴偏斜、turn-count confound、H2 failure 和 CTU 不可外推。

这个结构的价值在于：它没有把“Agent 需要不同检索”当口号，而是把差异写成可审计的反事实数据集。

## 方法机制：从 SRU 到 CTU

### Agent 轨迹怎么表示？

论文研究的是一个 ReAct 风格 research agent：

- backbone：Qwen2.5-7B-Instruct；
- 检索：BM25 over paragraph-level Wikipedia index；
- reranking：top 50 candidates 经 cross encoder rerank；
- 上下文：每轮 top 10 paragraphs 进入 Agent context；
- 轮数：最多 4 个 search turns；
- decoding：temperature = 0.0，sampling disabled；
- 数据：HotpotQA development set。

作者把状态转移写成：

```text
S_t -> ((thought + CW)_t, q_t, D_t) -> S_{t+1}
```

变量解释：

| 符号 | 含义 |
| --- | --- |
| `S_t` | Agent 在第 t 步的 latent reasoning state |
| `(thought + CW)_t` | 显式 thought 加累计 context window |
| `q_t` | 第 t 步生成的检索 query |
| `D_t` | retriever 返回的 evidence set |

这篇论文真正盯住的是下一步 query 生成：

```text
((thought + CW)_t, D_t[:10]) -> q_{t+1}
```

一个 bridge document 的价值就在这里发生：

- 它可能不回答原始问题；
- 但它进入 `D_t[:10]`；
- 它改变 `(thought + CW)_t`；
- 它把下一步 `q_{t+1}` 推向正确实体。

### SRU：静态 RAG Utility 怎么算？

SRU 模拟传统 reader-only 判断。

给定问题 `q_i` 和文档 `d_j`：

```text
SRU_with(q_i, d_j) = A_with_{i,j}
SRU_without(q_i) = A_without_i
```

文档的静态 utility 是：

```text
Delta SRU(q_i, d_j)
  = F1(A_with_{i,j}) - F1(A_without_i)
```

这里减掉 zero-shot baseline 很关键：

- 如果 reader 不看文档也能凭参数记忆答对；
- 不能把这个功劳记到文档上；
- 所以文档要证明自己比 no-document baseline 更有用。

### CTU：Counterfactual Trajectory Utility 怎么算？

CTU 问的是另一个问题：

> 如果 Agent 没有读到这个文档，后续轨迹是否会变差？

干预很直接：

```text
[d1, d2, ..., d10]
  -> [d1, ..., d_{i-1}, d_{i+1}, ..., d10]
```

作者固定干预前 prefix，然后从干预点往后 replay trajectory。每个文档的价值由三个 delta 组成：

```text
Delta_answer     = F1_base - F1_cf
Delta_next-query = nDCG@10(q_{t+1}^{base}) - nDCG@10(q_{t+1}^{cf})
Delta_effort     = turns_cf - turns_base
```

含义如下：

| 分量 | 正值表示什么 | 为什么重要 |
| --- | --- | --- |
| `Delta_answer` | 删文档后最终答案 F1 更差 | 文档影响最终任务成败 |
| `Delta_next-query` | 删文档后下一步 query 检索更差 | 文档改变了搜索方向 |
| `Delta_effort` | 删文档后需要更多轮，或失败 | 文档让 Agent 更快收敛 |

三个分量 min-max normalize 后等权相加：

```text
CTU = w1 * norm(Delta_answer)
    + w2 * norm(Delta_next-query)
    + w3 * norm(Delta_effort)

w1 = w2 = w3 = 1
```

作者刻意不调权重，因为调权重会让“发现 bridge evidence”变成目标泄漏。

### 为什么 CTU = 1.4 是零效应点？

三个 raw delta 的观测范围是：

- `Delta_answer`：[-1, 1]
- `Delta_next-query`：[-1, 1]
- `Delta_effort`：[-2, 3]

如果删掉文档完全没影响，那么三个 raw delta 都是 0。

归一化后：

```text
(0 - (-1)) / (1 - (-1)) = 0.5
(0 - (-1)) / (1 - (-1)) = 0.5
(0 - (-2)) / (3 - (-2)) = 0.4

CTU_null = 0.5 + 0.5 + 0.4 = 1.4
```

因此：

- `CTU > 1.400`：删掉文档会伤害 Agent，文档有正因果效用；
- `CTU <= 1.400`：文档没有正效用，甚至可能让 Agent 变差；
- 这个阈值不是任意 median split，而是“零效应”在归一化空间里的位置。

## 算法流程：反事实轨迹探索

### Counterfactual Trajectory Exploration 伪代码

```text
Input:
  Questions Q from HotpotQA dev
  Agent A with ReAct prompt
  Retriever R = BM25 + cross-encoder reranker
  Max search turns T = 4

State:
  Base trajectory logs:
    thought_t, q_t, shown_doc_ids_t, D_t[:10], answer

For each question q in sampled Q:
  Run A normally and save the base trajectory

  For each search step t in base trajectory:
    For each shown document d_i in D_t[:10]:
      Build counterfactual evidence set:
        D_t_cf = D_t[:10] without d_i

      Replay A from step t onward:
        prefix before t stays fixed
        evidence at t uses D_t_cf
        future thought/query/answer are regenerated

      Compute:
        Delta_answer
        Delta_next-query
        Delta_effort
        CTU(d_i, A, t)

      Compute static signals:
        Delta SRU
        BM25_norm
        CE_norm
        answer containment

Output:
  Document-level table for quadrant analysis
  Entity-level table for OER propagation analysis

Failure boundaries:
  If the base trajectory ends in one turn:
    CTU is undefined for future-query effects
  If evidence is unreachable in top 50 BM25:
    discard question before sampling
  If BM25 and CE disagree in proxy quadrant:
    exclude from proxy robustness subset
```

### 为什么只干预“已展示文档”？

作者没有对所有 retrieved documents 做因果声明，只分析 Agent 实际读过的 `shown_doc_ids`。

理由很简单：

- 没进入上下文的文档不能影响模型；
- 被跨步去重后没展示的文档也不能影响模型；
- 只有已展示文档才是 Agent 决策条件的一部分。

这让论文的 causal claim 更窄，但也更干净：

> 它测的是 Agent 在这次轨迹中实际读到的证据是否有因果价值，而不是离线候选池里所有文档的潜在价值。

## 实验设置：数据、采样与信号

### HotpotQA 采样

作者从 HotpotQA development set 的 7,405 个问题中抽样 1000 个。

采样前有一个 coverage filter：

- 每个问题的 gold supporting fact article title；
- 必须在该问题 top 50 BM25 results 中出现；
- 否则丢弃。

这个过滤避免把两类失败混在一起：

| 失败类型 | 是否是本文关注对象 |
| --- | --- |
| Retriever 根本找不到 gold evidence | 否，属于 retrieval reachability failure |
| Agent 读到了可用线索但后续 query 没接住 | 是，属于 agentic trajectory utility |

抽样比例大致保持 HotpotQA 的 bridge/comparison 分布：

- bridge questions：约 70%；
- comparison questions：约 30%；
- 固定 random seed。

### Agent 与 reader prompt

Agent system prompt 约束了行为：

- 必须先 `<thought>`；
- 用 `<action>search</action>` 和 `<query>` 搜索；
- 有证据后 `<action>answer</action>`；
- answer 必须是短语；
- 最多 4 轮搜索；
- 不能重复 query。

静态 reader prompt 则故意更窄：

- 只能用 supplied document；
- 只输出 answer span；
- 文档不足时输出 `UNANSWERABLE`；
- 不允许使用 outside knowledge。

这个对比是论文的核心实验结构：

| 模型角色 | 输入 | 被测能力 |
| --- | --- | --- |
| Static reader | `question + one document` | 文档是否独立支持答案 |
| ReAct agent | history + query + retrieved docs | 文档是否改变后续搜索轨迹 |

## 主结果：SRU 与 CTU 几乎独立

### 描述统计先提示了问题

23,322 个 document observations 的关键统计如下：

| Metric | Mean | Median | 解释 |
| --- | ---: | ---: | --- |
| `Delta SRU` | 0.0048 | 0.0000 | 单文档对静态 reader 的平均改善非常小 |
| `sru_f1_withoutdocs` | 0.0122 | 0.0000 | no-document reader 基线很弱 |
| `sru_f1_withdocs` | 0.0170 | 0.0000 | 给单文档后仍然很弱 |
| `CTU` | 1.3911 | 1.4000 | median 正好等于零效应阈值 |
| `Delta answer` | -0.0225 | 0.0000 | 多数文档对最终答案无明显个体影响 |
| `Delta next-query` | -0.0482 | 0.0000 | 多数文档对下一步 query 无明显个体影响 |
| `Delta effort` | 0.1324 | 0.0000 | effort 有正向均值，但中位数仍为零 |

最重要的背景数字是 answer containment：

- unique question-document pairs 中只有 6.38% 含 gold answer；
- records 中只有 7.50% 含 gold answer。

这符合多跳问答的结构：

- 单个 paragraph 往往只承载一跳；
- 静态 reader 很难从单文档直接答最终问题；
- 因此 SRU 轴天然压缩。

### 四象限结果

作者按两个阈值切四象限：

- `Delta SRU > 0`：静态 reader 被文档改善；
- `CTU > 1.400`：删掉文档后 Agent 变差。

| Cell | 条件 | 含义 | 数量 / 占比 |
| --- | --- | --- | ---: |
| A | SRU 高，CTU 高 | Expected useful | 262 / 1.12% |
| B | SRU 高，CTU 低 | Redundant evidence | 508 / 2.18% |
| C | SRU 低，CTU 高 | Bridge evidence | 8,331 / 35.72% |
| D | SRU 低，CTU 低 | Genuinely useless | 14,221 / 60.98% |
| Total | - | - | 23,322 |

这个表的直觉是：

- A：传统 retrieval 想找的好文档；
- B：静态上好，但 Agent 已经知道或不需要；
- C：静态上差，但 Agent 没它不行；
- D：两边都没用。

论文真正关心的是 C。

### 相关性结果比占比更关键

Spearman correlation：

| Group | rho | p | n |
| --- | ---: | ---: | ---: |
| All records | -0.0257 | 8.754e-5 | 23,322 |
| 2 turns | -0.0083 | 0.499 | 6,710 |
| 3 turns | -0.0252 | 0.0622 | 5,490 |
| 4 turns | -0.0301 | 0.0015 | 11,122 |

作者的解读很克制：

- pooled p-value 显著，是因为 n 很大；
- rho 的绝对值只有约 0.026；
- 解释方差约 0.07%；
- 正确读法不是“轻微负相关”，而是“几乎无关”。

这才是论文的中心发现：

> 静态 utility 不能告诉我们 Agent 实际需要哪篇文档。

## Robustness：换成 BM25 + Cross Encoder 仍然成立

### 为什么要做 proxy quadrant？

reader-based SRU 有一个明显问题：

- reader F1 with-doc 平均只有 0.0170；
- without-doc 平均 0.0122；
- `Delta SRU > 0` 的记录只有 3.30%；
- 因此 SRU 轴接近退化。

如果只看 reader quadrant，审稿人可以质疑：

> 你只是证明了这个静态 reader 太弱，而不是证明静态检索信号不适合 Agent。

作者因此换了静态轴：

- BM25 normalized；
- cross encoder normalized；
- 两者都高才算 proxy high；
- 两者都低才算 proxy low；
- 两者 disagree 的记录排除。

### Proxy quadrant 结果

| Cell | 含义 | 数量 / 占比 |
| --- | --- | ---: |
| A | Proxy high, CTU high | 957 / 9.97% |
| B | Proxy high, CTU low | 1,648 / 17.17% |
| C | Bridge | 2,607 / 27.16% |
| D | Proxy low, CTU low | 4,388 / 45.71% |
| Total | BM25 与 CE 同向 records | 9,600 |

这个结果更有说服力的点是：

- 静态轴不再依赖 reader；
- proxy high 的比例约 27.14%，不再是 3.30% 的极端偏斜；
- bridge cell 仍有 27.16%；
- proxy 与 CTU 的 rho 仍接近 0：all records rho = -0.0161，p = 0.116。

但边界也要保留：

- 23,322 个记录中有 13,722 个被排除；
- 排除比例 58.84%；
- 这些正是 BM25 与 cross encoder 不一致的案例；
- 所以 proxy quadrant 只能说明“在静态 stack 自己比较有信心的 subset 上，结论仍成立”，不能代表全部记录。

## 机制解释：为什么 bridge document 会工作？

### 作者的机制假设

论文不是止步于“SRU 与 CTU 不相关”，还问：

> 如果 bridge document 本身不含答案，它到底给了 Agent 什么？

作者的答案是：实体。

更准确地说：

- 文档引入一个 entity；
- 这个 entity 在当前 candidate set 中能区分 relevant 和 non-relevant documents；
- Agent 把这个 entity 带入下一步 query；
- 搜索方向因此转向正确证据。

这把 bridge evidence 从直觉变成可测机制。

### OER 公式

Observable Entity Relevance（OER）衡量实体是否在候选集中区分相关文档与不相关文档。

对 step `q` 的实体 `e`：

```text
p_rel    = (df_rel + alpha) / (R  + 2 * alpha)
p_nonrel = (df_nonrel + alpha) / (NR + 2 * alpha)

w(e,q) = 1 - exp(-df_cand / tau)

OER(e,q) = w(e,q) * [logit(p_rel) - logit(p_nonrel)]
```

变量解释：

| 变量 | 含义 |
| --- | --- |
| `R` | relevant candidates 数量 |
| `NR` | non-relevant candidates 数量 |
| `df_rel` | 含实体 e 的 relevant candidates 数量 |
| `df_nonrel` | 含实体 e 的 non-relevant candidates 数量 |
| `df_cand` | 含实体 e 的 candidate 总数 |
| `alpha` | smoothing，作者沿用 0.5 |
| `tau` | support discount 参数，作者沿用 5.0 |
| `w(e,q)` | 降低低频实体的估计噪声 |

一个正的 OER 表示：

- 该实体更集中地出现在 relevant documents；
- 它不是页面上随便出现的实体；
- 它有可能成为下一步 query 的有效桥。

### H1：高 OER entity 更常进入下一步 query

作者构造两组：

- High OER：实体至少出现在一个 gold supporting document，且 OER > 0；
- Low OER：实体不出现在 gold supporting documents；
- 中间组排除。

结果如下：

| Criterion | Sample | High OER | Low OER | Ratio | p |
| --- | --- | ---: | ---: | ---: | ---: |
| Exact whole title | 300q pilot | 8.9% | 2.1% | 4.18x | 1.6e-271 |
| Exact whole title | 1000q | 6.1% | 1.5% | 4.02x | < 1e-300 |
| Partial title token | 300q pilot | 17.9% | 11.1% | 1.61x | 7.7e-107 |
| Partial title token | 1000q | 14.4% | 8.2% | 1.77x | < 1e-300 |

Exact match 更保守：

- 要求完整 entity title 出现在下一步 query；
- 少抓一些真实传播；
- 但噪声低。

Partial match 更宽：

- 任意非 stopword token 命中即可；
- 更容易抓到 paraphrase；
- 也会把 lake、county 这类常见 token 算进去；
- 因此 low OER rate 上升，ratio 被压低。

### H2：传播实体是否特别集中在 bridge cell？没有成立

作者还检验了更细的假设：

> 在 discriminative entities 中，bridge documents 携带的实体是否比 Cell A documents 携带的实体更容易传播？

结果没有稳定成立：

- pilot 中 bridge 高于 Cell A：9.6% vs 7.9%；
- full sample exact match 反转：5.1% vs 6.2%；
- Cell A 只有 321 个 high OER observations，power 不足；
- partial match 又变成 bridge 11.9% vs Cell A 11.2%；
- 方向随匹配规则变化。

因此作者没有 claim H2。

这点非常重要，因为它防止了过度解释：

- OER 能预测 entity propagation；
- bridge cell 平均实体传播率并不突出；
- bridge documents entity-rich，大量 low OER entities 会稀释平均值；
- 有效切分应按 OER，而不是按 quadrant cell 直接平均。

## Figure / Table 证据逐项解读

### Table 1：四象限定义

Table 1 的作用不是给结果，而是固定 interpretation：

| Cell | SRU | CTU | 作者命名 | 论证意义 |
| --- | --- | --- | --- | --- |
| A | 高 | 高 | Expected useful | 静态和因果一致 |
| B | 高 | 低 | Redundant evidence | 静态高估 |
| C | 低 | 高 | Bridge evidence | 静态低估，论文主角 |
| D | 低 | 低 | Genuinely useless | 两者一致认为无用 |

它让后续 35.72% 不是一个模糊标签，而是由两个可复现阈值定义：

- `Delta SRU > 0`
- `CTU > 1.400`

### Table 2：描述统计揭示 SRU 轴弱点

Table 2 最关键的不是 CTU 均值，而是 SRU 的动态范围：

- `Delta SRU` mean = 0.0048；
- median = 0；
- with-doc F1 = 0.0170；
- without-doc F1 = 0.0122。

这说明静态 reader 轴几乎只能区分极少数直接答案文档。

对多跳 Agent 来说，这正是问题所在：

- 单文档不一定回答最终问题；
- 但可以承载中间实体；
- 静态 reader F1 会把这类中间文档压到低分。

### Table 3：bridge cell 大，但不能双重计数

Table 3 给出 reader quadrant：

- bridge cell：35.72%；
- redundant：2.18%；
- expected useful：1.12%；
- genuinely useless：60.98%。

直觉上，这张表很震撼。但作者在 threat section 做了必要降温：

```text
Expected bridge under independence
  = (1 - 0.0330) * 0.3685
  = 35.63%

Observed bridge = 35.72%
```

也就是说：

- 35.72% 几乎就是“SRU 与 CTU 独立 + 边际分布”的数学后果；
- 不能把“rho 近零”和“bridge 35.72%”当两个完全独立证据；
- 真正要守住的是独立性本身，以及 proxy quadrant 的 robustness。

### Table 4：rho 近零是主结果

Table 4 的意义是排除“静态 utility 只是有点弱，但仍有排序信号”的解释。

如果 SRU 能预测 CTU：

- rho 应该显著为正；
- 高 SRU 文档应更容易高 CTU；
- ranker 优化 reader utility 至少方向正确。

实际结果：

- all records rho = -0.0257；
- 分 turn 后仍接近 0；
- 最大绝对值也只有 0.0301。

因此作者的结论不是“需要更好的阈值”，而是“当前静态 label 与 Agent 目标错位”。

### Table 5：proxy quadrant 是最强 robustness check

Table 5 用 BM25 + cross encoder 替代 reader。

它支撑两个判断：

1. Reader 太弱不是唯一解释；
2. 部署中常见的 retrieval scores 也不能代表 Agent 轨迹价值。

不过它也留下一个硬边界：

- 只保留 BM25 和 CE 同向的 9,600 records；
- 舍弃 13,722 records；
- 舍弃的正是 static signals 之间冲突的区域。

所以这张表适合被读成：

> 即便在静态检索器自己更一致的区域，静态高低仍不能很好预测 CTU。

而不应读成：

> 所有候选文档的 proxy 结论都完全一样。

### Table 6 / Table 7：机制成立，但 localization 没成立

Table 6 证明：

- OER high entities 更常被 Agent 带进下一步 query；
- exact criterion 下 ratio = 4.02x；
- 样本从 300q 扩到 1000q 后 ratio 稳定。

Table 7 则提醒：

- bridge cell 的平均 propagation rate 不突出；
- Cell C exact rate = 0.032，反而低于 A/B/D 的某些值；
- 因为 bridge docs entity-rich，低 OER 实体很多；
- 如果直接按 cell 平均，会稀释真正有用的 discriminative entities。

这给后续研究一个清晰方向：

- 不要只训练“识别 bridge documents”；
- 更细的目标可能是“识别在当前候选集里具有 OER-like discriminative power 的实体或关系”。

## 相关工作中的位置

### 与传统 RAG / IR 的关系

论文把自己放在以下谱系里：

- BM25、DPR、cross encoder reranking：优化 query-document relevance；
- RAG：把 top-ranked passages 交给 generator；
- nDCG、MAP、MRR：评价排序是否把相关文档排到前面；
- reader utility：评价文档是否提升答案。

它不是否定这些指标在 reader 场景里的价值，而是指出：

- Agent 的使用单位是 trajectory；
- 文档价值可以通过下一步 query 间接实现；
- 静态 query-document pair label 缺失时间维度。

### 与 ReAct / multi-hop QA 的关系

ReAct 和 interleaving retrieval 把检索从一次性动作变成循环：

```mermaid
flowchart TD
  Q[原始问题] --> T1[Thought: 当前缺什么]
  T1 --> S1[Search q_t]
  S1 --> D1[Read D_t]
  D1 --> E{证据够吗}
  E -- 否 --> T2[生成 q_{t+1}]
  T2 --> S2[Search next]
  E -- 是 --> A[Answer]
```

Bridge evidence 发生在 `D_t -> q_{t+1}` 之间。

这让 Agent retrieval 的评价对象从“文档是否回答 Q”变成：

- 文档是否改变 query；
- query 是否提高 gold evidence retrieval；
- 最终答案是否变好；
- 搜索轮数是否下降。

### 与实体相关性工作的关系

作者直接复用了 Ghosh and Chatterjee 2026 的 OER 思路：

- Conceptual Entity Relevance：实体在概念上是否与 query 有关；
- Observable Entity Relevance：实体是否在候选集中可观测地区分 relevant 和 non-relevant documents。

本文贡献是把 OER 从静态 reranking 推到 Agent 行为：

- OER 不是只预测文档排序；
- 它还预测 Agent 下一步 query 中哪些实体会被携带；
- 因而可能成为 cheap proxy，近似昂贵 CTU。

## 证据边界与局限

### CTU 不是文档固有属性

作者明确写出：

```text
CTU(D_t, A, t)
```

这意味着 CTU 取决于：

- 文档集合 `D_t`；
- Agent `A`；
- 当前 step `t`；
- thought + context window；
- prompt；
- retrieval stack；
- decoding behavior。

同一篇文档换一个模型、prompt 或上下文，CTU 可能变。

这对实践很关键：

- 不能把 CTU 数据集当成 universal relevance labels；
- 更合理的是训练或估计与某类 Agent/runtime 对齐的 trajectory utility proxy。

### Turn-count breakdown 不能解释为难度效应

Table 3/5 里 bridge cell 随 2/3/4 turns 上升，看起来像“问题越难越依赖 bridge evidence”。

作者撤回了这个解读。

原因：

- 分组变量是 counterfactual trajectory 的 turn count；
- `Delta_effort = turns_cf - turns_base`；
- 这个变量本身进入 CTU；
- 固定 counterfactual turns 会机械改变 `Delta_effort` 范围；
- 这种 confound 足以解释上升趋势。

这是论文写得比较严谨的地方：

- 它没有把漂亮趋势当故事；
- 而是说明 aggregate independence、bridge cell 和 propagation experiment 不依赖这个 breakdown。

### SRU 轴偏斜削弱 headline percentage

SRU 轴的问题需要单独强调：

- 只有 3.30% records 的 `Delta SRU > 0`；
- 静态 reader 对多跳单文档任务太难；
- 所以大量文档被压到 SRU low；
- bridge cell 自然会变大。

因此，严谨解读应是：

1. SRU 与 CTU 近似独立；
2. 在这种边际分布下，bridge cell 大；
3. proxy quadrant 说明问题不只来自 weak reader；
4. 但 35.72% 本身不是一个可以单独宣传的第二结论。

### Counterfactual replay 昂贵

CTU 的价值来自 replay，但成本也来自 replay。

每个问题要：

- 跑 base trajectory；
- 对每个 search step；
- 对每个 shown document；
- 删除文档并重放后续轨迹；
- 再计算 answer、next-query、effort deltas。

这适合做 measurement paper，不适合在线训练或实时 ranking。

论文结尾指出的下一步很自然：

- 找一个不用 replay 的 proxy；
- OER 是候选之一；
- 因为它从 candidate set statistics 计算；
- 且在实验中预测下一步 query propagation。

## 对 Agent 系统研究的延伸思考

### 1. Agentic retrieval 的 label 可能要从 document relevance 变成 transition relevance

传统 ranker 学的是：

```text
(q_t, d) -> relevance
```

这篇论文暗示 Agent ranker 更该学：

```text
(state_t, q_t, d) -> utility for transition q_{t+1}
```

其中 `state_t` 至少包含：

- 已读证据；
- 当前 thought 或可观测 plan；
- 未解决的 subgoal；
- 当前候选集中的实体分布；
- 后续搜索预算。

这会改变数据标注方式：

| 传统 label | Agent label |
| --- | --- |
| 文档是否回答问题 | 文档是否改善下一步搜索 |
| 单轮 query-document 相关性 | 状态依赖的 trajectory utility |
| 人工或 reader 打分 | counterfactual / OER / transition outcome |

### 2. 检索器应该暴露“桥接线索”，而不只是 top answer passages

如果 bridge documents 常见，那么 Agent 检索器不应只追求直接 answer containment。

它可能需要返回结构化线索：

- candidate entity；
- entity 的 OER-like score；
- 该 entity 区分哪些 relevant candidates；
- 推荐的下一步 query expansion；
- 该线索与当前 subgoal 的关系。

一个 Agent-friendly retrieval API 可以长这样：

```text
retrieve_for_agent(state, query) -> [
  {
    document,
    static_score,
    answer_containment,
    bridge_entities: [
      { entity, oer_score, support_docs, suggested_next_query }
    ],
    uncertainty
  }
]
```

这样 Agent 不只看到文本，还看到“这篇文档可能帮你往哪走”。

### 3. Evaluation harness 应记录中间检索因果链

许多 Agent benchmark 只看 final success。

这篇论文说明，至少在搜索型 Agent 中，还应记录：

- 每步 query；
- 每步 top candidates；
- 实际展示的 documents；
- 去重后的 shown_doc_ids；
- 下一步 query 的 gold evidence nDCG；
- 删除/替换证据后的 trajectory delta。

否则我们很难区分三类情况：

| 现象 | final answer 可能一样 | 但系统含义不同 |
| --- | --- | --- |
| Agent 找到直接答案 | 成功 | 静态 retrieval 已足够 |
| Agent 靠 bridge evidence 改道 | 成功 | 需要 trajectory-aware retrieval |
| Agent 参数记忆答对 | 成功 | 检索贡献可能为零 |

### 4. 安全和可靠性也会遇到 bridge evidence

虽然论文是 retrieval measurement，不是安全论文，但机制对 AI safety 有直接启发。

在工具型 Agent 中，某段输入可能：

- 不直接触发危险动作；
- 但引入一个实体、命令、文件名、URL 或权限暗示；
- 使下一步 tool call 改道；
- 最终造成错误操作。

这与 prompt injection 的一些延迟效应很像：

- 单步扫描看不出危险；
- 多步轨迹里它改变了后续 action distribution；
- 因果价值或风险只在 transition 上显现。

因此，Agent 安全评测也可能需要 CTU-like 或 OER-like 思路：

```text
risk_utility(input_t)
  = change(final_outcome)
  + change(next_tool_call)
  + change(recovery_cost)
```

不是只问“这段文本是否包含危险内容”，而要问“这段文本是否改变了 Agent 后续行动路径”。

## 结论

### 最值得带走的判断

- 这篇论文的核心不是“35.72% bridge documents”这个 headline number，而是 **SRU 与 CTU 近似独立**。
- 它把 Agentic retrieval 的评价对象从静态 document relevance 转向 trajectory causal utility。
- Bridge evidence 的机制不是神秘推理，而是实体传播：高 OER entity 更容易进入下一步 query，exact match 下 ratio = 4.02x。
- 作者主动处理了几处可能夸大的结果：SRU 轴偏斜、turn-count confound、H2 不复现、proxy subset 丢弃 58.84% records。
- 因此，这篇论文最适合被看作 measurement + problem definition：它证明现有静态 label 与 Agent 目标错位，但还没有给出可部署的新 ranker。

### 后续最该追问什么？

1. **CTU proxy 能否在线估计？**
   - OER 是一个候选，但还需要验证它是否能在不同模型、不同 corpus、不同任务中稳定预测 trajectory utility。

2. **状态依赖 ranker 如何训练？**
   - 输入不应只有 `(query, document)`，还应包含 context window、当前 subgoal、已读证据和剩余预算。

3. **不同 Agent backbone 是否共享 bridge evidence？**
   - Qwen2.5-7B-Instruct 的 CTU 不一定迁移到更大模型或不同 prompt；需要跨模型 CTU agreement。

4. **能否把 bridge evidence 用于主动探索？**
   - 如果某文档携带高 OER entity，Agent 是否应主动生成 exploratory query，而不是等待 LLM 自己拾取实体？

5. **安全评测能否借鉴 transition utility？**
   - 对多步工具 Agent，风险输入的价值或危害也可能只体现在下一步 tool call，而不是当前文本表面。

这篇论文给出的最有用结论是：Agent 检索不是“把最相关的文档放前面”这么简单。对于会搜索、会计划、会改写 query 的系统，真正有价值的证据常常是能改变下一步状态转移的证据。
