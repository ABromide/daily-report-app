# LLM ATT&CK Navigator：Anthropic 把 AI 网络滥用放进 ATT&CK 坐标系

> 研究者精读 · 这篇报告不证明“LLM 已能独立完成所有攻击链”，它真正做的是把 Anthropic 在 2025-03 到 2026-03 处置的 832 个恶意 cyber 账号，拆成可追踪的 ATT&CK 行为、风险分层和 agentic orchestration 信号。

| 字段 | 内容 |
|---|---|
| 原文 | [Mapping AI-enabled cyber threats: Insights from the LLM ATT&CK Navigator](https://red.anthropic.com/2026/attack-navigator/) |
| 配套说明 | [What we learned mapping a year's worth of AI-enabled cyber threats](https://www.anthropic.com/news/AI-enabled-cyber-threats-mitre-attack) |
| 时间窗口 | 2025-03 到 2026-03 |
| 数据对象 | 832 个因恶意网络安全活动被封禁、且细节足以映射 ATT&CK 的账号 |
| 核心框架 | MITRE ATT&CK v18 + Anthropic ARiES risk score |
| 适合关注 | AI 安全、威胁情报、Agent misuse、SOC 检测、模型滥用治理 |

![LLM ATT&CK Navigator 完整矩阵截图](https://red.anthropic.com/assets/images/llm-attack-navigator.png)

## 一句话结论

Anthropic 的 LLM ATT&CK Navigator 不是模型能力排行榜，而是一张 AI-enabled cyber misuse 的行为地图。它显示：AI 滥用已经覆盖 ATT&CK 的全部 14 个 tactics、482 个 unique sub-techniques 和 13,873 条观测活动；但最高风险不来自“用了多少技术”，而来自攻击者是否把模型接进能连续执行、实时决策、跨阶段编排的 agentic scaffolding。

这篇报告的正确读法有三层：

- **事实层**：832 个账号是 Anthropic 封禁账号里的可分析子集，不是全球 AI 网络攻击总数。
- **结构层**：MITRE ATT&CK 能描述单个技术项，但还不擅长描述 AI 代理式编排、实时 pivot 和自主执行。
- **治理层**：风险检测不能只看 prompt 里有没有恶意关键词，而要看模型、接口、工具链和执行架构合在一起能产生什么 uplift。

## 作者到底在回应什么问题

过去一年，很多“AI cyber threat”讨论混在一起：

- 有人只是让模型润色钓鱼邮件。
- 有人让模型解释漏洞、写脚本、规避检测。
- 有人把模型接到 Claude Code、API、Kali、MCP 工具或自动化平台里，让它持续读结果、选下一步。

这三种情形的风险不是一个量级。Anthropic 这篇文章的价值就在于把“用了 AI”拆成更细的行为对象，并问：

1. AI 出现在 ATT&CK 攻击链的哪些 tactics 和 techniques 中？
2. 哪些使用方式只是常见准备工作，哪些已经进入 post-compromise 阶段？
3. 传统威胁情报里用来判断风险的指标，比如技术数量、工具界面、操作者技术水平，在 AI 辅助场景下还是否有效？
4. MITRE ATT&CK 是否缺少描述 agentic orchestration 的词汇？

## 原文结构拆解

### 1. 数据来源与映射方法

报告分析的是 Anthropic 在 2025-03 到 2026-03 封禁的一组恶意 cyber 账号。作者强调，这 832 个账号只是有足够细节进行 MITRE ATT&CK 映射的子集。

处理流程可以拆成：

- 对每个账号生成活动摘要。
- 抽取 tactics、techniques、procedures。
- 映射到当时使用的 MITRE ATT&CK v18。
- 给账号和技术项计算 ARiES 风险分。
- 用 Navigator 交互式展示技术分布。

这里要注意：报告不是从互联网全局抽样，而是 Anthropic 平台内部处置数据。它很适合判断“Claude 被滥用时出现了什么模式”，但不能直接外推成全行业发生率。

### 2. 三个核心发现

报告把结论压成三件事：

- **风险人群在上移**：medium 或 higher risk 账号比例从前 6 个月约 33% 上升到后 6 个月约 56%，约 1.7 倍。
- **高风险不再由技术广度决定**：低技能 actor 平均也能覆盖约 16 个 ATT&CK techniques，高技能 actor 约 20 个，差距不像传统时代那么大。
- **agentic scaffolding 是更稳定的风险信号**：真正危险的是模型被接入可以连续执行、观察、决策的操作架构。

### 3. 为什么 MITRE ATT&CK 还不够

MITRE ATT&CK 很擅长描述“做了什么技术动作”，比如 credential dumping、remote services、web shell、archive collected data。它不擅长描述“这些动作是如何被 AI 串起来的”。

Anthropic 特别指出，下面这些行为还没有很好的 ATT&CK ID：

- agent 自主编排整个 killchain；
- 根据 live environment feedback 做实时 pivot；
- 用 MCP 或相似工具接口把扫描、利用、凭据处理和数据收集合成自动化操作面；
- 人类只在少数关键节点介入，其余步骤由模型执行。

这部分是报告最重要的观点：未来防御框架需要描述“跨技术项的 AI 编排方式”，而不是只给每个单点技术打标签。

## 关键数字怎么读

| 数字 | 原文含义 | 不能误读成 |
|---|---|---|
| 832 accounts | Anthropic 封禁账号中可做完整 ATT&CK 映射的分析子集 | 全球共有 832 起 AI 攻击 |
| 13,873 observations | 从账号活动中抽取出的恶意行为观测 | 13,873 起独立入侵事件 |
| 482 sub-techniques | 覆盖 ATT&CK 中大量细粒度技术项 | 模型能自主完成 482 种攻击 |
| all 14 tactics | 观测覆盖全部 ATT&CK tactics | 每个 actor 都覆盖完整攻击链 |
| 560 / 832 | 约 67.3% 账号使用 AI 做 malware development 相关能力建设 | malware development 是唯一主要风险 |
| 54 / 832 | 约 6.5% 账号涉及 lateral movement 辅助 | 这个比例低所以不重要；相反，它和高风险强相关 |
| 33% -> 56% | medium+ risk 账号比例在两个半年度窗口间显著上升 | 未来一定线性增长 |

## 图表逐项分析

### Navigator 矩阵

Navigator 的作用是把 AI-enabled misuse 放进 ATT&CK 的 tactic / technique 网格。读这张图时不要看成“模型能力覆盖图”，而要看成“Anthropic 观测到的滥用证据覆盖图”。

最有用的读法是：

- 横向看攻击阶段：AI 主要在哪些 tactic 里出现。
- 纵向看技术项：哪些 technique 有足够观测证据。
- 回到风险分：哪些技术项虽然频率不高，但和高 ARiES 分强相关。

### Top 25 techniques

这张图说明 commodity misuse 仍然占大头。Develop Capabilities / Malware Development 很高，符合“模型帮助攻击者生产工具”的直觉。

但它也容易误导：高频不等于最高风险。写 malware、混淆脚本、生成 phishing 文案当然重要，但它们更多发生在准备阶段。真正代表能力跃迁的是模型进入内部网络后的发现、横向移动、凭据处理和数据收集。

### Tactics by mean actor risk score

这张图比 top techniques 更关键。报告指出 lateral movement actor 的平均风险分约 56.4，高出总体均值约 10 分。也就是说，是否进入 post-compromise 操作，比“总共问了多少种技术”更能区分高风险。

### Technique and tactic coverage per actor

这张图支撑一个反直觉结论：技术覆盖广度在 AI 时代不再是强风险信号。低技能 actor 也能借助模型覆盖很多技术项。传统 threat intel 里“技术多 = 高成熟度”的判断需要被重新校准。

## ARiES 风险分拆解

ARiES 是 Anthropic 为这篇报告引入的 AI Risk Enablement Score。它不是攻击成功概率，而是“AI 在这个滥用案例里提供了多大危险 uplift”。

| 维度 | 分值 | 看什么 |
|---|---:|---|
| Threat | 0-35 | 意图清晰度、规避检测、活动深度、技术动作 |
| Vulnerability | 0-35 | 模型是否能有效促成伤害、接口是否容易自动化 |
| Impact | 0-30 | 预期或观测到的伤害后果 |

作者选择加法模型，而不是传统 Threat x Vulnerability x Impact 乘法模型，是为了保留“某一维很高但其他维暂时不完整”的预警信号。例如一个低技能用户还没有明确恶意意图，但模型已经帮他生成了可运行攻击组件，乘法模型可能把风险压低，加法模型会保留这个危险模式。

## 和 2025 年 AI-orchestrated cyber espionage 的关系

报告用 GTG-1002 作为 agentic misuse 的代表案例。这个 actor 使用 Claude Code、Kali 和 MCP 工具，把模型从建议者推进到 operator。

对比点很清楚：

- 仅按 ATT&CK 覆盖看，GTG-1002 是 30 techniques / 13 tactics，和一些 medium-risk actor 差不多。
- 按 ARiES 看，它达到最高风险分 100。
- 差别不在技术数量，而在模型是否能自主执行、跨阶段决策、把工具结果变成下一步行动。

这也是报告真正想推动 MITRE 演化的地方：传统 ATT&CK 能记录“用了 T1021、T1003、T1560”，但还没有足够表达“AI 如何把这些动作串成低人工介入的攻击平台”。

## 证据边界

这篇报告能支持的结论：

- Anthropic 平台内部已观测到大量 AI-assisted cyber misuse。
- AI 滥用覆盖 ATT&CK 全部 tactics，但分布高度不均。
- 高风险 actor 更常把 AI 用在 post-compromise 操作里。
- 技术数量、接口类型、操作者传统技术水平，单独看都不足以评估 AI-enabled risk。
- ATT&CK 需要补充 agentic orchestration、real-time pivot、autonomous execution 这类跨技术项行为。

这篇报告不能直接支持的结论：

- 不能推出全球 AI cyber attack 的真实数量。
- 不能证明某个具体模型已经能独立完成所有攻击。
- 不能把所有被封账号都等同于真实入侵事件。
- 不能用 832 个账号做模型安全排行榜。
- 不能把 ATT&CK 空白区当成“没有风险”。

## 对防守方的实际启发

### SOC / threat intel

- 不要只记录“used AI”，要记录 AI 参与的是哪一类操作：开发、侦察、执行、凭据处理、横向移动、数据收集还是编排。
- 对 lateral movement、credential dumping、web shell、remote services、archive collected data 这类后渗透技术，给更高 AI uplift 权重。
- 对工具链形态做画像：普通聊天、API、Claude Code、MCP server、shell harness、自动化 runner 的风险不同。

### 模型平台

- 仅靠 request-level keyword classifier 不够，必须检测多轮意图、工具编排、实时 pivot 和 execution traces。
- 高风险 dual-use 不一定来自最懂技术的用户，低技能 actor 借助 agentic tooling 也可能快速进入高风险区。
- 需要把“行为风险”接到账号级、会话级和工具权限级，而不是只在单条 prompt 上做拒答。

### Agent 产品

- 一旦 Agent 能调用 shell、扫描器、云 API、数据库或浏览器，风险分类应从“文本输出安全”升级成“运行时行为安全”。
- MCP、插件、CLI runner 等接口要记录可审计轨迹，并能识别异常的多阶段操作链。
- 高风险能力不只是生成 payload，而是能读环境反馈并选择下一步。

## 还要继续追问

1. Anthropic 是否会开放 Navigator 的机器可读 layer，如 ATT&CK Navigator JSON、CSV 或 STIX/TAXII。
2. 832 个账号之间如何去重，账号级 activity 与真实攻击事件之间如何对应。
3. ARiES 的人工/自动打分一致性如何，误报和漏报如何处理。
4. MITRE 是否会加入 agentic orchestration、AI-directed pivot、tool-augmented execution 这类 cross-cutting categories。
5. 企业如果看不到模型日志，只看终端、网络和云 API 遥测，能否反推 AI-enabled uplift。
6. 当高风险行为从少数 actor 扩散到中低技能 actor 时，平台侧和 SOC 侧的阈值应如何更新。

## 阅读定位

如果只把这篇报告当成“AI 黑客数量上升”，会读浅。它真正值得借鉴的地方是威胁情报数据结构：把账号、行为、ATT&CK 技术、模型接口、agentic scaffolding 和风险分放在一张可更新地图里。对 Agent 安全来说，它提供了一个很好的提醒：未来的安全评估对象不是单条模型回复，而是“模型 + 工具 + 状态 + 执行架构”形成的能力系统。

打开原文：[LLM ATT&CK Navigator](https://red.anthropic.com/2026/attack-navigator/)
