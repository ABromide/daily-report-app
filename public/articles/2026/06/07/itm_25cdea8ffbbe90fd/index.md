# Harness-1：搜索 Agent 为什么需要外置状态

> 研究者精读 · Harness-1 的重点不是“20B 模型会搜索”，而是把候选池、精选证据集、重要性标签、证据图、验证记录、去重压缩和预算渲染从模型上下文里拿出来，变成 RL 可以操作的环境状态。

| 字段 | 内容 |
|---|---|
| 论文 | [Harness-1: Reinforcement Learning for Search Agents with State-Externalizing Harnesses](https://arxiv.org/abs/2606.02373) |
| 作者 | Pengcheng Jiang, Zhiyi Shi, Kelly Hong, Xueqiang Xu, Jiashuo Sun, Jimeng Sun, Hammad Bashir, Jiawei Han |
| 代码 / 模型 | [GitHub](https://github.com/pat-jj/harness-1)、[Hugging Face](https://huggingface.co/pat-jj/harness-1) |
| 基座 | openai/gpt-oss-20b search subagent |
| 训练 | 899 条 SFT teacher trajectories + SEC split 上约 82K on-policy CISPO rollouts |
| 评测 | 8 个 retrieval benchmark，覆盖 web、finance、patents、multi-hop QA |

## 一句话结论

Harness-1 认为长程搜索 Agent 的难点不是“会不会调用搜索工具”，而是“搜索过程中产生的状态由谁维护”。如果模型必须在越来越长的 transcript 里记住候选、证据、重复文档、验证结果、重要性、预算和失败路径，RL 会把大量梯度浪费在机械 bookkeeping 上。

Harness-1 的做法是 cognitive offloading：

- 语义决策留给 policy：搜什么、读什么、保留什么、验证什么、何时停止。
- 机械状态交给 harness：候选池、curated set、importance、document store、evidence graph、verification cache、dedup/compression、budget rendering。

主结果：

- 8 个 benchmark 平均 curated recall 为 0.730。
- 相比下一强 open search subagent 高 +11.4 points。
- held-out transfer 增益比 source-family benchmark 更大。
- BrowseComp+ 消融显示，去掉全部 Harness-1 机制后 recall 从 0.584 降到 0.513。
- 没有 diversity reward 时，policy 会塌缩成 search-heavy 策略，curated recall 约停在 0.53。

## 研究问题

搜索 Agent 常被训练成 append-only transcript policy：

```text
query + growing transcript -> next search / read / answer action
```

这种形式简单，但把两类能力混在一起：

1. **语义搜索能力**：该查哪个子问题、读哪篇文档、验证哪个 claim、保留哪些证据。
2. **机械状态管理**：哪些候选已经见过、哪些是重复、哪些证据已精选、哪些 claim 已验证、上下文预算还剩多少。

Harness-1 的问题是：这些机械状态能否由环境可靠维护，让模型只学习如何编辑和使用状态？

## Harness 维护了什么状态

| 状态 | 含义 | 为什么不该全塞进模型上下文 |
|---|---|---|
| `P_t` candidate pool | 压缩、去重后的候选文档 | transcript 越长越难恢复候选全貌 |
| `C_t` curated set | 准备交付的最终证据集 | 模型容易见过证据但忘记提交 |
| `I_t` importance tags | very_high / high / fair / low | 让证据排序和容量管理显式化 |
| `D_t` document store | 完整全文与 metadata | 全文不应每轮都进入 prompt |
| `G_t` evidence graph | 实体、年份、日期等共现线索 | 暴露 bridge docs 和 singleton entities |
| `V_t` verification cache | claim -> docs 的支持判断 | 避免验证结果只停留在一次性文字里 |
| `H_t, B_t` history / budget | 搜索历史、工具统计、预算标记 | 让 renderer 控制上下文，而不是模型自己猜 |

## 动作空间

Harness-1 的动作不是单一搜索，而是一组状态编辑动作。

| 类别 | 动作 | 作用 |
|---|---|---|
| Search | `fan_out_search`, `search_corpus`, `grep_corpus` | 发现候选 |
| Read / review | `read_document`, `review_docs` | 读新文档或回看已见文档 |
| Curate | `curate(add/remove/importance)` | 编辑最终证据集 |
| Verify | `verify(doc_ids, claim)` | 检查文档是否支持 claim |
| Stop | `end_search(reasoning)` | 提交 curated evidence set |

这使得 policy 学的是“如何使用一个搜索工作台”，不是“如何在一长串文本里自己维持工作台”。

## 三个训练兼容性要求

### 1. 非空初始状态

如果 rollout 都从空 curated set 开始，很多 hard query 会得到相同的近零 reward，组内 advantage 没有差异。

Harness-1 的 auto-seeding 会在第一次成功搜索后把 top 8 reranked results 自动加入 curated set，初始 importance 为 `fair`。模型随后学习 promote、remove、verify，而不是从空集合硬起步。

### 2. 紧凑 derived-state rendering

工作记忆必须短而有用。Harness-1 用 importance-tagged curated set、evidence graph summaries、compressed snippets、verification records 和 budget marker，让模型直接看到当前搜索状态。

### 3. 保持工具多样性

丰富 harness 不会自动被用起来。没有 reward 和 prompt nudges，policy 会走最容易的路径：重复搜索。

论文的训练动态显示：

- 关闭 diversity reward 时，工具多样性从约 6 降到约 3.5；
- policy 倾向 fan_out_search / search_corpus；
- curated recall 约停在 0.53；
- 加回 diversity reward 后，工具使用更均衡，final curated recall 约到 0.60。

## 奖励设计

Harness-1 用 terminal reward，而不是每步 dense reward。它同时看：

- final curated set 的 recall / precision 组合；
- trajectory 中是否见过 gold evidence；
- final set 是否保留 answer evidence；
- 是否见过答案证据却没有提交；
- 工具多样性；
- turn penalty；
- empty-set penalty。

简化理解：

```text
Reward =
  final curated evidence quality
  + trajectory discovery signal
  + final answer evidence signal
  + tool diversity bonus
  - missed evidence penalty
  - turn penalty
```

这个 reward 的关键是把“发现证据”和“交付证据”分开。否则模型可能不断搜索，trajectory recall 很高，但 final curated set 很差。

## 训练数据

### SFT

- Teacher：GPT-5.4 live agent。
- 保留条件：格式有效、至少返回一个文档、final output recall >= 0.10。
- 最终 899 条 teacher trajectories。
- 作用：教会模型工具语法、search -> curate rhythm、importance tagging、verification 用法。

### RL

- 从 SFT checkpoint step 550 初始化。
- 训练集：SEC training split 的 3,453 queries。
- 每步 128 queries，每 query 8 rollouts。
- 总 80 steps，约 82K rollouts。
- 算法：on-policy CISPO，clip range `[0,5]`。
- episode cap：40 turns。
- generation budget：2,048 tokens。
- constant-reward groups 丢弃。
- KL anchor：0。

## 主结果

论文评测 8 个 retrieval benchmark，包括 BrowseComp+、Web synthetic、SEC filings、USPTO office actions、LongSealQA、Seal0QA、FRAMES、HotpotQA。

核心指标：

| 指标 | 含义 |
|---|---|
| Curated recall | 最终 curated set 覆盖 relevant docs |
| Trajectory recall | episode 中任意时刻见过 relevant docs |
| Final-answer recall | 最终 set 覆盖 answer docs |
| Precision / F1 | 辅助看证据集质量 |

主结论：

- Harness-1 平均 curated recall 0.730。
- 平均 trajectory recall 0.756。
- 相比下一强 open search subagent 平均 curated recall 高 +11.4 points。
- held-out benchmarks 平均增益约 +17.0 points，高于 source-family 的 +7.9 points。

这个 held-out 增益很重要。它支持作者的解释：模型学到的不是 SEC 或 BrowseComp+ 的领域技巧，而是一套跨任务可迁移的状态操作能力。

## 消融

BrowseComp+ 100-query inference-time ablation 最能解释 harness 组件。

| 变体 | Recall | FA Recall | 解读 |
|---|---:|---:|---|
| Full Harness-1 | 0.584 | 0.667 | 完整机制 |
| 去掉 importance tags | 0.560 | 0.614 | 证据优先级影响最终答案证据 |
| 去掉 Sentence-BM25 compression | 0.585 | 0.620 | Recall 近似不变，但 answer evidence 下降 |
| 去掉 auto-seed | 0.582 | 0.624 | 非空初始 curated set 对答案证据有帮助 |
| 隐藏 evidence graph | 0.569 | 0.631 | 图线索帮助跨文档连接 |
| verify 不可用 | 0.566 | 0.641 | 验证影响最终选择 |
| review docs 不可用 | 0.598 | 0.641 | Recall nominal 上升，但质量指标下降 |
| 去掉 content fingerprint dedup | 0.611 | 0.678 | 近重复 qrels 让去重消融出现反直觉上升 |
| 关闭全部 Harness-1 机制 | 0.513 | 0.624 | harness 与训练是互补关系 |

最有意思的是 content dedup 反例。去掉 dedup 反而 nominal 上升，说明 benchmark qrels 里可能有 near-duplicate gold docs。这个结果不是说 dedup 有害，而是提醒读者：检索 recall 会被重复文档计数影响。

## 图表怎么读

### Figure 1 / Table 2：主结果

支撑 Harness-1 是强 open retrieval subagent。但要注意：它输出 curated evidence set，不是端到端最终答案。

### Figure 2：方法图

这张图要看模型和 harness 的边界。candidate pool、curated set、verification cache、evidence graph、full document store 都在环境侧；模型只看 renderer 给出的可行动工作记忆。

### Component ablation table

证明 harness 不是装饰层。单个组件的提升有大小差异，但全部关掉会明显降级。

### Training dynamics

这是理解 RL 的关键图。没有 diversity reward，policy 会走向 search-only collapse；有 diversity reward，模型才更愿意 curate、verify、review。

## 和其他工作的关系

### 相对 Search-R1 / WebSeer

这些工作更多关注如何通过 RL 学会多轮搜索。Harness-1 关注的是搜索状态的 runtime 抽象：哪些状态应该由环境维护，policy 如何在状态上行动。

### 相对 Context-1

Context-1 已经强调 search subagent 和 generator 解耦。Harness-1 更进一步，把 subagent 内部的候选、证据、验证、重要性也显式状态化，并用 RL 学这些状态编辑。

### 相对传统 retriever-reranker

Harness-1 不是单次 top-k retrieval 或 reranking。它做的是 episode-level evidence construction：发现、阅读、验证、精选、剪裁、排序。

## 可复现性

公开仓库提供：

- harness；
- tool environment；
- training / inference 代码；
- BrowseComp+ evaluation 路径；
- model export；
- tests；
- Hugging Face 权重。

但完整复现不轻：

- 需要 Linux、Python 3.11+、uv、CUDA；
- 需要支持 GPT-OSS 的 vLLM；
- 需要 BrowseComp+ query/qrel/answer 文件；
- 需要 Chroma collection，且 document IDs 与 qrels 对齐；
- 需要 OpenAI credentials；
- 可选 Baseten reranker credentials；
- 21B BF16 checkpoint 对硬件有要求。

## 局限

1. Evidence graph 是 regex-based，不是可靠实体链接或关系抽取。
2. Auto-seeding 依赖早期 reranked results，可能把错误候选带入初始状态。
3. Verification cache 的质量取决于 verifier，错误验证会被状态稳定化。
4. Curated cap `M=30` 是否适合所有任务没有充分探索。
5. Reward 权重手工设定，不同任务对 precision / recall / answer evidence 的权重可能不同。
6. 评测覆盖多类 benchmark，但不等于所有开放网页或专业检索场景。

## 对 Agent 系统的启发

Harness-1 最值得借鉴的是状态边界设计。长程 Agent 不应该把所有东西放进 transcript，让模型在自然语言里自己记账。

可以迁移到其他 Agent：

- Web Agent：DOM state、form state、tab history、blocked actions、constraint progress 外置；
- Coding Agent：file diff、test status、command history、risk flags、scope boundaries 外置；
- Research Agent：source ledger、claim verification、citation graph、open questions 外置；
- Data Agent：query history、schema facts、validated assumptions、result cache 外置。

真正的设计问题是：模型应该做语义判断，runtime 应该维护可恢复状态。

## 还要继续追问

1. 状态接口能否标准化成跨 search / web / code agent 的 API。
2. Reward 权重能否按任务自适应，而不是固定手工调。
3. Evidence graph 能否从 regex 共现升级为可校准实体链接和多跳关系。
4. Verification cache 如何处理 verifier uncertainty。
5. Auto-seeding 错误时，policy 是否能稳定清理错误初始证据。
6. 这个 state-externalizing 思路在非 evidence retrieval 任务上是否同样有效。

## 阅读定位

Harness-1 最重要的观点是：Agent RL 不只是在训练模型，也是在训练模型如何使用一个 runtime。harness 不是辅助脚手架，而是学习问题的一部分。对长程 Agent 产品来说，这比单个检索分数更有参考价值。

打开原文：[arXiv:2606.02373](https://arxiv.org/abs/2606.02373)
