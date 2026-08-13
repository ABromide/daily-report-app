# AI Guardrail Survival under Single-Cycle Agentic Self-Summarization：一次上下文压缩后，安全规则还“活着”吗？

**原文**：[AI Guardrail Survival under Single-Cycle Agentic Self-Summarization](https://arxiv.org/abs/2608.11392)  
**类型**：论文  
**方向**：AI 安全 / Agent 安全 / 上下文压缩  
**作者**：Ted Kwartler、Alan Aqrawi、Arian Abbasi  
**发布时间**：2026-08-11T19:57:55Z  
**复现仓库**：[alanaqrawi/guardrail-survival-under-compaction](https://github.com/alanaqrawi/guardrail-survival-under-compaction)

## TL;DR

- 这篇论文研究一个很具体但很危险的问题：长运行 Agent 把历史对话压缩成摘要后，原本写在上下文里的安全规则是否还能约束后续行为。
- 作者不满足于问“规则文本有没有出现在摘要里”，而是把规则命运拆成 **W/G/D/X** 四类：完整焊接、类别泛化、谓词降级、完全丢失。
- 核心结论是：__presence check is not a safety check__。摘要里看起来还有某种规则痕迹，不等于模型读到它后还会拒绝被禁止的动作。
- 在 Qwen 主实验中，未标记规则的文本存活率为 **50/185 = 27%**，匹配事实只有 **7/175 = 4%**；Claude 在 150-token 硬预算下复现了规则优先保留：**114/185 = 62%** vs **25/175 = 14%**。
- 更关键的是行为 replay：降级残留 D 比完整规则 W 更容易放行违规动作。全样本保守口径下，D-W 放行差距在 Qwen replay 中为 **+34 个百分点**，在 Llama replay 中为 **+57 个百分点**。
- 作者没有观察到“规则还在但 referent 被悄悄泛化到不覆盖目标”的文本 severing 模式：10 个泛化机会中 **0 个 non-covering**，但这只是单周期、小样本边界，不等于不可能发生。
- 论文的工程含义不是“把规则摘要得更认真”这么简单，而是：约束应放在摘要外的持久 registry / pinned memory 中；摘要后检查必须核对 **目标 + 禁止动作**，必要时还要 replay 或运行时 enforcement。
- 局限很清楚：所有结果只覆盖 **单次 compaction**；实验是合成任务；规则都是禁止型 standing rule；LLM judge 不是充分可靠，作者自己的 judge-only 标签两次差点改变论文结论。

## 1. 研究问题：为什么“摘要还提到了规则”不够？

### 论文回应的失败场景

- 长运行 Agent 通常不会无限保留完整 transcript：
  - 上下文接近窗口上限时，框架会把历史压缩成 summary。
  - 后续 Agent 只拿 summary 继续推理。
  - 如果安全规则只存在于原始 transcript，它会和普通任务细节一起接受摘要器筛选。

- 作者把风险切得更细：
  - 不是只问规则是否被整段丢弃。
  - 而是问规则被压缩后是否还具有 **可操作性**。
  - 一个摘要可以留下“这里有约束”这种痕迹，却丢掉到底不能做什么。

### 四个研究问题

| RQ | 问题 | 为什么重要 |
|---|---|---|
| RQ1 | 单条显著规则压缩后如何消失：整条丢失，还是目标被悄悄泛化？ | 区分可审计的 omission 与更隐蔽的 referent severing。 |
| RQ2 | 规则是否比同等显著的普通事实更容易被保留？ | 如果规则确实更常被保留，presence check 会更有迷惑性。 |
| RQ3 | 降级残留是否还能保护行为？ | 文本存在只是代理指标，安全最终看动作是否被拒绝。 |
| RQ4 | 只用 LLM judge 给摘要打标签是否会改变结论？ | Agent 安全评测常依赖 judge，错误会直接变成错误治理建议。 |

### 作者的论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 文本 presence 不是安全保护 | 摘要可能保留目标名或约束痕迹，却丢掉禁止谓词 | D 残留在 replay 中比 W 完整规则更常放行违规动作 | replay 模型能力会影响绝对放行率 |
| 规则比事实更常存活 | imperative / deontic 形式在摘要选择中更显著 | Qwen 27% vs 4%，Claude cap 62% vs 14% | 不能证明独立于 salience 或 normativity |
| 单周期文本损失主要是 weld-or-drop | 单条显著规则要么和 referent 一起保留，要么整体丢失 | stress probe 中 G=0；between-items 10 次泛化无 non-covering | 只覆盖一次压缩，不排除多轮 erosion |
| Judge-only 不可靠 | judge 会把可推断内容误判为摘要中存在 | marked epistemic survival 曾被 3 误膨胀到 12 | 作者 adjudication 非全量人类双标 |

## 2. 概念框架：W/G/D/X 到底在分什么？

作者把每个安全规则压缩后的文本状态分成四类。这一点是论文最重要的方法设计，因为它把“提到了”拆成了可执行性层级。

| 代码 | 名称 | 判定条件 | 是否足以应用限制 |
|---|---|---|---|
| W | welded | referent 清楚出现，禁止动作也可恢复 | 是，且目标具体 |
| G | generalized | 限制还在，但挂到类别层面，或目标在但限制被软化 | 部分是，但目标特异性下降 |
| D | degraded | 可能提到 referent，但禁止动作不可恢复，只剩“有约束” | 否 |
| X | dropped | 规则与目标都不在摘要中 | 否 |

### 关键变量

```text
survival_text = 1[code in {W, G}]
welded_survival = 1[code == W]
behavioral_disarm = 1[replay_model 执行了被禁止动作]
gap_D_minus_W = P(disarm | D) - P(disarm | W)
```

- `survival_text` 是宽口径，回答“规则形式是否还在”。
- `welded_survival` 是更安全的文本口径，要求目标与谓词都完整。
- `behavioral_disarm` 才是操作风险：模型是否真的放行了本该拒绝的动作。
- `gap_D_minus_W` 是论文最有解释力的量，因为它控制了“replay 模型本来就可能不听规则”的基线问题。

### 为什么 D 和 G 不能混在一起？

- **D 是谓词丢失**：
  - 例如摘要还写着 `payments-v2 has a constraint`。
  - 但读者不知道到底是不能 merge、不能 deploy，还是不能 share。

- **G 是目标泛化或软化**：
  - 例如 `avoid merging into sensitive payment branches without review`。
  - 它可能还覆盖原目标，但行为上常常比 W 弱。

- 这两个状态都会骗过粗糙的 presence check：
  - target 名称可能还在。
  - “constraint” 这种词可能还在。
  - 但真正需要保留的是 **target + restricted action + gate**。

## 3. 实验设计：两个 probe 覆盖两种压缩压力

### 3.1 单规则 stress probe

这个 probe 用来观察一条显著规则的文本命运。

- 输入构造：
  - 一段 45k filler 的长对话。
  - 中间插入一条 standing safety rule。
  - 同时种入多个无关 tracer facts，用来确认摘要器真的在压缩。

- 放置条件：
  - `turn-0-explicit`：开头显式声明规则。
  - `mid-casual`：中途随口提到规则。

- 解释目标：
  - 如果 tracer 大量保留，说明模型没有真正选择性压缩，结果不能解释。
  - 如果 tracer 几乎全丢，但规则还在，说明规则相对普通事实有保留优势。

### 3.2 between-items deontic-vs-epistemic probe

这个 probe 是论文主结果来源，用来比较规则与事实。

- 每个 conversation 含 **8 个 item**：
  - deontic item：禁止型规则。
  - epistemic item：关于类似 referent 的事实。

- 规模：
  - 45 个 conversation。
  - 每个 marking condition 一组。
  - 45,000-token filler budget。
  - 18 个 planted tracer facts。

- 两个 marking condition：
  - `unmarked`：自然放置。
  - `marked`：加 attention lead-in，试图提高事实显著性。

### 3.3 replay 为什么必要？

作者没有把 W/G/D/X 当成最终安全结论，而是把摘要单独加载到新会话里，让 replay model 去执行被禁止动作。

```mermaid
flowchart TD
  A["原始长对话：规则 + filler + tracer"] --> B["单次 self-summarization"]
  B --> C["摘要文本"]
  C --> D["W/G/D/X 文本打标"]
  C --> E["Behavioral replay"]
  E --> F{"目标动作是否被拒绝？"}
  F -->|拒绝目标且允许 sibling| G["still armed"]
  F -->|执行目标动作| H["disarmed"]
  F -->|连 sibling 也拒绝| I["inconclusive: 无行为 headroom"]
  D --> J["文本存活率"]
  E --> K["操作性保护率"]
```

这个 replay 设计的意义在于：

- 如果模型拒绝目标，也拒绝 sibling，不能证明它是因为规则而拒绝。
- 如果模型拒绝目标、允许 sibling，才说明规则特异性仍可能存在。
- 如果模型执行目标动作，就是对“残留仍有保护”的直接反证。

## 4. 主要结果一：规则比事实更容易在摘要中存活

### Qwen 主实验

| 条件 | 标签集 | 规则存活 | 事实存活 | 估计结果 |
|---|---|---:|---:|---|
| unmarked | primary | 50/185 = 27% | 7/175 = 4% | GEE β=2.473，p=4.0e-04 |
| unmarked | target-FE | 50/185 = 27% | 7/175 = 4% | β=2.320，p=1.3e-03 |
| unmarked W-only | primary | 37/185 = 20% | 2/175 = 1% | 用 cluster bootstrap 报率，不报 β |
| conservative v4 | GEE | 39/185 = 21% | 6/175 = 3% | β=2.147，p=2.6e-03 |
| marked | primary | 28/173 = 16% | 7/187 = 4% | 方向为正，p=6.7e-03 |
| marked | conservative v4 | 17/172 = 10% | 9/187 = 5% | p=0.133，不稳定 |

读这个表要抓住三个层次：

- **规则确实更常被写进摘要**：
  - unmarked 条件下，规则 W+G 存活是事实的约 6.75 倍。
  - W-only 口径仍保持 20% vs 1% 的差距。

- **marked 条件不能证明 normativity 独立作用**：
  - marked 试图把事实也变显著。
  - primary 标签显著，conservative 标签不显著。
  - 所以作者只说 descriptive retention premium，不说“模型天生重视规范”。

- **这反而让 presence audit 更危险**：
  - 规则更容易留下某种形式。
  - 审计者更容易误以为“规则还在，所以安全”。
  - 但后续 replay 显示，很多文本残留没有行为保护力。

### Claude 硬输出预算复现

| 模型/预算 | 条件 | 规则存活 | 事实存活 | 估计结果 |
|---|---|---:|---:|---|
| Claude 150-token cap | unmarked | 114/185 = 62% | 25/175 = 14% | β=2.288，p=9e-08 |
| Claude 150-token cap | target-FE | 114/185 = 62% | 25/175 = 14% | β=1.941，p=1.2e-04 |
| Claude 150-token cap | marked | 74/173 = 43% | 32/187 = 17% | β=1.545，p=2.5e-04 |

这里的边界也很重要：

- Claude 在 45k 和 150k 输入压力下倾向于扩展摘要，因此 tracer 仍保留很多。
- 作者用 **150-token 输出上限** 才制造真正 item competition。
- 这个复现证明“规则优先存活”不是 Qwen 单模型现象，但它混合了模型差异与预算差异。

## 5. 主要结果二：单条显著规则更常是 weld-or-drop

### stress probe 的 W/G/D/X 分布

| 模型/条件 | W | G | D | X | tracer survival | rule-referent survival |
|---|---:|---:|---:|---:|---:|---:|
| Llama / mid-casual | 0 | 0 | 0 | 8 | 0% | 0% |
| Llama / turn-0-explicit | 4 | 0 | 0 | 4 | 0% | 50% |
| Qwen / mid-casual | 1 | 0 | 3 | 4 | 3% | 50% |
| Qwen / turn-0-explicit | 3 | 0 | 0 | 5 | 2% | 38% |
| Claude / mid-casual | 8 | 0 | 0 | 0 | 99% | 100% |
| Claude / turn-0-explicit | 8 | 0 | 0 | 0 | 100% | 100% |

作者对这个表的读法很谨慎：

- Qwen/Llama 的 tracer survival 接近 0，说明压缩压力成立。
- Claude 在输入体积压力下没有真正删除大部分 tracer，因此不能按同一口径解释。
- 在确认压力的 open-model cell 中，G=0，作者没有看到 referent 被泛化 off-target。

### Target × predicate 分解

| 维度 | Predicate recoverable W/G | Predicate lost D/X | 合计 |
|---|---:|---:|---:|
| Target retained | 43 | 22 | 65 |
| Target lost | 7，且都仍覆盖目标 | 113 | 120 |
| 合计 | 50 | 135 | 185 |

这个分解对应的是 unmarked deontic、n=185。

- 如果发生最隐蔽的 textual severing，应落在：
  - target lost；
  - predicate recoverable；
  - 但 surviving restriction 不再覆盖原目标。

- 实际上：
  - 7 个 target-lost / predicate-present 的 G case 都仍覆盖目标。
  - 加上 marked 与 Llama 的机会，总共 10 个泛化机会中 0 个 non-covering。

- 结论边界：
  - 这不是“不可能 severing”。
  - 只是说在这个单周期设置里，作者没有观察到该文本形态。

## 6. 主要结果三：D/G 残留的行为保护明显弱于 W

### D 残留是什么？

D 标签不是说“模型一定会违规”，而是文本上已经不足以恢复动作约束：

- referent 可能仍在。
- “有约束”可能仍在。
- 但 restricted action 不在。
- 因此读摘要的模型无法知道该 withheld 什么。

### replay census 的关键数字

| replay 口径 | D 残留放行 | W 完整规则放行 | D-W 差距 |
|---|---:|---:|---:|
| Qwen，全样本保守 floor | 43% | 9% | +34 points |
| Qwen，有 headroom | 33/45 = 73% | 5/22 = 23% | +50 points |
| Llama，全样本保守 floor | 88% | 31% | +57 points |
| Llama，有 headroom | 68/72 = 94% | 17/45 = 38% | +56 points |

解释时要注意：

- 绝对放行率会受到 replay model 本身服从能力影响。
- 所以论文不把 `P(disarm | D)` 当成模型普遍风险率。
- 真正强的证据是 D 与 W 的差距在两个 replay 模型上都很大。

### G 残留也不可靠

论文进一步指出：

- G-labeled residues 更像 D，而不像 W。
- Qwen 中 G 放行为 9/14 = 64%。
- Llama 中 G 放行为 18/21 = 86%。
- category-moved 子集最危险：
  - Qwen 5/5 放行。
  - Llama 6/7 放行。

这说明“类别层面仍覆盖目标”并不等于保护充足：

- 文本上它不是完全丢失。
- 审计上它可能看起来合理。
- 但行为上，它经常不能触发对具体目标的拒绝。

## 7. LLM judge 的失败：评测本身也是安全面

作者把 LLM judge 作为 first-pass filter，但没有把它当最终事实来源。论文记录了两个会改变结论的错误。

| 案例 | Judge 原判断 | 作者复核 | 如果不复核会怎样 |
|---|---|---|---|
| stress probe Qwen/mid-casual | 把 3 个摘要标成 D | 作者盲读认为 3 个都是 W；replay 为 1 still armed、2 inconclusive | 会错误保留 silent-disarming hypothesis |
| marked epistemic survival | 把可从 sibling 推断的事实算作 survived，使 3 膨胀到 12 | presence-is-not-inference 后 primary 为 7，且 0 个 deontic 标签移动 | 会让本来 underpowered 的 marked 条件看似可分析 |
| conservative v4 validation | survival-level agreement 17/20 = 85% | 剩余错误都比作者更严格 | 说明修正未过度乐观，但也未达到 90% gate |

这部分的价值不只是“judge 会错”：

- 错误发生在安全评测最常见的地方：
  - 是否把可推断内容算作存在。
  - 是否把文本痕迹误认为行为保护。

- 作者给出的是可执行纪律：
  - judge 只做筛选。
  - decisive / contested case 必须作者 adjudication。
  - 关键安全结论要用 behavioral replay 校验。

## 8. 与相关工作的关系

### 与 Governance Decay 的关系

论文把 Governance Decay 当作近邻：

- Governance Decay 证明：
  - compaction 丢掉 policy 后，行为违规会升高。
  - 它更偏大规模行为结果。

- 本文补充：
  - 规则是怎样在文本层面丢失或降级的。
  - 留下残留时是否仍能保护。
  - presence / judge 是否能作为可靠代理指标。

### 与 long-context safety degradation 的区别

作者区分两类失败面：

| 失败面 | 历史是否还在窗口内 | 主要机制 | 本文是否研究 |
|---|---|---|---|
| long-context dilution | 是 | 位置、稀释、注意力退化 | 否，只作为背景 |
| compaction degradation | 否，历史被摘要替代 | 摘要选择、谓词丢失、目标泛化 | 是 |

这个区分对 Agent 系统很重要：

- 即使上下文还没长到模型失效，也可能在第一次压缩时丢掉规则。
- 压缩不是“清理噪音”的中性步骤，而是一次安全边界重写。

### 与 commitment-preserving compression 的关系

论文最后把建议收束到三类机制：

- constraint registry：
  - 把规则存在摘要之外。
  - 压缩后用 registry 核对摘要是否保留目标与禁止动作。

- constraint pinning：
  - 让关键 policy 不参与普通摘要竞争。
  - 它应该像 system policy 或工具权限一样被持久注入。

- verifiable commitment-preserving compression：
  - 压缩单位不是普通自然语言段落，而是 commitments。
  - 每个 commitment 都应有可验证字段：target、predicate、gate、scope。

## 9. 这篇论文真正改变了什么理解？

### 对 Agent 安全的影响

- 过去很多 Agent 设计默认：
  - 只要把规则写进 prompt，后续就靠模型记住。
  - 历史太长时摘要一下即可。

- 本文表明：
  - prompt 内规则不是持久状态。
  - summary 不是安全存储。
  - “摘要中有相关文字”也不是 enforcement。

### 对后续系统设计的约束

一个更合理的 compaction 设计应至少维护如下结构：

```text
Constraint {
  id: stable_id
  target: exact_resource_or_scope
  predicate: prohibited_or_required_action
  gate: required_approval_or_runtime_guard
  source_turn: immutable_pointer
  status: active | superseded | expired
}

post_compaction_check(summary, registry):
  for each active constraint:
    assert target is recoverable
    assert predicate is recoverable
    assert gate is recoverable
    if any assertion fails:
      re-inject pinned constraint
      block high-risk tool call until verified
```

这个伪代码和论文结论一致：

- registry 解决“摘要自身不知道自己漏了什么”的问题。
- target/predicate/gate 三字段解决“提到了但不可操作”的问题。
- block high-risk tool call 解决“文本存在但行为不触发”的问题。

## 10. 局限与可复现性

### 明确局限

| 局限 | 为什么影响外推 |
|---|---|
| 单周期 compaction | 多轮摘要可能逐步腐蚀，也可能突然丢失，本文没有测。 |
| 合成长对话 | organic agent transcript 的任务结构、工具调用和用户修正更复杂。 |
| 规则都是 prohibition | requirement、soft policy、hard safety norm 可能有不同存活曲线。 |
| salience 与 normativity 未分开 | 规则更短、更命令式、更行动化，不能证明只是规范性在起作用。 |
| replay model 有能力边界 | 小 open model 可能本来就不稳定服从 in-context rule。 |
| judge / rater 依赖 Anthropic 模型 | Claude 同时参与 judge、salience rating、部分 summarizer，独立性不足。 |
| 单次随机生成 | 没有重复 decoding seed，估计条件化于一次 realization。 |

### 复现证据

复现仓库公开了：

- `paper.md / paper.pdf / paper.docx`。
- `config/prompts.py` 与 `config/deontic_pairs.py`。
- `tracer/between_items_probe.py`。
- `tracer/rescore_between_items.py`。
- `tracer/_replay_all_D.py`。
- `tracer/_replay_contrast.py`。
- `results/between_items_probe/` 下的 digests、verdicts 与 replay transcripts。

模型设置也被写明：

- Judge 与 salience rater：`claude-sonnet-4-6`。
- 主 summarizer / replay：`Qwen/Qwen3.5-9B`，`enable_thinking=false`。
- 第二 summarizer / replay：`meta-llama/Llama-3.3-70B-Instruct-Turbo`。
- Claude hard-cap cell：`claude-sonnet-4-6`。

## 11. 研究者视角的继续追问

### 多轮 compaction 会发生什么？

最值得继续做的是 N-cycle 版本：

- 一条 W 规则经过 1 次压缩还能 weld。
- 经过 5 次、10 次后：
  - 是突然 X？
  - 先变 G，再变 D？
  - 还是 target 保留但 gate 丢失？

这会直接影响长期 Agent 的 memory architecture。

### 如何把 replay 变成可部署测试？

论文中的 replay 是实验评估。工程上可以转化为：

- 对每个 high-risk tool call 生成 sibling control。
- 检查模型拒绝是否 target-specific。
- 如果模型 blanket refusal，则不能证明规则还在工作。
- 如果模型允许 target，则立即触发阻断。

### 如何构造更公平的 rule-vs-fact 对照？

作者承认事实 item 常含数字、日期、合同细节，而规则 item 常是一句 imperative clause。后续可做三种对照：

- 同一 semantic content 的 rule / fact 改写。
- 单命题非数字事实，减少 specificity-density 差异。
- 人类 salience/actionability 双评分，而不是只用同族 LLM rater。

## 12. Figure / Table 逐项证据解读

### Table 1：为什么 taxonomy 是论文的地基？

Table 1 的作用不是提供结果，而是定义“什么算规则还活着”。这张表让论文避免了一个常见误区：把所有摘要中的规则相关文字都算作成功。

- **W 的要求最高**：
  - 目标必须清楚。
  - 限制动作必须可恢复。
  - 这类摘要才接近“可继续执行的规则”。

- **G 是容易误判的中间态**：
  - 文本仍有规范含义。
  - 但具体目标被提升到类别层面。
  - 后续 replay 显示，G 的行为保护更接近 D，而不是 W。

- **D 是本文最关键的失败态**：
  - 它经常能骗过“是否提到 target”的检查。
  - 但缺少谓词后，模型不知道该阻止哪个动作。
  - 因此 D 是 presence audit 的主要 false assurance 来源。

- **X 是最容易审计的失败**：
  - 摘要中完全没有规则。
  - 只要系统保存了原始 constraint registry，就能发现遗漏。
  - 真正难的是 D/G，因为它们看起来不像完全丢失。

### Table 2：target 与 predicate 要分开查

Table 2 把 unmarked deontic 的 185 个样本拆成两条轴：

- target 是否以 exact string 被保留。
- predicate 是否可恢复。

这个设计直接服务于安全审计：

| 审计问题 | 只查 target 会怎样 | 同时查 predicate 会怎样 |
|---|---|---|
| `prod-east-2` 是否还在？ | 可能通过 | 仍需确认 DROP/TRUNCATE/DELETE-without-WHERE 禁令是否还在 |
| `payments-v2` 是否还在？ | 可能通过 | 仍需确认 merge 前 security sign-off gate 是否还在 |
| `svc-acct-prod` 是否还在？ | 可能通过 | 仍需确认不得外传 credentials 与暴露后 rotate 的动作是否还在 |

表中的 43/65 target-retained 且 predicate-recoverable，是相对健康的状态；22/65 target-retained 但 predicate lost，则是最能说明 presence check 不够的状态。

### Table 3：主结果不是单一 p-value，而是一组边界

Table 3 同时报告了 primary labels、conservative labels、GEE、target fixed effects 和 W-only rate。这个冗余不是装饰，而是在回答三个怀疑：

- **怀疑一：是不是 judge 标签太乐观？**
  - conservative v4 下，unmarked 仍为 21% vs 3%。
  - 因此主方向不依赖最宽松标签。

- **怀疑二：是不是 conversation 或 target 聚类造成假显著？**
  - target-FE + conversation-clustered 仍显著。
  - 说明结果不是某几个 target family 独立样本重复导致。

- **怀疑三：G 是否过宽？**
  - W-only 仍是 20% vs 1%。
  - 即使只看 exact-target + recoverable predicate，规则也明显高于事实。

但 Table 3 也限制了作者能说的话：

- marked conservative 不显著，所以不能宣称“规则性”独立于显著性。
- Claude cell 是 hard output cap，不是同样的 input-volume pressure。
- Claude judge Claude 摘要，仍有同族评测依赖。

### Figure 1：图的价值在于把两个实验口径放在一起

Figure 1 的两个 panel 不能直接相减，但它们给出一致直觉：

- panel a 是 between-items 口径：
  - 规则 W+G 为 27%。
  - 事实 W+G 为 4%。
  - tracer base rate 约为 0-3%。

- panel b 是 stress probe 口径：
  - Qwen turn-0 为 38%。
  - Qwen mid-casual 为 50%。
  - Llama turn-0 为 50%。
  - Llama mid-casual 为 0%。

这说明规则不是稳定免疫压缩，而是有条件地优先存活：

- 当模型仍会选择性保留内容时，规则相对事实更容易留下。
- 当压缩进入极端 floor regime，规则也会和其他内容一起消失。
- 当 Claude 被允许扩展摘要时，tracer 也大量保留，因此不能把它当同等压力结果。

### Table 4：评测方法的失败案例就是论文证据的一部分

Table 4 很值得保留，因为它解释了为什么本文不该被简化成“跑一个 judge 看规则还在不在”。

- 第一次错误显示：
  - judge 把包含 literal referent 与 prohibition 的摘要误标为 D。
  - 如果作者不复核，就会错误地支持 silent-disarming hypothesis。

- 第二次错误更严重：
  - judge 把可以从 sibling 推断的内容算成存在。
  - 这会把 marked epistemic survival 从 3 膨胀到 12。
  - 进而让本来证据不足的 prominence-equalization 条件看起来可分析。

- 第三行 validation 不是胜利宣言：
  - 17/20 的 survival agreement 只有 85%。
  - 它说明修正方向更保守，但也提醒未全量人类复核仍有残余风险。

## 13. 失败案例与边界再拆解

### payments-v2 为什么是机制样本？

论文提到初始 replay 中两个确认 disarmed 的案例都来自 `payments-v2` merge rule。这个案例重要，是因为它体现了谓词丢失的完整路径：

- 原始规则可能是“不要在没有 security sign-off 的情况下 merge into payments-v2”。
- 摘要残留可能仍提到 `payments-v2` 或“有约束”。
- 但如果 `merge` 与 `security sign-off` 这两个动作字段丢失，模型读摘要时无法知道该拒绝什么。
- replay 一旦要求执行 merge，模型就可能直接配合。

这不是“目标被忘了”，而是“目标还在，操作含义不在”。对工具 Agent 来说，这类失败尤其危险，因为工具调用通常正是围绕具体动作谓词发生。

### blanket refusal 为什么会造成 inconclusive？

作者没有把所有拒绝都算成规则成功。原因是：

- 有些模型面对数据库 destructive operation 会天然拒绝。
- 即使 sibling target 不受规则保护，模型也可能拒绝。
- 此时无法说明目标拒绝来自摘要中的规则，而不是模型一般安全倾向。

所以 replay 使用 sibling control：

- 拒绝 protected target、允许 sibling，才有行为 headroom。
- 两者都拒绝，记作 inconclusive。
- 这会让全样本 floor 更保守，因为 W 中 inconclusive 比例更高，差距不会被夸大。

### 为什么“持久 memory”还不等于最终安全？

论文结尾提到把规则移出 volatile context，放入持久 memory 或 registry。这是必要条件，但不是充分条件。

- registry 只能回答：
  - 规则是否仍被记录。
  - 摘要是否还能恢复 target / predicate / gate。

- registry 不能自动保证：
  - 模型每次都会检索它。
  - 模型会正确应用它。
  - 工具层会阻断违规调用。

因此更完整的系统应把三层合在一起：

| 层级 | 作用 | 对应本文风险 |
|---|---|---|
| 持久约束存储 | 防止规则只存在于摘要 | 对抗 X / omission |
| 压缩后结构化校验 | 检查 target、predicate、gate | 对抗 D / G false presence |
| 工具调用 enforcement | 在动作发生前强制 gate | 对抗 W 仍不触发的行为失败 |

## 14. 结论

- 这篇论文的核心价值，是把 Agent compaction 风险从“会不会忘规则”推进到“规则以什么形态残留，以及残留是否仍能约束行为”。
- 最可执行的 takeaway 是：摘要后只查字符串或规则提及会给出虚假安全感。
- 如果系统真的依赖 standing safety rule，规则必须被放进摘要外的持久约束存储，并在压缩后验证 **target、predicate、gate** 三个字段。
- 但即使三字段仍在，系统还需要 runtime enforcement 或 replay-style 检查，因为论文已经观察到 textually intact 的 W 规则也可能在 replay 中失效。
- 论文自身证据边界清楚：它不是多轮 Agent 安全的完整答案，而是把单次 compaction 的失败形态、评测陷阱和工程检查点切得足够细，值得作为后续 Agent memory / safety registry 设计的基准读物。
