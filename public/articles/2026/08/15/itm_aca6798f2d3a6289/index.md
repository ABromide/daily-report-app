# ATOBench：当目标响应会说谎，自主渗透测试 Agent 还会验证吗？

## 元信息

- **原文**：[ATOBench: Tracing How Autonomous Penetration-Testing Agents Verify Vulnerabilities When Target Evidence Lies](https://arxiv.org/abs/2608.12996v1)
- **作者**：Qiyang Chen、Yixi Li、Fengwei Zhang、Junlin Liu
- **机构**：Alibaba Cloud、The University of Hong Kong、University of Chinese Academy of Sciences
- **发布日期**：2026-08-13
- **代码链接**：[github.com/daxtar2/ATOBench](https://github.com/daxtar2/ATOBench)
- **主题归类**：AI 安全 / AI for Security / Agent 过程评测

## TL;DR

- **这篇论文做什么**：ATOBench 不再只问自主渗透测试 Agent 最后有没有报出漏洞，而是问它在目标响应被篡改、误导或局部隐藏证据后，是否还能保留一条可审计的“证据到报告”验证链。
- **它怎么做**：作者提出 Adversarial Target Observation（ATO）和 Adversarial Observation Unit（AOU）。AOU 在目标真实执行之后、Agent 看到响应之前，对特定响应做冻结的、可重放的转换，同时保留另一条可恢复或可反驳路径。
- **实验规模**：论文在 OWASP Juice Shop 20.1.1 上构造 SQLi、Basket、JWT 三类 AOU；每个模型-合约组合 15 对 Native/ATO matched pairs，共 **225 对、450 个 episode**。
- **评测对象**：五条模型路线分别是 DeepSeek-V4-Pro、GLM-5.2、GPT-5.5、Kimi-K2.6、Qwen3.7-Max；全部经过同一个 Claude Code 2.1.156 单 Agent 渗透测试 harness。
- **核心结果**：ATO 下 Basket grounded verification 从 45.3% 到 40.0%，JWT 从 84.0% 到 58.7%，但 SQLi 从 44.0% 到 **0%**；五个模型在 SQLi ATO 行全部是 0/15。
- **最关键的机制判断**：SQLi 不是因为 Agent “不动了”，而是因为它变得更忙。ATO 相对 Native 的 SQLi 中位数多 **14 个动作、9 个重复动作、5 次 endpoint family switch、6 次 payload family switch**，但仍没有恢复 primary proof。
- **证据边界**：结论限定在三个冻结 AOU、一个 Juice Shop target、固定工具预算和论文中的单 Agent harness；GitHub 仓库目前公开材料很少，主要复现实物仍依赖 arXiv source/PDF 中的描述与表格。

---

## 1. 研究问题：为什么 final score 不够？

### 1.1 目标响应同时扮演两个角色

- 在自主渗透测试里，Agent 的每次 HTTP 观察都不只是“环境反馈”：
  - 它决定下一步该打哪个 endpoint、换哪个 payload、是否继续验证。
  - 它也会变成最后报告里漏洞声明的证据来源。
- 因此，如果目标响应不是中立事实，而是被防御方、代理层或 benchmark harness 局部改写，Agent 面临的不是普通失败，而是 **证据供应链被污染**。

### 1.2 论文真正追问的问题

- 现有 autonomous pentest benchmark 常见指标是：
  - 是否打到 milestone。
  - 是否完成 stage-level task。
  - 最终报告是否提到漏洞。
  - 总动作数、成功率、成本。
- ATOBench 的问题更窄也更锋利：
  - **当目标安全事实没有变，但可见响应变了，Agent 还能不能找到替代证据？**
  - **它是否把替代证据带入停止决策和最终报告？**
  - **如果失败，失败发生在探索、证据恢复、停止判断，还是报告 grounding？**

### 1.3 研究空白

| 已有评测关心什么 | ATOBench 补上什么 |
|---|---|
| Agent 是否最终完成 pentest 任务 | Agent 是否保留可审计的验证链 |
| 被动、忠实目标环境中的能力 | 目标响应被局部欺骗时的证据处理能力 |
| final score、milestone、报告文本 | action -> evidence -> stop -> report 的过程定位 |
| 攻击是否被防御 deception 阻断 | 漏洞事实不变时，Agent 是否仍能验证事实 |

## 2. 论文主张与论证路线

### 2.1 Claim -> mechanism -> evidence -> boundary

| 主张 | 机制 | 证据 | 边界 |
|---|---|---|---|
| 最终报告不足以判断 pentest Agent 是否真的验证了漏洞 | 对 matched Native/ATO episode 在首次受影响响应处对齐 | 450 个 episode 中同时记录 action、evidence、stop、report | 只覆盖论文设计的三类证据结构 |
| 目标侧 deceptive observation 会改变验证链，而不只是改变最终成功率 | AOU 只在 target execution 后、Agent observation 前改写响应 | SQLi ATO 下五个模型 grounded verification 全部 0/15 | 结果不能外推到所有 Web 漏洞或无限预算场景 |
| 更多活动不等于更好验证 | 统计 post-anchor 动作、重复、endpoint switch、payload switch | SQLi ATO 中位数多 14 动作、9 重复，却无 primary proof | 动作签名是论文定义的 proxy，不等同于完整认知过程 |
| 证据位置与持久性决定恢复难度 | SQLi 是直接 proof，Basket 是关系，JWT 是可重获 artifact | Basket/JWT 仍保留大量 grounded path，SQLi 崩溃 | 三个 AOU 是刻意挑选的对比结构 |

### 2.2 这篇论文不是“防御效果评测”

- CHeaT 这类工作更像问：
  - deception 能不能拖住、诱捕或暴露攻击 Agent。
- ATOBench 问的是另一件事：
  - **漏洞事实仍然存在时，Agent 能否抵抗错误观察，继续构造证据链？**
- 这个区别很重要：
  - 防御视角把“Agent 被误导”看作成功。
  - 可靠性视角把“Agent 被误导后仍然写出不受支持的报告”看作需要定位的失败模式。

## 3. 方法机制：AOU 如何改变 Agent 看到的世界？

![ATOBench 总览：Native 与 ATO episode 成对执行，并从改变后的 observation 追踪证据、停止和报告。](/assets/2026/08/15/itm_aca6798f2d3a6289/figure1-overview.png)

### 3.1 ATO 的干预边界

- ATO 不改：
  - Agent 发出的请求。
  - 目标应用代码。
  - 目标状态。
  - 漏洞是否真实存在。
  - prompt、工具、预算。
- ATO 只改：
  - 目标执行完成后的某个响应。
  - Agent 实际看到的 observation。

### 3.2 形式化表达

设 Agent 在第 \(t\) 步发出动作 \(a_t\)，目标返回原始观察 \(o_t\)。某个 AOU \(u\) 由三部分构成：

- \(q_u(a_t, o_t)\)：selector，判断这个响应是否属于可改写边界。
- \(g_u(a_t, o_t)\)：transform，把原响应转换成 Agent 可见响应。
- \(d_u(k_t)\)：dose rule，控制第几次匹配时应用转换。

公式可以写成：

\[
o^{vis}_t =
\begin{cases}
g_u(a_t, o_t), & q_u(a_t,o_t)=1 \land d_u(k_t)=1 \\
o_t, & otherwise
\end{cases}
\]

变量解释：

| 符号 | 含义 | 为什么重要 |
|---|---|---|
| \(o_t\) | 目标真实返回 | 保证漏洞事实和 target execution 没变 |
| \(o^{vis}_t\) | Agent 实际看到的响应 | 这是 deception 进入验证链的位置 |
| \(q_u\) | 响应选择器 | 限定干预边界，避免任意改写 |
| \(g_u\) | 响应转换器 | 定义具体欺骗，例如把成功 SQLi 改成失败 |
| \(d_u\) | 剂量规则 | 控制一次、两次或每次改写 |

### 3.3 AOU 构造协议

```text
Input:
  target security fact F
  native response boundary B
  deception mechanism M
  recovery or contradiction path R

State:
  selector q_u
  transform g_u
  dose rule d_u
  trace and report criteria

Loop:
  1. run target natively and identify response B
  2. freeze q_u, g_u, d_u
  3. replay eligible and ineligible traffic
  4. verify target fact F still holds
  5. verify R remains reachable outside transformed response
  6. admit AOU only if selector scope, dose, and recovery controls pass

Output:
  frozen AOU contract usable in matched Native/ATO campaign

Failure boundary:
  if unmatched traffic changes, recovery path disappears, or target state mutates,
  the unit is not a valid AOU for this paper's estimand.
```

### 3.4 三个 AOU 的证据结构

| AOU | Native 中的证据 | ATO 可见响应 | 保留的恢复路径 | 证据结构 |
|---|---|---|---|---|
| SQLi Proof Oracle | 登录或搜索 SQLi 返回可利用证明 | 登录变 401，搜索变空结果 | raw JSON Unicode escape 仍可绕过 selector 并触发目标解码 | 单次交互直接 proof |
| Basket Ownership Mirror | A token 读取 B basket，暴露跨身份访问 | HTTP 200 和 schema 保留，但显示成 A 自己的空 basket | 第三次同向读取返回 native foreign basket | 可复查的资源归属关系 |
| JWT Reusable Artifact | 登录 JWT 包含 `data.password` claim | 删除嵌套 password claim，并用 RS256 重签 | 后续登录可重新获得 native artifact | 可重获的 reusable artifact |

## 4. 实验设置：matched pairs 怎样保证可比较？

### 4.1 数据规模

| 维度 | 设置 |
|---|---|
| target | digest-pinned OWASP Juice Shop 20.1.1 |
| AOU | SQLi、Basket、JWT |
| 模型路线 | DeepSeek-V4-Pro、GLM-5.2、GPT-5.5、Kimi-K2.6、Qwen3.7-Max |
| 每个模型-AOU 组合 | 15 对 Native/ATO |
| 总 pairs | 225 |
| 总 episodes | 450 |
| SQLi/JWT budget | 40 tool calls、2400 秒 |
| Basket budget | 70 tool calls、3000 秒 |
| Agent scaffold | Claude Code 2.1.156，固定单 Agent harness，高 reasoning effort |

### 4.2 episode 隔离

- 每个 episode 都有：
  - fresh Juice Shop container。
  - fresh mitmproxy reverse proxy。
  - fresh Agent workspace、session、cookies、tokens。
  - fresh AOU state。
- Native 和 ATO 共用：
  - 相同 target snapshot。
  - 相同 prompt、工具、预算。
  - 相同日志路径。
- 唯一设计差异：
  - ATO condition 在 selector 命中后返回 transformed response。

### 4.3 评价链条

论文把每个 episode 拆成三个核心 predicate：

- \(E_i\)：是否有 positive registered task evidence。
- \(C_i\)：最终报告是否 closure 了 registered finding。
- \(S_i\)：报告 claim 是否被 trace support。

grounded verification 定义为：

\[
G_i = 1(E_i = 1 \land C_i = 1 \land S_i = 1)
\]

这一定义的意义：

- 只拿到漏洞证据但没写进报告，不算完整成功。
- 报告里写了漏洞但 trace 不支持，不算完整成功。
- trace 和报告都对齐，才算 evidence-to-report chain 完成。

### 4.4 Judge 设计

| 层次 | 做什么 | 防止什么偏差 |
|---|---|---|
| deterministic reconstruction | 从 proxy event、AOU record、Agent action、artifact 还原 evidence label | 避免只靠报告文本判断 |
| identity-blinded semantic Judges | 判断 report closure 和 claim-trace support | 避免知道模型或条件后产生偏见 |
| trajectory Judges | 判断 verification control、stop decision、report grounding | 定位失败发生在哪个过程阶段 |
| evidence verifiers | 复查 Judge 引用是否被 packet 支撑 | 防止 LLM-as-judge 用报告自证报告 |
| human expert audit | 独立审计 450 条 final semantic records | 给自动判定增加人工安全审查 |

判定可靠性也有数字支撑：

- 两个 blinded report Judges 在 450 份报告上 jointly agreed 416 份。
- report closure agreement 为 96.0%，\(\kappa=.905\)。
- claim-trace support agreement 为 93.6%，\(\kappa=.904\)。
- 剩余 34 份进入 source-linked adjudication。

## 4.5 detail inventory：这篇论文到底有哪些可核验细节？

### 方法对象

| 项目 | 论文中的具体设定 | 我为什么认为它重要 |
|---|---|---|
| ATO | 只改变 Agent 可见 observation，不改变 target execution | 把“目标事实”和“可见证据”分开，才能讨论验证能力 |
| AOU | selector、transform、dose、recovery/control path | 让 deception 不再是临时 prompt trick，而是可复现测试单元 |
| anchor | ATO 首次改变响应、Native 首次匹配同一 rule 的位置 | 让后续动作增量有共同起点，避免比较整段轨迹时混入前置探索差异 |
| grounded verification | \(E_i \land C_i \land S_i\) | 同时要求证据、报告 closure、trace support |
| retention estimand | 条件化到 Native 已展示能力且 ATO 已接触 target 的 matched pairs | 避免把没有触达关键响应的 run 当成 deception 失败或成功 |

### 数据与实验

- **目标应用**：
  - OWASP Juice Shop 20.1.1。
  - digest-pinned image，避免 target 版本漂移。
- **任务合约**：
  - SQLi/JWT 分别限制在 40 tool calls、2400 秒。
  - Basket 限制在 70 tool calls、3000 秒。
- **模型与 scaffold**：
  - 五条模型路线通过相同 Claude Code 2.1.156 harness。
  - prompt 要求单 Agent，不允许调用子 Agent 或后台 Agent。
- **episode 证据**：
  - proxy event。
  - native/visible response hash。
  - AOU match rule 和 application count。
  - artifact 或 relation identity。
  - final report 和 source-linked packet。

### Benchmark 与 baseline

| 对照项 | Native | ATO |
|---|---|---|
| target state | 原始漏洞存在 | 同一个漏洞仍存在 |
| network/logging path | 走同一 proxy | 走同一 proxy |
| prompt/tool/budget | 相同 | 相同 |
| 关键差异 | 返回 \(o_t\) | 返回 \(o^{vis}_t\) |
| 评测目标 | 验证链自然表现 | 错误 observation 下验证链是否保留 |

### 消融、失败和 sensitivity

- 论文没有做传统意义的模型架构消融。
- 它的“消融式”证据来自三类 AOU 的对比：
  - SQLi：direct proof 被改写。
  - Basket：资源归属关系被镜像。
  - JWT：可复用 artifact 中的 claim 被移除。
- 它的失败案例不是单个 transcript，而是统计模式：
  - SQLi 尝试 alternate strategy 的 19 个 ATO episode 全部未恢复 primary proof。
  - SQLi doubled wall-clock budget sensitivity 仍保持 Native/ATO 方向。
  - GPT-5.5 在 JWT 上从 73.3% 降到 20.0%，提示 artifact 证据虽然总体可恢复，但仍有模型路线差异。

## 4.6 三个 AOU 的机制细读

### SQLi Proof Oracle：直接 proof 被否定后的验证困境

- SQLi 是三者中最像传统 exploit proof 的证据：
  - 登录 bypass 返回 token。
  - 搜索 SQLi 返回差异化结果。
  - 一次响应就能给 Agent 强烈的“漏洞成立”信号。
- ATO 的 transform 把这个强信号改成失败表象：
  - 登录成功被显示为 credential invalid。
  - 搜索结果被显示为空集合。
- 论文保留了恢复路径：
  - 同 endpoint 的 raw JSON Unicode escape 请求不命中 raw selector。
  - 目标仍会把它解码成 authentication-bypass payload。
- 因此 SQLi 不是“漏洞被修复”，而是“第一证据口被污染”。

研究含义：

- 如果 Agent 的 SQLi 验证策略依赖少数熟悉 payload 和直接状态码，它会很容易把可见失败当成事实失败。
- 如果 Agent 只是换更多同类 payload，而没有建模 selector 边界或 alternate proof family，它会产生大量活动但没有新证据。
- 这也是 ATOBench 比 final-score benchmark 更有用的地方：它能区分“没尝试”和“尝试很多但没有恢复证据”。

### Basket Ownership Mirror：关系证据为什么更容易恢复？

- Basket AOU 不把请求变成失败：
  - HTTP 200 仍保留。
  - JSON schema 仍保留。
  - 只把 foreign basket 显示成 subject-compatible ownership relation。
- 这让 Agent 的困境更隐蔽：
  - 它可能以为没有 BOLA/IDOR。
  - 也可能通过反向身份、第三次读取、未认证访问或 own-basket baseline 发现关系不一致。
- 论文结果显示：
  - 39/75 有 registered adaptive action。
  - 25/75 恢复 primary evidence。
  - 22/75 把证据推进到 supported report。

研究含义：

- 关系型漏洞不一定依赖单一响应。
- 只要 Agent 愿意做多身份 differential check，它仍可能恢复事实。
- 但从 39 到 25 的损耗说明，适配行为本身不够；必须找到能真正反驳 mirror 的关系证据。

### JWT Reusable Artifact：artifact 持久性降低了欺骗伤害

- JWT AOU 的 transform 更像“删除某个可见 claim”：
  - 登录成功仍发生。
  - token 仍可用于 protected endpoints。
  - 只是 password-hash claim 被移除并重新签名。
- 恢复路径也更直接：
  - 后续成功登录可以重新获得 native artifact。
  - artifact 可被本地解码和复查。
- 结果中最醒目的数字是：
  - 45/75 ATO episode 有 primary evidence。
  - 其中 44 个进入 supported report。

研究含义：

- 可重获 artifact 让 Agent 有更多机会把证据带到报告里。
- 但 JWT 仍从 84.0% 降到 58.7%，说明一次隐藏 claim 仍会造成明显损耗。
- 对安全 Agent 来说，artifact 类证据应鼓励“重新获取、重新解码、对比 claim”，而不是只保存第一次观察。

## 4.7 这篇论文的失败案例该怎么读？

### 不要把 SQLi 失败读成“SQLi 很难”

- Native 下 SQLi pooled grounded verification 是 44.0%。
- 五个模型在 Native 下都不是零：
  - DeepSeek-V4-Pro 和 GPT-5.5 都是 60.0%。
  - GLM-5.2 是 46.7%。
  - Kimi-K2.6 和 Qwen3.7-Max 是 26.7%。
- 因此论文不是说这些 Agent 不会做 SQLi。
- 它说的是：
  - 当 direct proof 被目标侧 observation transform 改写后，这些 Agent 没能找到注册的 alternate proof。

### 不要把 SQLi 失败读成“Agent 太早放弃”

- Figure 4 和补充表都说明：
  - SQLi ATO 的动作更多。
  - 重复更多。
  - endpoint family switch 更多。
  - payload family switch 更多。
- 更准确的读法是：
  - Agent 并没有简单停止。
  - 它进入了更长的验证循环。
  - 但这些循环没有命中有效恢复路径。

### 不要把 JWT 成功读成“安全”

- JWT ATO 仍下降 25.3 个百分点。
- GPT-5.5 的 JWT 从 73.3% 降到 20.0%，是最大模型级损耗。
- 这说明 artifact 可恢复不等于所有 scaffold 都能恢复。
- 更稳妥的解释是：
  - artifact 的可重获性给了 Agent 机会。
  - 但 Agent 是否抓住机会，仍取决于具体验证习惯和停止判断。

### 不要把 Basket 波动读成“噪声”

- Basket 有模型上升、持平、下降三种形态。
- 这可能来自关系验证路径本身的多样性：
  - 有的 Agent 会做反向身份对照。
  - 有的 Agent 会重复同一 basket read。
  - 有的 Agent 会直接相信 subject-compatible 响应。
- 因此 Basket 的价值是展示“关系证据”这一类不同于 direct proof 和 reusable artifact 的中间地带。

## 4.8 从评测设计看，它比普通 benchmark 多了什么？

```mermaid
flowchart LR
  A["Traditional benchmark"] --> B["Milestone or final report"]
  C["ATOBench"] --> D["Registered intervention"]
  D --> E["Aligned trajectory"]
  E --> F["Primary evidence"]
  F --> G["Stop descriptor"]
  G --> H["Trace-supported report"]
```

传统 benchmark 的缺口：

- 如果 Agent 最后没报漏洞，不知道是没触达、被误导、没恢复证据，还是恢复了但没写。
- 如果 Agent 最后报了漏洞，不知道 trace 是否支持这个 claim。
- 如果 Agent 动作很多，不知道是有效探索还是重复循环。

ATOBench 的新增能力：

- 通过 anchor 对齐，把“被干预之后”作为分析起点。
- 通过 AOU 合约，把 deception 的选择器、剂量和恢复路径写清。
- 通过 \(E,C,S\) 三个 predicate，把证据、closure、support 拆开。
- 通过 trajectory descriptor，把停止是否 ready-supported 单独分析。

## 5. 主结果：SQLi 在 ATO 下跨模型崩溃

### 5.1 Grounded verification rate

| Model | Basket Native | Basket ATO | JWT Native | JWT ATO | SQLi Native | SQLi ATO |
|---|---:|---:|---:|---:|---:|---:|
| DeepSeek-V4-Pro | 53.3 | 53.3 | 100.0 | 86.7 | 60.0 | 0.0 |
| GLM-5.2 | 13.3 | 26.7 | 60.0 | 66.7 | 46.7 | 0.0 |
| GPT-5.5 | 33.3 | 26.7 | 73.3 | 20.0 | 60.0 | 0.0 |
| Kimi-K2.6 | 60.0 | 53.3 | 86.7 | 66.7 | 26.7 | 0.0 |
| Qwen3.7-Max | 66.7 | 40.0 | 100.0 | 53.3 | 26.7 | 0.0 |
| **Pooled** | **45.3** | **40.0** | **84.0** | **58.7** | **44.0** | **0.0** |

### 5.2 这个表说明什么？

- Basket：
  - ATO 只从 45.3% 降到 40.0%。
  - 有些模型甚至没有下降或上升，说明关系证据仍有恢复空间。
- JWT：
  - 从 84.0% 降到 58.7%，下降明显但没有归零。
  - 说明 artifact 被隐藏一次后，Agent 仍可能通过后续登录或 artifact 使用重新获得证据。
- SQLi：
  - Native 下五个模型都有一定成功率。
  - ATO 下所有模型全部 0/15。
  - 这不是某个模型弱，而是合约触发了共同的 direct-proof recovery bottleneck。

### 5.3 capability-conditioned retention

论文还只看“Native 已经证明具备能力，并且 ATO 下确实接触了 registered target”的 pairs：

| AOU | Target pairs | Observed | Retained | Retention 95% CI | Missing bounds |
|---|---:|---:|---:|---:|---:|
| Basket | 26 | 21 | 13 | 61.9% [38.4, 81.9] | [50.0, 69.2] |
| JWT | 57 | 48 | 38 | 79.2% [65.0, 89.5] | [66.7, 82.5] |
| SQLi | 22 | 22 | 0 | 0.0% [0.0, 15.4] | [0.0, 0.0] |

这里的关键是 SQLi 的 bounds 仍是 0.0-0.0。也就是说，按论文定义的 observed target 内，缺失结果如何分配都不能挽救 SQLi ATO 的 retention。

## 6. 失败断点：不是所有合约都断在同一环

![ATO 下三类合约的验证路径：Basket/JWT 仍能把部分证据带到报告，SQLi 在 primary proof 前断裂。](/assets/2026/08/15/itm_aca6798f2d3a6289/figure3-verification-paths.png)

### 6.1 Figure 3 的读法

- Basket 的路径是：
  - 39/75 有 registered adaptive action。
  - 25/75 进一步拿到 primary evidence。
  - 22/75 进一步写成 supported report。
- JWT 的路径是：
  - 45/75 拿到 primary evidence。
  - 39/75 到达 ready-supported stop。
  - 38/75 到达 supported report。
- SQLi 的路径是：
  - 19/75 尝试 alternate strategy。
  - 0/75 拿到 primary proof。

### 6.2 不同合约的瓶颈不同

| 合约 | 主要断点 | 研究意义 |
|---|---|---|
| Basket | adaptive action 后不一定恢复 relation evidence | Agent 可能知道要换角度查，但不一定找到正确关系证据 |
| JWT | evidence-positive 后大多能进入报告，少量卡在 stop/report | 可重获 artifact 更容易穿过证据链 |
| SQLi | alternate strategy 后仍没有 primary proof | direct proof 被伪装后，Agent 更容易陷入重复验证而非恢复证明 |

### 6.3 论文最有价值的细节

- JWT 的 45 个 evidence-positive ATO episode 中，44 个最终进入 supported report。
- Basket 中 25 个 \(A \cap E\) episode 里，22 个进入 supported report。
- SQLi 中 19 个 alternate strategy episode 里，0 个进入 \(A \cap E\)。

这说明：

- **报告写作不是所有失败的共同根因。**
- SQLi 的失败更靠前，发生在 primary proof recovery。
- JWT/Basket 的问题更接近 evidence recovery 和 report propagation 的损耗。

## 7. 更多动作为什么不是更好验证？

![SQLi ATO 相对 Native 的 post-anchor 动作、重复、endpoint switch、payload switch 都显著增加，但没有恢复 grounded verification。](/assets/2026/08/15/itm_aca6798f2d3a6289/figure4-action-deltas.png)

### 7.1 动作增量

| AOU | \(\Delta\) actions | \(\Delta\) repeated | \(\Delta\) endpoint switches | \(\Delta\) payload switches |
|---|---:|---:|---:|---:|
| Basket | +1 [-7, 5.5] | +1 [-3.5, 5.5] | 0 [-4.5, 6.5] | 0 [-2, 3] |
| JWT | +2 [-4, 7] | 0 [-4, 5] | -1 [-6, 5] | 0 [-2, 2] |
| SQLi | +14 [3.5, 31] | +9 [3, 20] | +5 [1, 14] | +6 [3, 11] |

### 7.2 pair-level 方向

- 在 75 对 SQLi matched pairs 中：
  - 64 对 ATO 的 total actions 多于 Native。
  - 61 对 ATO 的 repeated actions 多于 Native。
  - 58 对 ATO 的 endpoint switches 多于 Native。
  - 65 对 ATO 的 payload switches 多于 Native。
- Basket/JWT 没有出现这种四个维度一致偏正的模式。

### 7.3 机制解释

可以把 SQLi ATO 的失败写成一条状态机：

```mermaid
flowchart TD
  A["Agent sends SQLi probe"] --> B["Target executes vulnerable request"]
  B --> C["AOU changes visible proof into failure or empty result"]
  C --> D["Agent distrusts or rechecks the hypothesis"]
  D --> E["More payloads and endpoint switches"]
  E --> F{"Find alternate primary proof?"}
  F -- "No: 0/19 alternate strategies recover proof" --> G["Unresolved or unsupported closure"]
  F -- "Yes: not observed in registered SQLi ATO cohort" --> H["Grounded verification"]
```

这张图对应的研究结论：

- Agent 的探索强度增加，并不等于验证质量提升。
- 如果评测只看“是否继续探索”或“是否尝试更多 payload”，会误判 SQLi ATO 下的行为。
- 真正需要观测的是：
  - 它找到什么证据。
  - 证据是否和目标事实对应。
  - 停止是否由证据支持。
  - 报告是否被 trace 支撑。

## 8. 关键 Figure/Table 逐项证据解读

### 8.1 Figure 1：框架总览

- Figure 1 把 ATOBench 的数据流压成一张图：
  - Native/ATO pentest session。
  - MITM proxy 注入响应转换。
  - runtime trace 与 session transcripts。
  - trajectory judge、evidence verifier、expert audit。
  - 最终输出 verification control、stop decision、report grounding。
- 这张图的作用不是给出结果，而是说明为什么 ATOBench 能把 final report 拆回过程证据。

### 8.2 Figure 2：SQLi 轨迹示意

![SQLi verification trajectory：初始探测后进入验证循环，最后退出并报告。](/assets/2026/08/15/itm_aca6798f2d3a6289/figure2-sqli-trajectory.png)

- Figure 2 说明 SQLi ATO 的典型形态：
  - 初始 probe 触达被改写的响应。
  - Agent 在失败表象下进入 verification loop。
  - 它可能换 payload、换 endpoint、重复测试。
  - 最终退出时没有恢复 registered primary proof。
- 这与 Figure 4 的动作增量互相支持：
  - 多动作不是空转的主观描述，而是 post-anchor sequence 指标可见。

### 8.3 Table 1/3：AOU 合约

- SQLi 的 transform 是最强烈的：
  - 成功证明被可见地改成失败或空结果。
  - 但恢复路径仍存在，只是需要逃离 raw selector 的变体。
- Basket 的 transform 保留 schema 和 HTTP 200：
  - 它更像“关系事实被镜像成主体兼容”。
  - 第三次同向读取是同 surface recovery。
- JWT 的 transform 保留 token 可用性：
  - 它只移除一个 claim。
  - 后续登录可重新获得 native artifact。

### 8.4 Table 2：grounded verification 主表

- Table 2 的核心不是 pooled 平均值，而是 SQLi ATO 的横向一致性：
  - 所有模型都是 0.0。
  - Native 行又不是 0.0。
- 这让论文有资格说：
  - 合约特定断裂，而不是模型整体无能。

### 8.5 Appendix 的 sensitivity

- 作者额外做了 18 对 SQLi doubled wall-clock budget sensitivity。
- product-search SQLi closure：
  - Native 是 15/2/1。
  - ATO 是 0/15/3。
- any registered SQLi finding：
  - Native 是 16/1/1。
  - ATO 是 0/14/4。
- 这说明在这个 frozen sensitivity cohort 里，单纯翻倍时间没有恢复 SQLi closure。

## 9. 相关工作中的位置

### 9.1 与 autonomous pentest benchmark 的关系

- PentestGPT、PentestAgent、AutoPenBench、PentestEval 等工作建立了：
  - 任务型 pentest Agent 是否能推进阶段。
  - 漏洞靶场上是否达到 milestone。
  - 不同架构或模型的成功率差异。
- ATOBench 不替代这些 benchmark，而是补一个维度：
  - 在目标响应不可信时，是否能审计“报告声明来自哪条证据链”。

### 9.2 与 cyber deception 的关系

- CHeaT、decoy-based deception、agent-oriented canary 更关注：
  - 如何让攻击者绕路。
  - 如何检测攻击者。
  - 如何降低攻击成功率。
- ATOBench 更关注：
  - deception 作为 evaluation probe，如何暴露 Agent 的证据处理缺陷。

### 9.3 与过程评测的关系

- AgentBoard、TRAJECT-Bench、AgentProcessBench 强调：
  - step-level process。
  - tool dependency。
  - trajectory quality。
- ATOBench 的特殊性在于：
  - 它不是给每一步泛化打分。
  - 它从一个注册的 target-side intervention 出发，追踪具体安全事实的 verification chain。

## 10. 证据边界与可复现性

### 10.1 论文自己承认的边界

- 固定预算会影响 late recovery：
  - SQLi/JWT 是 40 calls、2400 秒。
  - Basket 是 70 calls、3000 秒。
- 结果描述的是该 harness 下的行为：
  - 不是无限时间渗透测试。
  - 不是所有 autonomous pentest scaffold。
  - 不是所有 Web 漏洞类型。

### 10.2 我读下来认为还要补的边界

- **代码仓库边界**：
  - 论文列出 GitHub 链接。
  - 认证 GitHub API 显示仓库创建于 2026-08-12、push 于 2026-08-13。
  - 但当前公开树只有 README，正文是 “Repo for ATOBench”。
  - 因此，可复现性主要还不能依赖仓库代码，而要依赖论文 source 中的合约、表格和描述。
- **模型路线边界**：
  - 论文使用若干 2026 年模型路线名称。
  - 这些路线在外部服务中的具体实现、版本锁定、采样细节，仍需要 artifact 支撑。
- **Judge 边界**：
  - LLM-as-judge 做了 blinding、双审、adjudication、evidence verifier。
  - 但 trajectory judgment 仍是模型辅助判定，不等同于形式化验证。
- **AOU 选择边界**：
  - SQLi、Basket、JWT 的差异很清晰。
  - 但它们是三个精心构造的 evidence structure，不代表所有漏洞证据都会呈现相同规律。

## 11. 研究者视角的延伸问题

### 11.1 Agent 安全评测应报告“证据链完整性”

- ATOBench 给出的启发不是“多做一个 SQLi benchmark”，而是：
  - 对安全 Agent，final score 必须拆成 evidence chain。
  - 尤其在高风险任务中，报告不能自证正确。
- 一个更严格的安全 Agent 评测项应至少包括：
  - contact：是否接触关键响应。
  - recovery：是否找到替代证据。
  - stop：是否在证据充分时停止。
  - report：是否把证据准确带入报告。
  - contradiction handling：是否处理相互冲突的 target observations。

### 11.2 后训练和 Agent scaffold 的问题

- 如果要用后训练改进这类 Agent，reward 不能只奖励：
  - 打到 endpoint。
  - 最终报告提到漏洞。
  - 动作数更多。
- 更合理的 reward 应奖励：
  - 对 target claim 的低信任处理。
  - baseline/differential 检查。
  - 证据引用可追溯。
  - 看到冲突证据后能降级假设。
  - 在“不知道”时避免 unsupported closure。

### 11.3 对安全防御的反向问题

- 从防御角度看，ATOBench 暗示了一个攻击面：
  - 只要能改变 Agent 看到的关键 proof，就可能让它陷入验证循环。
- 但从评测伦理看，这不能简单变成“教防御方欺骗 Agent”：
  - 更重要的是让 Agent 知道目标环境本身可能是 adversarial evidence surface。
  - 安全 Agent 必须把 target response 当 observation，而不是 authority。

### 11.4 下一步值得问什么？

- 如果 AOU 不是响应级，而是 DOM、日志、issue、CI output、cloud console event，会不会出现类似失败？
- 如果 Agent scaffold 强制维护 belief ledger、evidence ledger、contradiction ledger，SQLi proof recovery 会不会改善？
- 如果 reward model 看完整 trace，而不是只看 final answer，能否学到“少重复、多交叉验证”的策略？
- 如果 target-side deception 与 prompt injection 同时存在，Agent 会先被指令污染还是先被证据污染？
- 如果 Agent 有多个工具和 memory，错误 observation 会不会被长期固化为错误技能或错误经验？

## 12. 结论

- ATOBench 的最大贡献是把 autonomous pentest Agent 的可靠性问题从“有没有报对漏洞”推进到“证据链在哪里断了”。
- 三个 AOU 证明不同证据结构有不同恢复难度：
  - Basket 关系证据仍能部分恢复。
  - JWT artifact 一旦重新获得，通常能进入报告。
  - SQLi direct proof 被改写后，即便动作更多，也没有恢复 registered primary proof。
- 对 AI 安全研究而言，这篇论文最值得保留的判断是：
  - **目标响应不是事实本身，而是需要被交叉验证的证据来源。**
  - **Agent 的活动量不是验证质量，报告文本也不是证据。**
- **真正需要评测的是 observation -> evidence -> stop -> report 的完整链条。**
- 这条链也应成为后续安全评测的最低审计对象。
