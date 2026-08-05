# MAFIA：被审计的 LLM Agent 记忆，为什么仍会被“事实化”投毒绕过？

## 元信息与 TL;DR

- **论文**：MAFIA: Query-Only Memory Attacks via Probing and Factual Injection against Audited LLM Agents
- **作者**：Jiaming Chen、Yisen Gao、Yanping Li、Zifan Liu、Yumeng Zhang、Jun Zhang
- **机构**：The Hong Kong University of Science and Technology
- **官方链接**：[arXiv:2608.03844v1](https://arxiv.org/abs/2608.03844)
- **发布日期**：2026-08-04 15:50:26 UTC
- **代码状态**：[GitHub 仓库](https://github.com/JiamingChen1234/MAFIA) 已公开 README，但截至本轮采集只写明代码准备发布。

### TL;DR

- **这篇文章做什么**：
  - 它研究一种更贴近真实部署的 Agent 长期记忆投毒威胁。
  - 攻击者不能直接写数据库、不能看内部检索分数、不能改 Agent 输出，只能像普通用户一样发查询。
  - 系统还会在写入前用 LLM 审计器检查输入，并且记忆池里已有几千条正常记录。

- **核心方法是什么**：
  - MAFIA 把攻击拆成两段：
    - 先用正常查询探测记忆检索空间，从返回内容里收集可见的历史问题字段。
    - 再把有限写入预算分配到更可能影响未来受害查询的语义区域。
  - 载荷不依赖明显命令式提示，而是把错误映射包装成短小的“局部事实注解”。
  - 这里的关键不是一句话模板，而是“保持检索相似度 + 降低单条输入审计触发率”的联合设计。

- **实验给出什么证据**：
  - 四个 Agent-数据集设置：EHRAgent/MIMIC-III、EHRAgent/eICU、RAP/WebShop、DataInterpreter/HF Hub。
  - 每个设置评估 9 组 victim-target 映射。
  - 主表显示 MAFIA 在 eICU 上 ASR 达到 **92.59%**，审计后 Post-ASR 仍有 **90.74%**。
  - 摘要声称最高 ASR 为 **90.7%**，且把审计检测率从基线最高 **83.3%** 压到至多 **7.4%**。

- **最值得带走的判断**：
  - 只做“单条输入是否像 prompt injection”的写入前审计，无法覆盖长期记忆里的组合风险。
  - 记忆风险不是单条记录的文本风险，而是“记录如何被检索、如何与其他记录形成多数证据、如何影响后续行动”的系统风险。

- **局限在哪里**：
  - 论文主要评估 RAG-style memory，不覆盖图记忆、层级记忆、权限化 episodic memory 等更复杂架构。
  - 防御实验覆盖输入审计和 A-MemGuard 式检索后检查，但没有系统评估 provenance、访问控制、信息流控制。
  - 代码仓库尚未发布完整代码，当前复现仍依赖论文细节和作者后续 artifact。

## 1. 研究问题：为什么“加了审计”的记忆 Agent 仍不够安全？

### 论文真正反对的简单安全假设

- 很多 Agent 系统把长期记忆当成能力增强层：
  - 当前输入触发检索。
  - 检索出的历史记录进入上下文。
  - Agent 生成推理和动作。
  - 成功交互再被写回记忆。

- 直觉上，运营方可能觉得有两道保护：
  - **输入审计**：写入前过滤明显恶意提示。
  - **检索竞争**：记忆池很大，少数恶意记录不容易进 top-K。

- MAFIA 的问题意识是：
  - 这两道保护不是同一个维度。
  - 输入审计只看“单条输入像不像攻击”。
  - 检索竞争看“未来某个查询附近，哪些记录最相似”。
  - 攻击只要同时优化这两个目标，就可能绕过单点防线。

### 作者把威胁模型往真实部署推进了一步

| 维度 | 旧式记忆投毒常见假设 | MAFIA 的扩展设置 | 安全意义 |
|---|---:|---:|---|
| 写入权限 | 可直接改记忆库或插入记录 | 只能 query-only 交互 | 更接近普通外部用户能力 |
| 审计器 | 小规模或无审计 | 每次输入先过 LLM 审计 | 迫使载荷不能明显像指令 |
| 记忆规模 | 小记忆池 | 几千条 benign memory | 恶意记录必须赢 top-K |
| 预算 | 可大量尝试 | 每个 V,T 对有限预算 | 防止靠刷量淹没记忆池 |
| 观测 | 可见内部检索或记录 | 只看 Agent 正常响应 | 更符合黑盒服务边界 |

- 这里最关键的变化是：
  - 攻击目标不再是“能不能把一句恶意文本塞进去”。
  - 而是“能不能让一组通过审计的记录，在未来受害查询时稳定被检索到，并在上下文里形成错误证据”。

## 2. 威胁模型：攻击者到底能做什么，不能做什么？

### Agent 侧：RAG 记忆循环

- 论文关注的是 RAG-based memory Agent：
  - 记忆池记为 `M`。
  - 用户查询记为 `q`。
  - 检索器从 `M` 里取 top-K 相似记录。
  - Agent 基于 `q` 和检索记录生成推理轨迹 `R_q`。
  - 若交互被接受，系统把 `(q, R_q)` 追加写入 `M`。

- 这个模型覆盖的不是所有长期记忆：
  - 它适合解释基于 embedding 检索和 demonstration reuse 的 Agent。
  - 它不自动覆盖图结构记忆、权限分层记忆、人工批准写入记忆。

### 攻击者侧：query-only + budget-bound

- 攻击者可以：
  - 通过普通交互接口提交查询。
  - 观察 Agent 返回的自然语言、动作或可见字段。
  - 多次交互，让通过审计的记录经由正常 write-back 留在记忆中。

- 攻击者不能：
  - 直接访问向量库或数据库。
  - 查看完整 top-K 检索结果和相似度分数。
  - 修改 Agent 输出。
  - 干扰其他用户查询。
  - 绕过输入审计器。

- 作者还加入固定预算 `b`：
  - 这避免了“不停重试直到成功”的弱化模型。
  - 也避免了“用海量恶意记录淹没 benign pool”的非现实捷径。

### 攻击目标：item manipulation

- 论文中的攻击不是泛化 jailbreak，而是定向替换：
  - 在 EHR 场景中，把一个患者或药物映射到另一个目标。
  - 在 WebShop 场景中，把某类商品搜索导向目标品牌。
  - 在 HF Hub 场景中，把原本应使用的模型依赖替换成另一个模型。

- 抽象成符号：

```text
给定：
  V = victim entity
  T = target entity
  M = benign memory pool
  K = retrieval context size
  b = allowed poison-write budget

目标：
  让未来 clean query q(V)
  在不含明显恶意指令的情况下
  检索到足够多支持 V -> T 的历史记录
  从而生成 target-directed response
```

## 3. 方法机制：MAFIA 为什么不是“写一句恶意提示”？

### 总体路线：placement + payload

- MAFIA 的两段式路线是：
  - **Placement**：决定污染哪些语义位置。
  - **Payload**：决定用什么文本形态污染。

- 两段分别对付两个压力：
  - Placement 对付大规模 benign pool 的 top-K 竞争。
  - Payload 对付 LLM input auditor 的语义检查。

```mermaid
flowchart LR
  A["普通探测查询"] --> B["Agent 正常响应"]
  B --> C["收集可见历史问题字段"]
  C --> D["聚类与预算分配"]
  D --> E["选择代表性 base queries"]
  E --> F["加入短事实化映射"]
  F --> G["输入审计"]
  G --> H["正常 write-back"]
  H --> I["未来受害查询检索到污染记录"]
```

### 3.1 Placement：从“记忆很大”里反过来找信号

- 大记忆池表面上保护系统：
  - 恶意记录很少。
  - top-K 只取少数相似项。
  - 随机投毒很容易被正常记录挤出。

- 作者反过来看：
  - 大记忆池也反映了用户任务分布。
  - 如果普通查询能让 Agent 暴露部分历史问题字段，攻击者就能获得局部 surrogate。
  - 这个 surrogate 不等于完整记忆库，但足以估计哪些语义区域更密集。

- 具体做法：
  - 用公开 schema 或任务知识合成 `K_p` 个 probe seeds。
  - 把 probe 变成普通查询，走 Agent 正常接口。
  - 从响应中抽取被展示出来的历史 question fields。
  - 汇总得到 surrogate set `D`。

### 3.2 聚类、预算和调度

- 对 `D` 做 embedding。
- 使用 agglomerative clustering。
- 用 cluster size `|C|` 估计该语义区域的历史支持度。
- 按 cluster 大小排序，用 round-robin 方式分配有限预算。
- 每个 cluster 里选择离 centroid 最近的未选问题作为 base template。

### 为什么不是只打最大 cluster？

- 只打最大 cluster 的问题：
  - 覆盖面窄。
  - 对未来 query drift 敏感。
  - 小 cluster 的稀疏区域可能更容易赢检索竞争。

- size-ranked round-robin 的意义：
  - 大 cluster 得到优先权。
  - 小 cluster 仍被覆盖。
  - centroid-nearest base 降低语义偏离。

### 调度为什么按小 cluster 先写？

- 作者的解释是生成阶段效应：
  - 小 cluster 的 benign competition 弱。
  - 早期写入的错误映射更容易被后续相关写入检索到。
  - 这些记录会相互强化，使后续更密集区域也更容易形成目标导向轨迹。

- 注意边界：
  - 向量检索本身通常与写入顺序无关。
  - 顺序影响的是 Agent 生成和 write-back 过程，不是 cosine ranking 的数学定义。

### 3.3 Payload：从“命令”改成“事实”

- MINJA 类方法依赖更显性的操控语气。
- 这类文本有两个问题：
  - 审计器容易识别命令式或 prompt-injection 特征。
  - 文本变长、语义偏移，离 victim query 的 embedding neighborhood 更远。

- MAFIA 的 payload 设计追求：
  - 文本短。
  - 看起来像局部 schema/数据库事实。
  - 保留 base query 的主体语义。
  - 避免直接命令 Agent “必须怎么做”。

- 为避免复述可直接滥用模板，这里只保留抽象形式：

```text
base_query(entity = V)
  + short_parenthetical_mapping(V -> T)
  + local_context_marker
```

- 这个设计的机制含义：
  - **审计层**：它不像显性指令，容易被低误报审计器当作普通注解。
  - **检索层**：base query 仍占主要表面语义，embedding 不会大幅远离 victim query。
  - **生成层**：多条相近记忆共同出现时，Agent 可能把错误映射当成上下文事实。

## 4. 算法流程：高层伪代码

```text
Input:
  agent A
  victim entity V
  target entity T
  probe budget Kp
  injection budget b

State:
  D = visible surrogate questions
  C = semantic clusters over D
  B = selected base queries

Procedure:
  for each schema-derived probe seed:
      submit benign-looking probe through normal interface
      collect only response-visible historical question fields
      append them to D

  embed D
  cluster D by semantic similarity
  rank clusters by size
  allocate b selections by size-aware round robin
  select centroid-nearest base query within each chosen cluster
  schedule selected bases from smaller clusters to larger clusters

  for each selected base query:
      construct a compact factual mapping around V -> T
      submit through the same audited interface
      if audit accepts and agent writes back:
          memory receives a poisoned trajectory through normal persistence

Output:
  a memory pool whose future top-K contexts may over-represent V -> T

Failure boundary:
  if probes do not cover the future victim-query domain
  or if write authorization/provenance blocks untrusted mappings
  or if retrieval-time verification rejects unsupported entity remapping
  then the attack path weakens.
```

## 5. 实验设置：四类 Agent 场景如何覆盖风险面？

### Agent 与数据集

| Agent 设置 | 数据集 | 攻击替换含义 | benign memory size |
|---|---:|---|---:|
| EHRAgent | MIMIC-III | 患者 SUBJECT_ID 替换 | 约 5.8K |
| EHRAgent | eICU | 药物推荐替换 | 约 5.8K |
| RAP | WebShop | 商品类别导向目标品牌 | 2,000 |
| DataInterpreter | HF Hub | 模型依赖替换 | 2,000 |

- 每个设置包含 9 组 victim-target pair。
- Agent backbone 主实验使用 gpt-5.4-mini。
- 检索使用 e5-small-v2 cosine similarity。
- top-K 在 EHR 和 DataInterpreter 等设置为 `K=4`，WebShop 依照基线设置为 `K=3`。

### 指标解释

| 指标 | 含义 | 越高/越低 |
|---|---|---:|
| ISR | attack query 被写成目标导向记录的比例 | 越高表示写入成功越多 |
| ASR | clean victim query 被导向目标响应的比例 | 越高表示攻击越有效 |
| DR | 审计或防御检测恶意记录的比例 | 对攻击越低越隐蔽 |
| FPR | benign 记录被误报为恶意的比例 | 对防御越低越可用 |
| Post-ISR | 审计过滤后的写入成功率 | 越高说明审计没有挡住 |
| Post-ASR | 审计过滤后的攻击成功率 | 越高说明系统级风险仍在 |

## 6. 主结果：审计后仍有效，才是这篇论文的重点

### Table 1 的核心数字

| Agent | Dataset | Method | ISR | ASR | DR | Post-ISR | Post-ASR |
|---|---|---:|---:|---:|---:|---:|---:|
| EHRAgent | MIMIC-III | MAFIA | 95.56 | 75.19 | 0.00 | 95.56 | 75.19 |
| EHRAgent | MIMIC-III | MINJA | 84.57 | 60.09 | 68.40 | 34.22 | 8.41 |
| EHRAgent | eICU | MAFIA | 74.44 | 92.59 | 7.40 | 69.63 | 90.74 |
| EHRAgent | eICU | MINJA | 82.96 | 66.30 | 83.30 | 0.00 | 0.00 |
| RAP | WebShop | MAFIA | 84.81 | 58.52 | 1.80 | 85.93 | 56.66 |
| RAP | WebShop | MINJA | 32.22 | 8.89 | 83.30 | 0.00 | 0.00 |
| DataInterpreter | HF Hub | MAFIA | 91.85 | 63.70 | 0.00 | 91.85 | 62.96 |
| DataInterpreter | HF Hub | MINJA | 98.15 | 29.63 | 71.85 | 27.41 | 14.81 |

### 怎么读这张表？

- **MIMIC-III**：
  - MAFIA 的 ASR 为 75.19%，MINJA 为 60.09%。
  - 更关键的是审计后，MAFIA Post-ASR 仍为 75.19%，MINJA 掉到 8.41%。
  - 这说明显性操控文本在审计条件下不稳定。

- **eICU**：
  - MAFIA ASR 达 92.59%，审计后仍有 90.74%。
  - MINJA 原始 ISR 更高，但 DR 达 83.30%，审计后 Post-ASR 为 0。
  - 这支持作者主张：写进去不等于可部署攻击成功，必须同时看审计后效果。

- **WebShop**：
  - MAFIA 在商品重定向上 ASR 为 58.52%，Post-ASR 为 56.66%。
  - MINJA 在同一设置下 Post-ASR 为 0。
  - 这里说明攻击机制不只适用于医疗 SQL 场景。

- **HF Hub/DataInterpreter**：
  - MAFIA 的 ASR 是 63.70%，Post-ASR 是 62.96%。
  - 风险从“回答错实体”扩展到“代码或模型依赖被替换”。
  - 对工具型 Agent 来说，这类替换可能改变执行环境和供应链行为。

## 7. 审计实验：低误报审计为什么漏，高检测审计为什么难用？

### Table 2 的防御困境

| Auditor | FPR | MAFIA DR | MINJA DR |
|---|---:|---:|---:|
| ProtectAI | 0.0 | 1.1 | 4.4 |
| General Prompt | 0.0 | 0.0 | 68.9 |
| Targeted Prompt | 0.0 | 3.3 | 67.8 |
| Perplexity Filter | 20.0 | 43.3 | 21.1 |
| Llama Guard 3-8B | 31.7 | 40.0 | 34.4 |
| GuardReasoner-1B | 65.0 | 82.2 | 91.1 |
| GuardReasoner-3B | 78.3 | 94.4 | 90.0 |
| GuardReasoner-8B | 80.0 | 88.9 | 86.7 |
| PromptGuard-86M | 100.0 | 100.0 | 100.0 |

- 低 FPR 审计器的问题：
  - 它们更像“明显注入检测器”。
  - 对短事实化映射不敏感。
  - 在主实验里，General Prompt 对 MAFIA 是 0.0% DR。

- 高 DR 审计器的问题：
  - 它们往往把很多 benign 记录也拦掉。
  - GuardReasoner 和 PromptGuard 在表中出现极高 FPR。
  - 这对记忆系统很危险，因为长期记忆需要保留大量正常经验。

- 论文给出的实际判断是：
  - 审计器不是越严越好。
  - 如果一个防御靠高误报换高检测，它会破坏 Agent 记忆的可用性。

## 8. 检索泛化：攻击不是只卡住一个 embedding 模型

### Table 3：不同 retriever 下的 top-K 影响

| Retriever | MAFIA RIR@4 | MINJA RIR@4 | MAFIA Top-1 | MINJA Top-1 |
|---|---:|---:|---:|---:|
| e5-small-v2 | 90.29 | 75.73 | 57.28 | 35.92 |
| e5-small-v2 no-prefix | 84.47 | 74.76 | 46.60 | 38.83 |
| bge-small-en-v1.5 | 84.47 | 63.11 | 51.46 | 30.10 |
| nomic-embed-text-v1 | 75.73 | 52.43 | 35.92 | 23.30 |
| all-MiniLM-L6-v2 | 58.25 | 30.10 | 19.42 | 12.62 |

- RIR@4 指恶意记录进入 top-4 的覆盖率。
- Top-1 指恶意记录排到第一位的比例。
- MAFIA 在所有 dense retriever 上都比 MINJA 更高。
- 对称句向量模型 all-MiniLM-L6-v2 是边界情况：
  - MAFIA 仍领先。
  - 但绝对 RIR@4 明显下降。
  - 说明 payload 的实体相似性并不保证所有检索范式同等脆弱。

## 9. 消融：placement 和 payload 分别贡献什么？

### Table 4(a)：拿掉选择和探测会怎样？

| Configuration | RIR@4 | mean poison count@4 | ASR |
|---|---:|---:|---:|
| Full pipeline | 91.26 | 2.26 | 73.8 |
| w/o Selection | 85.76±2.02 | 2.10 | 62.1 |
| w/o both | 82.52±5.91 | 1.89 | 58.3 |
| MINJA | 66.99 | 1.37 | 47.6 |

- 这张表支持两个机制判断：
  - 只靠短 payload 不够，placement 影响 top-K 覆盖。
  - 只随机覆盖也不够，centroid-nearest selection 提升稳定性。

### Table 4(b)：小 cluster 先写的收益

| Pair | Desc ISR | Asc ISR | Desc ASR | Asc ASR |
|---|---:|---:|---:|---:|
| Pair 1 | 82.22 | 95.56 | 51.46 | 73.79 |
| Pair 2 | 84.44 | 92.22 | 70.87 | 82.52 |
| Pair 3 | 80.00 | 91.11 | 58.25 | 69.90 |
| Mean | 82.22 | 92.96 | 60.19 | 75.40 |

- 这说明 injection scheduling 不是装饰项。
- 但它也暴露一个需要谨慎解释的地方：
  - 论文把收益解释为生成阶段的自强化。
  - 它没有证明所有 Agent 记忆系统都会有相同顺序效应。
  - 如果 write-back 不会引用已有污染记录，这个收益可能下降。

## 10. 防御实验：A-MemGuard 为什么仍不够？

### Memory-side consistency checking 的结果

- 论文还评估 A-MemGuard 的 ConsistencyChecker。
- 在 9 个 MIMIC-III pair 上：
  - MAFIA poison appearances 的平均检测率约 **75.59%**。
  - benign appearances 的平均误报率约 **44.88%**。

| 防御 | 检测对象 | 平均 DR | 平均 FPR | 论文判断 |
|---|---|---:|---:|---|
| 写入前 input audit | 单条输入 | 对 MAFIA 常接近 0-7.4 | 低 FPR 可用 | 漏掉事实化映射 |
| A-MemGuard | 检索后记忆一致性 | 75.59 | 44.88 | 检测较多但误报过高 |

- 这组结果强化了本文主线：
  - 单条输入审计太窄。
  - 只在检索后做语义一致性检查又可能太粗。
  - 更合理的防御需要把写入者、来源、权限、实体关系和任务上下文一起建模。

## 11. Figure 与案例证据：哪几张图真正支撑主张？

### Figure 1：两种部署压力

- Figure 1(a) 比较审计检测率：
  - MINJA 在 general audit 和 targeted audit 下约 68%。
  - MAFIA 在同样审计下接近 0% 到 3.3%。

- Figure 1(b) 比较 memory-density stress：
  - benign memory size 从 50 增到 5,842。
  - MAFIA 在高密度时仍保持明显领先。
  - 图中标出 full-pool 下约 +37 percentage points 差距。

### Figure 2：pipeline 图

- Figure 2 支撑的是方法结构：
  - probe 走普通接口。
  - 攻击者记录的是响应里暴露的历史问题字段。
  - clustering、selection、scheduling 决定写入位置。
  - compact factual cloak 通过普通 write path 进入记忆。

- 这张图的边界：
  - 它没有证明所有 Agent 都会暴露历史问题字段。
  - 如果系统默认不回显检索示例，probe stage 的可行性会下降。

### Figure 5：PHI 泄露案例

- 论文附录给出一个 MIMIC-III 案例：
  - 医生查询某患者用药。
  - top-K 中多数记录携带错误实体映射。
  - Agent 在推理中把该映射当成数据库事实。
  - 最终 SQL 查到另一个患者的处方。

- 这个案例的重要性：
  - 它把抽象 ASR 转化成具体安全后果。
  - 风险不是“回答风格被改变”，而是“外部状态或敏感数据访问对象被换掉”。

- 案例的边界：
  - 使用的是 benchmark 和去标识化数据。
  - 不能直接外推到所有医疗 Agent。
  - 但它说明实体级记忆污染会影响工具调用参数。

## 12. 相关工作位置：MAFIA 相对 MINJA、AgentPoison、A-MemGuard 的区别

### 与 AgentPoison 类直接写入攻击

- 直接写入攻击假设更强：
  - 攻击者能改 memory bank。
  - 或能插入恶意 demonstration。

- MAFIA 的区别：
  - 只通过 normal interaction。
  - 让 Agent 自己把污染记录写回。
  - 因而更适合讨论 SaaS Agent、工具 Agent、个人助理 Agent 的外部用户威胁。

### 与 MINJA 类 query-only memory injection

- MINJA 的贡献是把攻击从直接写库推进到 query-only。
- MAFIA 的推进点是把现实约束补上：
  - 大规模 benign pool。
  - LLM input auditor。
  - 有限预算。
  - 检索竞争。

- 所以 MAFIA 不是简单说“MINJA 不好”：
  - 它说明 MINJA 在小、无审计记忆环境可能有效。
  - 但部署压力一来，显性操控文本会触发审计，也会偏离 victim query neighborhood。

### 与 A-MemGuard 类防御

- A-MemGuard 代表 memory-side defense。
- 论文发现它能检测不少污染检索结果，但误报太高。
- 这提示后续防御需要更细粒度：
  - 谁写入了这条记忆？
  - 写入时的原始交互是什么？
  - 该记忆能否影响另一个用户或另一个权限域？
  - 当前任务是否允许使用这类实体映射？

## 13. 证据边界与复现缺口

### 论文已经证明得比较强的部分

- 在四个 benchmark Agent 设置中：
  - 短事实化映射比显性操控文本更不容易被低误报审计器抓到。
  - probe-guided placement 能提升 top-K 检索覆盖。
  - 审计后指标比审计前指标更能反映部署风险。

- 在 retriever 泛化中：
  - 多个 dense encoder 下 MAFIA 都领先 MINJA。
  - 说明结果不只依赖单一 embedding 模型。

### Detail inventory：读论文时应保留的实验细节

| 维度 | 论文给出的具体信息 | 对复现/评审的意义 |
|---|---|---|
| 攻击访问 | query-only，不能直接读写 memory bank | 避免把结果误解为数据库权限攻击 |
| 预算 | MIMIC-III 每个 pair 90 次攻击写入，其他设置每个 pair 30 次 | 控制“刷量淹没记忆池”的捷径 |
| 探测 | 300-probe surrogate pool，跨 9 个 pair amortize | 把探测成本和攻击预算分开 |
| 聚类 | cosine similarity、average linkage、阈值约 0.96 | 复现 placement 时需要固定 |
| 检索 | e5-small-v2 cosine，EHR/HF Hub 常用 top-4，WebShop 用 top-3 | ASR 与 top-K 设置强相关 |
| baseline | MINJA 的 m1 到 m4 或扩展版本 | 比较对象不是随机投毒，而是既有 query-only 攻击 |
| 审计 | gpt-5.4-mini input auditor，加多种 classifier 对照 | 证明不是只绕过单一 prompt |
| 防御 | A-MemGuard ConsistencyChecker | 评估 memory-side defense 的检测-误报权衡 |

- 这些细节决定论文结论能否成立：
  - 如果实际系统不暴露历史问题字段，surrogate `D` 的质量会下降。
  - 如果实际系统对写回做用户级隔离，跨用户受害查询可能无法检索到攻击者记录。
  - 如果实际系统要求实体映射由可信数据源证明，短事实化注解就不能直接进入高风险上下文。

- 因此，复现时不能只问“能否触发某个输出”：
  - 要记录每条攻击记录是否通过审计。
  - 要记录它是否进入 top-K。
  - 要记录 top-K 中恶意记录数量。
  - 要记录最终工具参数是否被替换。
  - 要区分预审计 ASR 和审计后 Post-ASR。

### 论文没有完全覆盖的部分

- **代码复现**：
  - GitHub README 仍是 TODO。
  - 当前不能独立审计实现细节、随机种子、prompt、数据处理脚本。

- **记忆架构**：
  - 不覆盖图记忆、权限隔离记忆、人工批准记忆、基于 provenance 的 memory ACL。

- **审计粒度**：
  - 主要看单条输入审计和检索后 consistency checking。
  - 没有完整评估“写入前后联合审计 + 用户权限 + 数据 lineage”的组合防御。

- **真实系统外推**：
  - 论文使用 benchmark 环境。
  - 真实 Agent 的日志策略、检索回显、写回规则、用户隔离会显著影响攻击可行性。

### 作为防御评审时，我会追问的控制实验

- **检索回显控制**：
  - 禁止 Agent 在响应中暴露历史问题字段后，MAFIA 的 placement 还能否维持同等 RIR@4？
  - 如果不能，说明响应最小化本身就是有效防线之一。

- **写入隔离控制**：
  - 把普通用户写入的记忆限制在本人 session 或低权限 namespace。
  - 再测试未来高权限用户 query 是否仍能检索这些记录。
  - 这个实验能区分“个人记忆污染”和“跨权限记忆污染”。

- **provenance 加权控制**：
  - 在 retrieval score 里加入来源可信度、写入者身份、原始任务标签。
  - 观察 RIR@4、ASR 和 benign utility 是否同时变化。
  - 如果 ASR 下降但正常任务准确率保持，说明不是简单牺牲可用性。

- **实体映射授权控制**：
  - 对 patient ID、drug、model dependency 等高风险实体替换加入外部数据校验。
  - 要求检索记忆只能作为提示，不能直接覆盖权威数据源。
  - 这能测试“事实化注解”是否仍能进入工具参数。

- **组合上下文审计控制**：
  - 不只审计单条写入记录，而是审计最终 top-K 组合上下文。
  - 重点检查多个低风险记录是否共同支持同一个未经授权映射。
  - 这个方向更贴近 MAFIA 暴露的系统性风险。

## 14. 对 Agent 安全研究的三个延伸问题

### 问题一：记忆写入需要权限模型，而不只是文本审计

- 如果任何普通会话都能写入全局记忆：
  - 系统等于把“未来上下文的一部分”开放给低权限用户。
  - 输入审计只能过滤显性恶意文本。
  - 它无法判断这条记忆未来是否会影响更高权限任务。

- 更稳妥的设计应当区分：
  - private memory。
  - team memory。
  - tool execution memory。
  - cross-user reusable memory。
  - high-risk entity mapping memory。

### 问题二：检索结果需要 provenance-aware ranking

- 当前 top-K 往往只看语义相似度。
- 对安全任务来说，还应加入：
  - 写入者身份。
  - 写入时间。
  - 原始任务上下文。
  - 是否经过授权确认。
  - 是否与当前用户权限域一致。

- 一个简化 scoring 形式可以写成：

```text
score(record, query, actor) =
  alpha * semantic_similarity(record, query)
  + beta * task_relevance(record, query)
  + gamma * provenance_trust(record, actor)
  - delta * cross_boundary_risk(record, actor)
```

- MAFIA 的意义在于提醒我们：
  - 只优化 semantic_similarity 的检索器，本身会成为攻击目标。

### 问题三：Agent 记忆防御要看“组合后的上下文”，不是单条记录

- 一条记录单独看可能像普通事实。
- 三条相近记录一起进入 top-K 后，可能形成多数证据。
- Agent 再把多数证据转成工具参数，就出现真实后果。

- 因此防御评估应增加：
  - top-K context risk。
  - multi-record consistency。
  - entity remapping provenance。
  - action-parameter sensitivity。
  - post-retrieval authorization check。

## 结论

- MAFIA 的贡献不是发现“记忆会被投毒”这个一般事实。
- 它更具体地证明：
  - 在大规模 benign pool 和 LLM input audit 同时存在时，query-only 攻击仍可能通过 placement 与 factual cloak 获得较高成功率。
  - 写入前审计如果只看单条文本，很难识别“看起来像事实、实际改变未来工具参数”的污染记录。
  - 检索后防御若缺少权限和来源上下文，则容易在检测率和误报率之间失衡。

- 对研究者来说，这篇论文把 Agent memory safety 的重点从 prompt injection 检测推进到系统设计：
  - memory write authorization。
  - provenance-aware retrieval。
  - cross-user memory isolation。
  - high-risk entity mapping verification。
  - action-time confirmation for memory-derived parameters。

- 当前最需要后续验证的是：
  - 代码公开后的可复现性。
  - 在不同长期记忆架构上的适用性。
  - provenance 和信息流防御是否能在低 FPR 下压住这类攻击。
