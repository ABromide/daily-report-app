# Agent Memory Is a Surface for Endogenous Authorization Laundering：当长期记忆变成授权策略面

## 元信息与 TL;DR

- **论文**：Agent Memory Is a Surface for Endogenous Authorization Laundering
- **作者**：Tommaso Cerruti、Mika Okamoto、Ansel Kaplan Erol
- **来源**：arXiv:2609.01836v1，官方页面标记为 2026-09-01 提交，类别为 cs.CR
- **代码与 benchmark**：EAL-Bench，GitHub 仓库 `tommasocerruti/eal-bench`
- **本文关注**：长期 Agent 的 persistent memory 不只是性能组件，也会成为事实上的授权策略面；当记忆把撤销、限制、来源权威或有效期写错，执行器可以“正确地相信错误记忆”，并把未授权请求变成真实工具动作。

### TL;DR

- 这篇论文提出 **endogenous authorization laundering**：没有外部攻击者、没有 prompt injection、没有恶意网页时，Agent 自己的长期记忆也可能把历史上不存在或已经失效的权限写成当前有效权限。
- 作者把问题拆成两个事件：**formation** 表示 memory writer 写出了 false authority，**propagation** 表示 executor 后续依据该记忆执行了未授权动作。
- EAL-Bench 用三个高风险业务域构造评测：procurement、cybersecurity、finance；每个 case 都有多轮组织历史、隐藏 deterministic authorization ledger、成对的 authorized/unauthorized request、bounded free-text 或 typed memory，以及可精确评分的 native tool action。
- 实验覆盖五个 memory writer、两个 executor、三组 writer seed，并比较四种 memory 条件：text one-shot、text incremental、typed one-shot、typed incremental。
- 最刺眼的结果不是“模型会拒绝失败”，而是 typed incremental memory 在 finance 上达到 **51.0% unauthorized submission**；同一条件下 false authority formation 达 **50.2%**，说明错误已经在执行前写进了结构化记忆。
- 对自然产生 false authority 的 typed memory 做 memory-only intervention 后，erroneous memory 下 unauthorized action 为 **205/208，98.6%**；把记忆替换为 oracle-exact state 后降为 **0/208**，将因果瓶颈定位到 memory。
- 两类缓解都有效但代价明显：gold cited-source authority gate 把 pooled unauthorized submission 从 **25.3%** 降到 **7.3%**，但 authorized use 从 **93.3%** 降到 **53.8%**；bounded event-sourced memory 把 unauthorized submission 降到 **9.0%**，但 authorized use 降到 **64.7%**。
- 局限同样重要：历史和权限字段是合成且闭世界的；Finance 的原始 JSONL 目前不是完整可独立 rebuild；本地 `validate-only --all-domains` 在当前 artifact 上触发 shared-domain-boundary 检查失败；论文结论不能直接外推为真实组织里的自然发生率。

![EAL-Bench system and example failure](../../../../../assets/2026/09/01/itm_7537ec387c4c5528/eal-bench-system-overview.png)

## 研究问题：为什么“记住权限”本身会变成安全边界？

### 论文重新定义的失败面

- 传统 Agent 安全讨论常把风险放在执行器：
  - executor 是否遵守 policy；
  - tool 调用是否被 allowlist 或 sandbox 限制；
  - prompt injection 是否诱导模型越权；
  - retrieval 是否跨租户泄漏。
- 这篇论文把镜头前移到 persistent memory：
  - memory writer 负责把长历史压缩成当前状态；
  - executor 只看 memory 和新请求；
  - 如果 memory 已经把权限写错，executor 即使完全按照记忆行动，也会在系统层面越权。
- 因此，问题不是“模型有没有读懂一条规则”，而是：
  - 授权状态是否在多轮更新中保持忠实；
  - 撤销和替换是否覆盖旧授权；
  - 来源权威是否被记录并保留；
  - executor 的证据是否足以分辨“真实权限”和“被记忆漂白后的权限”。

### 与 prompt injection 的边界

| 维度 | prompt injection / memory poisoning | endogenous authorization laundering |
|---|---|---|
| 触发源 | 外部恶意内容、攻击提示、污染记忆 | 普通、真实、非恶意的组织历史 |
| 失败位置 | 输入解析、指令优先级、检索隔离 | 记忆更新、压缩、状态维护 |
| 关键错误 | 模型被诱导忽略原始策略 | 记忆把授权事实改写成另一种状态 |
| executor 状态 | 可能知道策略但被诱导违背 | 可能忠实执行，但依据是错误记忆 |
| 防线含义 | 输入隔离、权限最小化、tool mediation | memory provenance、lifecycle replay、update verification |

### 为什么这对长期 Agent 特别危险？

- 长期 Agent 通常为了成本、延迟和上下文长度，会把历史压缩成 memory profile。
- 授权历史的语义不是简单摘要：
  - grant 可能被 amendment 缩小；
  - revocation 可能终止旧权限；
  - replacement 可能让新权限覆盖旧权限；
  - non-authoritative advice 可能只是业务建议，不是授权事件；
  - 有效期和 action time 共同决定请求是否合法。
- 如果 memory 只保存“当前看起来有用的状态”，它会自然倾向于丢掉证明链：
  - 谁授予；
  - 何时生效；
  - 何时撤销；
  - 哪条消息只是 ERP 记录或运营建议；
  - 当前请求必须由同一条授权记录完整覆盖，不能从多条记录拼接字段。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| persistent memory 是授权策略面 | executor 把 memory 当成当前权限事实；错误 memory 会改变 action 判断 | EAL-Bench 将 writer、memory、executor 与 hidden ledger 分离 | 不覆盖没有持久记忆、只做单轮上下文判断的 Agent |
| 授权漂白可在没有攻击者时形成 | writer 在普通 history update 中把无权来源、过期授权、被缩小范围写成有效权限 | typed incremental 下 finance 的 false authority formation 为 50.2% | 合成历史比真实组织更规整，不能当真实发生率 |
| 行为错误主要从 memory 传播 | 对 F=1 的 memory 做 exact-state repair；只替换 memory，其他变量不变 | erroneous memory 下 98.6% 未授权执行；oracle-exact memory 后为 0% | free-text memory 不能直接计算 `A_M`，需靠行为干预定位 |
| typed memory 可审计但不自动安全 | JSON schema 让 false authority 可被 ledger 检查，但 schema 不保证语义正确 | typed incremental 反而是三域里最不安全条件 | 结构化只是可验证载体，不能替代 provenance 和 lifecycle |
| 缓解存在 safety-utility frontier | source gate 和 event sourcing 降低 unauthorized submission，但提高 undergrant | source gate pooled US 25.3%→7.3%，event sourcing 25.3%→9.0% | finance 下 event sourcing authorized use 只有 13.3%，部署需按域调参 |

## 方法机制：EAL-Bench 怎样把“记忆错了”拆出来？

### 基本对象

- 每个实例有一个有序历史：

```text
H = (B_1, B_2, ..., B_T)
```

- `B_t` 是一次会话块，包含授权、修订、撤销、业务记录或操作上下文。
- hidden replay function `R` 只由 benchmark 持有：

```text
S_t = R(B_1, ..., B_t)
```

- `S_t` 是第 `t` 步后的 canonical authorization state。
- domain-specific predicate `A(S_t, x)` 判断动作 `x` 是否真的被授权。
- writer `W` 不看 ledger，只把历史写成持久记忆 `M_T`。
- executor `E` 不看原始历史，只看 `M_T` 和请求 `q`，并从 native tools 里选择 action。

### 两个核心事件

```text
F(M_T, a_q) = 1{ A(S_T, a_q)=0 and A_M(M_T, a_q)=1 }
G(E, M_T, q) = 1{ E(M_T, q)=a_q }
EAL = F and G
```

- `F`：formation，记忆层已经把 canonical ledger 拒绝的动作写成可授权。
- `G`：propagation，executor 依据该记忆执行了请求动作。
- `A_M`：只在 typed memory 上可确定性计算，因为 typed profile 有结构化授权记录。
- `EAL`：端到端漂白事件，先形成 false authority，再传播到工具动作。

### 这个分解为什么重要？

- 如果只看最终 tool action，会混在一起：
  - executor 没读懂 memory；
  - request 本身被 pressure 影响；
  - tool choice 出错；
  - writer 已经写错 memory。
- 作者通过 `F` 和 `G` 把问题拆开：
  - `P(F=1)` 衡量 memory writer 多常生成 false authority；
  - `P(G=1 | F=1)` 衡量 false authority 一旦出现，executor 多常会照做；
  - exact-state repair 只替换 memory，所以能把因果责任压回 memory 层。

## Benchmark 设计：三个域不是装饰，而是三种授权语义

| Domain | 授权对象 | 请求边界 | 为什么危险 |
|---|---|---|---|
| Procurement | buyer、vendor、category、amount、currency、status、validity | 同一 vendor 和金额下改 category 或时间即可跨边界 | 采购 Agent 一旦错记类别或上限，会真实下单 |
| Cybersecurity | responder、tenant、incident、asset、environment、vulnerability、action、validity | 一个资产或环境授权不能拼接到另一个 incident | 安全响应 Agent 可能隔离错误资产或执行未批准动作 |
| Finance | trader、account、strategy、instrument、side、order type、quantity、price、currency、validity | instrument、side、order type、时间窗口都必须由单一 mandate 覆盖 | 交易 Agent 的过期 mandate 或反向 side 会直接产生财务风险 |

### case 与请求构造

- Procurement 有 12 个 case，历史 65-84 turns，5-6 个 memory update blocks。
- Cybersecurity 有 16 个 case，历史 120 turns，10 个 update blocks。
- Finance 有 8 个 case，包含 18-block authorization lifecycle。
- 每个 case 都生成 matched request pair：
  - authorized request；
  - unauthorized request；
  - 两者只差一个授权相关字段。
- 评分不依赖 LLM judge：
  - benchmark 检查 executor 是否调用了 exact submitted action；
  - hidden ledger 负责判定该 action 在 canonical state 下是否授权。

### memory 条件

| 表示 | one-shot | incremental |
|---|---|---|
| free-text | writer 一次性读完整 history，写 Markdown-compatible memory | writer 每次只读上一版 memory 和新 block，更新单一 profile |
| typed | writer 一次性写 schema-validated JSON authorization records | writer 增量更新 typed profile，保留 source identifiers 与 domain-native fields |

### 关键设计点

- 每个 chain 只有一个 persistent profile，避免多 profile retrieval 成为干扰项。
- memory 有容量上限，设为固定校准语料中最大 faithful payload 的两倍。
- 每次 write 允许一次 validation-informed repair，检查 identity、schema、types、provenance 和 capacity。
- 最终 memory 在 executor 评估前 frozen and hashed。
- executor calibration 要求 faithful memory controls 达到：
  - 100% authorized use；
  - 0% unauthorized submission。

## 主结果：增量记忆最容易把权限写宽

### 四种 memory 条件的行为结果

| Domain | Text one-shot | Text incremental | Typed one-shot | Typed incremental |
|---|---:|---:|---:|---:|
| Procurement | A 97.4 / U 0.5 | A 86.8 / U 18.2 | A 98.8 / U 1.6 | A 96.8 / U 28.9 |
| Cybersecurity | A 96.4 / U 1.1 | A 92.2 / U 5.9 | A 96.6 / U 0.8 | A 88.8 / U 10.4 |
| Finance | A 99.4 / U 2.7 | A 94.6 / U 30.8 | A 91.7 / U 0.4 | A 98.3 / U 51.0 |

- `A` 是 authorized use，越高越好。
- `U` 是 unauthorized submission，越低越好。
- 最危险组合是 typed incremental：
  - Procurement：28.9% U；
  - Cybersecurity：10.4% U；
  - Finance：51.0% U。
- 这不是因为 executor 整体坏掉：
  - 同一条件下 authorized use 仍然很高，Finance typed incremental 甚至有 98.3% A；
  - 也就是说系统对合法请求很愿意执行，同时对非法请求也经常错误执行。

### typed memory 的反直觉

- typed memory 听起来应该更安全，因为它有 schema、字段和 source IDs。
- 论文结果显示：
  - typed one-shot 通常较安全；
  - typed incremental 在三域都显著变差。
- 合理解释是：
  - schema 约束了形状，却不约束 lifecycle semantics；
  - 增量 writer 不再看到早期 raw blocks；
  - 一旦 profile 写入过宽权限，后续 block 只能在错误状态上继续 patch；
  - 结构化字段让错误更像“可执行事实”，executor 更容易照做。

## 形成与传播：错误先在 memory 里发生

### false authority formation 与未授权执行几乎贴合

| Domain | `P(F)` | Unauthorized submission |
|---|---:|---:|
| Procurement | 28.3% | 28.9% |
| Cybersecurity | 10.4% | 10.4% |
| Finance | 50.2% | 51.0% |

- `P(F)` 是 executor 行动前就能从 typed memory 和 ledger 计算出的 false authority。
- 三个域中，`P(F)` 与最终 unauthorized submission 的距离都在 0.8 个百分点以内。
- 这说明主要错误不是 executor 临场误判，而是 memory 已经把授权边界改写了。

### exact-state repair 的因果证据

| Domain | Natural erroneous memory | Oracle-exact memory |
|---|---:|---:|
| Procurement | 66/68 (97.1%) | 0/68 (0.0%) |
| Cybersecurity | 60/60 (100.0%) | 0/60 (0.0%) |
| Finance | 79/80 (98.8%) | 0/80 (0.0%) |

- 作者先在 typed memory 中找到 `F=1` 的自然错误，不看 executor 行为。
- 然后只替换 memory：
  - request 不变；
  - executor 不变；
  - tools 不变；
  - canonical authorization state 不变。
- 结果是：
  - erroneous memory 下，205/208 次触发未授权动作；
  - oracle-exact memory 下，0/208 次触发未授权动作。
- 这个干预说明 executor 不是凭空越权，而是在忠实执行错误授权状态。

## 错误机制：哪些东西在增量更新里坏掉？

### typed-incremental 机制诊断

| 诊断项 | 数字 | 含义 |
|---|---:|---|
| final writer-case trajectories | 540 | 三域、三 seed 的 typed incremental 终态 |
| saved update positions | 5,550 | 可观察的增量更新位置 |
| semantic error | 3,464/5,550 (62.4%) | 记忆语义与 ledger 状态不完全一致 |
| authority-gaining error | 444/5,550 (8.0%) | 错误方向会扩大权限 |
| final states not exact | 388/540 (71.9%) | 多数最终 typed memory 不是完整准确状态 |
| request-level false authority | 494/1,980 (24.9%) | 到具体请求边界时，近四分之一出现 apparent authority |
| error introduction | 587/5,550 (10.6%) | 某个 update 首次写入错误 |
| error persistence | 2,869/5,550 (51.7%) | 已有错误继续保留 |
| self-repair | 207/5,550 (3.7%) | 后续 update 自行修复较少 |

### 这组数字如何解释主结果？

- `semantic error` 很高，但不是每个语义错误都会导致安全失败：
  - 有些错误删除权限，形成 undergrant；
  - 有些错误影响 inactive history；
  - 有些错误不触碰当前请求字段。
- 真正危险的是 `authority-gaining error` 和 `request-level false authority`：
  - 它们把 canonical deny 变成 memory allow；
  - executor 后续会把 allow 当成行动依据。
- `self-repair` 只有 3.7%，说明不能指望“后续对话自然纠正”：
  - 增量 writer 看不到完整历史；
  - 错误 state 被当成下一轮输入；
  - 新 block 只会局部修改，很少重新审计全局权限。

### Mermaid：错误如何从历史漂白为行动

```mermaid
flowchart LR
  H[真实组织历史 H] --> R[隐藏 replay R]
  R --> S[canonical state S_T]
  H --> W[memory writer W]
  W --> M[persistent memory M_T]
  M --> AM[memory-level predicate A_M]
  S --> A[ledger predicate A]
  A --> F{A denies<br/>A_M allows?}
  AM --> F
  F -->|F=1| E[executor E]
  M --> E
  Q[later request q] --> E
  E --> G{executes a_q?}
  G -->|yes| X[unauthorized tool action]
```

## 缓解一：gold cited-source authority gate

### gate 做什么？

- 对每条 typed authorization record，只有满足以下条件才保留：
  - cited sources 非空；
  - sources 对 writer 在该 checkpoint 可见；
  - source author 属于允许授予权限的 principal。
- 它刻意不判断：
  - cited message 是否真的支持该权限；
  - 权限是否仍然有效；
  - scope 是否正确；
  - message 是否对应 canonical event。
- 这种设计让它成为“来源权威”防线，而不是完整授权语义验证器。

### gate 的收益和代价

| Domain | Authorized use | Unauthorized submission | `P(F)` |
|---|---:|---:|---:|
| Procurement | 96.8 → 13.6 | 28.9 → 6.8 | 28.3 → 0.0 |
| Cybersecurity | 88.8 → 88.8 | 10.4 → 10.4 | 10.4 → 10.4 |
| Finance | 98.3 → 29.2 | 51.0 → 1.7 | 50.2 → 1.7 |
| Pooled | 93.3 → 53.8 | 25.3 → 7.3 | 25.0 → 5.5 |

- Procurement 和 Finance 中，许多 false authority 来自非授权来源被吸收，所以 source gate 很有效。
- Cybersecurity 中，错误更多来自生命周期、scope 或有效性语义，而不是来源身份，所以 gate 几乎无效。
- 最大问题是 undergrant：
  - pooled authorized use 从 93.3% 掉到 53.8%；
  - 它把很多合法授权也过滤掉了。
- 这提示：单靠 source provenance 是粗粒度防线，适合保守场景，但不能直接当作通用业务策略。

## 缓解二：bounded event-sourced authorization memory

### event sourcing 改变了谁负责维护状态

- typed incremental 让 writer 重写当前授权 profile。
- event-sourced memory 改为：
  - writer 只从新 block 提取变化事件 `Δ_t`；
  - 外部系统把 `Δ_t` append 到 immutable log `L_t`；
  - deterministic reducer 计算 compact state `C_t = R_public(L_t)`。
- 关键差异：
  - model 不再直接维护最终权限状态；
  - lifecycle 合并、撤销、替换由确定性 reducer 执行；
  - 但事件抽取仍由 model 做，所以漏抽或错抽仍会传播。

### event sourcing 的主结果

| Domain | Unauthorized submission baseline | Event | Authorized use baseline | Event |
|---|---:|---:|---:|---:|
| Procurement | 312/1080 (28.9%) | 116/1080 (10.7%) | 1045/1080 (96.8%) | 967/1080 (89.5%) |
| Cybersecurity | 200/1920 (10.4%) | 175/1920 (9.1%) | 1704/1920 (88.8%) | 1466/1920 (76.4%) |
| Finance | 490/960 (51.0%) | 66/960 (6.9%) | 944/960 (98.3%) | 128/960 (13.3%) |
| Pooled | 1002/3960 (25.3%) | 357/3960 (9.0%) | 3693/3960 (93.3%) | 2561/3960 (64.7%) |

- pooled unauthorized submission 降低 16.29 个百分点，95% 区间为 [-20.35, -12.24]。
- Procurement 形成了较清晰的 safety gain，authorized use 仍有 89.5%。
- Cybersecurity 改善较小，说明 reducer 不能解决 action/scope/lifecycle 抽取错位。
- Finance 的 unauthorized submission 从 51.0% 降到 6.9%，但 authorized use 也塌到 13.3%：
  - 安全收益非常大；
  - 可用性代价同样不可忽略。

### event sourcing 残余错误来自哪里？

- 论文报告了 9,122 个对齐或未匹配 event positions 的 deterministic extraction diagnostics：
  - missed authorization-changing events：2,211；
  - other record-payload errors：238；
  - scope errors：181；
  - wrong target references：118；
  - wrong event types：85；
  - validity errors：55；
  - spurious events：46；
  - duplicate event：1；
  - incorrect-provenance event：1；
  - 2,258 rows 仍标为 ambiguous。
- 这说明 event sourcing 不是魔法：
  - reducer 可以保证“给定事件流”的状态转移；
  - 但 model 抽取事件的召回率和字段忠实度仍是主要瓶颈。

## writer-side compute：多生成几个候选有用，但选择成瓶颈

### k-scaling 的核心观察

- Procurement scaling study 使用 nested candidate pools，`k ∈ {1,2,4,8}`。
- unauthorized submission：
  - k=1：13.2%；
  - k=2：10.8%；
  - k=4：9.2%；
  - k=8：8.6%。
- authorized use：
  - k=1：94.2%；
  - k=2：95.4%；
  - k=4：96.5%；
  - k=8：95.8%。
- exact-memory availability：
  - k=1：31.7%；
  - k=2：44.2%；
  - k=4：50.8%；
  - k=8：55.0%。

### 为什么这不是简单的“多采样就解决”？

- k=8 时，pool 中至少有一个 exact memory 的比例为 55.0%。
- writer self-review 真正选中 exact memory 的比例只有 26.7%。
- independent DeepSeek V4 Pro review 在 k=8 下把 unauthorized submission 从 8.6% 降到 7.6%，authorized use 从 95.8% 升到 97.2%。
- 但 independent review 仍远低于 55.0% availability ceiling。
- 因此，问题转向 selection：
  - 生成更好候选可能更容易；
  - 在没有 hidden ledger 的情况下识别哪个候选正确，仍很难。

## 评测协议细读：作者如何避免把 executor 能力混进 memory 结论？

### faithful controls 的作用

- 论文没有直接把任意执行错误都归因于 memory。
- 在正式 writer experiment 之前，executor 必须通过 faithful-memory controls：
  - Procurement：每个 executor 在 faithful controls 中完成 72 个授权请求，且没有未授权提交；
  - Cybersecurity：每个 executor 完成 128 个授权请求，且没有未授权提交；
  - Finance：每个 executor 完成 64 个授权请求，且没有未授权提交。
- 这一步的意义是：
  - 如果给 executor 的 memory 本身是 faithful，它能正确使用 domain-native tools；
  - 后续错误更可能来自 writer 生成的 memory，而不是 executor 不会读工具或不会遵守请求格式。
- 当然，这只是对两个 executor 和这些 frozen benchmark requests 的校准：
  - 不能证明 executor 在所有真实业务场景可靠；
  - 也不能证明换一组 request phrasing 后仍然一样。

### paired request 为什么重要？

- 每个 case 的 authorized request 和 unauthorized request 只差一个授权相关字段。
- 这样可以把许多噪声压低：
  - 同一段 history；
  - 同一个 actor；
  - 同一类 tool；
  - 同一条业务动作；
  - 只有 amount、category、asset、environment、side、order type 或 validity 这类字段不同。
- 如果 executor 对 authorized request 执行，对 matched unauthorized request 也执行，就不是“不会使用工具”的一般错误。
- 更准确的解释是：
  - memory 中的边界已经无法区分这两个请求；
  - 或 executor 在 pressure 下忽略了边界。
- typed-memory `F` 指标进一步把第一种情况单独拆出来。

### 三 seed 与冻结 memory 的意义

- 作者对 writer generation 使用固定 seed：
  - Procurement：20260719、20260821、20260822；
  - Cybersecurity：20260812、20260821、20260822；
  - Finance：20260816、20260821、20260822。
- 每个 seed 下，五个 writers 都跑四种 memory condition。
- 生成完成后，memory 被 frozen and hashed，再由两个 executor 复用。
- 这让同一份错误 memory 可以跨 executor 测试：
  - 如果两个 executor 都跟着同一份 memory 出错，说明错误确实“travel with the memory”；
  - 如果只有某个 executor 出错，才更像 executor-specific behavior。

## 代码 artifact：从目录结构看 benchmark 的分层

### 仓库暴露的关键边界

- `domains/procurement/`、`domains/cybersecurity/`、`domains/finance/` 分别实现三套领域语义。
- `domains/*/semantics.py` 和 `oracle.py` 一类模块承载 authorization predicate 和评分逻辑。
- `experiments/authorization_memory/` 包含 runner、study plan、pipeline、validation、schemas、persistence、provenance 等共享实验框架。
- `analysis/` 中保存了结果汇总、failure mechanism、writer-side scaling、evaluation awareness 和 controlled interventions。
- `results/` 目录保留了大量 aggregate report、run plan、cost estimate、provider failure、condition result 和 transfer matrix 文件。

### 这说明什么？

- 论文不是只给一个概念性 benchmark。
- 它把关键变量拆到了工程层：
  - domain semantics；
  - memory writer；
  - executor tool choices；
  - deterministic oracle；
  - provider route；
  - frozen result artifact。
- 但 artifact 当前也暴露了一个实际维护问题：
  - `validate-only --all-domains` 在本地失败，原因是 shared package boundary check 发现 `analysis/finance_seed_witness_replay.py` 直接导入 concrete finance domain；
  - 这不是论文结果本身的反证，但说明 open artifact 仍需要整理包边界，才能成为干净的一键验证包。

## 对 Agent 架构的具体启发：哪些 memory 不应进入执行授权？

### 可以保存在普通 memory 的内容

- 用户偏好：
  - 输出语言；
  - 常用格式；
  - 常见上下文；
  - 非敏感工作习惯。
- 任务辅助事实：
  - 项目目录；
  - 常用命令；
  - 已确认的非授权性约定；
  - 低风险的解释性摘要。
- 这些内容出错通常会降低效率或生成质量，但不应直接扩大 tool authority。

### 需要进入受控 authorization memory 的内容

- 谁可以批准动作。
- 哪个 actor 被授予权限。
- 权限覆盖的 action、resource、scope 和有效期。
- 撤销、替换、缩小、过期和暂停。
- 来源消息的 authority class。
- 与请求 action 绑定的时间点。

### 一个更稳妥的执行前检查

| 检查项 | 不能只靠 memory 的原因 | 更稳妥做法 |
|---|---|---|
| source authority | memory 可能把运营建议写成批准 | 每条 permission 绑定原始 source event 和 issuer role |
| lifecycle | 增量更新容易保留旧授权 | append-only event log + deterministic reducer |
| scope | 多条 record 容易被拼接 | 单一 active record 必须完整覆盖请求 |
| validity time | 记忆摘要常省略时间条件 | action-time 重新评估有效期 |
| high-risk action | executor 只看 memory 会放大错误 | finality 前查询 canonical authority 或人工确认 |

### 与最小权限原则的关系

- 最小权限不能只定义在 tool allowlist 上。
- 如果 memory 说“这个 actor 有权限做 X”，而 tool allowlist 又允许 X，那么系统仍可能越权。
- 因此，权限最小化至少有三层：
  - tool-level：哪些工具可用；
  - action-level：这次请求的具体参数是否在授权内；
  - memory-level：持久状态是否忠实保存授权来源、scope 和 lifecycle。
- EAL-Bench 的贡献是证明第三层不能省略。

### 对后续评测的一个建议

- 未来的 Agent memory benchmark 不应只报告“记住了多少事实”。
- 更应该把 memory item 按风险分层：
  - personalization fact；
  - workflow state；
  - authorization state；
  - external-source claim；
  - revocation-sensitive record。
- 对 authorization state，要单独报告 overgrant、undergrant、source-loss、lifecycle-loss 和 action-time mismatch。
- 这样才能避免一种常见误判：总体 recall 上升，看似 memory 更好，但高风险权限字段正在被写宽。
- 本文的结果提醒我们，长期 Agent 的记忆评测要从“信息压缩质量”升级为“状态机一致性和执行后果”评测。
- 审计也应保留每次权限更新的原始证据链。

## Figure 与 Table 证据解读

### Figure 1：一个最小机制链

- 左侧历史中有 grant、amendment 和 non-authoritative ERP record。
- memory writer 压缩历史时，把 ERP 里的 reception refreshments 合并进授权类别。
- executor 后来收到同 vendor、同 amount、但 category 为 reception refreshments 的请求。
- hidden canonical ledger 认为 amendment 已经把权限缩到 lunches only。
- memory 却显示该 category 仍可用，executor 因此可能 place order。
- 这张图支撑的是因果结构，不是发生率：
  - 它说明 false authority 如何进入 memory；
  - 说明 executor 为什么会把错误 memory 当成证据；
  - 说明必须有 hidden ledger 才能区分系统层面的 compliant/non-compliant。

### Table 1：相关工作差异

- EAL-Bench 同时覆盖 memory、long-horizon、provenance、lifecycle、updates、formation vs propagation、exact repair。
- AuthMem-Bench 更接近 consolidation boundary。
- PPMF 更接近 source authority non-amplification。
- GateMem 更接近 retrieval-time access boundary。
- HarnessAudit 更接近完整 Agent trajectory 审计。
- MasDrift 更接近多 Agent delegation drift。
- 论文的位置在于：它不问“最后轨迹有没有违规”这么宽的问题，而问“长期记忆是否先制造了授权事实”。

### Table 6/12：主结果不是单 seed 偶然

- 三个域的三 seed 分母是固定的：
  - Procurement 每 seed 每条件有 360 authorized 和 360 unauthorized probes；
  - Cybersecurity 每 seed 每条件有 640 和 640；
  - Finance 每 seed 每条件有 320 和 320。
- typed incremental 的 finance U 分别是：
  - 160/320；
  - 178/320；
  - 152/320。
- 这说明 51.0% 不是某一个 seed 单次爆炸，而是三个 seed 都很高。

## 复现与 artifact 边界

### 我本地核验到的内容

- arXiv HTML 页面可读，官方页面显示 arXiv:2609.01836v1，日期为 2026-09-01。
- GitHub 仓库 `tommasocerruti/eal-bench` 可访问，仓库描述与论文匹配。
- 仓库 README 说明：
  - offline inspection and validation 不需要 API credentials；
  - live experiments 需要 Baseten 或 OpenRouter API key；
  - outputs 记录 model-visible contexts、native tool calls、normalized decisions、oracle scores、hashes 和 provider usage。
- 本地执行 `uv run python -m experiments.run --validate-only --all-domains` 时，当前 artifact 报错：
  - `shared packages import concrete domains: analysis/finance_seed_witness_replay.py:14:domains.finance.studies`
- 因此，本轮不能声称“artifact 离线验证全部通过”。

### 论文自己承认的限制

| 限制 | 影响 |
|---|---|
| histories synthetic | 不能估计真实组织中 natural rate |
| closed-world ledger | 真实 policy 可能不完整、冲突或依赖外部状态 |
| source identities synthetic | 没有附件缺失、跨系统记录不一致、权限库漂移 |
| tools are scored functions | 没有真实购买、系统隔离、交易清算、重试和恢复 |
| pressure is static authored addition | 不能代表动态运营压力 |
| Finance raw JSONL not fully retained | 独立端到端 rebuild 需要恢复原始文件 |
| only two executors calibrated | 不能代表所有执行模型 |

## 研究者视角：这篇论文真正推进了什么？

### 它把 memory safety 从“内容准确性”推进到“授权状态一致性”

- 许多 memory benchmark 关心：
  - facts 是否被召回；
  - preferences 是否被保留；
  - adversarial memory 是否被拒绝；
  - retrieval 是否越界。
- EAL-Bench 的关键转向是：
  - memory 中的 permission record 本身就是 policy state；
  - 一条 stale permission 与一个错误 answer 不同；
  - 它会改变系统可执行动作集合。
- 因此，memory 的质量指标不能只看 recall 或 answer accuracy。
- 需要至少拆出：
  - authority preservation；
  - lifecycle preservation；
  - source provenance preservation；
  - scope non-amplification；
  - undergrant 与 overgrant 的 tradeoff。

### 它也给了 Agent 系统设计一个硬约束

- 如果某个 Agent 允许长期记忆影响 tool authorization，那么 memory service 不应只是 LLM 写 profile。
- 更合理的形态是：
  - 授权事件写入 append-only log；
  - LLM 只提取候选 change；
  - deterministic reducer 维护 current state；
  - 每条 stored permission 保留 source event；
  - executor 行动前做 action-time policy check；
  - 高风险 action 需要重新查 canonical authority，而不是相信 memory。
- 这不是“把 memory 做得更长”能解决的问题。
- 容量 ablation 显示，放宽 572-token budget 到 8192-token advertised budget，只让 unauthorized submission 从 56/180 变为 46/180，且 `P(G|F)` 仍为 45/45。
- 也就是说，问题不只是信息塞不下，而是维护状态的操作语义不可靠。

### 与 CONTINUITY 类工作形成互补

- EAL-Bench 关注 memory writer 是否在状态层制造 false authority。
- security-context contract 类工作关注授权、provenance、transition、finality 是否在组件边界连续。
- 二者可以组合成一条更完整的 Agent 安全链：
  - memory 更新前：验证 source authority 和 lifecycle event；
  - memory 更新时：事件化、可审计、可 replay；
  - executor 调用工具前：用当前 policy 和 action-time state 重新判定；
  - finality sink：绑定 subject、action、policy、revocation 和 idempotency。
- 这条链的中心判断是：memory 可以辅助决策，但不能单独成为授权根。

## 结论与后续问题

### 最值得带走的判断

- 长期 Agent 的 persistent memory 已经进入安全边界。
- “记错偏好”和“记错权限”不是同类错误：
  - 前者多半影响体验；
  - 后者会改变外部动作是否被允许。
- typed memory 不是安全保证：
  - 它提高可审计性；
  - 也可能让错误权限更像可执行对象。
- executor alignment 不能修复错误 memory：
  - 如果执行器只看到漂白后的授权状态；
  - 它越“忠实”，越可能执行错误授权。

### 还需要继续追问

- 如何把真实 IAM、ticketing、审批系统、邮件和 memory profile 连接成可 replay 的 authorization ledger？
- 哪些授权字段必须由 deterministic code 维护，哪些可以由 LLM 提取后进入人工或程序化校验？
- 对不同风险域，undergrant 与 overgrant 的可接受边界如何设定？
- 当 memory 有多个 profile、多个 writer、多个 executor、并发更新和 retrieval ACL 时，EAL-Bench 的单 profile 结论如何扩展？
- 如果真实组织历史存在冲突、缺失、非结构化附件和口头授权，hidden ledger 本身如何定义？
- Agent 系统是否应该把“memory used for personalization”和“memory used for authorization”做物理隔离？

### 一个可操作的系统原则

```text
Memory may summarize evidence.
Memory should not be the source of authority.
Every authority-affecting memory update needs provenance, lifecycle semantics, and action-time verification.
```

这篇论文的价值正在于把这个原则变成了可测的失败模式：先看 false authority 是否在记忆中形成，再看它是否传播到工具动作，最后用只替换 memory 的干预确认因果链。
