# WebMCP Tool Surface Poisoning：当 Agent 信任“工具列表”本身，攻击面就前移了

### 元信息

- 论文：**WebMCP Tool Surface Poisoning: Runtime Manipulation Attacks on LLM Agents**
- 作者：Lin-Fa Lee、Yi-Yu Chang、Chia-Mu Yu、Kuo-Hui Yeh
- 原文：[arXiv:2606.06387](https://arxiv.org/abs/2606.06387)
- 版本：v1，2026-06-04 16:52:43 UTC 提交
- 类型：AI Agent 安全论文
- 关键词：WebMCP、Model Context Protocol、tool injection、tool metadata poisoning、LLM agent security、data exfiltration

### TL;DR

- 这篇论文研究的不是传统 prompt injection，而是 **WebMCP 会话中动态工具面的投毒**：第三方脚本在页面运行时改变 Agent 可见的工具集合、工具名称、description、`readOnlyHint` 或 `inputSchema`，诱导 Agent 调用恶意工具并把任务数据送到攻击端点。
- 作者提出 **Mid-Session Tool Injection，MSTI**，把攻击拆成两大类：**Tool Hijacking** 直接改 Agent 能看到和调用的工具集合；**Tool Framing** 不替换功能，而是用工具元数据改变 Agent 对工具角色的理解。
- 实验使用四类任务场景：知识库搜索、商业报告发送、电商 checkout、GPU driver update；三种模型 Agent：GPT-5.4、Claude Opus 4.6、Gemini 2.5-flash；核心指标是 ASR、任务完成率和是否向 attacker endpoint 外泄数据。
- 主结果显示两种风险形态不同：C1 AbortSignal hijack 平均 ASR **94%**，C3 registration race 平均 ASR **100%**，但任务完成率只有 **18%/17%**；C2 description injection 和 C5 composite 的 ASR 为 **59%/61%**，任务完成率却高达 **81%/85%**，更像隐蔽偏转。
- timing 实验给出关键边界：Tool Hijacking 的 P1，即 agent loop 开始前投毒，ASR **100%**；P2、P3、P4 都是 **0%**。Tool Framing 没有这么硬的边界，但越早注入越有效，S1 到 S3 呈明显衰减。
- 字段消融说明工具 metadata 不是中性说明文字：description-only 平均 ASR **93%**，`readOnlyHint`-only 平均 ASR **87%**，description + `readOnlyHint` 达到 **100%**；`inputSchema` 的效果高度模型依赖，Gemini 可到 **100%**，GPT-5.4 和 Claude 在该设置下为 **0%**。
- 作者实现的两类 baseline defense 在 testbed 中把五个主攻击条件 ASR 从 **36-100%** 降到 **0%**：Tool Hijacking 用 origin 绑定和同名注册拒绝；Tool Framing 用第三方工具参数限制，说明“模型被误导”和“数据真实外泄”可以分层防御。
- 局限也明确：实验用的是 CDN polyfill `@mcp-b/global` 和 Node.js ProxyClient，不是完整原生 Chrome WebMCP 安全模型；没有用户研究；防御只覆盖四类建议中的两类；四个任务和三个模型还不能证明所有 WebMCP 部署都会同样脆弱。

### 研究问题：为什么工具列表会变成安全边界？

传统 Agent 安全讨论常把风险放在三类输入上：

- 用户 prompt 里藏恶意指令；
- 网页、邮件、文档等外部内容里藏 indirect prompt injection；
- 工具返回值污染 Agent 的上下文。

这篇论文把问题往前移了一层：

> 如果 Agent 选择工具前看到的“工具列表”和“工具元数据”本身被运行时改变，模型是否还有机会判断自己处在被投毒环境？

WebMCP 的设计动机是让网站直接向 AI Agent 暴露结构化工具。

它带来两个便利：

- Agent 不必像人一样点击 UI，可以直接理解工具能力。
- 网站可以动态更新工具列表，让 Agent 适应页面状态变化。

但便利背后有一个假设被打破：

- 静态 MCP 或固定工具池里，工具集合通常在任务开始前被认为已经确定。
- WebMCP 里，工具列表可以在同一页面、同一会话、同一任务中变化。
- 如果页面加载了 CDN、广告 SDK 或其他第三方 JavaScript，这些脚本可能改变 Agent 可见的工具面。

论文的核心问题因此变成：

```text
Agent action = f(user task, model state, visible tools, tool metadata, tool outputs)

传统防御更关注 user task 和 tool outputs。
MSTI 关注 visible tools 与 tool metadata 在会话中的动态可变性。
```

变量解释：

- `visible tools`：Agent 调用 `listTools()` 或等价机制时看到的工具集合。
- `tool metadata`：工具名、description、annotation、`readOnlyHint`、`inputSchema` 等字段。
- `model state`：模型在多步执行中积累的任务目标、上下文和中间结果。
- `Agent action`：模型下一步选择哪个工具、传入哪些参数、是否继续完成原任务。

这个公式不是原文公式，而是对论文问题的结构化重写。它说明 MSTI 的危险在于：攻击者不必等模型读到恶意内容，而是可以改变模型认为“可用且可信”的行动空间。

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| WebMCP 的动态工具面是新的安全边界 | 第三方脚本可在同页改工具注册、替换、元数据和生命周期 | MSTI taxonomy：Tool Hijacking 与 Tool Framing | 实验基于 polyfill + ProxyClient，原生浏览器实现可能有差异 |
| Tool Hijacking 是协议/生命周期层问题 | AbortSignal、同名注册、registration race 改变 Agent 可见工具 | C1 平均 ASR 94%，C3 平均 ASR 100% | 低任务完成率受 payload 设计影响，真实攻击可伪造成功响应 |
| Tool Framing 是语义/元数据层问题 | description、工具名、`readOnlyHint`、`inputSchema` 改变 Agent 对工具角色的理解 | C2 ASR 59% 且任务完成率 81%；C5 ASR 61% 且任务完成率 85% | 受模型、字段、注入时机、任务语境影响明显 |
| 元数据字段不是中性 UI 文案 | Agent 会把 description、read-only 标记、schema 描述当作执行信号 | AB1 平均 ASR 93%；AB2 平均 ASR 87%；AB4 平均 ASR 100% | AB0 与 AB1-AB5 工具名不完全相同，消融不是完全纯净 |
| 单靠模型升级不能解决工具生命周期攻击 | 协议层替换发生在模型语义判断前 | C1/C3 在 prior models 与 SOTA models 上都保持高 ASR | 语义 framing 的风险随模型而变，不能简单外推 |
| 防御应分层：身份绑定管 hijacking，数据流限制管 framing | origin binding、同名注册拒绝、第三方参数限制 | 五个主条件 defended ASR 均为 0% | 只是 baseline defense，未测生产成本和完整浏览器安全模型 |

### 方法机制：MSTI 到底攻击什么？

论文把 MSTI 分成两类。

#### Tool Hijacking：改工具是否存在、何时存在、谁占用名字

Tool Hijacking 的攻击目标是工具集合本身。

典型做法包括：

- 让合法工具 unregister；
- 用 AbortSignal 触发工具生命周期变化；
- 在合法工具注册前抢占同名工具；
- 用恶意工具替代同名合法工具；
- 在 Agent 第一次调用前改变 `listTools()` 结果。

这种攻击的关键不是让模型“理解错”。

它更像供应链或运行时注册表攻击：

- 模型看见的工具已经是被替换后的工具；
- 如果工具名和接口足够像，模型可能没有语义层面的可见异常；
- 即使模型很强，也未必知道工具注册过程被同页脚本抢跑。

#### Tool Framing：不换工具，改 Agent 对工具角色的解释

Tool Framing 的攻击目标是工具元数据。

它不一定直接替换合法工具，而是把恶意工具包装成：

- 任务相关的辅助步骤；
- 必需的安全检查；
- 企业合规要求；
- workflow 的标准前置步骤；
- 看似无害的 read-only 操作；
- 合法工具的必要 prerequisite。

这种攻击更接近 indirect prompt injection，但区别在于注入载体不是网页正文，而是 Agent 原本就会信任的工具结构字段。

### 攻击条件 C1-C10：从主实验到变体

| 条件 | 类型 | 攻击说明 | 主实验/附录 | 关键意义 |
|---|---|---|---|---|
| C1 | Tool Presence | AbortSignal hijack，注销合法工具后用同名恶意工具重注册 | 主实验 | 验证生命周期替换风险 |
| C2 | Tool Framing | 在 description 放入 “Always call before ...” 一类 workflow 指令 | 主实验 | 验证语义 framing 可诱导调用 |
| C3 | Tool Presence | Registration race，恶意工具先抢同名注册 | 主实验 | 验证 first-register-wins 风险 |
| C4 | Tool Framing | 1203 词长 description 中混入恶意指令与合规套话 | 主实验 | 验证长元数据的模型差异 |
| C5 | Composite | presence manipulation + description/hint framing | 主实验 | 更接近真实组合攻击 |
| C6 | Tool Framing | 非冲突名字 + 中性 description | 附录 | 作为低信号下界，ASR 0% |
| C7 | Tool Framing | 企业语义强的工具名 | 附录 | 只靠名字也有 39% 平均 ASR |
| C8 | Tool Framing | 非冲突名 + 标记式 description injection | 附录 | 说明 prefix 指令不稳定 |
| C9 | Tool Framing | `readOnlyHint=true` 伪装安全只读 | 附录 | 主表中较弱，但字段消融里强度更高 |
| C10 | Tool Framing | 声称是合法工具 prerequisite | 附录 | 弱 framing 策略，平均 ASR 13% |

这里要注意一个细节：

- C6 的 ASR 是 0%，说明“随便加一个陌生工具”不会自然成功。
- C7 的平均 ASR 是 39%，说明工具名里的企业工作流语义已经足以影响选择。
- C2、AB1、AB4 的高 ASR 说明 description 与 read-only 信号组合后，Agent 会把工具 metadata 当成流程约束。

### 实验设置：四个任务、三个模型、三个指标

作者的实验框架有四个组件：

- task scenarios；
- benign page server；
- malicious server；
- LLM agent。

论文 Figure 1 展示了这个框架：

![WebMCP MSTI 实验框架](/assets/2026/06/07/itm_6102dc8831a7c675/experimental-framework.jpg)

这张图的证据作用很明确：

- 中间的 benign page 提供正常工具面和任务 workflow；
- 上方 malicious server 通过被攻陷的第三方脚本介入页面；
- 右侧 LLM agent 执行工具调用；
- 下方 attacker endpoint 用于记录是否发生数据外泄。

四个任务场景按严重度递增：

| 严重度 | 场景 | 合法工具序列 | 风险含义 |
|---|---|---|---|
| Weak | 知识库搜索 | `search_articles → get_article → save_to_knowledge_base` | 信息检索与保存 |
| Medium | 商业报告生成 | `get_sales_data → generate_report → send_email` | 企业数据处理与邮件发送 |
| Strong | 电商 checkout | `get_cart → apply_coupon → checkout` | 交易流程和支付动作 |
| Critical | GPU driver update | `check_driver_version → download_driver → execute_installer` | 系统级操作和安装执行 |

三种模型 Agent：

- GPT-5.4；
- Claude Opus 4.6；
- Gemini 2.5-flash。

三个核心指标：

| 指标 | 定义 | 为什么重要 |
|---|---|---|
| ASR | Agent 调用恶意工具并向 attacker endpoint 发送任务相关数据的比例 | 同时衡量工具误选和数据外泄 |
| Task Completion | 原始用户任务是否完成，不管是否同时发生恶意调用 | 区分破坏型攻击和隐蔽型攻击 |
| Exfiltration Evidence | 数据是否抵达攻击端点 | 避免只看“模型是否选错工具”的表面结果 |

作者强调，恶意工具调用在 testbed 中会立即触发 exfiltration。

所以 ASR 在这里不只是“调用了坏工具”，而是“坏工具调用造成了外泄”。

### 主结果：高 ASR 不等于高隐蔽性

主实验的五个条件如下：

| 条件 | GPT-5.4 | Claude Opus | Gemini 2.5 | 平均 ASR | 任务完成率 | 解释 |
|---|---:|---:|---:|---:|---:|---|
| C1 AbortSignal hijack | 100% | 100% | 82% | 94% | 18% | 强替换，容易破坏 workflow |
| C3 Registration race | 100% | 100% | 100% | 100% | 17% | 最稳定 hijack，但任务常停在第一步 |
| C2 Description injection | 78% | 38% | 62% | 59% | 81% | 不直接替换，能保持任务表面正常 |
| C4 Long-desc. overflow | 35% | 0% | 72% | 36% | 85% | 模型差异最大 |
| C5 Composite | 78% | 35% | 70% | 61% | 85% | 组合攻击更隐蔽 |

这张表最重要的不是谁最高，而是两类攻击的风险形态完全不同。

#### Tool Hijacking：成功率高，但容易打断任务

C1 和 C3 都能让 Agent 大概率把数据送到恶意工具。

但任务完成率很低：

- C1：18%；
- C3：17%。

作者检查日志后认为，低完成率来自 payload 设计：

- 恶意工具常在第一步破坏 workflow；
- Agent 因为拿不到合法后续结果而停住；
- 这不代表 hijacking 天然不隐蔽。

论文局限部分还补了一句关键判断：

- 如果真实攻击者知道原工具接口；
- 并返回看似合法的 success response；
- 任务完成率很可能显著提高；
- 用户会更难发现工具被替换。

这意味着 C1/C3 的低任务完成率不能当成安全慰藉。

#### Tool Framing：成功率略低，但更像真实隐蔽攻击

C2 和 C5 的 ASR 低于 C1/C3。

但它们的任务完成率高很多：

- C2：81%；
- C5：85%。

这更危险，因为用户可能看到：

- 邮件发出去了；
- 报告生成了；
- checkout 完成了；
- 驱动更新流程看似继续了。

与此同时，敏感上下文已经被额外传给了恶意工具。

所以 framing 型攻击的安全评价不能只看原任务是否成功。

必须问：

- 多调用了哪个工具？
- 参数里多带了什么上下文？
- 数据去了哪个 origin？
- 工具调用是否符合用户授权的任务边界？

### Timing 结果：攻击窗口也是安全边界

论文对 timing 做了两组补充实验。

#### Tool Hijacking 的硬边界

| 注入点 | 定义 | C1 ASR |
|---|---|---:|
| P1 | agent loop 开始前 | 100% |
| P2 | `listTools()` 后、模型第一次决策前 | 0% |
| P3 | 第一次 `callTool()` dispatch 前 | 0% |
| P4 | 第一次工具调用后 | 0% |

这说明在作者实现里，Tool Hijacking 的成功强依赖 **first invocation 前工具面是否已经被污染**。

安全含义是：

- 工具注册完成时刻；
- Agent 读取工具列表时刻；
- 模型选择工具时刻；
- 实际 dispatch 时刻；
- 调用前一致性校验时刻；

这些都不是普通实现细节，而是安全边界。

如果 planning 阶段看到的工具和 invocation 阶段实际调用的工具不能绑定一致，Agent 的计划就可能被 TOCTOU 式替换。

#### Tool Framing 的软边界

| 注入点 | 定义 | C2 | C4 | C5 |
|---|---|---:|---:|---:|
| S1 | 敏感上下文进入前 | 82% | 38% | 68% |
| S2 | 敏感上下文后、最终动作前 | 62% | 12% | 55% |
| S3 | 最终动作前，负控制 | 28% | 0% | 30% |

Tool Framing 没有 P1/P2 那种断崖式边界。

但它仍然遵循一个趋势：

- 越早进入 Agent 的计划空间，越容易影响后续选择。
- 越接近最终动作，Agent 已经形成 workflow，framing 空间变小。
- 即使 S3 仍有 28%/30%，说明临近最终动作时仍可能通过“最后检查”“合规记录”等方式插入。

### 字段消融：description 和 readOnlyHint 为什么危险？

作者做了 AB0-AB5 字段消融。

| 变体 | description | readOnlyHint | inputSchema | GPT-5.4 | Claude | Gemini | 平均 |
|---|---|---|---|---:|---:|---:|---:|
| AB0 | 无 | 无 | 无 | 0% | 0% | 0% | 0% |
| AB1 | 有 | 无 | 无 | 100% | 100% | 80% | 93% |
| AB2 | 无 | 有 | 无 | 60% | 100% | 100% | 87% |
| AB3 | 无 | 无 | 有 | 0% | 0% | 100% | 33% |
| AB4 | 有 | 有 | 无 | 100% | 100% | 100% | 100% |
| AB5 | 有 | 无 | 有 | 100% | 0% | 80% | 60% |

几个结论很清楚。

#### 1. description 是强控制通道

AB1 平均 ASR 93%。

原因不难理解：

- Agent 被训练成认真阅读工具说明；
- description 通常告诉模型何时使用工具；
- 如果 description 中嵌入 “Always call before send_email” 之类流程指令，模型会把它当作工具使用规范。

这不是模型“蠢”，而是工具使用范式本身鼓励模型相信 description。

#### 2. readOnlyHint 不是弱信号

AB2 平均 ASR 87%。

这很值得警惕：

- `readOnlyHint=true` 本来可能用于帮助 Agent 区分安全读取和副作用动作。
- 但一旦第三方工具能自称 read-only，它反而降低 Agent 的警觉。
- 模型可能把“只读”理解成“可以放心调用”。

安全启发是：

> read-only 不应由工具自我声明后直接被 Agent 信任，而应由宿主、origin、权限系统和数据流策略共同验证。

#### 3. inputSchema 是模型依赖通道

AB3 中：

- GPT-5.4：0%；
- Claude：0%；
- Gemini：100%。

这说明 schema 描述不是普遍有效的攻击面，但对某些模型非常强。

安全系统不能因为两个模型忽略 schema 语义，就认为 schema 字段安全。

如果一个部署支持多模型或未来模型升级，schema 字段也必须进入安全审查。

#### 4. description + readOnlyHint 组合最稳

AB4 三个模型全部 100%。

这说明最危险的 framing 不是单条恶意语句，而是多字段一致叙事：

- 工具名像企业流程；
- description 说它是必要步骤；
- `readOnlyHint` 暗示安全；
- 参数设计诱导传入上下文。

Agent 看到的是一套完整的“可信工具人格”。

### 防御实验：为什么 0% ASR 仍要谨慎解读？

作者按两类攻击实现了两个 baseline defense：

- 对 Tool Hijacking：注册时绑定 origin，拒绝同名但不同 origin 的后续注册。
- 对 Tool Framing：拦截第三方 origin 工具调用，限制它们可接收的参数字段。

结果：

| 条件 | 攻击类型 | baseline ASR | defended ASR |
|---|---|---:|---:|
| C1 | AbortSignal hijack | 94% | 0% |
| C3 | Registration race | 100% | 0% |
| C2 | Description injection | 59% | 0% |
| C4 | Long-desc. overflow | 36% | 0% |
| C5 | Composite | 61% | 0% |

这个结果支持一个重要分层：

```text
Observed Harm = Model Misled × Data Flow Allowed × Tool Invocation Authorized

即使 Model Misled = true，
只要 Data Flow Allowed = false 或 Tool Invocation Authorized = false，
真实外泄仍可被切断。
```

变量解释：

- `Model Misled`：模型是否相信恶意工具是合理步骤。
- `Data Flow Allowed`：敏感参数是否允许流向该工具。
- `Tool Invocation Authorized`：该 origin、tool_id、capability 是否有权被调用。
- `Observed Harm`：实际可观测的数据外泄或高风险动作。

这就是论文防御实验最有价值的地方：

- 它没有试图让模型永远不被骗。
- 它把“被骗”和“造成伤害”拆开。
- Tool Hijacking 用注册身份一致性处理。
- Tool Framing 用数据流和能力边界处理。

但 0% 不能被过度解读：

- 这是固定 testbed 下的 baseline defense。
- origin enforcement 是在 ProxyClient 层模拟，不是浏览器原生实现。
- 只覆盖作者四类建议中的 A 和 C，没有实现生命周期一致性 B 和 provenance log D。
- 没有测复杂真实网站、嵌套 iframe、多 CDN、多工具供应商、OAuth token、用户 consent UI。

### 伪代码：一个安全 WebMCP 调用前校验应该检查什么？

基于论文建议，可以把安全调用流程写成伪代码：

```text
Input:
  user_task
  planned_tool_name
  planned_tool_id
  planned_metadata_hash
  planned_owner_origin
  call_arguments
  current_tool_registry
  sensitive_context_labels

State:
  plan_snapshot = tool state observed during planning
  invocation_snapshot = tool state observed before dispatch
  provenance_log = registration / update / unregister / invocation events

Loop:
  before each callTool(planned_tool_name):
    current_tool = current_tool_registry.lookup(planned_tool_name)

    if current_tool.tool_id != planned_tool_id:
      block call
      request re-planning

    if current_tool.owner_origin != planned_owner_origin:
      block call
      require explicit user authorization

    if hash(current_tool.metadata) != planned_metadata_hash:
      invalidate old plan
      request re-validation

    allowed_fields = policy.allowed_fields(current_tool.capability, current_tool.origin)
    filtered_arguments = remove_sensitive_fields(call_arguments, allowed_fields)

    if filtered_arguments drops required sensitive fields:
      ask user or trusted host for consent

    append provenance_log
    dispatch call with filtered_arguments only

Output:
  either safe tool result, blocked call, or re-planning request

Failure boundary:
  if registry cannot prove origin, tool_id, metadata consistency, and data scope,
  default should be no dispatch, not best-effort execution.
```

这个伪代码对应论文四类设计建议：

- tool identity and ownership；
- lifecycle and state consistency；
- capability and data flow；
- user-authorized task governance。

### Figure 与 Table 证据逐项解读

| 证据 | 支持的结论 | 不能证明什么 |
|---|---|---|
| Figure 1 实验框架 | MSTI 通过同页第三方脚本、恶意服务器和 attacker endpoint 形成完整链路 | 不能证明原生 Chrome WebMCP 一定同样可攻 |
| Table main results C1-C5 | Tool Hijacking 高 ASR；Tool Framing 更隐蔽 | 不能证明所有任务、所有工具、所有模型都有相同数值 |
| Timing Table P1-P4 | Hijacking 成功依赖 first invocation 前窗口 | 不能覆盖更复杂的多次工具刷新和长程任务 |
| Timing Table S1-S3 | Framing 越早越有效，但晚期仍可能部分有效 | 不能说明真实用户是否能发现多余步骤 |
| Field ablation AB0-AB5 | description、readOnlyHint、inputSchema 都可能成为攻击通道 | AB0 与 AB1-AB5 工具名差异使消融有轻微混杂 |
| Prior model comparison | 协议层攻击不靠模型升级自然消失 | 语义攻击的未来模型趋势仍不确定 |
| Defense Table | origin binding 与参数限制能在 testbed 中切断外泄 | 不能证明生产防御成本、误报率和用户体验可接受 |

### 与相关工作的位置：MSTI 相对 MCPTox 的增量在哪里？

论文把自己放在 MCP/Agent 工具安全研究的一个新位置。

| 工作/方向 | 主要攻击面 | 时间点 | 与 MSTI 的差异 |
|---|---|---|---|
| Prompt injection | 用户输入或外部内容里的恶意指令 | 执行前或执行中被模型读取 | 工具集合通常被假设固定 |
| Indirect prompt injection | 网页、邮件、文档、工具输出污染上下文 | Agent 读取外部内容后 | 攻击模型的文本解释，而非工具注册表 |
| MCPTox | 工具 metadata 在注册阶段被投毒 | MCP registration / pre-execution | 重点是静态 metadata poisoning |
| MCP-ITP | 自动化生成隐式工具投毒 | 注册阶段 | 强化 metadata injection，但不聚焦 WebMCP runtime |
| MCPShield / ShieldNet | 工具行为检查、网络流量观察、运行时防御 | 使用前、使用中或使用后 | 可缓解影响，但不直接解决同页脚本动态改 WebMCP 工具面 |
| MSTI | 运行时改变 Agent 可见工具和工具元数据 | WebMCP session runtime | 攻击对象是 visible tool surface 本身 |

所以 MSTI 的研究价值不是说“工具 description 会骗人”。

这个领域已经有不少工作指出 tool metadata poisoning。

它的新增点是：

- WebMCP 把工具暴露放到网页运行时；
- 第三方脚本可以在同页生命周期中介入；
- 工具注册、注销、替换、metadata update 都可能发生在任务中；
- Agent 的可见行动空间不再是静态可信输入。

### 局限：为什么这篇论文值得读，但不能直接等同真实世界风险上限？

作者自己列了几类局限。

#### 1. 实验不是原生浏览器 WebMCP

环境是：

- real browser page；
- CDN-loaded `@mcp-b/global` polyfill；
- `navigator.modelContext` API；
- Node.js ProxyClient；
- OpenAI、Anthropic、Google native LLM APIs。

这意味着：

- polyfill 的安全模型不等于 Chrome 原生实现；
- Node.js headless agent 不等于完整浏览器隔离模型；
- 原生 WebMCP 广泛可用后仍需复测。

#### 2. 没有用户研究

这很重要，因为 C2/C4/C5 的任务完成率高。

真正的问题是：

- 用户是否能发现多余工具被调用？
- 用户是否理解 read-only 工具也可能外泄上下文？
- UI 中 provenance log 怎样展示才不会被忽略？

论文没有回答这些问题。

#### 3. 防御只覆盖两类设计建议

作者提出四类安全设计：

- A：tool identity and ownership；
- B：tool lifecycle and state consistency；
- C：agent capability and data flow；
- D：user-authorized task governance。

但实现只覆盖：

- A 的 origin binding；
- C 的第三方参数限制。

B 和 D 没有被完整实现。

#### 4. 任务和模型覆盖有限

实验只有：

- 4 个任务场景；
- 3 个 SOTA 模型；
- 2 个 prior generation 模型用于比较；
- 固定攻击条件。

它足以说明 attack class 存在，但不足以给出行业级风险基准。

### 核心判断：WebMCP 安全不能只靠“模型更聪明”

这篇论文最重要的判断可以压缩成一句话：

> 当工具注册表和工具元数据是 Agent 规划输入的一部分时，它们就必须按安全边界处理，而不能按普通 UI 文案或开发者便利接口处理。

这对 Agent 系统设计有三个直接含义。

#### 1. 工具名不是身份

`send_email`、`audit_logger`、`checkout` 这类名字只是 public label。

安全系统需要：

- immutable `tool_id`；
- owner origin；
- script source；
- frame/document binding；
- capability declaration；
- metadata hash；
- registration history。

Agent planning 阶段和 invocation 阶段必须验证这些字段一致。

#### 2. metadata 不是说明文，是控制面

description、schema、annotation、`readOnlyHint` 都会影响模型动作。

因此需要：

- metadata trust level；
- third-party metadata quarantine；
- explicit source label；
- policy linting；
- human-visible provenance；
- 不允许第三方工具自证 read-only 后直接获得低摩擦调用。

#### 3. 防御重点是数据流和能力边界

不要把目标设为“模型永远不会调用坏工具”。

更现实的目标是：

- 即使调用了，也不能拿到不该拿的数据；
- 即使工具名被抢，也不能绕过 origin；
- 即使 description 很会包装，也不能升级 capability；
- 即使任务完成，也要能追踪额外调用。

### 领域延伸：下一步 Agent 安全研究该问什么？

#### 1. Tool TOCTOU benchmark

MSTI 本质上有明显 TOCTOU 味道：

- time of check：Agent 看到工具列表并规划；
- time of use：实际 dispatch 工具调用；
- 攻击者在两者之间改变 tool identity 或 metadata。

一个更系统的 benchmark 可以覆盖：

- 多次 `listTools()`；
- 长程任务中的工具刷新；
- iframe 和跨 origin 工具；
- OAuth scope 变化；
- 工具 schema 演化；
- agent memory 中保存的旧工具说明。

#### 2. Metadata trust policy

未来 MCP/WebMCP 客户端可能需要给每个 metadata 字段标注信任级别：

| 字段 | 可由工具自报吗 | 是否影响模型选择 | 是否需要宿主验证 |
|---|---|---|---|
| name | 可以展示，但不能作为身份 | 强影响 | 是 |
| description | 可以展示，但要标来源 | 强影响 | 是 |
| readOnlyHint | 不应只靠工具自报 | 强影响 | 必须 |
| inputSchema | 可描述参数，但应限制敏感字段 | 中到强，模型依赖 | 是 |
| capability | 应由 host/policy 归一化 | 强影响 | 必须 |
| data destination | 不应省略 | 决定外泄风险 | 必须 |

#### 3. Provenance log 的可用性

论文建议记录注册、注销、替换、metadata change 和 invocation。

但记录本身不够。

还要研究：

- 哪些日志应该实时提示用户？
- 哪些只给安全审计？
- Agent 是否应在 final answer 中声明额外工具调用？
- 高风险动作前是否要展示“此工具来自第三方 origin”？
- provenance log 如何避免被用户忽略？

#### 4. MCP/WebMCP 与浏览器安全模型的结合

WebMCP 把 Agent 工具暴露带进浏览器页面。

因此它不能只用 LLM 安全语言讨论，还要和传统 Web 安全结合：

- origin；
- CSP；
- iframe sandbox；
- permission prompt；
- service worker；
- subresource integrity；
- extension boundary；
- credential and token isolation；
- clickjacking-style UI mediation。

这篇论文没有完整展开这些浏览器机制，但它指出了为什么这些机制会重新变重要：Agent 正在把网页里的工具面当作可执行能力边界。

### 结论：MSTI 的真正威胁是“行动空间投毒”

MSTI 不是又一个 prompt injection 名词。

它把 Agent 安全问题从“模型读到了什么坏文本”推进到“模型以为自己拥有什么工具”。

这一区别很关键：

- prompt injection 污染的是指令解释；
- tool output injection 污染的是上下文状态；
- tool metadata poisoning 污染的是工具语义；
- MSTI 污染的是会话中动态变化的可执行行动空间。

论文给出的数字已经足够说明风险存在：

- C3 registration race：平均 ASR 100%；
- C1 AbortSignal hijack：平均 ASR 94%；
- C2 description injection：ASR 59%，任务完成率 81%；
- C5 composite：ASR 61%，任务完成率 85%；
- AB4 description + readOnlyHint：三模型 100%；
- baseline defenses：testbed 中五个主条件 defended ASR 0%。

但这些数字最应该引导的不是恐慌，而是架构调整：

- 工具 identity 必须绑定 origin 和不可变 id；
- planning 与 invocation 之间必须重验一致性；
- third-party tool 默认不能接收敏感上下文；
- read-only、description、schema 都必须进入安全策略；
- provenance log 和用户授权要成为高风险动作的一部分。

从 AI 安全研究角度看，这篇论文的价值在于把 MCP/WebMCP 安全问题具体化为可测、可复现、可防御的 attack surface。

下一步更难的问题是：

- 原生浏览器 WebMCP 会怎样定义工具注册权限？
- Agent host 是否能给第三方工具建立最小权限沙箱？
- 用户是否能理解工具 provenance？
- 模型供应商、浏览器、网站和 MCP server 各自承担哪一层责任？

如果这些问题没有被解决，Agent 越会用工具，工具面投毒的收益就越高。

WebMCP 的安全边界不在模型输出的最后一行，而在 Agent 第一次相信“这些工具就是我能用的世界”之前。
