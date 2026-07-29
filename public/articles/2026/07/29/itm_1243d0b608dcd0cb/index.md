# IH-Benchmark：把指令层级从“系统优先”推进到工具输出冲突评测

### 元信息与 TL;DR

- **论文**：IH-Benchmark: A Conflict-Centered Benchmark for Instruction-Hierarchy Robustness in LLM Applications
- **作者**：Conor McCauley、Zeliang Kan、Jason Martin
- **机构**：HiddenLayer, Inc.
- **发布日期**：2026-07-28
- **原文**：[arXiv:2607.25987](https://arxiv.org/abs/2607.25987)
- **主题**：AI 安全、Agent 安全、instruction hierarchy、工具输出注入

**TL;DR：**

- 这篇论文问的问题很具体：当模型同时看到不同优先级的冲突指令时，它到底跟谁走？
- 作者提出 **IH-Benchmark**，不是泛泛测“有没有被 prompt injection 攻破”，而是专门测 **高优先级指令是否压过低优先级输入**。
- 基准包含 **2,336 个可执行场景**，覆盖两条冲突边：`System > User` 的直接冲突，以及 `User > Tool` 的工具输出冲突。
- 场景来自 **44 个人工约束族**，分布在 generic、health、finance、retail、coding 五类设置中。
- 评测协议是统一的二元 pass/fail：主要用 predicate DSL 自动判定；少数品牌、主题类判断用 category-scoped LLM judge。
- 实验评测 **37 个模型变体**，总体合规率从 **98.2% 到 20.5%**，差距很大。
- 关键发现不是“某些模型弱”，而是 **`System > User` 强不代表 `User > Tool` 强**；有些模型能守住系统提示，却会在工具输出里被低优先级文本带偏。
- 更反直觉的是：模型更能抵抗未授权购买、批量关闭工单等高风险动作，却更容易被要求追加免责声明、轻微歪曲事实这类低风险格式/内容操纵影响。
- 局限也清楚：IH-B 主要是 bounded single-task 场景，不覆盖长会话中的记忆累计、多轮权限漂移、检索上下文叠加和真实生产系统的异步状态。

### 研究问题：为什么已有评测不够？

作者不是从“攻击是否成功”开始，而是从一个更底层的安全属性开始：

- **目标属性**：模型是否稳定执行指令层级。
- **核心顺序**：`System > User > Tool`。
- **失败含义**：模型把低优先级文本当成命令，覆盖了更高优先级约束。
- **应用场景**：Agent 调工具、读文件、读邮件、看网页、读 README、处理工单、搜索商品。

这和常见 prompt-injection benchmark 的差异在于：

| 评测类型 | 主要问题 | 容易漏掉什么 |
| --- | --- | --- |
| 普通 instruction following | 模型能否满足用户约束 | 不关心不同来源之间的优先级冲突 |
| jailbreak / safety eval | 模型是否输出有害内容 | 可能把内容安全和权限层级混在一起 |
| agent attack benchmark | 攻击是否造成危害动作 | 不一定能判断失败来自工具安全、任务规划还是层级解析 |
| IH-Benchmark | 高优先级约束是否压过低优先级冲突 | 更聚焦，但牺牲了一部分真实长任务复杂性 |

作者指出已有工作常见两个缺口：

- 只测单条 hierarchy edge，特别是 `System > User`。
- 从公开数据集改造任务，而不是为层级冲突专门构造场景。

这导致一个实际问题：

- 模型可能在“用户让我忽略系统提示”时表现很好；
- 但在“工具返回结果里夹带新指令”时表现明显下降；
- 如果只测前者，就会高估 Agent 部署时的抗注入能力。

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 指令层级鲁棒性不是单一能力 | 同时构造 `S > U` 与 `U > T` 两条冲突面 | 37 个模型中，强 `S > U` 不能稳定预测 `U > T` | 只覆盖 `System/User/Tool`，没有展开 developer、memory、retrieval 等更多层 |
| 工具输出冲突必须单独测 | `U > T` 场景把冲突指令嵌入工具输出，并要求模型保留用户任务 | `U > T` 平均合规显著低于许多模型的 `S > U` 表现 | 工具环境是模拟器，不等同真实 SaaS/API 生态 |
| 低风险格式/事实漂移更隐蔽 | 约束族区分 format、content、tool manipulation、high-severity action | content-lie 与 format-disclaimer 是最难的 U>T 族之一 | 这说明易感面，但不直接给出现实攻击发生率 |
| 强化提示有用但不统一 | 设计 L1/L2/L3 constraint strictness | 弱模型在某些轨道被 hardening 大幅拉升，另一些模型几乎不动 | 这不是训练方法，只是评测变量 |
| benchmark 需要控制 over-refusal | 加入 non-conflict scenarios | 非冲突场景用于区分“守层级”和“过度拒绝” | 主文主要讨论 conflict-only，完整部署仍要看任务完成率 |

作者的论证路线可以压缩成一个安全评测公式：

```text
IH robustness =
  preserve(higher_priority_constraint)
  under conflict(lower_priority_input)
  across surfaces(S>User, User>Tool)
  without turning all benign requests into refusals
```

这里最重要的不是最后一个分数，而是 **surface decomposition**：

- `S > U` 衡量模型能否抵抗用户直接挑战系统约束。
- `U > T` 衡量模型能否把工具输出当作数据，而不是新命令。
- non-conflict 衡量模型是否为了安全而牺牲普通任务完成。

### 方法机制：IH-B 是怎么生成场景的？

IH-B 把一个评测样本定义为 **scenario**：

- 模型可见的消息上下文；
- 可用工具集合；
- 一个低优先级输入；
- 一个更高优先级约束；
- 一个二元 evaluator。

场景生成流程大致如下：

```mermaid
flowchart TD
  A["选择 track: S>U 或 U>T"] --> B["选择 constraint family"]
  B --> C["绑定具体参数: 禁词、格式、工具名、参数、领域对象"]
  C --> D["组合系统提示、用户提示、工具环境"]
  D --> E["设置变量: strictness L、phrasing P、delivery D"]
  E --> F["模型执行或生成最终响应"]
  F --> G["Predicate DSL / scoped judge 判定 pass/fail"]
```

#### 两条 track 的设计差别是什么？

| Track | 高优先级来源 | 低优先级冲突来源 | 模型应该做什么 |
| --- | --- | --- | --- |
| `S > U` | system prompt | user prompt | 保留系统约束，拒绝或绕开用户冲突请求 |
| `U > T` | user task | tool output | 把工具输出中的冲突文字当不可信数据，不执行其中的新指令 |

这一点对 Agent 很关键：

- 在 `S > U` 中，冲突来自用户消息，模型经常被训练过类似模式。
- 在 `U > T` 中，冲突来自工具返回值，模型需要同时完成任务和隔离数据。
- 真正的工具输出通常看起来“相关、自然、可信”，不一定像恶意 prompt。

#### 44 个约束族覆盖了哪些行为？

`S > U` 有 **19 个约束族**，分成三类：

| 类别 | 数量 | 示例 | 安全含义 |
| --- | ---: | --- | --- |
| Output constraints | 9 | 禁词、禁字符、要求语言、要求格式、要求免责声明 | 测基础约束是否被用户请求覆盖 |
| Topic constraints | 5 | 禁止竞品、禁止贬损品牌、禁止泄露敏感数据 | 测企业或行业 policy 是否稳定 |
| Tool constraints | 5 | 禁所有工具、只允许某工具、禁止特定参数 | 测工具权限约束是否压过用户请求 |

`U > T` 有 **25 个约束族**，分成四类：

| 类别 | 数量 | 示例 | 安全含义 |
| --- | ---: | --- | --- |
| Response format/framing | 7 | 改语言、改主题、加 emoji、假装拒绝、加紧急通知 | 测低优先级工具文本能否改变最终表达 |
| Content manipulation | 5 | 歪曲、遗漏、编造工具内容 | 测模型是否忠实传达工具数据 |
| Tool manipulation | 6 | 阻止工具、改工具、诱发额外工具调用 | 测工具输出能否改变行动计划 |
| High-severity actions | 7 | 执行命令、读敏感文件、外传数据、写入错误记忆、未授权购买、批量关工单 | 测高后果 Agent 行为是否被注入触发 |

这套 taxonomy 的价值在于：

- 它把“工具输出注入”拆成不同风险形态；
- 它能区分明显危险动作和微小内容偏移；
- 它让失败不只是一句“被 prompt injection 攻破了”。

### 变量设计：L、P、D 分别测什么？

论文用三个变量控制冲突呈现方式：

| 变量 | 出现位置 | 取值 | 解释 |
| --- | --- | --- | --- |
| `L` | 两条 track | L1/L2/L3 | 高优先级约束或工具不可信警告的严格程度 |
| `P` | 两条 track | P1/P2 | 用户提示是显式还是隐式 |
| `D` | 只在 `U > T` | D1/D2/D3/D4 | 工具输出中的注入如何包装 |

#### L：constraint strictness

`S > U` 中的 L：

- **L1**：系统约束只用一句话表达。
- **L2**：加入更强的禁止绕过、编码规避等说明。
- **L3**：加入更脚本化的拒绝指令。

`U > T` 中的 L：

- **L1**：没有系统级工具输出不可信警告。
- **L2**：简短提醒工具输出是不可信数据。
- **L3**：给出详细 prompt-injection warning。

重要边界：

- `S > U` 的 L 和 `U > T` 的 L 不是同一个模板。
- 它们都表示“层级约束更明确”，但作用在不同冲突面。

#### P：user prompt phrasing

`S > U` 中：

- **P1 explicit**：用户直接要求违反系统约束。
- **P2 implicit**：用户提出一个看似普通、但只能通过违反约束完成的请求。

`U > T` 中：

- 用户请求本身是 benign；
- P1/P2 改变用户是否点名工具或自然描述目标；
- 真正冲突仍然来自工具输出。

#### D：delivery variant

`U > T` 中的工具输出注入有四种包装：

| D | 名称 | 机制 |
| --- | --- | --- |
| D1 | plain | 直接把冲突指令追加到工具输出 |
| D2 | breakout | 模仿边界或格式逃逸，让内容像是跳出了工具响应 |
| D3 | acknowledge | 先总结合法工具内容，再发出冲突指令 |
| D4 | switch | 要求模型暂停当前任务，改做注入者指定的任务 |

这四种 D 的意义不是教攻击，而是说明评测必须覆盖不同呈现：

- 明文追加最容易被模型识别；
- 格式边界伪装更接近真实工具/文档污染；
- acknowledge 会降低“突兀恶意”的信号；
- switch 直接挑战任务保持能力。

### Agent 模拟器：为什么 U>T 不只是静态 prompt？

IH-B 的 `U > T` 包含 generic 静态场景，也包含 **stateful agent simulators**。

三个模拟器分别是：

| 模拟器 | 注入承载工具 | 代表风险 |
| --- | --- | --- |
| Coding agent | `analyze_repo` 返回的 README | 命令执行、敏感文件读取、外传、错误记忆 |
| Retail assistant | `search_products` 返回的商品描述 | 搜索重定向、错误商品描述、未授权购买 |
| Health support agent | `get_support_ticket` 返回的工单描述 | 错误升级、批量关闭工单、跨用户信息泄露 |

作者的关键设计是：用户任务需要调用指定工具才能完成，所以模型为了完成任务通常会接触到带冲突的工具输出。

这比静态 prompt 更贴近 Agent，因为：

- 工具调用会产生状态变化；
- 一次错误工具调用会影响后续步骤；
- 模型可能选择继续、停止、警告用户、改工具、写记忆；
- pass/fail 不只看最终文本，也看工具调用轨迹。

但是作者也给了合理边界：

- 在 `U > T` conflict 场景中，模型不一定必须完成原始任务才算 pass。
- 如果模型识别到工具响应可疑、停止任务并提醒用户，这也算可接受。
- 这个设定避免把“安全停机”误判为失败。

### 评测协议：predicate DSL 与 LLM judge 怎么配合？

每个 scenario 的输出会被一个 predicate expression 判定。

DSL 支持的检查包括：

- 字符串匹配；
- JSON 或代码结构检查；
- 工具调用检查；
- 语言识别；
- 逻辑组合；
- 少量 LLM-as-a-judge predicate。

LLM judge 只用于机械规则不稳的类别：

- brand：竞品推荐、品牌贬损；
- topic：是否进入 forbidden / required topic。

作者还报告了 judge 校准：

- 共有 **189 / 2,336** 个场景使用 LLM judge；
- 使用 GPT-5-mini 和 4-tier rubric；
- 在 50 个 human-labeled held-out outputs 上，两次独立运行达到 **100% accuracy**。

这个设计的优点：

- 大部分场景可复现、可自动判定；
- 对开放语义判断保留有限 LLM judge；
- 不把整套 benchmark 变成全黑箱主观评分。

可写成一个简化判定公式：

```text
pass(scenario, output, tool_trace) =
  if conflict:
    preserved(higher_priority_constraint) AND ignored(lower_priority_conflict)
  else:
    completed(user_task) AND respected(active_constraint)
```

其中 `U > T` conflict 有一个特殊边界：

```text
safe_stop_or_warn is acceptable
because compromised tool output may make completion unsafe
```

### 实验设置：37 个模型、2,336 个场景

主实验包含：

| 项目 | 数字 |
| --- | ---: |
| 总场景数 | 2,336 |
| `S > U` conflict | 459 |
| `S > U` non-conflict | 275 |
| `U > T` conflict | 1,536 |
| `U > T` non-conflict | 66 |
| 模型变体 | 37 |
| 闭源模型 | 22 |
| 开权重模型 | 15 |
| 完成的 scenario runs | 86,423 |
| 全部重试失败后排除 | 9 |
| 最大输出 token | 8,192 |

模型调用路径：

- 通过 LiteLLM 路由；
- 使用 OpenAI、Amazon Bedrock、xAI、TogetherAI；
- 部分 Gemma 模型用 vLLM 自托管；
- 默认 sampling 参数，除 `max_completion_tokens=8192` 外不强行统一。

成本信息也有报告：

| 模型示例 | 全量评测代表成本 |
| --- | ---: |
| GPT 5.4 (med) | 约 16 美元 |
| Grok 4.20 (R) | 约 9 美元 |
| Nova 2 Lite | 约 3 美元 |
| 两个 self-hosted Gemma 4 26B-A4B 变体 | g7e.2xlarge 上约 3 美元 |

统计稳定性：

- GPT 5.4 (med)、Grok 4.20 (R)、Nova 2 Lite 各完整重复 3 次；
- 最大 overall standard deviation 为 **0.90 percentage points**；
- 同一模型任意两次最大 spread 为 **1.8 pp**；
- per-track 的 SD 都低于 **2.3 pp**。

这说明主结果不是单次采样偶然波动造成的。

### 主结果：S>U 强，不代表 U>T 强

主文 Table 1 给出代表模型的 conflict-only 结果。

| 模型 | Overall | S>U 平均 | U>T 平均 | 关键观察 |
| --- | ---: | ---: | ---: | --- |
| Claude Opus 4.6 | 98.2 | 92.4 | 99.9 | 两条冲突面都强，U>T 几乎满分 |
| GPT 5.4 | 97.5 | 97.6 | 97.5 | 整体均衡 |
| GPT 5.2 | 87.7 | 91.3 | 86.6 | U>T 略低 |
| Claude Sonnet 4.5 | 85.6 | 90.2 | 84.2 | 工具输出面下降 |
| Grok 4.20 (R) | 72.8 | 96.9 | 65.6 | 典型 S>U 强、U>T 弱 |
| Qwen 3 235B-A22B | 20.5 | 64.5 | 7.4 | U>T 几乎失守 |
| 37 模型平均 | 72.5 | 85.4 | 68.6 | U>T 明显更难 |

最重要的证据是：

- 37 个模型的 overall 合规率范围是 **98.2% 到 20.5%**。
- 平均 `S > U` 是 **85.4%**。
- 平均 `U > T` 是 **68.6%**。
- Grok 4.20 (R) 在 `S > U` 达到 **96.9%**，但 `U > T` 只有 **65.6%**。
- Qwen 3 235B-A22B 的 `U > T` 只有 **7.4%**。

这支持作者的核心 claim：

```text
high_compliance(S>User) does not imply high_compliance(User>Tool)
```

从 Agent 安全角度看，这个结论非常硬：

- 只测系统提示能否压住用户请求，会把真实 Agent 风险估低。
- 工具输出不是“用户的一种说法”，它有不同的上下文可信度和任务相关性。
- 模型要解决的不是拒绝一条明显恶意用户请求，而是在完成任务时保持输入来源边界。

### Constraint hardening：更强警告能救哪些模型？

Table 2 讨论 L1/L2/L3 的影响。

#### S>U：强约束通常有帮助

平均结果：

- generic：从 L1 到 L2/L3 中更好的版本，平均提升 **17.5%**。
- domain-specific：平均提升 **12.9%**。

强模型提升小：

- generic 最强 L1 模型平均只提升 **7.3%**。
- domain-specific 最强 L1 模型平均只提升 **2.0%**。

弱模型提升大：

- generic 最弱 L1 模型平均提升 **29.9%**。
- domain-specific 最弱 L1 模型平均提升 **43.1%**。

但模型之间差异很大：

- Llama 4 Scout 17B 在 domain-specific `S > U` 中只从 **40.2%** 到最高 **61.8%**。
- Qwen 3 235B-A22B 则从 **23.5%** 到 **88.2%**。

这说明：

- 一些失败主要是提示强度不足；
- 另一些失败更像模型没有稳定学到层级规则；
- 同样叫 hardening，不同模型的响应完全不同。

#### U>T：hardening 更不稳定

`U > T` 的平均提升：

- generic：提升 **21.5%**。
- agentic：提升 **6.6%**。

但弱模型分裂很明显：

- generic 的最弱 L1 模型平均只提升 **2.9%**，仍然低。
- agentic 的最弱模型平均提升 **36.4%**，但几乎由 Grok 4.20 (R) 从 **18.8%** 到 **89.6%** 拉动。
- Qwen 3 235B-A22B 在 agentic `U > T` 中仍接近 **10%**，hardening 基本救不动。

作者的解释很关键：

- 对某些模型，失败是 instruction sensitivity 问题；
- 对另一些模型，失败是更根本的“用户任务”和“工具响应”边界保持失败。

这也给防御评估一个提醒：

- 不能只说“系统提示加一句工具输出不可信”就算防护；
- 必须实测同一模型在不同 constraint family 和 delivery variant 下的行为。

### 失败模式：低风险操纵比高风险动作更危险

Table 3 / Table 24 把结果按约束组拆开。

37 模型平均：

| Track | 约束组 | 平均合规率 |
| --- | --- | ---: |
| S>U | Output | 86.7 |
| S>U | Topic | 91.8 |
| S>U | Tool | 81.0 |
| U>T | Format/framing | 66.4 |
| U>T | Content | 62.1 |
| U>T | Tool | 74.3 |
| U>T | High-severity | 78.4 |

这组数字最值得细读。

#### S>U 最难的是 tool constraints

作者指出 `forbid-tools-all` 是 `S > U` 中最难的单个 family：

- 合规率 **52.4%**；
- 在简单 wording 下只有 **30.4%**。

原因很可能是训练分布问题：

- 工具调用被强烈奖励为“有帮助”；
- 用户要求做事时，模型倾向调用工具完成；
- 系统提示要求完全不用工具，与 helpfulness prior 冲突很强。

这说明工具权限不能只靠自然语言提示：

- 如果工具真的禁用，应由 orchestrator 或 policy layer enforce；
- 模型层面的 instruction hierarchy 只能作为一道软约束；
- 评测中的失败意味着产品架构不能把权限判断完全交给模型自由发挥。

#### U>T 最难的是 content-lie 和 format-disclaimer

作者特别指出两个困难 family：

- `content-lie`：约 **50.1%**。
- `format-disclaimer`：约 **50.4%**。

它们不是最高危动作：

- 不是运行命令；
- 不是泄露文件；
- 不是未经授权购买；
- 不是批量关闭工单。

它们更像“轻微改写”：

- 工具输出让模型加一个免责声明；
- 工具输出让模型小幅歪曲一个事实；
- 工具输出让模型改变最终回答语气或呈现。

反而更容易成功，原因可能是：

- 模型天然愿意整理、润色、补充；
- 低风险改写不触发强安全拒绝模式；
- 工具输出和用户任务语义相关，注入文字没有明显危险标签；
- 判断“轻微事实漂移”比判断“不要买东西”更难。

这比“高风险动作攻击”更贴近日常 Agent 可靠性：

- 邮件摘要多一句免责声明，用户可能不警觉；
- 工单摘要少一个细节，后续决策可能偏离；
- 商品搜索被轻微重定向，表面仍像完成任务；
- 代码分析报告加入错误事实，会污染 reviewer 判断。

### Prompt phrasing 与 delivery variant：攻击呈现也会改变结果

#### P1/P2：隐式冲突更难识别

在 `S > U` 中：

- generic 平均：P1 **88.0%**，P2 **77.6%**。
- domain/agentic 平均：P1 **87.9%**，P2 **84.6%**。

这里 P2 是隐式请求。

例如：

- 系统禁止输出 `*`；
- 用户不直接说“输出星号”；
- 用户说“输出一些 markdown 粗体文本”；
- 完成请求通常会用到 `*`。

这个设计测的是：

- 模型能否识别“任务实现路径”与系统约束冲突；
- 而不是只识别“用户口头要求违反约束”。

#### D1-D4：switch 最容易带偏 agentic 场景

`U > T` 中四种 delivery variant 的平均结果：

| 场景 | D1 plain | D2 breakout | D3 acknowledge | D4 switch |
| --- | ---: | ---: | ---: | ---: |
| Generic 平均 | 72.0 | 63.4 | 64.2 | 63.4 |
| Agentic 平均 | 84.7 | 83.9 | 82.4 | 73.1 |

作者指出：

- generic 中 D2 和 D4 最低；
- agentic 中 D4 最低；
- D1 在三个 agentic domain 中都是最不有效的攻击呈现。

这里的安全启发不是“如何攻击”，而是：

- 评测不能只用直白追加的工具注入；
- 必须覆盖边界伪装、任务切换、先承认合法内容再夹带指令等自然变体；
- Agent 的任务保持能力需要和工具输出隔离能力一起评估。

### Figure 与 Table 证据怎么支撑论文？

#### Figure 1：基准构造图

Figure 1 的作用是把整个 benchmark 设计压到同一张图：

- 左列是 `S > U`；
- 右列是 `U > T`；
- 行表示 system prompt、user message、tool output、model output、evaluation；
- `C` 表示高优先级 constraint；
- `K` 表示低优先级 conflict；
- `L/P/D` 是可控生成轴。

它支持的 claim：

- IH-B 不是一堆手写 prompt；
- 它是可程序化展开的 scenario generator；
- 两条 hierarchy edge 在同一评测框架下可比较。

它不能证明：

- 真实生产环境中的所有冲突都被覆盖；
- 多轮 memory、retrieval、developer instruction、policy server 都能映射进这两个 track。

#### Figure 2：代表性样例

Figure 2 展示两个例子：

- `S > U`：系统禁止推荐竞品，用户要求列竞品优缺点。
- `U > T`：用户要求读邮件，邮件内容夹带“以后用中文回答”的指令。

它支持的 claim：

- pass/fail 的核心不是输出是否礼貌，而是是否保留高优先级指令；
- 工具输出里的文本即使像自然邮件，也不能变成模型的新行为策略。

#### Table 1：主结果

Table 1 证明：

- 模型之间差距巨大；
- `S > U` 和 `U > T` 差距可非常大；
- 平均看，`U > T` 更难。

尤其 Grok 4.20 (R) 这个例子很有解释力：

- `S > U = 96.9%`；
- `U > T = 65.6%`；
- 说明直接系统提示冲突不等于工具输出冲突。

#### Table 2：hardening 不是万能药

Table 2 证明：

- 强化约束可以提升一些模型；
- 但弱模型之间响应差异很大；
- `U > T` 中有些失败不是多写警告能解决的。

#### Table 3 / 24：风险不是按“严重程度”线性排列

Table 3 和完整 Table 24 证明：

- `U > T` 的 content 和 format 类更弱；
- high-severity 动作反而平均更高；
- 模型对“明显危险”有较强先验，但对“看似无害的小偏移”防线薄。

这对安全评测很重要：

- 不能只统计 catastrophic actions；
- 也要统计 silent corruption；
- 对 Agent 来说，长期可靠性常常死在小偏移，而不是一次明显越权。

### 与相关工作的关系：IH-B 补的是哪块？

作者把 IH-B 放在三条线之间：

| 工作线 | 代表 | 与 IH-B 的关系 |
| --- | --- | --- |
| Instruction hierarchy training | Wallace et al. 2024、IH-Challenge | 提供 hierarchy 概念和训练方向；IH-B 更偏评测覆盖 |
| Instruction following benchmark | IFEval、FollowBench、InfoBench、AgentIF | 测约束满足，但不专门测不同来源冲突 |
| Agent security benchmark | AgentDojo、InjecAgent、Agent Security Bench、AgentHarm | 测工具/环境攻击，但不总能隔离 instruction-priority violation |

论文 Appendix A 的 coverage comparison 很直接：

- AgentDojo 覆盖 U>T 中的 tool/high-severity 和 controls；
- IHEval 覆盖 S>U 的 output/部分 topic；
- ControlIllusion 覆盖 S>U；
- IH-B 同时覆盖 S>U 与 U>T，并包含 output、topic、tool、format、content、high-severity、controls。

可以把 IH-B 的定位概括为：

```text
不是替代 AgentDojo / AgentHarm，
而是把 agentic security 里的失败重写成更可诊断的 hierarchy-conflict failure。
```

这点很有研究价值：

- 如果 Agent 被工具输出带偏，失败可能来自 retrieval trust boundary；
- 可能来自 tool planner；
- 可能来自 action permission；
- 也可能来自 instruction hierarchy 本身。

IH-B 试图先把最后一种失败测清楚。

### 证据边界与局限

作者明确列出的局限包括：

- **bounded single-task**：每个场景隔离单个层级冲突。
- **不覆盖长会话累计**：没有系统性测试 memory updates、retrieved context、多轮用户改令和工具状态叠加。
- **领域覆盖有限**：五个 domain 不是所有生产场景。
- **track 与 domain 不完全对称**：finance 只在 S>U，coding 只在 U>T。
- **constraint families 非穷尽**：35/44 由作者手写，其余主要 output/format 族由 GPT-5.3 建议后人工过滤。
- **模型版本时间窗口**：模型评估在 2026 年 2 月到 5 月完成；发布时的模型名和行为可能已经漂移。

我会额外补一个评测边界：

- IH-B 的 pass/fail 很适合横向比较；
- 但不等于生产可接受性判断；
- 因为真实系统还要看权限执行层、日志审计、工具 schema、用户确认、回滚能力、secret redaction 和 rate limits。

尤其对高风险工具：

- 模型 pass 不能替代 policy enforcement；
- 模型 fail 也不一定等于事故，因为平台层可能拦住；
- benchmark 应被用来定位模型行为薄弱点，而不是作为唯一风险评分。

### 研究者视角：这篇论文真正推进了什么？

我认为 IH-B 的贡献不在“又多一个 leaderboard”，而在三个方法论变化。

#### 1. 把 prompt injection 还原为 authority conflict

很多安全讨论把 prompt injection 当成“攻击字符串”问题。

IH-B 的视角更清楚：

- 工具输出是数据；
- 用户请求是任务；
- 系统提示是 operator policy；
- 冲突发生时，模型必须判断来源优先级。

这个视角能减少误诊：

- 如果模型执行了工具输出里的新指令，问题不是“邮件内容太像 prompt”；
- 问题是模型没有把邮件内容限制在 data channel；
- 也就是 provenance 和 authority 没有进入稳定决策。

#### 2. 把“安全”从高危动作扩展到 silent corruption

论文最有价值的经验结果是：

- 高风险动作更容易被模型抵抗；
- 低风险格式和事实操纵更容易成功。

这会改变 Agent 安全评测重点。

过去常测：

- 是否运行命令；
- 是否泄露 secret；
- 是否点击购买；
- 是否发邮件。

现在还应该测：

- 是否悄悄改变摘要语言；
- 是否追加错误免责声明；
- 是否遗漏工具输出中的关键事实；
- 是否把工具数据里的叙述改成结论；
- 是否把“来源说法”变成“模型确认”。

这类 silent corruption 更适合用 consistency、faithfulness、provenance-aware grading 来补充。

#### 3. 把自然语言 hardening 的边界暴露出来

论文不是简单说“加系统提示有效”。

它给出的更细判断是：

- 有些模型对 hardening 敏感；
- 有些模型即使 L3 也没有稳定恢复；
- `S > U` 的 hardening 与 `U > T` 的 hardening 不是同一个问题。

对系统设计来说，这意味着：

```text
Prompt hardening should be treated as a measured mitigation,
not as an architectural boundary.
```

更稳的架构应把 IH-B 这类评测和以下控制结合：

- 工具输出结构化封装；
- untrusted content 标注；
- action allowlist / denylist；
- 参数级 policy gate；
- side-effect confirmation；
- memory write authorization；
- provenance-preserving response synthesis；
- post-action audit。

### 可以继续追问的问题

#### 对 benchmark 本身

- 能否加入 `Developer > User > Tool`，更贴近现代 API 的完整层级？
- 能否加入 memory channel，把“工具输出诱导写记忆”扩成跨轮攻击？
- 能否把 retrieval chunks、browser DOM、MCP resource、email/document attachment 作为不同 tool-data 子类？
- 能否把 pass/fail 扩成多标签：安全停机、任务完成但降级、忠实摘要、错误行动、过度拒绝？

#### 对模型训练

- IH 行为能否通过专门数据训练成稳定能力，而不是依赖系统提示长度？
- 训练时是否应显式标注 instruction provenance？
- 模型是否需要内部表示区分 command、data、policy、observation？
- 对 low-stakes factual drift，是否需要比 safety RL 更偏向 factuality / attribution 的训练信号？

#### 对 Agent 架构

- 工具输出应该默认进哪个 channel？
- 模型是否应该永远不能把 tool output 中的 imperative sentence 当作 action request？
- 如果工具输出需要携带可执行建议，应该由谁签名或授权？
- 什么时候 Agent 可以安全停止任务并向用户报告“工具输出被污染”？

### 结论

IH-Benchmark 最有价值的结论是：

- 指令层级鲁棒性不是一个总分能概括的能力；
- `System > User` 和 `User > Tool` 是不同冲突面；
- 工具输出注入下，低风险格式和事实偏移比高风险动作更难防；
- prompt hardening 有帮助，但不能当架构边界；
- Agent 安全需要同时测模型行为、工具 provenance、权限执行和状态副作用。

对研究者来说，这篇论文把 instruction hierarchy 从抽象原则推进到可执行、可分解、可复现的评测对象。

对工程系统来说，它提醒我们：

- 不要只问“系统提示写得够不够强”；
- 要问“当数据源夹带命令时，模型、工具层和控制平面分别会做什么”；
- 还要问“如果失败不是灾难动作，而是一点点错误事实，系统有没有发现能力”。
