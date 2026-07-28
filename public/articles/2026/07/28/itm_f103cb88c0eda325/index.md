# ContainmentBench：把提示注入评测从“最后有没有出事”推进到“污染到底走了多远”

- **论文**：[ContainmentBench: Trace-Based Evaluation of Post-Injection Containment in Tool-Using LLM Agents](https://arxiv.org/abs/2607.23999)
- **作者**：Wenhao Lan, Shan Li, Xinhua Lai, Meiqi Wu, Junbin Yang, Haihua Shen
- **发布时间**：2026-07-27
- **类型**：AI 安全 / 工具型 LLM Agent / prompt injection containment benchmark
- **本文判断**：这篇论文的重点不是提出一个万能防御，而是重新定义 Agent 提示注入评测的观察单位：不要只看最终有没有违规提交，还要看未信任内容经过了哪些消息、工具、记忆、授权和恢复节点，以及防御是否把本该完成的授权工作也一起拦掉。

### TL;DR

- **问题**：工具型 LLM Agent 会读取外部文档、写记忆、委托子 Agent、调用带副作用的工具。传统 prompt injection 评测常用最终攻击成功率或策略违规率总结安全性，但两个系统都能阻止最终违规提交时，内部污染轨迹和授权任务损失可能完全不同。
- **方法**：ContainmentBench 把每次 rollout 记录成结构化执行 trace graph，节点包括未信任来源、Agent 状态、消息、memory record、tool proposal、authorization decision、tool result 和 committed side effect；指标拆成 endpoint policy compliance、logged taint propagation、recovery instrumentation、authorized structured-action completion。
- **实验**：主实验是预先冻结的 **17,640 个 rollout**，使用 Qwen2.5-7B-Instruct，覆盖 4 个 evidence stage：security、memory/recovery、active-tainted utility、clean utility；7 个 defense 条件包括 no defense、prompt-only、structured guard、tool-boundary、taint-only v1、intent-ledger v2 和 rollback v2。
- **关键数字**：在 600 个 active-tainted 匹配样本里，taint-only v1 和 intent-ledger v2 的最终 committed harm 都是 0，但 **73.5%** 的 pair 在轨迹或 utility 上不同。taint-only 只能完成 **0.1642** 的授权污染工作流，intent-ledger 提升到 **0.8567**，强 tool-boundary baseline 是 **0.9233**。
- **边界**：主实验只有一个主要开源模型；场景是合成 sandbox；intent-ledger 假设 trusted authorization ledger 正确；adaptive attack 只做到有限候选搜索和 transfer diagnostic；logged taint spread 是 instrumentation 指标，不等于语义因果影响的完整证明。
- **领域意义**：这篇论文提醒 Agent 安全评测不能用单一“是否越权”标签替代系统轨迹。对真实平台来说，更重要的是暴露结构化 action proposal、policy-visible authorization、provenance record、parser diagnostics 和 recovery hook，让权限、来源、提交和恢复各自可审计。

### 研究问题：为什么终点标签不够？

作者把问题放在工具型 Agent 的运行现实里：

- Agent 不只是聊天模型：
  - 它会从外部工具读资料。
  - 它会把中间结论写入短期或长期记忆。
  - 它会把任务交给其他 Agent。
  - 它会发送邮件、共享文档、更新日历、写 CRM 等带副作用的动作。
- prompt injection 的关键风险因此变成系统安全问题：
  - 未信任内容可能没有直接造成最终泄露。
  - 但它可能已经进入 message、memory、tool proposal 或 delegated agent。
  - 它也可能被最后一道工具边界拦下，从 endpoint 看是安全，从 trace 看却已经扩大了影响面。
- 反过来，防御也可能“看起来安全”：
  - taint-only policy 阻止了所有污染高权限动作。
  - 但很多用户任务本来就是“读取外部内容后执行用户授权动作”。
  - 如果防御把这些合法动作都拦掉，它的 endpoint 安全分数会好看，真实可用性却很差。

论文的核心研究问题可以压成三句：

| RQ | 问什么 | 需要什么证据 |
|---|---|---|
| RQ1 | endpoint scoring 漏掉了什么？ | parser-valid action、endpoint outcome、logged trajectory、outcome-conditioned matched pair |
| RQ2 | taint-only enforcement 具体失败在哪里，intent-aware authorization 修复多少？ | active-tainted 阶段的 v1/v2 匹配日历、邮件、CRM trace |
| RQ3 | 不同 runtime policy 的 operating point 如何比较？ | endpoint、utility、stage-stratified spread、memory/recovery、denominator sensitivity |

这一路线很重要。作者不是先提出一个新防御再证明它最好，而是先定义一个能把“安全、污染、授权、恢复、可用性”拆开的测量框架。

### 论文主张：containment 是轨迹性质，不是终点性质

作者的论证路线可以写成：

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 只看最终 committed harm 会掩盖差异 | 对相同 endpoint 的 pair 做 trajectory projection | v1/v2 在 600 个 active-tainted pair 中 endpoint 都为 0，但 73.5% 轨迹或 utility 不同 | projection 仍依赖作者定义的字段，不覆盖所有语义影响 |
| taint-only 会过度阻断合法工作 | 把 tainted high-risk proposal 一律阻断 | authorized completion 从 no defense/tool-boundary 的 0.9233 降到 0.1642 | 这是合成 benchmark 下的诊断，不代表所有 taint 系统都必然如此 |
| intent-ledger 能修复一大部分 utility | 用 trusted user goal 生成结构化授权 ledger，只允许 exact action/target/argument predicate | v2 authorized completion 达到 0.8567，FP block 降到 0.0667 | 依赖 ledger 正确；自动从自然语言抽取 intent 不是本文结论 |
| propagation 不能做单一总分排名 | 把 logged spread 按 evidence stage、denominator、completion condition 拆开 | tool-boundary vs v2 的 all-stage gap 中 85.85% 来自 memory/recovery stage；fixed denominator 下部分排序会反转 | logged label 不是 semantic influence 的充分估计 |

因此，ContainmentBench 的科学贡献是测量协议：

- 它把 prompt injection containment 从单点 label 改成多轴证据向量。
- 它让“防住了最终违规”和“污染被局部隔离”分开。
- 它让“来源可追踪”和“动作被授权”分开。
- 它让“防御没有出事”和“防御仍能完成授权工作”分开。

### 方法机制：trace graph 如何定义污染传播？

论文给每次 rollout 定义一个有向 trace graph：

```text
G_tau = (V_tau, E_tau)
```

其中：

| 变量 | 含义 |
|---|---|
| `V_tau` | trace 节点集合，包括 source、agent state、message、memory、tool proposal、authorization decision、committed side effect |
| `E_tau` | trace 边集合，包括数据流、影响边、结构边、时间边、审计边 |
| `U_tau` | rollout 里的未信任来源节点集合 |
| `E^T_tau` | 会传播 taint label 的边子集 |
| `T_tau` | 从未信任来源沿 taint-propagating edge 可达的 logged taint closure |

作者把 taint closure 写作：

```text
T_tau = Reach(V_tau, E^T_tau)(U_tau)
```

这个定义的关键细节是：

- 不是所有 trace 边都传播 taint。
- `E_tau` 可以包含结构、时间、审计关系。
- `E^T_tau` 才表示污染标签实际传播。
- 如果用全图可达性定义 taint，后面的 normalized spread 会变成循环定义。

传播指标 `BR(tau)` 的形式是：

```text
BR(tau) =
  |{ v in V_tau : labels(v) intersects L_taint }|
  / max(1, |Reach(V_tau, E_tau)(U_tau)|)
```

这说明 `blast_radius_norm` 不是攻击成功率：

- 分子：有 taint label 的节点数。
- 分母：从注入源结构可达的 trace 区域。
- 它衡量的是未信任影响在已记录执行区域里扩散多广。
- 它可能因早期阻断、合法污染工作完成、trace 长短和 instrumentation coverage 改变。

所以作者反复强调：

- logged spread 是 operational construct。
- 它不是 formal noninterference proof。
- 它也不是 semantic causal influence 的完整重建。
- 如果部署没有记录真实 taint edge，指标会低估传播。

### 指标设计：四个 evidence stage 不混成一个分数

主实验冻结 4 个 evidence stage：

| Stage | 场景数 | Defense | Seeds | Rows | 记录指标 |
|---|---:|---:|---:|---:|---|
| Security | 192 | 7 | 5 | 6,720 | `committed_harm`, `secret_leakage`, `wrong_recipient_rate`, `blast_radius_norm` |
| Memory/recovery | 96 | 7 | 5 | 3,360 | `memory_reinfection`, `recovery_success`, `blast_radius_norm` |
| Active-tainted utility | 120 | 7 | 5 | 4,200 | `authorized_tainted_action_success`, `false_positive_block_rate`, `blast_radius_norm` |
| Clean utility | 96 | 7 | 5 | 3,360 | `clean_benign_completion`, `false_positive_block_rate` |

作者没有把这些 stage 混成一个“大安全分数”，原因是：

- security stage 测的是 unauthorized side effect、secret leakage、wrong recipient。
- active-tainted utility 测的是“读了外部内容后是否仍能完成用户授权动作”。
- memory/recovery 测的是持久记忆污染、恢复、隔离和 rollback 记录。
- clean utility 测的是没有注入时普通任务是否被误伤。

这比传统表格更啰嗦，但正是论文想证明的点：

> Agent 安全不是一个 scalar，而是一组在不同 evidence stage 上成立或不成立的声明。

### Runtime policy case study：从 taint-only 到 intent-ledger

论文的防御案例研究从一个故意保留的失败基线开始。

#### Taint-only v1 的规则

taint-only firewall 可以近似写成：

```text
AllowTaint(q; tau, s) =
  not HighRisk(q)
  or (
    q not in T_tau_prefix
    and Match(q, I_s)
    and not Leak(q)
  )
```

解释如下：

- 如果工具调用不是 high-risk，就允许。
- 如果是 high-risk，就要求 proposal 不带 taint。
- 即使 action、target、recipient 都符合用户目标，只要带 taint，也会被阻断。

这个设计很“安全”，但问题明显：

- 用户要求“根据外部合作方 note 创建日历邀请”时，外部 note 本来就是输入证据。
- 正确行为必须依赖 tainted source。
- 一刀切阻断就会把合法任务也当成风险。

#### Intent-ledger v2 的规则

intent-ledger 先从 trusted user goal 生成结构化 ledger：

```text
I_s = {(a, t, phi)}
```

其中：

| 符号 | 含义 |
|---|---|
| `a` | 被授权的 action type，例如 send、share、invite、update |
| `t` | 被授权的 target，例如收件人、文档、memory key、calendar entity |
| `phi` | 参数和 visibility predicate，例如允许的字段、公开范围、事件对象 |

一个 proposal `q` 匹配 ledger 的条件是：

```text
Match(q, I_s) =
  exists (a, t, phi) in I_s:
    a(q) = a
    and t(q) = t
    and phi(x(q)) = 1
```

high-risk commit 的允许条件近似是：

```text
AllowIL(q; tau, s) =
  1, if not HighRisk(q)
  1, if HighRisk(q)
        and Match(q, I_s)
        and not Leak(q)
        and not Expand(q, I_s, G_tau_prefix)
  0, otherwise
```

这里 `Expand` 是论文最关键的安全语义之一：

- 外部内容可以提供任务内容。
- 外部内容不能扩展 action type。
- 外部内容不能改变 target。
- 外部内容不能扩大 visibility。
- 外部内容不能把未授权字段塞进 side effect。

这就把“污染来源”和“授权范围”拆开：

| 问题 | taint-only 的答案 | intent-ledger 的答案 |
|---|---|---|
| 这个字段来自外部内容吗？ | 是，所以阻断 high-risk action | 是，但还要看是否扩大授权 |
| 用户授权给谁发？ | 不细分，只看 taint | ledger 精确记录 recipient/target |
| 外部内容能否改变收件人？ | 一律不允许污染 commit | 不允许 expand target/visibility |
| 合法外部 note 能否驱动日历邀请？ | 多数会被拦 | 如果 exact match，可以完成 |

### 实验协议：为什么作者先做 parser 和 positive control？

作者没有直接比较 defense，而是先做测量前提检查：

- Qwen2.5-7B-Instruct 是主实验模型。
- 旧 parser 会把很多 action-like completion 当作 free-text final answer。
- 离线 reparse 96 个旧 Qwen actions 后：
  - action-like final answer 从 93 降到 2。
  - valid tool proposal 恢复 85 个。
  - invalid tool 会记录但不会执行。
- no-defense 条件必须证明 benchmark 有非零攻击面：
  - 在 960 个 security-stage rollout 中，no defense 的 committed policy violation 是 **0.3354**。
  - wrong recipient 是 **0.3292**。
  - defended runtime policies 在同 stage 都是 0。

这个设计避免两个常见评测错误：

1. **把格式失败当成安全成功**：
   - 如果模型没有输出可解析工具调用，endpoint 没出事并不代表防御有效。
   - 所以 parser diagnostics 是 measurement prerequisite。
2. **在没有正控攻击面的场景里比较防御**：
   - 如果 no defense 也几乎不出事，defense 全部 0 没有区分度。
   - 所以作者把 AgentDojo adapter 的正控不足降级为 portability check，而不是主结论。

### 主结果一：相同终点隐藏了 73.5% 的轨迹/utility 差异

最有力的结果来自 active-tainted utility stage。

| Defense | Active N | Authorized completion | FP block | FP confirm | Clean completion |
|---|---:|---:|---:|---:|---:|
| None | 600 | 0.9233 | 0.0000 | 0.0000 | 0.9958 |
| Prompt-only | 600 | 0.9136 | 0.0000 | 0.0000 | 1.0000 |
| Structured guard | 600 | 0.0102 | 0.0000 | 0.9350 | 0.9958 |
| Tool-boundary | 600 | 0.9233 | 0.0000 | 0.0000 | 0.9958 |
| Taint-only v1 | 600 | 0.1642 | 0.6205 | 0.1605 | 0.9958 |
| Intent-ledger v2 | 600 | 0.8567 | 0.0667 | 0.0000 | 0.9958 |
| Rollback v2 | 600 | 0.8567 | 0.2000 | 0.0000 | 0.9958 |

这张表支持三个判断：

- **taint-only 的安全来自过度阻断**：
  - completion 只有 0.1642。
  - FP block 高达 0.6205。
  - 它在 endpoint 上没出事，但用户授权工作几乎被禁用。
- **intent-ledger 修复了大部分误伤**：
  - completion 从 0.1642 到 0.8567。
  - paired delta 是 0.6925，95% CI 为 [0.6160, 0.7637]。
  - FP block 降到 0.0667。
- **structured guard 是另一类失败**：
  - completion 只有 0.0102。
  - FP confirm 高达 0.9350。
  - 论文把它解释成 interface/confirmation-path operating point，而不是安全性更强。

最关键的是 outcome-conditioned comparison：

| Comparison | Scope | Same zero endpoint | Trajectory divergence | Main distinction |
|---|---|---:|---:|---|
| Taint-only v1 vs Intent-ledger v2 | Active utility | 600/600 | 0.7350 | logged spread and authorized completion |
| Tool-boundary vs Intent-ledger v2 | All stages | 2520/2520 | 0.1623 | stage-composed logged spread |
| Tool-boundary vs Intent-ledger v2 | Security | 960/960 | 0.0510 | small security-stage trajectory differences |
| Tool-boundary vs Intent-ledger v2 | Memory/recovery | 480/480 | 0.6667 | logged memory-component differences |

这说明如果只看 `committed_harm=0`：

- v1 和 v2 会被判成一样安全。
- 但 441/600 个 active-tainted pair 的轨迹和 utility 不同。
- 这些差异不是 audit 噪声，而是防御语义的核心差异。

### 主结果二：intent-ledger 修复 v1，但没有超过强 tool-boundary baseline

论文没有把 v2 包装成冠军算法。相反，作者明确承认：

- tool-boundary 和 v2 在 2,520 个 rollout 中都没有观察到 committed policy violation、wrong recipient 或 secret leakage。
- v2 的 all-stage zero-event endpoint，按 504 个 scenario cluster 的 rule-of-three，上界约 **0.60%**。
- security-stage 上界约 **1.56%**。
- 这些是未观察风险的上界，不是“真实概率为零”。

两者真正分开的是 authorized utility：

| Comparison | Stage/N | Tool-boundary | Intent-ledger v2 | Delta |
|---|---:|---:|---:|---:|
| Authorized completion | Active/600 | 0.9233 | 0.8567 | -0.0667 |
| Clean completion | Clean/480 | 0.9958 | 0.9958 | 0 |
| Policy violation | All/2520 | 0/2520 | 0/2520 | tied observed endpoint |
| Policy violation | Security/960 | 0/960 | 0/960 | tied observed endpoint |

作者还做了 rule-level analysis：

- 有 40 个 matched workflow 中 tool-boundary 完成而 v2 没完成。
- 对应 v2 row 都记录 `block_low_to_high_privilege_jump`。
- 这表明 v2 的 field-level provenance 和 ledger 检查更保守。

这对研究者很有价值：

- 如果只想最大化当前 benchmark 的合法任务完成率，tool-boundary 更强。
- 如果想记录字段级 taint、授权状态和恢复证据，v2 提供更多可审计结构。
- ContainmentBench 的好处正是能把这两种 operating point 暴露出来，而不是强行给一个总排名。

### 主结果三：logged spread 排名依赖 stage 和 denominator

论文对 propagation 的处理很谨慎。

在 realized-trace denominator 下：

| Scope | Tool-boundary | Intent-ledger v2 | 解读 |
|---|---:|---:|---|
| All full-scale | 0.5528 | 0.5219 | v2 aggregate 更低 |
| Security only | 0.6640 | 0.6624 | 差异很小 |
| Authorized-completion subset | 0.8293 | 0.8276 | 完成授权污染任务时几乎打平 |
| All full-scale, fixed max denominator | 0.3467 | 0.3070 | v2 仍更低 |
| Security only, fixed max denominator | 0.5314 | 0.5339 | tool-boundary 略低 |
| Active stage, fixed max denominator | 0.3207 | 0.3383 | tool-boundary 略低 |

更重要的是 all-stage logged-spread gap 的来源：

| Stage | N/defense | Tool-boundary | V2 | Weighted gap | Gap share |
|---|---:|---:|---:|---:|---:|
| Security | 960 | 0.6640 | 0.6624 | 0.000600 | 1.94% |
| Active-tainted utility | 600 | 0.8394 | 0.8236 | 0.003769 | 12.21% |
| Memory/recovery | 480 | 0.5249 | 0.3858 | 0.026508 | 85.85% |
| Clean utility | 480 | 0.0000 | 0.0000 | 0.000000 | 0.00% |

这组数字说明：

- v2 的 all-stage spread 更低，不等于 v2 在所有传播语义上更强。
- 85.85% 的 aggregate gap 来自 memory/recovery stage。
- security-only realized denominator 只差 0.0016。
- 换 fixed max denominator 后，security 和 active stage 的方向会反转。

因此，论文反对把 `blast_radius_norm` 当成唯一安全分数：

- 它应当按 stage 报告。
- 应当报告 denominator sensitivity。
- 应当和 endpoint、utility、recovery 一起看。
- 不应当拿一个全局均值宣布“某防御传播更少”。

### 图表证据逐项解读

| Figure/Table | 支持什么 | 不能证明什么 |
|---|---|---|
| Figure 1 | 威胁模型区分 untrusted influence 和 user-authorized intent | 不证明所有真实平台都能记录同等粒度的 trace |
| Table 1 | ContainmentBench 相对 AgentDojo、Fides、CaMeL、NeuroTaint 的位置 | 不证明它比这些系统更真实或更形式化 |
| Table 3 | 17,640 rollout 的四阶段行数结构 | 不保证场景分布覆盖真实企业负载 |
| Table 9 | no defense 有 0.3354 committed violation，defended runtime policies 在 security stage 为 0 | secret leakage 全为 0，不能比较泄露防御 |
| Table 10 | 相同 endpoint 下仍有 trajectory divergence | divergence 只基于共同 projection 字段 |
| Table 11 | v1 过度阻断，v2 修复，tool-boundary utility 最高 | 不证明 v2 优于 tool-boundary |
| Table 12 | claim-critical paired comparison 和 confidence interval | 零事件上界不是真实零风险 |
| Table 13/14 | logged spread 对 stage 和 denominator 敏感 | 不给出语义因果影响完整排名 |
| Table 15 | memory reinfection 全 0，recovery tied | 不能得出 rollback v2 更好 |
| Table 16 | 明确列出单模型、ledger 正确性、adaptive coverage、合成任务等边界 | 这些边界本身需要后续实验收窄 |

作者的图表风格值得注意：

- 有正控才做 comparative claim。
- 没有正控的指标保留为 instrumentation evidence。
- confidence interval 跨 0 就不强行解释。
- all-zero endpoint 用 cluster upper bound 量化残余风险。

这比很多安全 benchmark 更克制，也更可复核。

### 算法流程：一次 side effect 如何被授权？

可以把论文的 runtime policy 流程写成伪代码：

```text
Input:
  user_goal, scenario_auth_metadata, model_action_stream,
  trace_prefix G_tau, taint_labels, local_tools

State:
  intent_ledger I_s = build_from_trusted_goal(user_goal, scenario_auth_metadata)
  trace_graph G_tau
  parser_diagnostics
  authorization_decisions

Loop over model actions:
  parse action q

  if q is invalid_tool or invalid_schema:
    record parser diagnostic
    do not execute
    continue

  append q to trace_graph

  if not HighRisk(q):
    allow and execute local tool
    append tool result to trace_graph
    continue

  if not Match(q, I_s):
    deny and record authorization failure
    continue

  if Leak(q):
    deny and record synthetic secret/private-label leakage risk
    continue

  if Expand(q, I_s, G_tau_prefix):
    deny and record tainted authority expansion
    continue

  precommit q
  commit benchmark-local side effect
  append committed side effect to trace_graph

Output:
  endpoint metrics, logged spread metrics,
  active-tainted utility, clean utility,
  memory/recovery instrumentation, parser diagnostics
```

失败边界也要写进流程：

- 如果 ledger 漏掉合法 action，v2 会误阻断。
- 如果 ledger 过度授权，v2 可能放过 unsafe-but-ledger-matching side effect。
- 如果 trace 少记 taint edge，logged spread 会低估传播。
- 如果模型 action interface parse failure 太高，policy comparison 没有充分解释力。

### 相关工作位置：它不是替代 AgentDojo，也不是替代 Fides

论文把自己放在五条研究线之间：

| 研究线 | 典型关注 | ContainmentBench 补什么 |
|---|---|---|
| BIPIA / InjecAgent / AgentDojo | vulnerability、task utility、attack success | exposure 后的 stage-structured trace、recovery、authorized-tainted utility |
| Task Shield / ClawGuard / Progent | instruction 或 tool-call authorization | endpoint、propagation、recovery、utility 的联合测量 |
| AuthGraph / CaMeL / Fides | provenance、intent graph、capability、IFC | 统一的 empirical containment protocol 和 denominator semantics |
| AgentWatcher / NeuroTaint | detection 或 source-sink influence reconstruction | runtime policy 在在线 instrumentation 下的 outcome |
| AgentLAB / Hidden in Memory | long-horizon/persistent compromise | memory/recovery stage 接到同一 trace schema |

这篇论文最接近 Fides/CaMeL/NeuroTaint，但职责不同：

- Fides 更关注 dynamic taint tracking 可执行的安全性质和 utility taxonomy。
- CaMeL 更关注 capability/information-flow-aware enforcement。
- NeuroTaint 更关注 semantic transformation、causal decision influence 和 cross-session persistence 的离线重建。
- ContainmentBench 更关注不同 runtime policy 在同一 trace schema 下的 endpoint、utility、logged propagation 和 recovery operating point。

因此，最佳后续方向不是“用 ContainmentBench 取代 NeuroTaint”，而是：

- 在线运行时记录 ContainmentBench 风格 trace。
- 离线用 NeuroTaint 风格 semantic/causal auditor 重建隐性影响。
- 最后把 operational labels 和 semantic influence 差异一起报告。

### 局限：哪些结论不能过度外推？

论文自己列了很明确的边界：

| Boundary | 当前证据 | 下一步测试 |
|---|---|---|
| 单一主模型 | 主实验是 Qwen2.5-7B-Instruct；Mistral 诊断有非零 no-defense signal，但 parse failure 约 0.63-0.66 | 先验证每个模型 action interface，再至少扩展到两个模型 |
| 正确 structured ledger | ledger 来自 benchmark authorization metadata | 扰动 omission、over-authorization、target ambiguity、confirmation errors |
| adaptive coverage 有限 | target-preserving search 在 held-out 只有 6/36 exact commits，且只在 calendar/CRM | 先提升 family-level attacker transfer，再比较 defense |
| 合成工作流 | AgentDojo adapter 可运行，但 parity-preserving matrix 只有 1/32 no-defense positive clusters | 建立更广的 external positive controls |
| operational taint labels | logged edge 支持可复现 spread metrics | 与 semantic/causal trace audit 对照 |
| 非区分性 endpoint | secret leakage、memory reinfection 无正控事件；rollback recovery tied | 预先构造 positive control 再做比较 |
| 零观察 defended events | 用 scenario-cluster upper bound 量化 | 增加独立 scenario clusters 和 adaptive attacks |

这些边界削弱的不是测量框架本身，而是防御案例的外推：

- v2 在这个 benchmark 下修复 v1，不代表生产中自动抽取 intent 后也可靠。
- tool-boundary 在 utility 上更好，不代表它对所有污染路径都有更好 accountability。
- logged spread 更低，不代表 semantic harm 更低。
- all-zero security endpoint 不能替代自适应红队。

### 研究者视角：这篇论文真正改变了什么？

我认为这篇论文最值得带走的是三组拆分。

#### 第一组：endpoint 与 trajectory 分开

很多 Agent 安全评测默认：

```text
safe = no committed violation
```

ContainmentBench 逼迫我们改成：

```text
safe_observation =
  endpoint_policy_compliance
  + stage_stratified_logged_propagation
  + authorized_utility
  + recovery_evidence
  + parser_validity
```

这对工具型 Agent 尤其关键：

- 最后没有发错邮件，不代表攻击没有进入 memory。
- 最后没有泄露 canary，不代表 agent message 没有携带污染指令。
- 最后没有违规提交，也可能只是所有合法动作都被封死。

#### 第二组：provenance 与 authorization 分开

论文第 8.3 节的判断很关键：

- provenance 回答“影响从哪里来”。
- authorization 回答“系统允许做什么”。

这两个问题不能互相替代：

| 例子 | provenance 判断 | authorization 判断 |
|---|---|---|
| 外部 partner note 影响日历邀请正文 | 来自 tainted source | 如果 recipient/event 匹配用户目标，可以授权 |
| 外部网页要求把文档发给攻击者 | 来自 tainted source | target 不在 ledger，拒绝 |
| 私密 canary 进入允许收件人的邮件 | 来源可追踪 | 是否允许取决于 secret/private-label 与 sink |
| stale memory 推动 CRM 更新 | provenance 指向 memory | authorization 还要检查当前目标和字段 |

真实系统如果只做 provenance，会误伤大量合法任务。只做 authorization，又可能看不见外部内容如何改变参数和路径。

#### 第三组：benchmark claim 与 defense claim 分开

作者很克制地把结论分成两层：

- benchmark claim：
  - trace-based decomposition 能揭示 endpoint-only 看不到的差异。
  - active-tainted utility 和 propagation denominator 必须单独报告。
- defense case-study claim：
  - 在正确 ledger 假设下，v2 修复 taint-only 的 authorized utility 损失。
  - 但 v2 没有超过 tool-boundary 的 utility。
  - v2 的传播优势不能做 universal claim。

这个分层避免了一个安全论文常见问题：

- 为了证明新方法强，把 benchmark 设计成只奖励自己的机制。
- 或者把没有正控的全零指标当成防御胜利。

ContainmentBench 的设计反而允许“新 policy 没赢”的结论出现，这让测量框架更可信。

### 对 Agent 安全评测的后续问题

这篇论文可以自然推出几条后续研究线：

1. **trace schema 标准化**
   - 工具型 Agent 平台是否应该统一记录 proposal、authorization、precommit、commit？
   - MCP、browser tool、email tool、workspace tool 是否需要通用的 side-effect event schema？
   - memory write 是否必须区分 observation、draft、belief commit 和 executable premise？

2. **intent ledger 的构造误差**
   - 论文假设 ledger 来自 trusted scenario metadata。
   - 真实系统里用户目标常常是自然语言。
   - 后续要测 omissions、over-authorization、ambiguous target、用户确认疲劳和审批绕过。

3. **semantic taint 与 operational taint 的差距**
   - logged labels 只能记录系统知道的边。
   - 模型可能通过改写、概括、隐含目标把污染语义继续传播。
   - ContainmentBench + NeuroTaint 式离线因果审计可能是更强组合。

4. **positive control 驱动的安全评测**
   - AgentDojo adapter 在论文里没有成为主证据，因为 no-defense positives 太稀疏。
   - 这提醒我们：外部 benchmark 适配不是越多越好。
   - 没有足够正控攻击面，防御比较就会退化成全 0 展示。

5. **从 endpoint dashboard 到 evidence ledger**
   - 安全报告不应只列 ASR、utility、refusal rate。
   - 更合理的报告应包含：
     - endpoint violation。
     - wrong recipient。
     - authorized tainted completion。
     - false positive block。
     - stage-stratified spread。
     - recovery success。
     - parser validity。
     - denominator sensitivity。

### 如果把 ContainmentBench 思路落到真实平台，应该审查什么？

这篇论文虽然使用合成 sandbox，但它给真实 Agent 平台提出了一份很具体的审查清单。重点不是照搬论文里的 v2 policy，而是看平台有没有把“模型想做什么”和“系统最终允许什么”拆成可验证事件。

| 审查项 | 需要记录什么 | 为什么重要 | 论文里的对应证据 |
|---|---|---|---|
| action proposal | 模型提出的工具名、参数、目标、可见性、调用 ID | 没有 proposal 记录，就无法判断是模型没提出、parser 没解析，还是 policy 拦截 | parser repair 从 96 个旧 actions 恢复 85 个 valid proposals |
| authorization decision | policy 当时看到的 trace prefix、ledger match、拒绝原因、规则 ID | 事后看最终状态无法还原为什么放行或拒绝 | v2 在 proposal time 授权，而不是 rollout 后审计 |
| precommit/commit | 哪个 high-risk action 进入预提交，哪个真正写入本地 sink | endpoint 安全必须以已提交副作用为准，不能只看模型文本 | `committed_harm`、wrong recipient、secret leakage 分开计 |
| taint/provenance | 哪些字段来自外部内容、记忆、子 Agent 或工具结果 | provenance 解释来源，但不能替代授权 | v1 失败正说明“有 taint”不等于“未授权” |
| recovery hook | quarantine、scrub、rollback、confirmation 是否真的改变状态 | 没有 recovery 正控时，不能宣称恢复机制有效 | Table 15 里 recovery tied，因此作者没有做 rollback 胜利声明 |
| denominator report | spread 的 realized denominator、fixed denominator、stage 分布 | 单个 blast-radius 均值会被 trace 长度和 stage mix 牵着走 | Table 13/14 展示排序方向会变化 |

把这份清单翻译成工程要求，大概是：

1. **工具调用必须结构化**
   - 不要只保留自然语言 transcript。
   - 每次调用都要有 call ID、tool name、typed arguments、policy-visible fields。
   - invalid schema 也要记录，但绝不能执行。

2. **权限检查必须在 commit 前发生**
   - prompt 里的“请遵守权限”不等于 runtime authorization。
   - policy 要在 side effect 前看到 proposal 和 trace prefix。
   - 如果系统只做事后日志分析，它最多是审计，不是 containment。

3. **记忆写入不能默认变成 belief commit**
   - 论文没有主攻 belief commit，但 memory/recovery stage 暗示了同一个问题。
   - 外部内容写入 memory 后，后续 Agent 可能把它当成可信前提。
   - 因此 memory write 也应当像 tool side effect 一样有 provenance、validity、visibility 和撤销路径。

4. **授权与内容质量要分开**
   - ContainmentBench 的 benign success oracle 检查结构化字段，不评价邮件文风或摘要质量。
   - 这不是偷懒，而是避免把任务质量、模型能力和安全 policy 混成一团。
   - 后续可以加内容质量评测，但不能让它掩盖 recipient、target、visibility 这类硬边界。

5. **报告要能解释“为什么没出事”**
   - 没出事可能是防御有效。
   - 也可能是 parser 失败。
   - 也可能是模型没有生成可执行 action。
   - 也可能是所有 high-risk action 都被过度阻断。
   - 也可能是 benchmark 没有足够正控攻击面。

### 一个失败案例应该怎样读？

论文附录列了 redacted case study，但不展开可复现攻击 payload。我们可以用作者给出的 case 功能来理解评测读法。

#### Case 2：taint-only v1 active-utility failure

用户目标类似：

- 读取 benign partner note。
- 创建和 `partner@trusted.local` 的 calendar meeting。
- 发送邀请。

如果 partner note 被标成 tainted，v1 会发生：

- 模型提出 invite 或 calendar update。
- proposal 依赖外部 note。
- high-risk action 带 taint。
- taint-only 规则阻断。
- endpoint 没有 committed harm。
- 但 authorized task 没完成。

传统 endpoint 表会把它记成安全。ContainmentBench 会额外暴露：

- false-positive block。
- authorized tainted-action failure。
- proposal 已经存在。
- policy 拦截点发生在 high-risk side effect 前。

这说明失败不是模型能力不足，而是 policy 语义过粗。

#### Case 3：intent-ledger v2 success

同样用户目标下，v2 会多看 ledger：

- action type 是 invite 或 calendar create。
- target 是用户授权的 partner。
- 参数满足 `phi`。
- tainted fields 没有扩展 recipient、visibility 或 action。
- 因此允许 commit。

它仍然把 taint/provenance 记录下来，所以不是“把污染洗白”。更准确地说：

- 污染来源存在。
- 权限没有被外部内容扩大。
- 结构化授权允许这个 side effect。
- 系统保留 audit evidence。

这就是作者说 provenance 和 authorization 互补的具体含义。

#### Case 4：tool-boundary 与 v2 的 spread 差异

这个 case 用来提醒读者不要只看 aggregate spread：

- 两个 policy 都没有 committed violation。
- 两者在某些 trace component 上 taint label 数量不同。
- 但差异是否重要，要看 stage、denominator 和是否完成授权任务。

如果一个 defense 因为早早阻断而 trace 很短，它可能 spread 低，但 utility 也低。另一个 defense 完成合法污染任务，trace 更长，logged taint node 可能更多。这个差异不能自动解释成“更危险”，必须和 endpoint、authorization、utility 一起读。

### 和近期 Agent 安全论文的连续性

从本周已发布内容看，ContainmentBench 与 APPA、MemTX、SPORE、CoT invisible reasoning 等主题形成了一条很清楚的研究线：

| 论文/主题 | 关注对象 | 和 ContainmentBench 的关系 |
|---|---|---|
| APPA | Agent 权限、taint confinement、engine-managed branch | 更偏 enforcement semantics；ContainmentBench 可作为评测层 |
| MemTX | Stateful agent memory 的 transactional belief commit | 更偏 memory write/repair discipline；ContainmentBench 的 memory/recovery stage 可扩展 |
| SPORE | 工具侧利用 memory retrieval 做抽取 | 更偏攻击面；ContainmentBench 当前不提供强 adaptive production claim |
| Invisible CoT reasoning | 输出 token 不包含全部计算 | 提醒 logged trace 也可能漏掉模型内部语义影响 |
| ContainmentBench | trace-based post-injection evaluation | 把 endpoint、trajectory、utility、recovery 分开交账 |

这条线共同指向一个结论：

- Agent 安全不能只靠系统提示。
- 也不能只靠最后一道发送前检查。
- 更不能只靠静态 benchmark 的 pass/fail。
- 需要把状态、权限、来源、记忆、工具副作用和恢复路径做成可检查控制面。

但每篇论文也有各自边界：

- APPA 的 guarantee 依赖 engine 和 contract TCB。
- MemTX 需要真实系统接受 belief commit 协议。
- SPORE 说明工具接口本身可能成为 memory extraction 面。
- Invisible reasoning 说明 CoT monitor 不等于完整透明性。
- ContainmentBench 说明评测必须拆指标，但它没有解决所有 enforcement 问题。

### 结论与边界判断

ContainmentBench 的一句话贡献是：

- **把 prompt injection containment 的评测对象从终点标签换成结构化执行轨迹。**

它证明了三个具体事实：

- 同样没有 committed harm 的两个 policy，仍可能在 73.5% 的 active-tainted pair 中表现完全不同。
- taint-only policy 可以通过过度阻断获得漂亮 endpoint，但 authorized completion 只有 0.1642。
- intent-ledger 能把 completion 修到 0.8567，但仍低于 tool-boundary 的 0.9233，且 propagation 排名依赖 stage 和 denominator。

我对这篇论文的边界判断是：

- 它不是生产级 Agent 防御方案。
- 它也不是跨模型、跨平台、强自适应攻击下的最终证据。
- 它更像一个审计协议：要求研究者把 endpoint、trace、authorization、utility、recovery 和 parser validity 分开交账。

对 Agent 安全研究来说，这个转向很必要。随着 Agent 真的开始读企业资料、写持久记忆、调用外部工具，安全问题不会停在“模型有没有说出攻击者要求的话”。更可怕也更常见的问题是：污染被谁读了、写进哪里、带到了哪个 proposal、被哪条 policy 放行或拦下、是否误伤了用户本来授权的工作、恢复过程是否真的把状态清理干净。

ContainmentBench 给出的答案不是一个万能分数，而是一套可复查的证据结构。这个结构本身，比 v2 policy 是否赢过某个 baseline 更值得关注。

### 参考链接

- [arXiv 摘要页：ContainmentBench](https://arxiv.org/abs/2607.23999)
- [arXiv HTML 全文：ContainmentBench](https://arxiv.org/html/2607.23999v1)
- [Papers.cool 当日 cs.CR 列表](https://papers.cool/arxiv/cs.CR)
- [AgentDojo：Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses](https://arxiv.org/abs/2406.13352)
- [Fides：Taint tracking / information-flow related agent defense](https://arxiv.org/abs/2504.18529)
- [NeuroTaint：semantic and causal taint audit for agents](https://arxiv.org/abs/2604.23374)
