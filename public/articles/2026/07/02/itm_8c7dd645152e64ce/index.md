# AgentFlow：把 Agent 程序从“框架黑箱”还原成可审计依赖图

### 元信息

| 字段 | 内容 |
|---|---|
| 论文 | AgentFlow: Building Agent Dependency Graphs for Static Analysis of Agent Programs |
| 作者 | Shenao Wang, Xinyi Hou, Yanjie Zhao, Xiao Cheng, Haoyu Wang |
| 时间 | arXiv v1，2026-07-02 |
| 分类 | cs.SE, cs.CR |
| 链接 | https://arxiv.org/abs/2607.01640 |
| 本文定位 | 大模型 Agent 安全与治理：静态分析、Agent BOM、prompt-to-tool 风险 |

### TL;DR

1. **这篇论文解决的问题**：Agent 程序不只是普通 Python 代码，它还把模型、prompt、工具、MCP、memory、handoff、guardrail 放进 LangGraph、OpenAI Agents SDK、CrewAI、LlamaIndex、Semantic Kernel 等框架语义里；传统 AST 或 call graph 很难回答“哪个 Agent 能读到什么、能把什么传给哪个工具、哪个高危动作被什么策略保护”。
2. **核心方法**：作者提出 **Agent Dependency Graph, ADG**，把一个 Agent 程序表示成三张共享节点图：ACDG 记录组件绑定，ACFG 记录可能控制流，ADFG 记录可能数据流；节点覆盖 Agent、prompt、model、capability、memory state、control policy。
3. **系统实现**：AgentFlow 用 11.4 KLoC Python、4.5 KLoC TypeScript checker、2.9 KLoC 框架语义 registry 实现；前端建模 5 个框架、143 个框架特定构造，其中 OpenAI Agents SDK 48 个、LangChain/LangGraph 27 个、CrewAI 15 个、LlamaIndex 22 个、Semantic Kernel 31 个。
4. **实验规模**：作者构造 AgentZoo，来自 GitHub 的 5,399 个真实 Agent 程序项目，包括 3,823 个 LangChain/LangGraph、947 个 CrewAI、442 个 OpenAI Agents SDK、146 个 LlamaIndex、41 个 Semantic Kernel 项目。
5. **主要数字**：在 ADG-Eval 60 项目上，AgentFlow 成功 59 个、1 个 timeout，恢复 738 个 Agent、314 个 capability、599 个 prompt、180 个 model、39 个 memory、60 个 policy，以及 973 条结构边、639 条控制边、1,222 条数据边。
6. **安全发现**：在 AgentZoo 上，AgentFlow 找到 238 个含 prompt-to-tool 风险的项目，占 4.4%；总计 4,357 条 P2T findings；抽样人工验证 100 条报告，73 条是真漏洞，precision 为 73.0%，另有 9 条漏报来自动态绑定、自定义 wrapper 和 LangGraph 状态/工具绑定等场景。
7. **局限**：ADG 是静态、过近似分析，能说明“程序结构允许某条路径”，不能证明运行时一定触发；当前只覆盖 Python 和 5 个框架，框架 API 演化会要求 registry 持续更新，sink 语义也需要更细地区分读写和副作用。

### 研究问题：为什么 Agent 程序需要一种新的依赖图？

普通软件依赖分析通常问几个问题：

1. 函数 A 会不会调用函数 B？
2. 变量 x 的值会不会流向 sink？
3. 对象 o 的 points-to 集合是什么？
4. 某个框架回调在什么生命周期里触发？

Agent 程序把这个问题改写成更混合的形态：

| 传统程序分析问题 | Agent 程序里的对应问题 | 为什么更难 |
|---|---|---|
| call graph | Agent 是否可能调用某个 tool/MCP/skill | 调用常由框架 `tools=[...]`、decorator、handoff 声明，而非显式函数调用 |
| data flow | 用户 prompt 是否可能进入高权限工具参数 | 数据可能经过 prompt、memory、agent message、tool return 多次转写 |
| component inventory | 系统有哪些软件包/模型/数据 | 还要知道 Agent、prompt、model、tool、memory、policy 之间的绑定 |
| guard check | 哪些敏感动作被权限门控 | guardrail 可能绑定在 Agent、tool、hosted MCP 或 handoff 路径上 |

论文的关键判断是：

> Agent 程序的安全边界不是单独由代码语句决定，而是由“代码 + 框架语义 + LLM 运行时选择”共同决定。

因此，作者没有把 AgentFlow 写成又一个框架 parser，而是先抽象出一层统一 IR：**ADG**。它不预测模型运行时会选择哪个动作，而是恢复程序结构允许的所有 Agent 依赖路径。

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| Agent 程序存在传统分析看不到的 agent-specific dependencies | 把 Agent、prompt、model、capability、memory、policy 作为一等节点 | Figure 2 的 OpenAI Agents SDK 例子展示 `tools`、`handoffs`、`session`、`require_approval` 都不是普通调用边 | 例子说明问题存在，但不等于所有框架构造都能被完全恢复 |
| ADG 能统一不同框架的语义 | 把依赖分成 ACDG/ACFG/ADFG，并通过 fact extraction frontend 规范化框架 API | Table I 显示 5 个框架共 143 个 constructs 被建模 | 只覆盖 Python 生态和 5 个框架，低代码平台和产品级 Agent 不在范围内 |
| ADG 比 AST 工具更适合治理和 BOM | ACDG 查询 `BOM(P)` 返回 Agent 到 prompt/model/tool/memory/agent 的结构可达关系 | Table III、IV、V 显示 AgentFlow 恢复更多节点、边和 binding relationships | BOM 更丰富不自动等于漏洞可利用，需要结合策略和动态验证 |
| ADG 可用于 prompt-to-tool 风险检测 | 组合 ADFG prompt influence、ACFG sensitive capability reachability、agent-to-capability 参数边 | AgentZoo 上发现 238 个 P2T 风险项目、4,357 条 findings；抽样 precision 73.0% | 静态过近似会带来 false positive；动态 wrapper 会带来 false negative |

这个论证路线很清楚：

1. 先证明 Agent 程序里的依赖不是传统 AST 能完整表达的。
2. 再给出 ADG 作为统一语义层。
3. 然后用两个下游任务验证 ADG 的实用性：
   - Agent BOM：治理和供应链透明度。
   - Prompt-to-tool：安全路径检测。
4. 最后用大规模真实项目说明它不是玩具例子。

### 方法机制：ADG 到底表示什么？

ADG 的形式定义是：

```text
ADG_P = <ACDG_P, ACFG_P, ADFG_P>
```

三张图共享一个节点集合：

```text
V = A ⊎ I ⊎ M ⊎ C ⊎ S ⊎ G
```

变量解释：

| 符号 | 含义 | Agent 程序例子 |
|---|---|---|
| A | Agent units | `ResearchAgent`, `OpsAgent` |
| I | Prompt contexts | system instructions、任务 prompt |
| M | Model units | `gpt-4o`、本地模型配置 |
| C | Capabilities | function tool、MCP server、skill |
| S | Memory states | session、vector store、conversation memory |
| G | Control policies | approval、guardrail、permission check |

#### ACDG：组件绑定图

ACDG 是无向图，回答“一个 Agent 由哪些组件构成”：

```text
E_acdg ⊆ {{a, x} | a ∈ A, x ∈ I ∪ M ∪ C ∪ S}
       ∪ {{g, x} | g ∈ G, x ∈ A ∪ C}
       ∪ {{a1, a2} | a1, a2 ∈ A}
```

它适合做 Agent BOM，因为 BOM 需要的不只是“项目用了哪些包”，还要回答：

1. 哪个 Agent 绑定哪个模型？
2. 哪个 Agent 读哪个 prompt？
3. 哪个 Agent 可调用哪个 tool/MCP/skill？
4. 哪个 Agent 共享哪个 memory？
5. 哪个高危 capability 是否绑定了 policy？

#### ACFG：Agent 控制流图

ACFG 是有向图，回答“Agent 结构上可能把控制权转移到哪里”：

```text
T_acfg ⊆ A × (G ∪ {⊥}) × (A ∪ C)
```

解释：

1. `(a, ⊥, t)`：Agent `a` 可直接转向目标 `t`，目标可能是另一个 Agent，也可能是 capability。
2. `(a, g, t)`：Agent `a` 要经过 policy `g` 才能到达目标 `t`。

这一步对安全分析特别重要，因为 LLM 是否调用工具无法静态确定；但静态分析可以恢复“程序结构允许它调用哪些工具”。

#### ADFG：Agent 数据流图

ADFG 是有向图，回答“信息可能如何传播”：

```text
E_adfg ⊆ E_ctx(I→A) ∪ E_arg(A→C) ∪ E_ret(C→A)
       ∪ E_msg(A→A) ∪ E_write(A→S) ∪ E_read(S→A)
```

对应到真实 Agent：

| 数据流边 | 含义 | 风险意义 |
|---|---|---|
| `prompt → agent` | prompt 影响 Agent 决策上下文 | prompt injection 的入口 |
| `agent → capability` | Agent 把参数传给工具 | 高权限调用的 taint sink |
| `capability → agent` | 工具返回影响后续步骤 | 工具输出可污染下一轮 |
| `agent → agent` | handoff/message/task result | 多 Agent 传播风险 |
| `agent → memory` | 写入 session/vector store | 持久化污染 |
| `memory → agent` | 后续读取记忆 | 跨轮次传播 |

这也是论文与一般 workflow scanner 最大的分界：它不只是画出 workflow，而是把 prompt、memory、tool 参数和 agent handoff 放进同一个可查询的依赖空间。

### Figure 2 的动机例子：为什么普通 AST 会漏掉关键关系？

论文用一个 OpenAI Agents SDK 风格例子说明问题：

1. `SQLiteSession` 定义共享 memory。
2. `@function_tool` 把 `web_search` 注册为工具。
3. `HostedMCPTool` 定义 `send_email`，且 `require_approval="always"`。
4. `OpsAgent` 绑定 `send_email`。
5. `ResearchAgent` 绑定 `web_search`，并 handoff 到 `OpsAgent`。
6. `Runner.run` 给 `ResearchAgent` 输入用户请求，同时附加 session。

普通 AST 可以看到函数定义、对象构造和变量引用，但很容易漏掉这些语义边：

| 框架写法 | ADG 恢复的语义 | 安全意义 |
|---|---|---|
| `tools=[web_search]` | `ResearchAgent → WebSearch` 控制边和参数数据边 | Agent 能把用户请求转成搜索参数 |
| `handoffs=[handoff(ops_agent)]` | `ResearchAgent → OpsAgent` 控制边和消息数据边 | 低权限 Agent 可把上下文传给另一个 Agent |
| `session=session` | `ResearchAgent ↔ ResearchMem` 读写路径 | 信息可跨执行阶段保留 |
| `require_approval="always"` | `OpsAgent → ApprovalPolicy → SendEmail` | 高危发送动作有门控 |

这说明 Agent 安全审计的核心不只是“有没有危险函数”，而是：

```text
用户/外部 prompt
  → Agent 上下文
  → memory 或 handoff
  → 高权限 Agent
  → 工具参数
  → 外部副作用
```

### 构建流程：AgentFlow 如何从代码生成 ADG？

论文把构建过程拆成三段：

1. **Agent fact extraction frontend**
   - 识别框架构造：Agent constructor、tool decorator、hosted tool、handoff、workflow command、session object。
   - 做 alias resolution：把 `send_email` 在 tool list 里的引用追回 `HostedMCPTool` 定义。
   - 输出规范化 facts：entity、component、control、data 四类。
2. **Intra-agent local analysis**
   - 在单个 Agent 内初始化节点和边。
   - `BindModel`、`BindPrompt`、`BindTool` 生成 ACDG 边。
   - `Call(a,c)` 生成 ACFG 的 agent-to-capability 边。
   - `ToolCallArg`、`ToolCallRet` 生成 ADFG 的参数和返回数据边。
3. **Inter-agent dependency analysis**
   - `Transfer(a1,a2)` 生成 Agent 间控制流。
   - `InterAgentMsg(a1,a2)` 生成显式消息数据流。
   - 共享 memory 通过 `a1 → s → a2` 表达隐式跨 Agent 数据传播。

可以把核心算法理解成：

```text
Input:
  P: 一个 Python Agent 程序
  R: 框架语义 registry
  A: alias/callee/argument 分析结果

State:
  Facts = {}
  ADG = <ACDG, ACFG, ADFG>

Loop:
  for each framework construct in P:
    resolve aliases with A
    emit entity facts
    emit component binding facts
    emit control-flow facts
    emit data-flow facts

  for each local agent scope:
    add component edges to ACDG
    add capability/control-policy edges to ACFG
    add prompt/tool/memory edges to ADFG

  for each multi-agent construct:
    add handoff/workflow edges to ACFG
    add message/shared-state edges to ADFG

Output:
  ADG plus queryable facts for BOM and P2T detection

Failure boundary:
  if behavior is hidden in dynamic custom wrappers,
  or framework syntax is not in registry,
  ADG may miss nodes or edges.
```

### 两个图查询：BOM 与 prompt-to-tool

#### Agent BOM 查询

论文给出的 BOM 查询是：

```text
BOM(P) = {(a, x) | a ∈ A, x ∈ I ∪ M ∪ C ∪ S ∪ A, a ;str x}
```

含义：

1. 从 Agent 节点 `a` 出发。
2. 沿结构边 `;str` 遍历。
3. 收集可达的 prompt、model、capability、memory、其他 Agent。

这比“列出所有模型和包”更接近真实审计需求，因为审计者关心的是绑定关系：

| BOM 问题 | 没有 ADG 时 | 有 ADG 时 |
|---|---|---|
| 哪个 Agent 能发邮件？ | 只能 grep `send_email` | 查 `Agent → Capability` |
| 哪个 prompt 影响该 Agent？ | 需要人工读 constructor | 查 `Prompt → Agent` |
| 是否共享 memory？ | 需要跨文件追 session | 查 `Agent → State → Agent` |
| 是否有 approval？ | 需要理解框架参数 | 查 `Agent → Policy → Capability` |

#### Prompt-to-tool 查询

论文把 P2T 风险写成三个条件的交集：

```text
R_pa = {(p, a) | p ∈ Src_prompt, a ∈ A, p ;data a}
R_ac = {(a, c) | a ∈ A, c ∈ Snk_tool, a ;ctrl c}
P2T(P) = {(p, a, c) | (p,a) ∈ R_pa, (a,c) ∈ R_ac, (a,c) ∈ E_arg}
```

中文解释：

1. `p ;data a`：prompt 源能影响 Agent。
2. `a ;ctrl c`：Agent 结构上能到达敏感 capability。
3. `(a,c) ∈ E_arg`：Agent 的上下文可能进入 capability 参数。

只有三者同时成立，才报告 prompt-to-tool 风险。这个定义比“prompt 旁边出现工具名”更严格，也比纯动态测试更适合大规模筛查。

### 实验设置：四个 RQ 分别证明什么？

| RQ | 问题 | 数据集 | 对比对象 |
|---|---|---|---|
| RQ1 | 能否恢复 Agent 实体和依赖 | ADG-Eval，60 个项目 | Agent-Wiz、AgenticRadar |
| RQ2 | 能否生成更依赖感知的 Agent BOM | BOM-Eval，100 个项目 | Trusera AI-BOM、Drako Agent BOM、Cisco AI BOM |
| RQ3 | 能否发现真实 prompt-to-tool 风险 | AgentZoo，5,399 个项目 | 人工抽样审计 |
| RQ4 | 能否扩展到真实规模 | AgentZoo，5,399 个项目 | 时间与图规模统计 |

实验环境很强：

1. Ubuntu Linux 24.04.3 LTS。
2. 双 AMD EPYC 9554，128 物理核。
3. 1007 GiB RAM。
4. 5 张 NVIDIA A100 80GB。
5. 8 块 7 TB SSD 与 4 块 14.6 TB HDD。

这说明 RQ4 的性能数字不能直接外推到普通开发机，但能说明它适合批量离线审计。

### RQ1：ADG 恢复了哪些 AST 工具看不到的东西？

Table III 的核心结果：

| 工具 | 成功/超时/失败 | Agent | Cap. | Prompt | Model | Memory | Policy | Struct. | Ctrl. | Data |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Agent-Wiz | 60/0/0 | 284 | 35 | - | 54 | - | - | 97 | 185 | - |
| AgenticRadar | 31/0/29 | 149 | 54 | 32 | 41 | - | - | 73 | 352 | - |
| AgentFlow | 59/1/0 | 738 | 314 | 599 | 180 | 39 | 60 | 973 | 639 | 1,222 |

几个关键读法：

1. **Prompt 节点差距很大**：AgentFlow 恢复 599 个 prompt，AgenticRadar 只有 32 个，Agent-Wiz 没有该类输出；这直接影响 prompt injection 路径是否能被表达。
2. **Memory 和 Policy 是分水岭**：两个 baseline 在表里没有 memory/policy，AgentFlow 恢复 39 个 memory、60 个 policy；这对持久化污染和权限门控分析非常关键。
3. **Data edge 是关键增量**：AgentFlow 恢复 1,222 条数据边，baseline 没有；没有数据边，就只能画 workflow，无法判断 prompt 是否进入 tool 参数。
4. **成功率也有代价**：AgentFlow 有 1 个 timeout，说明更深的 alias/semantic analysis 比 AST parsing 更重。

作者的论证不是“AST 工具没用”，而是说：

```text
AST 工具适合快速识别显式结构；
ADG 适合恢复框架语义下的 Agent 依赖。
```

### RQ2：Agent BOM 为什么不是 AI inventory？

Table V 给出 BOM-Eval 上的数字：

| 工具 | 成功 | 组件数 | 关系数 | 主要问题 |
|---|---:|---:|---:|---|
| Drako Agent BOM | 100/100 | 971 | 107 | 有组件，但显式绑定关系少 |
| Trusera AI-BOM | 100/100 | 3,615 | - | 多是模型、软件包或相关 inventory，不恢复 Agent 组件绑定 |
| Cisco AI BOM | 100/100 | 141 | 22 | 主要集中在 agent-model 绑定 |
| AgentFlow | 98/100 | 2,295 | 1,008 | 组件与绑定关系都更丰富，但有 2 个失败 |

这里最值得注意的不是组件总数，而是 **binding relationships**：

1. 传统 SBOM/AI-BOM 能告诉你系统里有什么。
2. Agent BOM 还必须告诉你这些东西如何连接。
3. 对 Agent 安全来说，“一个发送邮件工具存在”不等于“哪个 Agent 能调用它”。
4. “一个 approval policy 存在”也不等于“它真的绑定在高危 tool 路径上”。

因此，AgentFlow 的 BOM 更像“可执行治理图”，而不是静态清单。

### RQ3：Prompt-to-tool 风险结果怎么读？

AgentZoo 上的结果：

| 指标 | 数字 |
|---|---:|
| 分析项目总数 | 5,399 |
| P2T 风险项目 | 238 |
| 占比 | 4.4% |
| P2T findings | 4,357 |
| 抽样 precision | 73.0% |
| 非报告样本中发现漏报 | 9/100 |

按框架分布：

| 框架 | P2T 风险项目数 |
|---|---:|
| LangChain/LangGraph | 133 |
| OpenAI Agents SDK | 63 |
| LlamaIndex | 27 |
| CrewAI | 10 |
| Semantic Kernel | 5 |

按副作用分布：

| 副作用类型 | 项目数 |
|---|---:|
| External Send | 129 |
| File Access | 74 |
| SQL Query | 42 |
| CMD/Code Execute | 41 |

这些数字的含义要谨慎解释：

1. **238 个项目不是 238 个可利用漏洞**：静态分析报告的是结构允许的 prompt-to-tool 路径。
2. **73% precision 已经说明信号不弱**：100 条报告里 73 条真有 P2T vulnerability。
3. **25 个 false positive 仍有有效 taint path**：只是 sink 语义过粗，例如本地只读文件、只读 SQL、受限 calculator 被当成更危险 sink。
4. **9 个 false negative 指向工程难点**：custom command wrapper、dynamic tool binding、custom orchestration、LangGraph state/tool binding 都是静态 registry 很难完全覆盖的部分。

最关键的研究价值在于：

```text
P2T 风险不是“prompt injection 是否成功”的动态实验问题，
而是先要问“程序结构是否让 prompt-influenced context 到达高权限工具参数”。
```

### RQ4：性能和图规模是否可接受？

论文给出的规模数字：

| 指标 | 数字 |
|---|---:|
| 中位端到端分析时间 | 14.17 秒 |
| 95 分位分析时间 | 163.54 秒 |
| 中位 ADG 节点数 | 208 |
| 中位 ADG 边数 | 206 |
| 95 分位节点数 | 721 |
| 95 分位边数 | 832 |
| 最大 ADG 节点数 | 3,370 |
| 最大 ADG 边数 | 17,678 |
| 中位 extracted agent facts | 43 |
| 95 分位 extracted agent facts | 313 |

这组数字支持一个有限结论：

1. ADG 不会把全部 host-language statement 都展开，所以图规模相对可控。
2. 95 分位 163.54 秒对 pre-commit 来说偏重，但对 CI 夜间扫描、供应链审计和批量研究是可接受的。
3. 最大图 17,678 条边说明真实 Agent 项目可能很复杂，人工审计需要图查询先缩小范围。

### Figure 与 Table 逐项证据解读

| 图表 | 支持的论点 | 不能证明什么 |
|---|---|---|
| Figure 1 | Agent supply chain 不只含模型和工具，还含 MCP、A2A、skills、framework、runtime、registry | 不证明每个组件都会带来同等风险 |
| Figure 2 | OpenAI Agents SDK 例子里，tools、handoff、session、approval 都需要框架语义恢复 | 不证明该例子中的 email 路径一定会被利用 |
| Figure 3 | AgentFlow 的 pipeline 是 fact extraction → ADG construction → BOM/P2T queries | 不证明 registry 对未来框架版本仍有效 |
| Figure 4 | alias resolution 能把代码引用还原成 agent facts | 不证明动态反射、自定义 wrapper 都可恢复 |
| Figure 5 | BOM 和 P2T 能表达成图查询 | 不证明查询结果等于可利用漏洞 |
| Table I | 5 个框架共 143 个 constructs 被建模 | 不覆盖非 Python、低代码平台和产品闭源 Agent |
| Table III | AgentFlow 比 baseline 恢复更多 prompt/memory/policy/data edge | 不说明所有恢复边都运行时可达 |
| Table V | AgentFlow BOM 有 2,295 组件和 1,008 关系 | 不说明 BOM 使用者能自动完成治理决策 |
| Table VI | P2T 风险在真实项目中存在且分布广 | 不说明 4.4% 是整个生态的真实漏洞率 |

### 消融、失败案例与误差来源

论文没有给出传统意义上的 ablation table，例如“去掉 alias resolution 后下降多少”。但它通过人工审计揭示了误差结构。

#### False positive 的主要来源

| 来源 | 例子 | 为什么会误报 |
|---|---|---|
| sink 语义过粗 | 本地文件 read/path traversal | 路径存在，但没有 write/delete 副作用 |
| SQL 操作不细分 | 只读 SQL query | 被归入 SQL sink，但实际危害更低 |
| 受限工具 | calculator-style tool | 工具名或调用形态像执行能力，但语义被限制 |

这说明下一步不是简单“减少路径”，而是给 capability sink 加更细的 effect typing：

```text
effect(c) ∈ {read, write, delete, send, execute, mutate_admin, network}
risk(p,a,c) = taint_path(p,a,c) × effect(c) × policy(c)
```

#### False negative 的主要来源

| 来源 | 为什么难 |
|---|---|
| custom command wrappers | 工具能力被包在项目自定义函数里，框架 registry 看不到真实副作用 |
| dynamic tool binding | 工具集合在运行时拼装，静态值不稳定 |
| custom orchestration | Agent 转移不使用已建模 API |
| LangGraph state/tool binding | 状态更新和工具绑定可能通过更复杂模式表达 |
| multi-tool wrappers | 一个 wrapper 内部再选择多个工具，外层只看到一个普通 callable |

这些失败案例也给出领域边界：

1. ADG 是“框架语义静态分析”，不是完整程序语义恢复。
2. 对高风险项目，ADG 更适合作为 directed fuzzing 或人工审计的入口。
3. 对生产治理，最好把 ADG 结果和 runtime trace、policy enforcement、tool permission manifest 结合。

### 相关工作位置：它和现有 Agent 安全工具有什么不同？

论文把自己放在三条线之间：

| 方向 | 代表 | AgentFlow 的差异 |
|---|---|---|
| 框架感知静态分析 | FlowDroid、ICCTA、Spring/YASA 类工作 | 把 framework-induced semantics 思路迁移到 Agent framework |
| LLM/Agent 安全测试 | LLMsmith、AgentFuzz、prompt-to-sink 分析 | 用 ADG 先恢复 Agent 依赖，再查询 prompt-to-tool |
| Agent scanner / BOM | AgenticRadar、Agent-Wiz、AI-BOM 工具 | 从 AST inventory 升级到 dependency-aware Agent BOM |

最有价值的定位是：

```text
AgentFlow 不是替代 fuzzing，
而是给 fuzzing、BOM、审计和治理提供统一的静态语义底座。
```

如果没有 ADG，动态测试很难知道该优先打哪条路径；如果没有动态测试，ADG 又很难证明某条路径运行时一定可利用。

### 证据边界与可复现性

这篇论文的证据强处：

1. 数据规模不是单个 demo，而是 5,399 个 GitHub Agent 项目。
2. 对比对象覆盖 Agent scanner 和 BOM 工具两类。
3. P2T 做了人工抽样审计，报告 precision 和漏报线索。
4. 形式化查询把 BOM/P2T 的判定条件讲清楚。

但仍有几个边界：

1. **代码仓库未在 arXiv 页面直接给出**：本文检索 GitHub 未找到明确官方 AgentFlow 实现入口，因此当前可复现性主要依赖论文描述。
2. **数据集构造可能偏向 GitHub 上显式使用框架 import 的项目**：没有覆盖闭源企业 Agent、低代码 Agent、产品化 coding agent、Dify/Coze 类可视化编排。
3. **运行环境非常强**：A100 和大内存服务器说明大规模批处理可行，但不能直接说明普通 CI runner 的成本。
4. **P2T precision 仍受 sink taxonomy 限制**：73% 是可用起点，不是足够自动阻断的精度。
5. **框架演化风险高**：Agent framework API 变化快，registry 如果不更新，ADG 会逐渐漏边。

### 对 Agent 安全研究的进一步问题

#### 先把它放到本周 Agent 安全脉络里

本周几篇 Agent 安全论文有一个共同背景：Agent 不再只是回答问题，而是在真实软件和运营环境里留下状态、执行动作、组合工具。不同论文切入点不一样：

| 研究切口 | 关注对象 | 核心风险 | AgentFlow 的关系 |
|---|---|---|---|
| underspecified DevOps instruction | 生产操作边界 | 指令不完整时越权或误操作 | 需要知道 Agent 能调用哪些操作性工具 |
| infinite agentic loops | 迭代控制 | Agent 不停止、循环调用、handoff 失控 | 可在 ACFG 上寻找控制流环和缺失终止策略 |
| persistent-state AI control | 跨会话状态 | 攻击分散在多轮修改和 memory 中 | 可在 ADFG 上追踪 memory 写入与后续读取 |
| malicious skills / tool supply chain | 第三方能力包 | tool、skill、MCP 扩展权限边界 | 可把 capability 节点接入供应链 inventory |
| AgentFlow | 框架语义依赖 | prompt 到工具、Agent 到能力、memory 到决策的结构路径 | 给上述动态风险提供静态结构先验 |

这也是本文值得深读的原因：它不直接声称“发现了最严重的新攻击”，而是在回答一个更基础的问题：

```text
当 Agent 程序越来越像软件系统时，
我们是否拥有类似 call graph、data-flow graph、BOM 的基础分析对象？
```

如果答案是否定的，后续所有安全评测都会遇到同一个瓶颈：

1. 动态红队不知道该重点触发哪条工具路径。
2. 供应链清单不知道组件之间是否真的可达。
3. 策略引擎不知道 approval 是否挡在正确位置。
4. 人工审计只能在框架代码、prompt、tool schema、memory 配置之间来回跳转。

AgentFlow 的价值在于先把这些分散证据统一成图。它不是最终判决器，而是把“Agent 程序可允许的行为空间”压缩成可查询结构。

#### 问题一：Agent 依赖图应该成为安全策略的输入吗？

如果 ADG 能稳定恢复 Agent 到 capability 的路径，就可以把策略写成图约束：

```text
deny if:
  prompt_source ;data agent
  and agent ;ctrl capability
  and effect(capability) ∈ {send, execute, delete, admin_mutate}
  and no approval_policy on path(agent, capability)
```

这比只在 runtime 做字符串过滤更结构化，因为它把“能力边界”放回程序结构。

#### 问题二：ADG 如何和 MCP/skills 供应链结合？

Agent 程序越来越依赖外部能力包：

1. MCP server 可扩展工具面。
2. Agent Skills 可打包 prompt、脚本和配置。
3. A2A 让 Agent 间调用跨进程、跨服务。

ADG 的下一步应该把外部 manifest、权限声明、tool schema 和运行时 trace 纳入同一个图里。否则，静态代码里的 capability 只是入口，真正的副作用可能藏在外部 server 或 skill 包内部。

#### 问题三：如何把过近似变成可操作风险？

静态图天然会过近似。更实用的方向不是追求“零误报”，而是把风险排序拆成：

| 因子 | 解释 |
|---|---|
| reachability | prompt 是否可到达 Agent |
| privilege | capability 的副作用强度 |
| guard | 是否存在 approval/guardrail |
| persistence | 是否写入 memory 或跨轮次传播 |
| dynamic evidence | runtime trace 或 directed fuzzing 是否触发 |

这样可以把 ADG 从“报告很多路径”变成“给审计者排优先级”。

#### 问题四：ADG 能否支持“最小权限 Agent”设计？

今天很多 Agent 框架把工具列表当成开发便利性配置：

1. 为了让 Agent 少卡住，开发者倾向于一次性给很多工具。
2. 为了让 multi-agent 协作顺畅，开发者倾向于开放 handoff。
3. 为了让长任务可恢复，开发者倾向于共享 memory 或 session。
4. 为了减少审批摩擦，开发者可能只给少数工具加 guardrail。

这些决定单独看都合理，但组合后会形成隐蔽的权限放大：

```text
低风险 prompt
  → 宽工具 Agent
  → 共享 memory
  → 高权限 Agent
  → 外发或执行工具
```

ADG 可以把“最小权限”从口号变成具体检查：

| 检查项 | 图查询视角 | 可操作修复 |
|---|---|---|
| 工具过宽 | Agent 可达 capability 数过多 | 拆 Agent 或收窄 tool list |
| memory 过宽 | 多个 Agent 共享同一 state | 按任务隔离 session 或命名空间 |
| handoff 过宽 | 低权限 Agent 可达高权限 Agent | 给 transfer 加 policy 或改成受限任务队列 |
| guard 缺失 | 高副作用 capability 路径无 policy | 在 ACFG 路径上插入 approval/validator |
| prompt 污染 | prompt source 可数据流到 sink 参数 | 对参数做 schema validation 和 allowlist |

这个方向也能解释为什么 Agent BOM 必须带 binding relationships。没有绑定关系，BOM 只能告诉你“项目里有 email tool”；有 ADG，BOM 才能告诉你“哪个 Agent、经由哪个路径、在什么 policy 下能触达 email tool”。

#### 问题五：静态图和运行时日志应如何互补？

AgentFlow 当前是静态系统。静态系统的优点是覆盖面广、成本可控、能在代码上线前运行；缺点是无法知道模型在某次运行中实际选择了什么。运行时日志正好相反：它能证明某条路径真实发生，但覆盖有限，也容易受测试输入影响。

更合理的组合方式是：

1. 用 ADG 找出所有结构上可达的高风险路径。
2. 按 capability effect、policy 缺失、memory 跨轮传播给路径排序。
3. 用 directed fuzzing 或 replay harness 对高分路径生成输入。
4. 用 runtime trace 验证是否真的调用工具、参数是否被污染、guard 是否生效。
5. 把真实 trace 反写为 ADG 边的置信度，降低长期误报。

可以把风险分数写成一个研究原型：

```text
score(path) =
  w1 * prompt_influence
+ w2 * capability_effect
+ w3 * memory_persistence
+ w4 * missing_guard
+ w5 * runtime_triggered
- w6 * schema_validation
- w7 * human_approval
```

变量解释：

| 变量 | 含义 |
|---|---|
| `prompt_influence` | prompt 或外部输入到 Agent 的数据流强度 |
| `capability_effect` | 工具副作用强度，例如 send、write、execute |
| `memory_persistence` | 是否经过可跨轮次保存的 state |
| `missing_guard` | 路径上是否缺少 approval 或 validator |
| `runtime_triggered` | 动态测试是否真实触发 |
| `schema_validation` | 参数是否被强 schema/allowlist 约束 |
| `human_approval` | 高危动作是否必须人工确认 |

这类组合会让 ADG 从“论文里的 IR”变成工程里的 triage 机制。

### 一个研究者视角的小结：这篇论文真正改变了什么？

我认为它改变的不是某个 benchmark 排名，而是 Agent 安全问题的抽象层级。

过去很多讨论默认把 Agent 风险分成两类：

1. 模型层：模型会不会被 prompt injection、越狱、幻觉影响。
2. 工具层：某个 tool、plugin、MCP server 有没有危险能力。

AgentFlow 强调中间还有一层：**框架语义层**。

这一层决定：

1. prompt 是否能进入 Agent 上下文。
2. Agent 上下文是否能写入 memory。
3. memory 是否会影响另一个 Agent。
4. Agent 是否能通过 handoff 到达高权限 Agent。
5. 高权限 Agent 是否能把污染上下文传进工具参数。
6. control policy 是否真的挡在调用路径上。

如果没有这层，安全研究会过度依赖黑盒测试；如果只有这层，又会误把结构可达当成真实可利用。本文的合理位置是中间层：为动态验证、人工审计和权限治理提供静态骨架。

### 结论

AgentFlow 这篇论文的贡献不在于发现某一种全新的 prompt injection 技巧，而在于把 Agent 程序安全问题重新放回软件工程的分析框架里：

1. Agent 不是普通函数集合，而是由框架语义绑定起来的模型、prompt、工具、memory 和策略网络。
2. 如果没有 ADG 这样的统一 IR，Agent BOM 只能是 inventory，prompt-to-tool 检测也容易退化成 grep 或单点 fuzzing。
3. ADG 的三图结构把组件、控制、数据分开建模，又允许在查询时组合它们。
4. 大规模实验说明真实项目里确实存在这种结构性风险：5,399 个项目中 238 个含 P2T 风险路径，且高风险副作用集中在外发、文件、SQL、命令执行。
5. 论文的局限同样明确：静态过近似、sink 语义粗、动态 wrapper 漏报、框架覆盖有限、代码可复现入口不清。

对后续 Agent 安全研究来说，这篇论文最值得带走的不是某个具体数字，而是一个判断：

```text
要治理 Agent，必须先把“Agent 能看见什么、记住什么、传给谁、调用什么、被什么策略拦住”
还原成可查询的结构。
```

这也是 ADG 的价值：它让 Agent 从“自然语言 + 框架魔法”重新变成一个可以审计、比较、扩展和验证的软件工件。
