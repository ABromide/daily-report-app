# CAGE：把工具型 Agent 的授权对象从“观测点”改成“邻域证明”

### 元信息

- **论文**：CAGE: Certified Authorization under Typed-Return Uncertainty for Tool-Using Agents
- **作者**：Blaise Delattre、Cong Wang、Yang Cao
- **类别**：大模型 Agent / AI 安全
- **官方链接**：[arXiv:2607.29190](https://arxiv.org/abs/2607.29190)
- **提交时间**：2026-07-31 09:11:56 UTC
- **代码状态**：arXiv 标注了 GitHub 链接，但本轮访问 `https://github.com/tdsai-lab/cage-agent-authorization` 返回 404；本文只把论文和 TeX/PDF 作为证据来源。

### TL;DR

- **这篇论文研究什么**：工具型 LLM Agent 在读取结构化工具返回后，常由运行时 permission gate 判断下一步 action 是否可执行；CAGE 认为只检查当前观测到的 `(return, action)` 点不够，因为工具返回的 provenance、类别字段、分数、金额等可能存在小的绑定错误和数值漂移。
- **核心方法是什么**：把授权问题改写为鲁棒证明：若观测返回为 `z=(s,x)`，其中 `s` 是离散 provenance / 类别字段，`x` 是连续数值字段，则 action 只有在整个邻域 `B_{d,ε}(z)` 内都安全时才被允许。
- **关键机制是什么**：CAGE 精确枚举离散邻域 `N_disc(s)`，再对每个离散分支证明连续 `ε` 球内都安全；它明确反驳“离散通道单独安全 + 连续通道单独安全就能组合安全”的直觉。
- **最重要的理论结论**：论文构造 joint-gap witness：观测点安全，单独 provenance swap 安全，单独数值漂移也安全，但二者同时发生时越过阈值；这种 witness 的区间长度是 `min(Δ, ε)`。
- **实验数字**：在 finance / SRE / ops 合成设置中，return-dependent pair 占 `42.5%--45.6%`；在真实 IEEE-CIS + OPA 策略上，witness set `W` 有 `6032/10000`，点式 gate 允许几乎全部，而 CAGE-Exact / CAGE-RS 对该集合 allow-on-W 为 `0%`。
- **系统证据**：论文在 finance/SRE、k8s stale registry、MCP write、filesystem MCP quota、Marble decision API 等端到端链路上验证：未保护或边际组合会提交不安全副作用，联合邻域证书阻止这些副作用。
- **边界条件**：CAGE 证明的是单次授权决策；它依赖可信 typed-return constructor、完整 mediation、可枚举离散邻域、数值漂移在校准预算内。跨 turn 累积、tool selection、MCP metadata、prompt injection 本身仍需要其他防线。
- **为什么值得读**：它把 Agent 权限控制从“更强 judge / 更复杂 prompt”拉回到可证明的运行时对象：在工具返回已经被 schema 校验但仍有绑定不确定性时，安全性必须覆盖联合离散-连续邻域，而不是覆盖序列化文本或单个观测点。

### 研究问题：为什么 post-tool-return 才是关键边界？

- 论文从一个很具体的 Agent 执行链路切入：
  - LLM 先提出工具调用。
  - 工具返回结构化记录和展示文本。
  - LLM 读取这些内容后提出下一步 action。
  - 运行时 gate 决定是否允许 action 执行。

- 作者认为当前许多 permission gate 的问题在于：
  - 它们多检查 **pre-execution** 的 proposed call。
  - 即使检查 action，也往往只检查观测到的 `(z,a)`。
  - 如果 `z` 的 provenance 或 policy pack 绑定错了，观测点检查仍可能给出 allow。

- 论文把工具返回拆成两个通道：

| 通道 | 记号 | 攻击或误差 | CAGE 的处理 |
|---|---:|---|---|
| 非可信展示文本 | `m` | prompt injection、恶意说明、社工文本 | gate 架构上不读取 `m`，只读 typed record |
| 结构化 typed return | `z=(s,x)` | stale provenance、policy-pack confusion、TOCTOU、数值残差 | 对 `B_{d,ε}(z)` 做鲁棒授权 |

![Figure 1：post-tool-return 授权边界](/assets/2026/08/03/itm_7d6f5f88b2e5ae54/fig1_post_tool_return_boundary.png)

- Figure 1 的意义不是画一个普通 Agent loop，而是强调：
  - LLM 可以被展示文本 `m` 影响 proposal。
  - gate 不应把 `m` 当成安全证据。
  - gate 只看 validated typed return `z` 和 action `a`。
  - 但 `z` 仍有 residual binding uncertainty，所以需要证明邻域。

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 授权必须读到实际工具返回 | Proposition 1：若两个返回 `z0/z1` 对同一 action 安全性不同，return-blind rule 不可能同时正确 | finance/SRE/ops 中 return-dependent pair 为 `42.5%--45.6%` | 只说明 post-return 位置必要，不说明任意 post-return gate 都足够 |
| 边际证书不能组合 | Theorem 1：离散和连续单独安全，不推出笛卡尔积安全 | joint-gap witness 区间长度 `min(Δ,ε)`，经验频率随该几何关系变化 | witness 是机制性存在与实验频率，不等于现实部署普遍率 |
| 联合邻域枚举可以消除 in-budget false allow | 枚举 `N_disc(s)`，每个分支做连续证书，全部通过才 allow | OPA / IEEE-CIS / NAB / PSD2/AML 等设置 CFA 为 `0` | 依赖预算覆盖；预算外 schema/key collision 不在证书内 |
| learned gate 只能证明 gate，不自动证明 policy | CAGE-Lip / CAGE-RS 是 gate-certified，不是 policy-certified | 论文持续报告 gate-policy fidelity 与 Wilson 上界 | 若基础 gate 学错 policy，证书会忠实证明一个错 gate |
| Agent judge 不是根本解 | judge 仍评估 observed point 或 serialized prompt | 32B judge、budget-aware judge、guard model 在 witness set 上仍允许大量不安全点 | 工具增强 judge 若完整枚举邻域，本质上是在实现同一类证书 |

### 方法机制：把授权对象改成 `B_{d,ε}(z)`

- 论文定义 typed tool return：
  - `s ∈ S`：离散部分，例如工具身份、provenance、状态标签、policy pack、类别字段。
  - `x ∈ R^k`：连续部分，例如风险分数、金额、延迟、价格、CPU 指标。
  - `a ∈ A`：Agent 提出的下游 action。
  - `Safe(z,a)`：安全谓词，表示 action 在该 return 下是否允许。

- 观测记录是 `z=(s,x)`，但正确绑定的真实状态可能是 `z*`：

```text
B_{d,ε}(s,x) = {
  (s', x') :
  D_disc(s, s') <= d,
  ||x' - x||_2 <= ε
}
```

- CAGE 要证明的是：

```text
Allow(z,a)=1  =>  对所有 z* ∈ B_{d,ε}(z)，Safe(z*,a)=1
```

- 这个形式化的意义很直接：
  - 不是让 LLM “更谨慎”。
  - 不是把工具输出文本过滤得更干净。
  - 不是让 judge 再读一遍 transcript。
  - 而是把授权对象从单点变成“所有可接受绑定误差下的状态”。

### 非组合定理：为什么单独检查两个通道会失败？

- 一个常见想法是：
  - 检查连续漂移：在原 provenance `s` 下，`x±ε` 都安全。
  - 检查离散漂移：在原数值 `x` 下，所有 `s'` 都安全。
  - 若二者都安全，则 allow。

- 论文证明这不成立：

```text
[∀x'∈Bε(x): Safe((s,x'),a)=1]
AND
[∀s'∈Ndisc(s): Safe((s',x),a)=1]
DOES NOT IMPLY
[∀s'∈Ndisc(s), ∀x'∈Bε(x): Safe((s',x'),a)=1]
```

- 关键反例是 provenance 改变阈值：

```text
Safe((s, x), a)  = 1[x <= q]
Safe((s',x), a) = 1[x <= q - Δ]
```

- 若同时满足：
  - 连续单查安全：`x <= q - ε`
  - 离散单查安全：`x <= q - Δ`
  - 联合移动不安全：`x > q - Δ - ε`

- 则 witness 落在：

```text
x ∈ (q - Δ - ε, min(q - ε, q - Δ)]
区间长度 = min(Δ, ε)
```

![Figure 3：joint-gap witness 的几何结构](/assets/2026/08/03/itm_7d6f5f88b2e5ae54/fig3_joint_gap_witness.png)

- 这个定理在 Agent 安全里的含义是：
  - 若 provenance 决定阈值，数值字段和 provenance 不能拆开证明。
  - 若 policy pack 决定 action 限额，分数残差和 policy-pack confusion 不能拆开证明。
  - 若缓存状态决定风险边界，stale cache 和数值 freshness 不能拆开证明。

### CAGE 的三层后端：Exact、Lip、RS

- CAGE 的离散通道始终采用精确枚举：

```text
Allow_CAGE(s,x,a)=1
iff
min_{s'∈Ndisc(s)} Cert_ε(s',x,a)=1
```

- 不同后端只影响每个离散分支上的连续证书：

| 后端 | 使用场景 | 证明对象 | 主要代价 | 失败模式 |
|---|---|---|---|---|
| CAGE-Exact | policy 是可执行 affine fragment | 直接证明 `Safe` policy | 枚举分支 + 解析 worst point | TCB 或预算逃逸 |
| CAGE-Lip | 隐式 policy，可训练 1-Lipschitz gate | 证明 `hθ` learned gate | 需要 `L_cert ε` margin | gate-policy misfit |
| CAGE-RS | 黑盒 gate 或 batch fallback | 证明 smoothed gate | Monte Carlo 与置信预算 | misfit + MC conservatism |
| MILP ceiling | 小型 ReLU gate 的离线审计 | 完整证明 trained gate | 每条记录秒级 | 若 gate 学错，错误被完整保留 |

- CAGE-Exact 的分支测试形式：

```text
w^T x + ε ||w||_2 <= b(s', a)
```

- CAGE-Lip 的分支测试形式：

```text
min_{s'∈Ndisc(s)} hθ(s', x, a) > L_cert ε
```

- CAGE-RS 的分支测试流程：
  - 对每个 `s'` 采样 `η_j ~ N(0, σ^2 I)`。
  - 估计黑盒 gate 在 `x+η_j` 上的 safe probability。
  - 用 Clopper-Pearson lower confidence bound 做 family-wise 修正。
  - 通过 Gaussian smoothing bound 得到每个分支的下界。
  - 所有分支的下界都超过阈值 `τ` 才 allow。

### 伪代码：CAGE 的授权循环

```text
Input:
  observed typed return z=(s,x)
  proposed action a
  discrete budget d
  continuous budget ε
  backend in {Exact, Lip, RS}

State:
  N_disc(s) = all admissible discrete bindings within distance d
  branch_results = []

For each s' in N_disc(s):
  If backend == Exact:
    result = all affine constraints pass worst-case test
  Else if backend == Lip:
    result = hθ(s', x, a) > L_cert * ε
  Else if backend == RS:
    samples = gθ(s', x + η_j, a) for j=1..M
    p_lcb = corrected lower confidence bound(samples)
    result = smoothed_lower_bound(p_lcb, ε, σ) >= τ

  branch_results.append(result)

If every branch result is true:
  Output: ALLOW
Else:
  Output: ABSTAIN or route to human review

Failure boundary:
  This certificate says nothing about fabricated identities,
  constructor corruption, unmediated actions, or drift outside ε.
```

### 实验设置：作者如何避免“真实”这个词混在一起？

- 论文把实验来源拆得很细，这一点值得肯定：

| Setting | Input data | Policy / oracle | Execution substrate | 作用 |
|---|---|---|---|---|
| synthetic finance/SRE/ops | 生成记录 | controlled oracle | simulator | 验证几何机制 |
| IEEE-CIS + OPA | 真实交易边际 | authored OPA policy | OPA | 主比较 |
| OpenFisca | 边界样例 | 第三方 policy code | OpenFisca | 外部有效性锚点 |
| k8s / MCP / Marble | 构造 episode | instrumented policies | live systems / APIs | 检查副作用是否真的提交 |
| fault injection | corrupted adapter returns | 对应 oracle | adapter stack | 校准 `d, ε` 预算 |

- 这张实验地图的意义是：
  - “真实数据”不等于“真实 policy”。
  - “真实 engine”不等于“真实银行部署规则”。
  - “真实 side effect”不等于“field prevalence 已测量”。
  - 作者把存在性、机制、引擎执行、部署普遍性分开报告，避免过度声称。

### 主结果 1：point gate 与 marginal composition 在 witness set 上失效

- 在 Proposition 3 的 witness set `W={clean-safe}\R` 上：
  - 真实 IEEE-CIS + OPA policy 产生 `6032/10000`。
  - 这些点在观测点上都是 clean-safe。
  - 任何只看观测点的 gate 都会认为它们应被允许。

| Gate | 评估对象 | allow-on-W | CFA |
|---|---|---:|---:|
| no gate | 无 | `100%` | - |
| learned point-gate | point | `99.3%` | - |
| exact predicate @ point (OPA) | point | `100%` | - |
| LLM point judge (32B) | point | `92%` | - |
| budget-aware LLM judge | point | `44±43%` | - |
| CAGE-Exact / CAGE-RS | neighborhood | `0%` | `0` |
| CAGE-Lip | neighborhood | `1.5±0.4%` | `8.2%` gate-misfit caveat |

- 这里最值得注意的是：
  - OPA point predicate 本身并不“错”，它只是回答了错误问题。
  - LLM judge 即使被提示预算，也没有自动变成邻域证明器。
  - CAGE-Lip 的非零 caveat 被作者归因于基础 gate 的 policy misfit，而不是 Lipschitz 邻域证书本身失效。

### 主结果 2：证书不是 vacuous，仍保留一部分自动执行

- 论文用 `CFA` 衡量 certified false allow，用 `Rallow` 衡量 robust-safe set 中还能自动 allow 的比例。

| Setting | Backend | C witness 频率 | CFA | Rallow |
|---|---|---:|---:|---:|
| OpenFisca | Exact | `3.5%--8.9%` | `0` | `22%--34%` |
| OPA | Lip/RS | `10%--12%` | `0` | `27%--37%` / `6.5%--7.3%` |
| IEEE-CIS | RS | `6.4%` | `0` | `20%--24%` |
| NAB telemetry | Lip | `10.9%` | `0` | `100%` |
| PSD2/AML | RS | `6.5%--9.8%` | `0` | `20%--34%` |

- 这个表说明：
  - CAGE 不是简单 deny-all。
  - 更强的证书通常会牺牲 autonomy。
  - 随机平滑在严格参数下可能变得保守。
  - Exact rung 在可执行 policy fragment 上最清楚，因为它直接证明 policy。

### 主结果 3：端到端系统里确实会提交不安全副作用

- 论文不只停在分类指标，还做了 committed side effects：

| Substrate | 未保护的不安全效果 | CAGE 结果 |
|---|---|---|
| finance/SRE | money approval / alert suppression | `0/0` 不安全提交 |
| k8s stale registry | unsafe deploy | blocked |
| MCP write | `4/4` proposer 提交不安全写 | `0/4` |
| filesystem MCP quota | over-quota write | blocked |
| Marble decision API | `100/100` persisted | `0/100` |

- 这部分把论文的安全论证从“分类器误报”推进到“执行副作用”：
  - marginal composition 可以在端到端链路里以 no-gate rate 提交不安全 action。
  - transcript classifier 即便 point accuracy 很高，也会在 joint-gap witness 上提交。
  - CAGE 的 gate overhead 约 `10 μs`，与论文报告的约 `2.5 s` LLM decode 相比不是主要瓶颈。

### 逐项证据解读：每个实验回答了哪一个怀疑？

- **怀疑 1：这是不是只在作者构造的 toy oracle 里成立？**
  - 作者先用 synthetic finance/SRE/ops 控制几何变量，是为了证明 joint-gap 的形状确实随 `min(Δ,ε)` 变化。
  - 之后引入真实 IEEE-CIS 交易边际、真实 OPA engine、NAB telemetry、OpenFisca、Marble 和 Kyverno。
  - 这些材料并不共同证明“现实系统常见”，但共同证明“该模式不是某个 toy 函数的伪影”。

- **怀疑 2：若 point gate 足够准确，是否就能解决？**
  - Witness set `W` 的定义让这个怀疑失效：`W` 中每个点在 observed point 上都是 clean-safe。
  - 因此 point accuracy 越高，越可能在 `W` 上稳定 allow。
  - 论文的 point predicate @ OPA 允许 `100%` witness，不是因为 OPA 糟糕，而是因为它精确执行了单点 policy。

- **怀疑 3：能否让 LLM judge 自己推理 worst case？**
  - 论文给 budget-aware judge 明确预算，但其 allow-on-W 仍有大方差。
  - 这说明问题不在“模型有没有读到预算”，而在 judge 没有形成可审计的离散枚举和连续 worst-point 证明。
  - 若 judge 真能列出 `N_disc(s)` 并逐分支证明，它已经变成一种符号执行器，而不是普通文本裁判。

- **怀疑 4：CAGE 会不会过度拒绝，导致 Agent 不可用？**
  - `Rallow` 表显示不同 setting 仍保留 `20%--100%` 的 robust-safe autonomy。
  - 但这个结论要按后端读：Exact 在可执行 fragment 上最接近 policy；RS 在严格置信设置下可能显著保守；Lip 依赖 learned margin。
  - 因此 CAGE 的工程取舍不是“安全或可用”二选一，而是“policy 可执行性、gate fidelity、置信预算和人工复核容量”的组合优化。

- **怀疑 5：若攻击者知道 gate，能否绕过？**
  - 论文报告 adaptive adversary 在 point gate 上仍能保留 `1.7%--15%` false allow。
  - CAGE 对 in-budget adversary 的 certified false allow 为 `0`，因为攻击者知道证书也不能改变证书覆盖的数学集合。
  - 但若攻击者打到 constructor、freshness 或未被枚举的 action group，问题转移到 TCB 和预算外逃逸。

### Figure / Table 证据怎样串起来？

- **Figure 1 支撑边界定位**：
  - 它把 LLM proposal 和 runtime gate 分开。
  - 它说明 prompt injection 防线与 typed-return authorization 是两层问题。
  - 它也解释为什么 gate 排除 `m` 后仍需要处理 `z` 的残余绑定误差。

- **Figure 3 支撑非组合定理**：
  - 图中安全区域随 provenance 改变阈值。
  - 单独移动连续变量不会越界。
  - 单独切换离散 provenance 也不会越界。
  - 联合移动跨过 `q-Δ`，这正是边际证书失效的最小例子。

- **Figure 4 支撑部署边界**：
  - 证书内部的 `CFA=0` 不代表系统没有 false allow。
  - 若 freshness 让真实 drift 超出 `ε`，系统 false allow 会随 SLA 放松上升。
  - 这迫使部署者把“预算校准”写进 release gate，而不是只把 CAGE 当作库函数调用。

- **Table backends 支撑假设阶梯**：
  - Exact 的强处是 policy-certified。
  - Lip / RS 的价值是扩展到隐式 policy。
  - 但 learned rung 必须承认 fidelity gap；这比把所有数值汇总成一个平均准确率更诚实。

- **Table systems 支撑真实副作用**：
  - money commit、alert suppression、Kubernetes deploy、MCP write、Marble persistence 都是可观察效果。
  - 这些实验说明 joint-gap 不是“可能误判”，而是可能变成真实 action。
  - 对 Agent 安全而言，副作用证据比离线 accuracy 更接近风险对象。

### 负面结果：论文没有把失败藏在平均值里

- **Constructor corruption**：
  - 若 trusted constructor 本身把 provenance 翻错，CAGE 会信任错误 typed record。
  - 论文报告 constructor corruption 会把 verified-point false allow 推到 `1.7%`。
  - 这说明 CAGE 的 TCB 很明确：schema validation、constructor、完整 mediation 不能被当成外部细节。

- **Freshness escape**：
  - same-entity wall-clock staleness 在约 `10s` 处穿过 `ε=0.10`。
  - 证书仍然可以对声明预算保持正确，但系统现实已离开预算。
  - 所以高风险 action 不能复用陈旧 score；它需要 in-loop recompute 或更紧 SLA。

- **RS horizon collapse**：
  - Randomized smoothing 的置信保证是 per-decision。
  - 如果部署有很长 horizon，就要把 lifetime failure budget 分摊到大量决策。
  - 论文报告在 `T>=10^3` 时 horizon-corrected RS 会变得 vacuous，长期部署应优先 deterministic Lip 或 Exact。

- **Dimension edge**：
  - 论文认为 typed policy state 应保持低维。
  - 到 `k=50` 仍可保持 sound and non-vacuous；到 `k=100` 时小型 smoothed gate 的 fidelity 成为瓶颈。
  - 这不是证书数学失败，而是 gate 对 oracle 的拟合不够。

- **Abstention DoS**：
  - 边界寻优输入可以增加 abstention。
  - 作者强调这会影响 availability，而不是把 allow 变成 false allow。
  - 实际部署仍需 rate limit、分源审计、人工 review budget，否则攻击者可把系统推向过度人工复核。

### 复现与审计清单：如果要在自己的 Agent harness 里尝试

- **接口前提检查**：
  - 每个工具返回必须有 typed constructor。
  - provenance、policy pack、status label 这些离散字段要能形成 `N_disc(s)`。
  - 金额、风险分、配额、延迟这些连续字段要能归一化，并能解释 `ε` 的业务含义。

- **预算校准检查**：
  - 注入 stale provenance、policy-pack confusion、TOCTOU 等 adapter fault。
  - 统计每类 fault 的离散距离 `d` 和连续残差。
  - 做 leave-one-out escape：去掉某个 fault class 后，检查是否有真实 fault 落出声明邻域。
  - 若 schema transposition 或 key collision 无法落入 `B_{d,ε}`，应把它归入 validation 层，而不是扩大 CAGE 证书口径。

- **policy 形态检查**：
  - 若 policy 是 affine threshold fragment，优先 Exact。
  - 若 policy 是 Rego / OPA / decision table，可先识别是否能转成可验证 fragment。
  - 若只能训练 gate，则必须保存 held-out fidelity audit，不能只报告 certified gate 的内部 margin。

- **运行时完整性检查**：
  - action 必须全部经过 gate；旁路执行会破坏完整 mediation。
  - gate 读取的是 typed return，不应读取展示文本 `m` 作为安全证据。
  - 每次 allow 应记录 `s`、`N_disc(s)`、`ε`、backend、branch result、policy version 和 freshness metadata。

- **发布前负控检查**：
  - 构造 clean-safe but not robust-safe 的 witness，确认 point predicate 会 allow、CAGE 会 abstain。
  - 构造 robust-safe control，确认 CAGE 不会 deny-all。
  - 构造 budget-out escape，确认系统把它报告为预算外风险，而不是误记成 CAGE false allow。

### 与 Agent 后训练的关系：CAGE 可以提供什么样的训练信号？

- CAGE 不是后训练算法，但它给后训练提供了一个更精确的标签分层：
  - `U`：观测点已经 unsafe，普通监督即可学到。
  - `C`：观测点 safe，但联合邻域 unsafe，是最容易被 point training 误标的危险样本。
  - `R`：整个邻域 robust-safe，可作为 autonomy 正例。

- 若要把它用于 tool-use SFT / RL：
  - 训练样本不应只含 observed `(z,a,label)`。
  - 应额外保存 `N_disc(s)`、`ε`、worst branch、refusal reason。
  - reward 不应奖励 point-safe approve，而应奖励 robust-safe allow 或正确 abstain。

- 这对 agentic RL 特别重要：
  - 多步任务的稀疏终局奖励可能把“恰好成功的危险执行”奖励成好轨迹。
  - CAGE 的 branch-level refusal reason 可以把成功轨迹拆成“结果成功但授权不稳健”的负例。
  - 这比事后只看 task success 更接近真实安全约束。

### 对 AI 安全评测的启发：benchmark 应该怎么改？

- **需要加入 typed-return perturbation**：
  - 只给模型 transcript，会把问题降成文本判断。
  - 应给出 schema、provenance graph、policy pack、freshness budget。
  - 评测答案应要求枚举 worst case，而不是只给 allow / deny。

- **需要区分三个准确率**：
  - point accuracy：观测点是否判断正确。
  - robust accuracy：整个 `B_{d,ε}` 是否安全。
  - policy fidelity：learned gate 是否等价于真实 policy。

- **需要记录 abstention quality**：
  - 安全 gate 在边界附近 abstain 是正确行为。
  - 如果 benchmark 把所有 abstain 当失败，会鼓励不安全 allow。
  - 更合理的指标应拆成 `CFA`、`Rallow`、review burden 和 budget escape。

### 一个简化例子：为什么“审批交易”会错？

- 假设工具返回：

| 字段 | 观测值 | 真实可能值 |
|---|---:|---:|
| source | `credit_check` | `sanctions_screen` |
| risk_score | `0.46` | `0.56` |
| action | `approve_transaction` | 同一 action |

- 假设 policy：
  - credit check 阈值：`score <= 0.60` 可批准。
  - sanctions screen 阈值：`score <= 0.52` 可批准。
  - continuous drift：`ε=0.10`。

- 三种错误直觉：
  - 看观测点：`0.46 <= 0.60`，allow。
  - 只看数值漂移：`0.46 + 0.10 <= 0.60`，allow。
  - 只换 provenance：`0.46 <= 0.52`，allow。

- 联合检查：
  - provenance 换成 `sanctions_screen`。
  - score 漂移到 `0.56`。
  - `0.56 > 0.52`，应拒绝。

- 这正是 CAGE 的核心：
  - 失败不是来自复杂自然语言。
  - 失败来自两个普通工程误差组合后改变了授权语义。
  - 若系统只为每个误差分别写单元测试，仍可能漏掉联合状态。

### Figure 4：预算校准比证书本身更像部署难点

![Figure 4：freshness 与 residual 风险](/assets/2026/08/03/itm_7d6f5f88b2e5ae54/fig4_freshness_residual.png)

- CAGE 的证书有一个容易被忽视的前提：
  - `d=1` 不是凭空假设，而是从 adapter fault 里校准出来。
  - `ε=0.10` 也不是模型超参，而是 residual drift 的声明预算。
  - freshness SLA 若放松，系统 false allow 会来自预算逃逸，而不是证书内部错误。

- 论文的 fault injection 结论：
  - stale provenance、policy-pack confusion、read-then-act 都是 atomic discrete fault。
  - covered fault 的 p95 continuous residual 在 `0.079--0.095` 左右。
  - schema transposition、key collision 没有合适离散 footprint，且超过 `ε`，属于 validation failure。
  - same-card staleness 约 `10s` 时穿过 `ε=0.10`，作者建议 score 需要 in-loop recompute。

### 相关工作位置：CAGE 不替代 prompt-injection 防线

- 论文把自己的位置放在 post-tool-return authorization：
  - ToolCert / TPA 更关注 tool description 或 training-set poisoning。
  - CaMeL / 信息流控制关注 untrusted text 和 data-flow。
  - AgentSpec / VeriGuard 等运行时执行器检查 observed action-state pair。
  - CAGE 针对的是 typed return 的 bounded semantic uncertainty。

- 因此它和其他防线的关系更像组合：
  - prompt-injection 防线减少 LLM 提出坏 action 的机会。
  - typed gate 阻止坏 action 被执行。
  - CAGE 在 typed gate 里加入邻域证书。
  - constructor、schema validation、freshness、provenance registry 仍是 TCB。

### 细读相关工作：为什么不是“又一个 guardrail”？

- **与 prompt-level guardrail 的差异**：
  - prompt-level 方法通常判断自然语言里是否有恶意指令。
  - CAGE 假设恶意或误导文本已经可能影响 proposal，但 gate 不把文本当作授权依据。
  - 这让安全对象从“模型是否被说服”转成“执行是否在 typed policy state 下稳健”。

- **与 runtime monitor 的差异**：
  - 许多 monitor 会检查当前 action 是否满足当前 state。
  - CAGE 认为当前 state 只是一个经过 validation 的代表点，不等同于唯一真实状态。
  - 因此它监控的不是 `Safe(z,a)`，而是 `∀z'∈B(z): Safe(z',a)`。

- **与 certified robustness 的差异**：
  - 图像或文本鲁棒性常证明输入扰动不改分类。
  - CAGE 证明的是授权谓词在 typed return 的离散-连续联合扰动下不改安全性。
  - 它的离散部分不是靠采样，而是枚举；这对 provenance / policy pack 这种小集合非常合适。

- **与 policy verification 的差异**：
  - policy verification 证明 policy 本身是否满足某些性质。
  - CAGE 证明某次运行时决策在绑定不确定性下是否可允许。
  - 两者可组合：先验证 policy，再用 CAGE-Exact 证明当前 action 在邻域内满足该 policy。

- **与 access-control 系统的差异**：
  - 传统 access-control 往往假设属性读取是正确的。
  - Agent harness 中的属性来自工具、缓存、adapter、外部 API 和模型上下文。
  - CAGE 的贡献是把“属性可能小范围错绑”纳入授权定义，而不是把它留给日志事后调查。

### 什么时候值得部署 CAGE，什么时候不值得？

- **值得部署的场景**：
  - action 有真实副作用，例如付款、部署、删除、批准、发送、开权限。
  - action 安全性依赖 provenance-conditioned threshold。
  - 工具返回经过 schema validation，但仍可能存在 stale cache、TOCTOU、policy-pack confusion。
  - 离散邻域可以枚举，连续字段维度较低，且业务能接受 abstention / human review。

- **不宜直接部署的场景**：
  - 工具返回没有稳定 typed schema，只是自由文本。
  - provenance registry 或 constructor 不可信，且无法独立审计。
  - action selection 本身未被完整 mediation，Agent 可绕过 gate 执行。
  - 业务无法定义 freshness SLA，也无法把 `ε` 映射到可解释单位。

- **上线前最小证据包**：
  - 一份 typed-return schema。
  - 一份 `N_disc(s)` 的来源说明。
  - 一份 adapter fault 注入报告。
  - 一份 robust-safe control 与 joint-gap witness 的负控测试。
  - 一份 allow / abstain / budget-escape 的审计日志样例。

- **上线后监控重点**：
  - `CFA` 需要延迟人工或真实 policy audit 校验。
  - `Rallow` 下降可能意味着 traffic 靠近边界，也可能意味着 gate fidelity 退化。
  - budget escape 上升通常指向 freshness、constructor、schema 或缓存层，而不是证书公式。
  - abstention 激增应按来源限流，否则安全性虽保持，系统吞吐会被边界样本拖垮。

### 局限：作者明确没有证明什么？

- **不证明跨步安全**：
  - 证书是单个 `(z,a)` 决策。
  - 多步 plan 中的状态积累、跨 turn memory、长期策略漂移仍未认证。

- **不证明 tool selection 安全**：
  - 若 Agent 选错 action group，CAGE 的 per-action ball 不自动覆盖。
  - 论文报告 cross-action mis-selection 仍保留残余风险。

- **不证明预算外错误**：
  - constructor corruption 会让 gate 相信错误 provenance。
  - schema/key collision 若超过 `ε`，需要 validation 层阻止。
  - stale data 若超过 freshness bound，证书仍可能是“对声明预算正确，但对系统现实不够”。

- **不证明 learned gate 等于 policy**：
  - CAGE-Lip / CAGE-RS 证明的是 gate。
  - 若 gate 对 policy 的拟合有误，证书会把这个误差保留下来。
  - 因而 fidelity audit 不是可选项。

### 研究者视角的延伸问题

- **Agent 权限控制应从“文本语义安全”转向“状态语义安全”**：
  - 许多 Agent 安全讨论停留在 prompt / tool description / transcript。
  - CAGE 提醒我们，结构化返回的 provenance 与数值绑定同样会改变 action 安全性。

- **后训练数据可以吸收 CAGE 的 abstention signal**：
  - CAGE 本身是 runtime gate，不是后训练方法。
  - 但被 CAGE 拒绝的 `C` 类 witness 可以成为 agentic RL / tool-use SFT 的高价值负例。
  - 关键是不要把“point safe”误标成“robust safe”。

- **未来评测要区分 point accuracy 与 neighborhood soundness**：
  - 一个模型或 judge 在观测点上答对，不代表它能覆盖 `B_{d,ε}`。
  - Agent 安全 benchmark 若只采样 serialized transcript，可能会系统性漏掉 joint-gap witness。

- **部署上最难的是接口治理，不是数学证书**：
  - 需要把 typed policy state 做小、可枚举、可校准。
  - 需要把 provenance registry、policy pack、freshness、constructor 都纳入审计。
  - 需要对每类 adapter fault 给出 leave-one-out escape 证据。

- **CAGE 的真正贡献不是一个更强分类器**：
  - 它改变了授权问题的类型。
  - 只要 action 安全性依赖 uncertain typed return，正确问题就不是“这个点安全吗”，而是“这个点代表的所有可接受状态都安全吗”。

### 证据边界小结

- 已有强证据：
  - 非组合定理和 witness 几何。
  - 多个 policy-engine / real-data / live-substrate 上的机制复现。
  - in-budget certified false allow 为 `0` 的多设置报告。
  - 预算逃逸、constructor corruption、horizon confidence 等负面结果没有被隐藏。

- 仍需谨慎：
  - field prevalence 未测量。
  - arXiv 标注代码仓库当前不可访问，复现实验需等待可用代码或手工复现。
  - learned rung 的 policy soundness 取决于额外 fidelity audit。
  - CAGE 不覆盖工具选择、跨步计划、未被 mediation 的执行路径。
  - 因而它更像一块可证明的授权拼图，而不是完整 Agent 安全方案。
