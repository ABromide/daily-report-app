# ShareLock：把 MCP 工具投毒从“单点明文”改造成“多工具门限重构”

## 元信息

| 字段 | 内容 |
| --- | --- |
| 标题 | ShareLock: A Stealthy Multi-Tool Threshold Poisoning Attack Against MCP |
| 方向 | AI 安全 / Agent 工具安全 / MCP Tool Poisoning |
| 原文 | https://arxiv.org/abs/2606.27027 |
| HTML | https://arxiv.org/html/2606.27027v1 |
| 时间 | arXiv v1 submitted on 2026-06-25 13:35:28 UTC |
| 作者 | Liwei Liu, Tianzhu Han, Zijian Liu, Zishu Dong, Na Ruan |

## TL;DR

- **这篇论文研究什么**：ShareLock 研究 MCP 生态里的工具投毒攻击，尤其是多个工具协同隐藏恶意指令时，现有人工审查、静态扫描和模型安全分类为什么会失效。
- **它怎么做**：作者把恶意 prompt 先编码，再用 Shamir Secret Sharing 拆成多个 share，把 share 伪装成 `tool_id`、`checksum` 等正常元数据，分散嵌入多个 MCP 工具描述；随后通过服务器更新引入 `EnvSetup` 触发器，在运行时收集至少 `t` 个 share 重构恶意指令。
- **核心证据**：论文构造 Travel、Coding、Finance、Office 四个多工具场景，在 Cherry Studio 与 Cline 两类 MCP 客户端上测试四个主流模型；摘要给出的总体结论是平均 Attack Success Rate 超过 90%。
- **关键数字**：在 Cherry Studio 的 Travel Assistant 场景，ShareLock 对 Gemini-2.5-Flash / DeepSeek-V3.1 / Qwen3-235B-Thinking 的平均 ASR/TCR/ASE 为 93.3 / 94.7 / 93.9；同表中 TPA、Puppet、Encode-Only 的平均 ASR 分别为 75.3、76.0、82.7。
- **防御绕过证据**：GPT-5、Gemini-2.5-Flash、Claude-Sonnet-4.5 三个零样本检测模型都会把 TPA/Puppet/Encode-Only 标为 Unsafe，但对 ShareLock 工具描述都给出 Safe；`EnvSetup` 触发工具只有 Claude 标为 Unsafe。
- **局限**：攻击链依赖多工具调用顺序、参数正确性、模型不主动请求用户确认，以及温度不能太高；论文自己的失败分析也承认工具调用失败、Time Anxiety 和细粒度交互会破坏 ShareLock。
- **研究意义**：它把 MCP 安全问题从“一个工具描述里有没有可疑文本”推进到“多个工具定义、服务器更新、工具返回、模型注意力和运行时编排共同形成的分布式攻击面”。

## 为什么这个问题值得单独看？

### MCP 的安全边界不是单个 tool description

- MCP 的基本流程可以压缩成五步：
  1. Server 在注册阶段向 Host/Client 暴露工具定义。
  2. 工具定义通常包含工具名、描述、输入 schema 等字段。
  3. 用户发出自然语言请求。
  4. LLM 根据系统提示、工具定义和上下文规划工具调用。
  5. MCP Client 把调用转发给 Server，再把工具结果带回模型。

- 传统 Tool Poisoning Attack 主要盯住一个入口：
  - 攻击者在某个工具描述里塞入恶意指令。
  - LLM 在选择或调用工具时读到这段描述。
  - 模型把描述中的恶意要求当成上下文指令执行。

- ShareLock 认为这个模型太窄：
  - 真实 MCP server 往往同时提供多个工具。
  - 审查者可能会扫描单个工具描述，但很难组合审查多个 benign-looking 字段。
  - 攻击者不必把完整恶意指令放在一个显眼位置。
  - 服务器更新可以把一个看似正常的初始化工具插入运行路径。

### 论文要挑战的防御假设是什么？

| 防御假设 | ShareLock 的反驳 |
| --- | --- |
| 恶意内容必须以明文或近似明文出现 | 恶意 prompt 被拆成 share，单个工具只看到元数据片段 |
| 检测器可以逐工具扫描描述字段 | 攻击语义需要跨工具重构，单个字段没有完整攻击意图 |
| 编码/高熵片段容易被熵检测发现 | share 被放进自然语言描述和看似合理的 checksum，整体熵接近正常工具 |
| 对触发工具做静态审查即可 | 运行时链路会改变模型注意力，静态识别不等于动态阻断 |
| 移除一两个可疑工具能破坏攻击 | 门限方案允许少量 share 缺失，只要可用 share 数仍达到阈值 |

## 论文主张与论证路线

### Claim 1：单工具明文投毒不够真实

- 作者先把已有 MCP 投毒工作归为两类：
  - **Tool Description Poisoning Attack**：恶意指令嵌在工具描述中，污染注册阶段的模型上下文。
  - **Tool Return Poisoning Attack**：恶意 prompt 出现在工具返回或外部资源里，污染调用阶段的模型上下文。

- 他们对单工具方案的批评很明确：
  - 如果完整 payload 直接放在一个描述字段里，人类审查容易发现。
  - 如果 payload 只是简单编码，检测器仍可能抓住异常文本、异常 entropy 或解码行为。
  - 如果一个工具被删除、禁用或审查标红，攻击就出现单点失败。

### Claim 2：多工具不是“更多通道”，而是“分布式秘密”

- ShareLock 的关键转向是把多个工具看成 secret sharing 参与者：
  - 每个工具只携带一个看似正常的 share。
  - 任意少于 `t` 个 share 的集合不能恢复完整 secret。
  - 至少 `t` 个 share 出现在模型上下文中时，恶意 prompt 才能被重构。

- 这个论证的安全含义是双重的：
  - 对攻击者：即使部分工具被审计移除，攻击仍可能执行。
  - 对防御者：逐条工具扫描不再对应完整威胁语义。

### Claim 3：运行时触发比静态描述更危险

- ShareLock 不只是“把字符串拆开”：
  - 服务器先发布包含 share 的工具描述。
  - 后续通过 update 引入伪装为环境初始化的 `EnvSetup` 工具。
  - `EnvSetup` 触发模型收集工具描述或上下文中的 share。
  - 重构出的指令通过工具返回进入模型上下文。

- 这个设计把攻击时间点从注册阶段推后到任务执行阶段：
  - 静态审查阶段看不到完整 prompt。
  - 运行时模型的注意力主要在完成用户任务上。
  - 触发器可以伪装成“初始化”“合规检查”“环境设置”等正常步骤。

## 方法机制：ShareLock 的三阶段流程

### 阶段一：把恶意 prompt 变成门限秘密

设恶意指令为 `S`，门限参数为 `(t, n)`：

```text
Input:
  S: adversarial prompt
  t: reconstruction threshold
  n: number of compromised tools

State:
  finite field F
  random coefficients a_1 ... a_{t-1}

Polynomial:
  q(x) = a_0 + a_1 x + a_2 x^2 + ... + a_{t-1} x^{t-1}
  where a_0 = S

Output:
  n shares: (x_i, q(x_i)), i = 1...n
```

- 变量解释：
  - `S`：要隐藏的恶意 prompt。
  - `n`：被污染或可控的工具数量。
  - `t`：重构所需的最少 share 数。
  - `q(x)`：`t-1` 次随机多项式。
  - `a_0`：多项式常数项，也就是秘密本身。

- 安全直觉：
  - 少于 `t` 个点不足以确定 `t-1` 次多项式。
  - 因此少于 `t` 个 share 时不能恢复 `S`。
  - 达到 `t` 个 share 时可用插值恢复 `q(0)=S`。

### 阶段二：把 share 包装成正常工具元数据

- 论文给出的伪装方式包括：
  - 给每个工具分配 `tool_id`。
  - 计算类似 `checksum` 的字段。
  - 把数字片段进行 Base64 编码。
  - 用 `sha384` 等字符串前缀制造“正常哈希/校验值”的外观。

- 这一步的目标不是让字段完全低熵，而是让它“像正常工程元数据”：
  - 一个孤立的 Base64 或 checksum 片段可能可疑。
  - 但很多开发工具本来就包含 commit hash、checksum、版本指纹、资源 id。
  - 当这些字段被混入较长自然语言描述时，整体统计特征会被稀释。

### 阶段三：用 `EnvSetup` 触发运行时重构

```text
Input:
  User task
  Tool descriptions D_1...D_n
  EnvSetup trigger from server update

State:
  available shares K
  threshold t
  primary user workflow

Loop:
  1. Agent receives normal user task.
  2. Agent sees multiple MCP tool definitions.
  3. EnvSetup asks agent to collect metadata/checksum values.
  4. If |K| >= t:
       reconstruct hidden instruction S
       inject S into runtime context via tool return
       continue toward unauthorized operation
     Else:
       reconstruction fails
       attack remains dormant or breaks
  5. Agent resumes or completes the apparent user task.

Output:
  Either successful unauthorized action, benign task completion, or failed chain.
```

- 这里最重要的是“攻击不一定让被污染工具自己做坏事”：
  - share 所在工具可以只是普通工具。
  - 触发器可以是另一个工具。
  - 最终执行恶意动作的也可能是高权限合法工具。

- 这让检测更困难：
  - 单个工具看起来不完整。
  - 单次调用看起来像任务步骤。
  - 恶意语义跨越注册、更新、工具返回和最终调用。

## 实验设置：作者怎样证明 ShareLock 更危险？

### 场景、客户端和模型

| 维度 | 论文设置 |
| --- | --- |
| 场景 | Travel、Coding、Finance、Office 四类多工具 MCP 任务 |
| MCP 客户端 | Cherry Studio、Cline |
| 主要攻击对比 | TPA、Puppet Attack、Encode-Only、ShareLock |
| 主要指标 | ASR、TCR、ASE |
| 检测设置 | 零样本 LLM 安全审查 + SFT Guard 模型 |
| 自适应防御 | 安全分类、熵检测、门限鲁棒性、温度敏感性 |

- 指标可以这样理解：
  - **ASR**：Attack Success Rate，攻击是否达成恶意目标。
  - **TCR**：Task Completion Rate，用户原始任务是否仍被完成。
  - **ASE**：论文用来综合攻击成功与任务完成的效果指标，强调“既隐蔽又不明显破坏任务”。

### Baseline 为什么选这三个？

| Baseline | 攻击形态 | 它代表的防御问题 |
| --- | --- | --- |
| TPA | 把完整恶意 prompt 明文塞进相关工具描述 | 最容易被人工和模型审查发现 |
| Puppet Attack | 通过另一个攻击者控制工具间接劫持目标工具 | 比 TPA 隐蔽，但仍依赖较短链路 |
| Encode-Only | 对 payload 编码，让 agent 解码执行 | 能绕开简单关键词，但解码步骤暴露攻击意图 |
| ShareLock | 多工具门限 share + 伪装元数据 + EnvSetup 触发 | 把完整恶意语义推迟到运行时组合 |

## 主结果：ShareLock 在攻击成功率和隐蔽性上同时占优

### Table 2：Travel Assistant 场景的攻击表现

| 方法 | 类型 | Gemini ASR/TCR/ASE | DeepSeek ASR/TCR/ASE | Qwen ASR/TCR/ASE | 平均 ASR/TCR/ASE |
| --- | --- | --- | --- | --- | --- |
| TPA | Single | 46.0 / 80.0 / 58.4 | 84.0 / 96.0 / 89.6 | 96.0 / 100.0 / 98.0 | 75.3 / 92.0 / 82.8 |
| Puppet | Single | 64.0 / 76.0 / 69.5 | 84.0 / 96.0 / 89.6 | 80.0 / 96.0 / 87.3 | 76.0 / 89.3 / 82.1 |
| Encode-Only | Single | 76.0 / 88.0 / 81.6 | 80.0 / 96.0 / 87.3 | 92.0 / 84.0 / 87.8 | 82.7 / 89.3 / 85.9 |
| ShareLock | Multi | 92.0 / 88.0 / 90.0 | 88.0 / 96.0 / 91.8 | 100.0 / 100.0 / 100.0 | 93.3 / 94.7 / 93.9 |

- 这张表的关键不是“所有模型都一律更脆弱”，而是：
  - ShareLock 对 Gemini 的 ASR 从 TPA 的 46.0 提升到 92.0。
  - 对 DeepSeek 和 Qwen，ShareLock 相比 TPA 的提升较小，但平均仍更高。
  - 多工具链没有显著牺牲 TCR，平均 TCR 反而高于三个单工具 baseline。

- 作者对 Gemini 的解释很有意思：
  - 单工具 TPA 下，Gemini 可能更倾向快速完成任务或忽略明显恶意描述。
  - ShareLock 的多步骤链路给模型更多“解释空间”，反而让隐藏指令被更准确执行。
  - 这说明“强一点的单点安全直觉”不一定能防住“分布式上下文操纵”。

### 为什么 Encode-Only 不等于 ShareLock？

- 两者都用 obfuscation，但关键差异在链路结构：
  - Encode-Only 把攻击集中在一个工具或一个解码步骤里。
  - ShareLock 把 payload、触发器、重构过程和执行工具拆开。

- 防御意义不同：
  - Encode-Only 可以被“发现可疑解码意图”拦截。
  - ShareLock 的单个 share 没有完整语义，`EnvSetup` 也能被描述成初始化或合规流程。

## 自适应防御：安全分类器为什么会错判？

### Table 3：模型安全审查的结果

| 攻击方法 | GPT-5 | Gemini-2.5-Flash | Claude-Sonnet-4.5 | Llama-Guard-3-8B | PromptGuard-86M |
| --- | --- | --- | --- | --- | --- |
| TPA | Unsafe | Unsafe | Unsafe | Safe | Safe |
| Puppet | Unsafe | Unsafe | Unsafe | Safe | Safe |
| Encode-Only | Unsafe | Unsafe | Unsafe | Safe | Safe |
| ShareLock | Safe | Safe | Safe | Safe | Safe |
| EnvSetup Tool | Safe | Safe | Unsafe | Safe | Safe |

- 论文把这个结果解释为“现代安全过滤器依赖一个错误假设”：
  - 假设恶意内容必须在 prompt 中显式可见。
  - 假设逐条 tool description 可以暴露攻击意图。
  - 假设模型判断静态文本安全就能推导运行时安全。

- ShareLock 破坏了这三点：
  - 单个 share 不是恶意 prompt。
  - 触发器只有在与其他 share 组合时才危险。
  - 动态执行中模型注意力会被用户任务和工具调用链路稀释。

### Claude 的例外说明了什么？

- Claude-Sonnet-4.5 能把 `EnvSetup` 独立标为 Unsafe。
- 但论文附录指出，在真实多步任务执行中，Claude 仍可能忽略运行时威胁。
- 这暴露了一个重要差距：
  - **静态识别能力**不等于**动态强制能力**。
  - 模型能在审查任务里说“这可疑”，不代表在工具调用任务里会持续保持审查心智。

## 熵检测：为什么 high-entropy 扫描不够？

### Table 4：工具描述 entropy 对比

| 组件 | Shannon Entropy |
| --- | --- |
| 自然语言工具描述 `weather_info` | 4.04 bits/char |
| 独立 metadata：`tool_id + checksum` | 5.54 bits/char |
| ShareLock：描述 + metadata | 5.22 bits/char |
| 含合法 hash 的正常工具 | 5.02 bits/char |

- 这张表支持一个有限但重要的结论：
  - 单看 share 元数据，确实更像高熵 payload。
  - 混入自然语言工具描述后，整体值接近带合法 hash 的普通工具。

- 但这不是说 entropy 防御完全没用：
  - 如果检测器能定位局部字段，而不是只看整段描述，仍可能发现异常。
  - 如果 MCP registry 要求所有 checksum / tool_id 与真实文件、版本或签名绑定，伪造字段会更难过审。
  - 论文的 entropy 证据主要说明“简单全局阈值”不可靠。

## 消融与失败：这不是无条件攻击

### 门限鲁棒性：`(t=3, n=5)` 的解释

- 作者在 ablation 中设定：
  - `n=5`：一共污染 5 个工具。
  - `t=3`：至少需要 3 个 share 才能重构 payload。
  - `k`：审查或系统故障后仍可用的工具数量。

- 结果逻辑如下：

| 可用工具数 `k` | 与门限关系 | 预期结果 | 安全含义 |
| --- | --- | --- | --- |
| 5 | `k > t` | 攻击按 baseline 运行 | 所有 share 可见，冗余最高 |
| 3 | `k = t` | ASR 仍保持较高 | 移除 2 个工具仍不足以阻断 |
| 2 | `k < t` | ASR 确定性降为 0% | 门限机制本身失效，payload 无法重构 |

- 这说明防御不能只问“我移除了几个可疑工具”，还要问：
  - 这些工具是否属于同一个潜在 share 集合？
  - 可疑 server 的多个工具是否共享同类 metadata 模式？
  - 审查后剩余工具是否仍足以形成攻击链？

### 温度敏感性：随机性会破坏精确链路

- ShareLock 需要模型完成较精确的步骤：
  - 识别初始化触发。
  - 收集多个 share。
  - 触发重构。
  - 调用最终高权限工具。

- 因此温度升高会带来两类后果：
  - 对 DeepSeek 和 Gemini，过高温度可能造成灾难性链路中断，TCR 也下降。
  - 对 Claude，论文观察到更常见的是局部忘记最后恶意动作，用户任务仍能完成。

- 这给防御者一个反直觉线索：
  - 更低延迟、更少步骤、更少自动初始化，有时能减少攻击窗口。
  - 过度复杂的自动化“合规初始化”反而可能给触发器提供伪装空间。

### 失败案例：三种具体边界

| 失败模式 | 论文解释 | 防御启发 |
| --- | --- | --- |
| Tool Invocation Failures | 多工具链参数错误或中间调用失败会中断攻击 | 强类型 schema、失败即停、不可自动重试高权限步骤 |
| Time Anxiety | 模型优先快速完成用户主任务，跳过辅助初始化 | 减少非必要初始化工具；让延迟优化与安全策略协同 |
| Fine-Grained Interaction | 模型要求用户确认最终敏感操作 | 高权限工具前强制用户授权和可读 diff |

## Figure 与 Table 证据怎么读？

### Figure 1：MCP 工作流和投毒入口

- 它支撑的是问题背景：
  - 工具定义在注册阶段进入模型上下文。
  - 工具返回在调用阶段再次进入模型上下文。
  - 两个阶段都能承载间接 prompt injection。

- 它不能证明 ShareLock 的有效性：
  - Figure 1 只是 threat surface。
  - 有效性主要来自 Table 2、Table 3、Table 4 和后续消融。

### Figure 2：ShareLock 总览

- 它支撑的是机制主张：
  - share 先分散进入多个工具描述。
  - 更新后的触发器在运行时收集 share。
  - 达到门限后重构恶意 prompt。

- 这张图最值得带走的不是攻击细节，而是安全边界：
  - 审查对象从“单个工具”变成“server 级工具集合”。
  - 防御对象从“静态描述字段”变成“注册、更新、调用、返回、最终高权限操作”的全过程。

### Table 2：攻击效果证据

- 它证明：
  - 在至少一个具体场景中，ShareLock 的平均 ASR/TCR/ASE 高于三个单工具 baseline。
  - 多工具攻击并没有因为链路更长而明显损失任务完成率。

- 它不能证明：
  - 所有 MCP 客户端都同样脆弱。
  - 所有模型、所有任务、所有 server 更新策略都能复现 90% 以上 ASR。
  - 真实企业环境中的审计、签名、权限隔离会完全失效。

### Table 3：静态检测证据

- 它证明：
  - 零样本 LLM 审查能识别明显单工具攻击。
  - 对 ShareLock 这种分布式元数据伪装，静态文本审查显著不足。

- 它不能证明：
  - 专门训练的多工具图检测器无效。
  - 带 provenance、签名和 server diff 的审查系统无效。
  - 运行时 policy enforcement 无效。

### Table 4：entropy 证据

- 它证明：
  - 简单 entropy 阈值会被正常 hash-like metadata 干扰。
  - 攻击字段混进自然语言后，整体统计特征不再显著异常。

- 它不能证明：
  - 字段级 entropy、schema provenance、checksum 可验证性无效。
  - registry 无法要求每个高熵字段绑定真实用途。

## 相关工作位置：ShareLock 接在什么脉络上？

### 与 Tool Poisoning Attack 的关系

- 早期 TPA 强调：
  - 工具描述是模型会信任的上下文。
  - 恶意指令可以通过 description 注入。
  - 被污染工具未必需要真的被调用。

- ShareLock 的增量：
  - 不再把 payload 放在单个 description。
  - 不再让恶意语义在静态文本里完整可见。
  - 引入门限秘密分享，使攻击具备抗部分移除能力。

### 与 MCP-ITP、MCPTox、MindGuard 等方向的关系

- MCP-ITP 关注自动生成隐式工具投毒样本。
- MCPTox 更像现实 MCP server 投毒 benchmark。
- MindGuard 类工作尝试从决策依赖图追踪工具投毒。
- ShareLock 的位置是：
  - 更强调多工具协作。
  - 更强调密码学门限结构。
  - 更强调“静态审查看不到完整恶意语义”的检测盲区。

### 与一般 prompt injection 的关系

- 普通间接 prompt injection 往往依赖：
  - 网页内容。
  - 文档内容。
  - 工具返回。
  - 用户不可见的系统片段。

- ShareLock 更接近 supply-chain 风险：
  - 攻击材料位于工具定义和 server 更新中。
  - 用户可能主动安装了 server。
  - 攻击可以长期潜伏，等待合适任务触发。

## 防御视角：如果认真对待这篇论文，应该改什么？

### 1. 审查粒度要从 tool 变成 server/tool graph

- 不应只逐个工具检查描述字段。
- 应把同一 MCP server 的所有工具定义放在一起审查：
  - 是否有重复结构的 `tool_id`、`checksum`、`seq`、`policy_token`。
  - 是否多个工具共享异常模板。
  - 是否存在无业务必要的高熵字段。
  - 是否更新后新增初始化或环境设置工具。

### 2. Server 更新要有 diff 和签名策略

- ShareLock 特别依赖“更新后引入触发器”。
- 因此 MCP 客户端需要把 server 更新视为安全事件：
  - 显示新增工具。
  - 显示工具描述 diff。
  - 标出新增高熵字段。
  - 对高权限工具调用策略重新授权。
  - 对 server 包、工具定义和资源引用做签名校验。

### 3. 运行时要做 capability-level enforcement

- 静态扫描不足以阻止动态重构。
- 高权限工具调用前应检查：
  - 调用是否由用户请求直接需要。
  - 调用参数是否与用户目标一致。
  - 是否经过新近更新的工具返回影响。
  - 是否跨 server 传递了可疑 metadata。

### 4. 用户确认不能只是弹窗

- 论文把 fine-grained interaction 视为失败因素。
- 但如果确认弹窗只写“是否允许继续”，仍可能被模型解释或用户误点。
- 更好的确认应包含：
  - 将要修改的文件或资源。
  - 修改前后 diff。
  - 发起调用的工具链。
  - 触发该调用的上游 server 和工具返回。

## 研究者视角的核心判断

### 最强贡献：把“攻击语义”从文本中拿走

- 很多 LLM 安全防御默认会找文本里的恶意语义。
- ShareLock 的核心启发是：
  - 攻击语义可以分布在多个 benign-looking 片段里。
  - 恶意性不是字段属性，而是组合属性。
  - 组合可能只在运行时、特定任务、特定工具链下出现。

### 最值得怀疑的地方：真实部署的先验太强

- 论文假设攻击者能控制或污染多个工具描述。
- 还假设可通过 server update 引入触发器。
- 在松散安装第三方 MCP server 的个人开发环境中，这很现实。
- 在严格企业环境中，以下机制会显著改变结果：
  - server allowlist。
  - signed tool manifests。
  - registry-level review。
  - outbound data policy。
  - high-risk tool human approval。
  - tool-call provenance logging。

### 最有研究价值的后续问题

| 问题 | 为什么重要 |
| --- | --- |
| 能否构建 server-level graph detector？ | 单工具分类器明显不够，需要检测跨工具 share 结构 |
| 如何定义 tool metadata 的最小权限？ | 描述字段不应无限制携带 hash-like 任意文本 |
| MCP 更新是否应触发安全重新授权？ | ShareLock 的触发器依赖 server update |
| 运行时如何追踪 prompt provenance？ | 需要知道最终高权限调用受哪些工具返回影响 |
| 多工具攻击能否扩展到多 server？ | 真实 agent 常连接多个第三方 server |
| 防御能否把 `k < t` 作为目标？ | 如果能识别潜在 share 集合，移除足够节点即可使攻击确定失败 |

## 结论与局限

### 可以带走的结论

- ShareLock 不是一个“更花哨的编码攻击”，而是把 MCP 工具投毒改造成分布式门限重构问题。
- 它的实验表明，在作者构造的多工具场景中，ShareLock 能同时保持高攻击成功率、高任务完成率和低静态可检测性。
- 它对 Agent 安全最重要的提醒是：工具定义、工具更新、工具返回和最终调用必须被放在同一个 provenance 图里看。

### 不能过度外推的地方

- 实验场景仍是作者构造的四类 benchmark，不等价于所有生产 MCP 环境。
- Table 2 的详细数字主要来自 Cherry Studio 的 Travel Assistant 场景，其他场景的结论需要结合完整论文和复现实验继续核验。
- 论文展示的是攻击可行性，不是完整防御评测；对签名 manifest、强 allowlist、字段级 schema policy、运行时信息流控制的比较还不充分。
- ShareLock 对执行链稳定性敏感，工具调用错误、模型延迟优化、用户确认和高温随机性都会降低攻击效果。

### 对 AI Agent 安全的延伸判断

- 如果 Agent 生态继续把“工具描述”当作普通自然语言上下文处理，那么 MCP server 就会越来越像软件供应链依赖：
  - 安装即授信。
  - 更新即改变攻击面。
  - 多个小字段可以组合成大风险。

- 下一阶段更关键的防御不是再训练一个更会读描述的模型，而是把工具系统做成可验证系统：
  - 工具 manifest 可签名。
  - 元数据字段有类型和用途约束。
  - 更新有 diff 和风险评级。
  - 工具调用有 provenance。
  - 高权限动作有可审计授权。

- ShareLock 的研究价值正在这里：它把 MCP 安全从“prompt injection 文本检测”推进到“Agent 运行时供应链治理”。
