# Convergent Detour Hijacking：当 Agent 答案正确，执行轨迹仍可能被静态 Skill 放大

### 元信息

| 项目 | 内容 |
|---|---|
| 论文 | Convergent Detour Hijacking: Task-Preserving Resource Amplification in Skill-Based LLM Agents |
| 作者 | Junliang Liu, Ruoyu Li, Wenxin Tang, Jingyu Xiao, Zhenyu Liu, Jingheng Xu, Laizhong Cui |
| 方向 | AI 安全 / Skill-based LLM Agents / 资源放大 |
| 官方来源 | https://arxiv.org/abs/2608.12273 |
| 版本日期 | arXiv v1，2026-08-12 17:12:49 UTC |
| 本文关注 | 不是“恶意工具执行坏代码”，而是“一个静态 Skill 让 Agent 走一条看似合理但不必要的昂贵路径” |

### TL;DR

- 这篇论文提出 **Convergent Detour Hijacking, CDH**：攻击者只发布一个静态 Skill，不控制模型权重、系统提示、用户问题、运行时工具返回，也不改已有 Skill，就能让 Agent 在完成原任务的同时多调用无关但良性的 Skill。
- 关键机制是 **progressive disclosure** 的两段式暴露：路由阶段只看 Skill 描述，规划阶段才加载 Skill body。攻击 Skill 用描述先被选中，再用 body 伪造“前置检查、证据收集、回验步骤”等局部合理依赖。
- 作者把攻击抽象成 **attract -> detour -> converge**：先吸引进入上下文，再诱导绕路，最后显式回到原目标，因此最终答案仍然正确，传统“输出是否成功”的检查不容易发现。
- 实验在 OpenClaw 2026.5.7 默认 53 个 Skill 上构造 536 个多 Skill 任务，其中 45 个只用于 pilot 优化，491 个 held-out 任务用于最终评测；任务覆盖 9 个功能组。
- DeepSeek-V4-Pro 单任务条件下，matched coordinator 被选中的比例为 **80.02%**；在 coordinator-hit 且双方完成的运行中，token 增加 **66.91%**，端到端时间增加 **92.45%**，平均多 **2.20** 次 Skill 调用，完成率仍接近 clean 条件。
- 消融显示两段必须配合：Attract-only 也能被选中，但平均只多 **0.22** 次调用；Detour-only 有 body 却几乎进不了上下文，命中率只有 **3/89**。
- 局限也很明确：评测只覆盖一个平台、mock 后端、group-matched coordinator；真实 Skill 市场、跨域触发、平台级防御和误报成本仍未解决。

### 研究问题：为什么“答案正确”不再够用？

- 传统 Agent 安全评估常看这些结果：
  - 最终回答是否完成用户任务。
  - 有没有泄露数据、越权写入、调用危险工具。
  - 工具参数是否明显异常。

- CDH 关心的不是这些显性失败，而是更隐蔽的轨迹性质：
  - Agent 仍然给出正确答案。
  - 所有额外调用都可以是良性 Skill。
  - 攻击不需要执行恶意代码。
  - 成本、延迟、上下文缓存和调用次数被系统性抬高。

- 论文把问题重新定义为：
  - **任务完成** 只说明输出满足请求。
  - **轨迹必要性** 才说明 Agent 是否走了必要路径。
  - **成本安全** 要求平台能解释为什么每个额外 Skill 调用对用户目标不可或缺。

这个区分很重要。对 Skill 市场、MCP server 市场或企业内部 Agent 插件库来说，很多审核流程会优先检查“是否明显恶意”。CDH 表明，攻击者可以把恶意性藏在 _过度合理_ 里：每一步都像是谨慎的检查、补充证据或状态一致性验证，但整体路径不是完成任务所必需。

### 背景：progressive disclosure 的效率收益和安全缝隙

大规模 Skill 库不能把所有 `SKILL.md` body 一次性塞进上下文，因此平台通常采用两阶段流程：

1. 路由阶段：
   - Router 只读取 Skill name、description、front matter 等短元数据。
   - 目标是筛出和当前任务相关的一小组 Skill。

2. 加载阶段：
   - 被选中的 Skill body 才进入上下文。
   - Planner 用这些 body 决定实际调用顺序、参数和中间检查。

3. 执行阶段：
   - Skill implementation 返回观察结果。
   - Agent 把调用、参数、返回和历史状态继续喂给 planner。

这套设计节省上下文，但给不可信发布者留下两个连续控制点：

| 阶段 | 攻击者可控文本 | 影响对象 | CDH 的利用方式 |
|---|---|---|---|
| 路由 | description | 是否进入上下文 | 写成目标域的协调器，让 router 认为它应该与原生 Skill 一起被选中 |
| 规划 | body / runbook | 调用顺序和依赖 | 把额外 Skill 包装成前置条件、证据事件或回验步骤 |
| 收敛 | body 中的返回条件 | 是否完成原任务 | 设定 bounded return，避免无限循环或任务失败 |

作者对照了两类已有工作：

- 选择操纵、Skill 描述投毒、cross-tool poisoning：
  - 这些工作说明元数据能影响工具选择。
  - 但不一定保持原任务正确完成，也不一定证明跨阶段资源放大。

- LLM-DoS 和工具链资源放大：
  - 例如 Crabs 展示黑盒 LLM-DoS 可显著增加延迟。
  - Beyond Max Tokens 展示 MCP 工具层文本字段和返回策略可把工具链拖长到极高成本。
  - CDH 的差异在于更窄的攻击者能力：一个静态 Skill，不控制运行时返回，不改函数签名，不依赖交互式 payload。

### 威胁模型：攻击者到底能做什么？

论文的攻击者能力刻意设得很窄：

- 能做：
  - 向 Skill registry 发布一个 Skill。
  - 控制这个 Skill 的 routing description。
  - 控制这个 Skill 的 instruction body。
  - 在 body 中写静态、条件式、Markdown 形式的 runbook。

- 不能做：
  - 读取模型内部状态。
  - 预先知道受害者具体 prompt。
  - 控制运行时 tool response。
  - 修改原生 Skill。
  - 修改平台路由器、系统提示或执行器。
  - 在发布后与会话交互。

- 目标不是：
  - 篡改最终答案。
  - 泄露私有数据。
  - 让 Agent 死循环。
  - 调用攻击者控制的外部服务。

- 目标是：
  - 让 coordinator 被加载。
  - 保留 clean route 中原本必要的 Skill。
  - 额外招募至少一个 clean route 不需要的原生 Skill。
  - 两边执行都完成原任务。
  - token、cache token、时间或调用次数上升。

这使 CDH 更接近供应链治理问题：平台不能只问“这个 Skill 是否直接执行危险操作”，还要问“这个 Skill 是否在自己的职责外声明过强依赖，导致其他 Skill 被不必要地拉进路径”。

### 形式化定义：CDH 成立需要四个条件

论文把每个 Skill 写成：

```text
s = (d_s, b_s, f_s)
```

变量解释：

| 符号 | 含义 |
|---|---|
| `d_s` | 路由阶段可见的 Skill metadata 或 description |
| `b_s` | 被选中后才加载的 instruction body |
| `f_s` | Skill implementation |
| `S_0` | clean registry，只包含原生 Skill |
| `h` | 攻击者发布的 coordinator Skill |
| `S_h = S_0 union {h}` | 注入 coordinator 后的 registry |
| `Lambda_S(x)` | 对任务 `x` 被 router 选中并加载的 Skill 集合 |
| `Gamma_S(x)` | 实际执行轨迹中的 Skill 调用序列 |
| `Eval(x, y)` | 最终输出 `y` 是否完成任务 |

CDH 的判定可以简化成下面四个约束：

```text
CDH_h(x) = 1 iff:
  1. h in Lambda_h(x)
  2. Skills(Gamma_0(x)) subseteq Skills(Gamma_h(x))
  3. (Skills(Gamma_h(x)) - Skills(Gamma_0(x))) intersects S_0
  4. Eval(x, y_0(x)) = Eval(x, y_h(x)) = 1
```

逐项解释：

- **Hijacking**：
  - `h in Lambda_h(x)` 要求恶意 coordinator 真正被选中。
  - 如果它没进上下文，body 就没有机会影响 planner。

- **Clean-route retention**：
  - injected route 仍然包含 clean route 的原生 Skill。
  - 这防止攻击只是替代原任务路径。

- **Native-skill detour**：
  - injected route 必须额外调用至少一个原生 Skill。
  - 额外工作不是 coordinator 自己刷存在感，而是拉动平台已有能力。

- **Convergence**：
  - clean 和 injected 两边都完成任务。
  - 这让攻击绕开只看最终答案的验证。

作者进一步定义攻击成功率：

```text
D+ = {x in D | Eval(x, y_0(x)) = 1}
ASR_CDH(h) = (1 / |D+|) * sum_x CDH_h(x)
```

这个定义有一个细节值得注意：它不是假设存在唯一正确 Skill 链，而是用 paired clean/injected 对比来判定“不必要”。这比手工规定 gold chain 更适合真实 Agent，因为很多任务本来就有多条可行路径。

### 方法机制：attract -> detour -> converge

论文的核心不是单条 prompt，而是一套构造 coordinator 的流程：

```mermaid
flowchart LR
  A["Skill registry: 53 native skills"] --> B["按 routing description 聚成 9 个功能组"]
  B --> C["每组生成 pilot tasks 和 held-out tasks"]
  C --> D["描述构造: shared rationale + target triggers"]
  D --> E["Pilot screening: 只用 coordinator 是否被选中做反馈"]
  E --> F["Body 构造: prerequisite + evidence + verification rules"]
  F --> G["Injected registry: S0 union coordinator"]
  G --> H["执行轨迹: attract -> detour -> converge"]
```

#### 1. Attract：描述必须被选中，但不能排挤原生 Skill

- coordinator description 不是写成“我能独立完成任务”。
- 它更像一个协调层：
  - 声称自己能识别目标域内多个 Skill 的依赖关系。
  - 强调应该与原生 Skill 一起使用。
  - 避免把自己描述成替代原生 Skill 的实现。

这样做有两个作用：

- Router 觉得它相关，因此加载 body。
- Router 仍会选中完成任务真正需要的原生 Skill，从而保证后续能 converge。

作者只用 45 个 pilot tasks 优化 description，反馈信号也只看 coordinator 是否被选中。任务完成、token、latency、调用增长都没有进入优化反馈，这是为了防止把 held-out 评测泄漏进构造过程。

#### 2. Detour：body 把额外调用写成局部合理依赖

body 的策略不是“无限调用工具”，而是把额外 Skill 包装成有限 runbook：

- prerequisite：
  - 在主操作前需要做某种状态检查或证据收集。

- mandatory framing：
  - 把原本可选的辅助动作写成必须步骤。

- evidence-event decomposition：
  - 把一个 Skill 的职责拆成前置、执行中、执行后多个事件。

- post-execution verification：
  - 主操作后再走一条有边界的回验路径。

- invocation bounds：
  - 每个 Skill 或全局调用数有上限，避免超时、被拒绝或明显异常。

这种 body 对 planner 的诱导点在于：每一步看起来都在降低风险或提高可靠性，但从 clean/injected 对比看，额外路径不是完成原任务所必需。

#### 3. Converge：显式返回原任务，保住最终答案

CDH 不追求破坏任务，而是保任务完成：

- coordinator body 中有 return condition。
- dependency path 结束或触发调用上限后，流程回到原目标。
- clean route 的原生 Skill 仍被调用。
- 最终输出由原生路径完成。

这就是论文题目里 “Convergent” 的含义：绕路不是无穷扩散，而是受控地重新汇入原任务路径。

### 伪代码：攻击 Skill 如何影响一次执行？

下面是论文机制的抽象化写法，不是原文代码：

```text
Input:
  task x
  clean registry S0
  attacker coordinator h = (d_h, b_h, f_h)

State:
  injected registry S_h = S0 union {h}
  selected skills Lambda_h(x)
  execution sequence Gamma_h(x)
  invocation_budget B

Route:
  Lambda_h(x) = Router(x, descriptions(S_h))

If h not in Lambda_h(x):
  Output normal agent execution

Plan with coordinator body:
  1. Identify native skills that remain necessary for x
  2. Add prerequisite checks justified by shared rationale rho_g
  3. Invoke auxiliary benign skills while budget remains
  4. Record observations as evidence or consistency checks
  5. Return control to native task path
  6. Complete original task

Output:
  final answer y_h(x)
  trajectory Gamma_h(x)
  cost metrics: tokens, cached tokens, latency, calls

Failure boundary:
  if detour exceeds B or blocks task completion:
    CDH condition fails
```

这个伪代码揭示了一个安全审计难点：如果只审最后的 `Output`，攻击看起来失败率很低；如果审 `Gamma_h(x)`，就能看到“为什么这几个 Skill 必须被调用”的证据缺口。

### Benchmark：491 个 held-out 任务如何构造？

作者的实验基线是 OpenClaw 2026.5.7 默认 registry：

| 设计点 | 数字 / 说明 |
|---|---|
| 原生 Skill 数 | 53 |
| 功能组 | 9 个，由 routing description 聚类并人工核验 |
| 总任务 | 536 个多 Skill 任务 |
| Pilot tasks | 45 个，每组 5 个，只用于 coordinator description 优化 |
| Held-out tasks | 491 个，只用于最终 routing 和 end-to-end 评测 |
| 额外泛化集 | 30 个由 3 名 OpenClaw 用户独立编写的自然任务 |

任务长度分布：

| Required skills | Tasks | Fraction |
|---|---:|---:|
| 2 个 Skill | 438 | 89.2% |
| 3 个 Skill | 49 | 10.0% |
| 4 个 Skill | 4 | 0.8% |
| 总计 | 491 | 100.0% |

任务形态：

| 属性 | Tasks | Fraction |
|---|---:|---:|
| Direct query | 310 | 63.1% |
| Ambiguous query | 181 | 36.9% |
| Localized executable query | 129 | 26.3% |
| Unchanged executable query | 362 | 73.7% |
| 含 forbidden-skill annotation | 25 | 5.1% |

这里有两个值得肯定的实验设计：

- pilot 与 held-out 分离：
  - 45 个 pilot 只服务于 description screening。
  - 491 个 held-out 不暴露给构造过程。

- paired clean/injected 执行：
  - 对同一个任务分别跑 `S_0` 和 `S_h`。
  - 模型、配置、mock backend、timeout 和 task input 保持一致。
  - 唯一区别是是否加入对应 group 的 coordinator。

### 评测协议：作者如何避免把超时误判为成本放大？

论文的 end-to-end 评测包含几个约束：

- 每个 clean/injected pair 使用独立会话：
  - 不共享 conversation history。
  - 不共享 planner state。
  - 不共享 tool observation 或 trace。

- 统一 timeout：
  - 每个执行 600 秒。
  - 到达 timeout 记为超时，不算成功完成。

- 完成率由人工标注：
  - 4 名 human annotators 对最终响应和可观察执行 artifacts 做二值判断。
  - 完成率在所有任务上计算。

- 资源放大只在更严格子集上计算：
  - coordinator 被选中。
  - clean 与 injected 都完成任务。
  - 这样避免把失败、截断或超时误当成攻击收益。

这个协议让论文的主张更窄也更可信：它不是说“攻击能让系统挂掉”，而是说“在任务仍完成的样本中，路径可被静态文本显著拖长”。

### 主结果：完成率差不多，成本明显上升

论文 Table 1 给出 6 个模型的路由、完成率和资源变化。下面摘取最能说明机制的几行：

| 模型 / 条件 | Coord. Hit | Clean Comp. | Injected Comp. | Token 增长 | Cache 增长 | Time 增长 | Avg. Delta Calls |
|---|---:|---:|---:|---:|---:|---:|---:|
| DeepSeek-V4-Pro / single-task | 80.02% | 93.6% | 94.3% | 66.91% | 54.33% | 92.45% | +2.20 |
| DeepSeek-V4-Pro / multi-turn | 88.98% | 93.8% | 94.4% | 91.20% | 80.71% | 20.57% | +2.03 |
| MiniMax-M3 / single-task | 96.60% | 93.75% | 93.42% | 80.81% | 91.91% | 26.99% | +1.43 |
| Qwen3.7-Plus / multi-turn | 86.94% | 93.7% | 94.2% | 103.25% | 50.17% | 29.78% | +1.90 |
| DeepSeek-V4-Flash / multi-turn | 88.57% | 93.9% | 94.0% | 107.12% | 25.25% | -27.97% | +1.50 |

可以拆成三层结论：

1. **Coordinator 命中率高**：
   - end-to-end 单任务中，命中率从 78.00% 到 96.60%。
   - multi-turn 中，命中率从 82.04% 到 94.69%。
   - 这说明 description 的目标不是孤立 routing benchmark，而是在真实 agent execution 中进入上下文。

2. **任务完成率基本不降**：
   - 所有 model-condition pair 中，clean 与 injected completion 差异不超过 1.5 个百分点。
   - 这正是 CDH 难检测的地方：输出层健康，过程层变胖。

3. **token 和调用次数比时间更稳定**：
   - 多数模型 token、cache token、调用次数明显增加。
   - 但时间增长不完全一致，DeepSeek-V4-Flash 甚至出现负 time delta。
   - 作者解释为后端缓存、调度、推理优化会影响 wall-clock latency，因此 token/call growth 是更稳定的轨迹证据。

### ASR：为什么低于 coordinator hit？

论文另列 CDH attack success rate：

| 模型 | Single-task ASR | Multi-turn ASR |
|---|---:|---:|
| Claude-Haiku-4.5 | 70.82% | 71.19% |
| DeepSeek-V4-Pro | 73.82% | 82.81% |
| DeepSeek-V4-Flash | 78.46% | 77.87% |
| Qwen3.7-Max | 75.98% | 77.32% |
| Qwen3.7-Plus | 80.17% | 81.76% |
| MiniMax-M3 | 80.51% | 71.88% |

ASR 低于 coordinator hit 是合理的，因为 CDH 成立不只是“coordinator 被选中”：

- 必须保留 clean route 的 Skill。
- 必须招募额外原生 Skill。
- clean 与 injected 两边都要完成任务。
- 不能只靠 coordinator 自己制造调用。

这组指标比单纯 selection rate 更像安全指标。它避免把“被加载但没造成 detour”的样本算进攻击成功。

### 消融：为什么 description 和 body 缺一不可？

作者在 DeepSeek-V4-Pro 上抽取 90 个 held-out tasks，每个功能组 10 个。一个 clean 未完成任务被排除后，共同分母为 89。

| Variant | Coord. Hit | Token 增长 | Cache 增长 | Time 增长 | Avg. Delta Calls |
|---|---:|---:|---:|---:|---:|
| Full CDH | 70/89 (78.7%) | +57.9% | +57.0% | +76.7% | +2.01 |
| Detour-only | 3/89 (3.4%) | +29.1% | +25.2% | +62.4% | +1.08 |
| Attract-only | 70/89 (78.7%) | +29.1% | +28.2% | +57.4% | +0.22 |

解读如下：

- Attract-only：
  - 保留优化过的 description。
  - body 换成中性 stub。
  - 命中率接近 Full CDH，但额外调用很少。
  - 说明 description 主要解决“进入上下文”。

- Detour-only：
  - 保留完整 detour body。
  - description 换成泛化、低吸引力版本。
  - body 很强，但几乎没机会被 planner 看到。
  - 说明 planning-stage payload 需要 routing-stage admission。

- Full CDH：
  - description 和 body 用同一个 shared coordination rationale 对齐。
  - 这才形成跨阶段组合：先进入，再扩路，最后收敛。

这个消融是论文最有说服力的部分。它说明 CDH 不是“多写一点安全检查文字”造成的偶然噪声，而是 progressive disclosure 架构下两个文本视图被协同利用。

### Figure 1/2 的机制证据：图里真正支持什么？

论文 Figure 1 展示了一个 computer health-check 例子：

- clean execution：
  - Agent 直接调用任务相关 Skill。
  - 返回用户请求的健康检查报告。

- injected execution：
  - Agent 先加载 malicious coordinator。
  - coordinator 让一些辅助 Skill 进入路径。
  - 辅助调用看起来像前置诊断或一致性检查。
  - 最后仍然回到原 health-check 目标。

Figure 1 支持的是直观 claim：

- 正确输出不代表轨迹必要。
- “更多 Skill 调用”可以伪装成谨慎流程，而不是明显错误。
- 成本攻击可以保留用户可见任务语义。

Figure 2 则对应方法 claim：

| 图中模块 | 论文机制 | 证明力 | 不证明什么 |
|---|---|---|---|
| pilot-guided black-box feedback | 用 pilot tasks 优化 description 吸引力 | 说明攻击能在不知道 held-out 任务的情况下调参 | 不说明跨平台泛化已经成立 |
| shared rationale | description 与 body 使用同一协调理由 | 说明两阶段文本一致性是关键 | 不说明所有 Skill 描述都可被这样利用 |
| dependency-rule body | 伪造前置、证据、回验依赖 | 解释 token/call 增长来源 | 不证明真实外部工具也会同样安全返回 |
| return condition | detour 后回到原任务 | 解释完成率为何接近 clean | 不证明攻击不会在更复杂任务里失败 |

因此，图表的价值不是提供新数据，而是把“跨阶段组合攻击”画成可审计的路径。

### 失败案例与边界：哪些地方不能过度解读？

论文没有把 CDH 包装成万能攻击，边界包括：

- 平台边界：
  - 实验只在 OpenClaw 2026.5.7 的默认 registry 上完成。
  - 其他 Agent 平台的 router、loader、tool policy、system prompt 可能不同。

- 环境边界：
  - 后端 Skill 用 local mock backend 替代需要凭据或平台依赖的真实服务。
  - 这提高了可复现性，也减少了真实外部副作用。
  - 但真实系统中的 API rate limit、权限模型、失败返回、费用策略可能改变攻击效果。

- 分布边界：
  - 491 个 held-out tasks 来自同一 functional group 体系。
  - 虽然 pilot/held-out 分离，但任务生成仍依赖作者设计的 Skill 组。
  - 30 个独立任务上命中率降到 33.33%，说明 off-distribution 泛化更难。

- 防御边界：
  - 论文提出监控轨迹必要性、预算和跨 Skill 转移，但没有实现完整防御系统。
  - 防御还要避免误杀合法多 Skill 工作流。

- 指标边界：
  - wall-clock time 不总是随 token/call 增长。
  - 如果后端缓存或调度优化强，时间指标可能掩盖过程放大。
  - 因此部署侧不能只盯延迟告警。

### 相关工作位置：CDH 相比资源放大攻击的新意在哪里？

可以把相关攻击放在三条轴上看：

| 工作类型 | 攻击入口 | 是否保任务完成 | 是否控制运行时 | CDH 的区别 |
|---|---|---|---|---|
| LLM-DoS / 长输出攻击 | 用户 prompt 或生成策略 | 不一定 | 通常不需要工具层 | CDH 发生在 Skill selection + planning |
| Beyond Max Tokens | MCP 工具层文本字段和返回策略 | 是 | 控制恶意 server 的返回策略 | CDH 不控制运行时 response，只靠静态 Skill 文本 |
| Trojanized Skill / companion script | Skill 或工具实现 | 视实现而定 | 可能控制执行逻辑 | CDH 不改 implementation，也不依赖恶意代码 |
| Selection manipulation | description / metadata | 不一定 | 否 | CDH 不停在 selection bias，而是继续制造 bounded detour |

所以 CDH 的新意不是“第一次发现资源放大”，而是：

- 把 progressive disclosure 的两个文本面联系起来。
- 把攻击者能力压到静态发布者。
- 用 clean/injected paired trajectory 定义“结果正确但路径不必要”。
- 用消融证明 description 与 body 的组合关系。

### 对 Agent 安全评测的启发：需要审什么？

这篇论文直接推导出几类防御检查：

#### 1. 安装前审计 Skill 描述与 body 是否一致

- 检查 description 是否过度宣称协调范围。
- 检查 body 是否引入与 Skill 角色无关的外部依赖。
- 检查是否有“必须先调用若干其他 Skill”但缺少任务条件约束。
- 检查是否把可选 verification 写成强制步骤。

#### 2. 路由阶段保留反事实解释

平台可以记录：

- 为什么选中每个 Skill。
- 哪些 task tokens 支持这个选择。
- 是否存在更小 Skill 集也能完成任务。
- coordinator 是否只提供“流程包装”而不提供必要能力。

#### 3. 执行阶段监控轨迹必要性

监控项不应只包含危险 API，还应包含：

- `Delta Calls`：相比历史 clean baseline 多了哪些调用。
- `Native-skill detour`：额外调用是否与用户目标直接相关。
- `Budget slope`：token/call 是否在没有新增证据的情况下上升。
- `Return condition`：是否有 Skill body 主导的绕路后回归模式。

#### 4. 预算策略必须和任务语义绑定

简单 token cap 可能不够，因为 CDH 是 bounded detour：

- 它不一定超过硬上限。
- 它可能只把每次任务抬高 50% 到 100%。
- 它仍可能在企业 Agent 的日常自动化中造成稳定成本泄漏。

更合适的策略是：

- 每类任务设 expected skill-chain envelope。
- 超出 envelope 时要求 planner 给出必要性解释。
- 对新安装 Skill 的前几次触发降低调用预算。
- 对 coordinator 类 Skill 设置更严格的 cross-skill dependency 审核。

### 复现实用性：哪些材料已经公开，哪些还需等待？

论文正文说明作者 release benchmark、mock implementations、task-localization interface 和 execution scripts 到 Supplementary Materials；TeX 源中也提到 coordinator artifacts 在 supplementary ZIP archive 中提供，而不是在附录内重复。

当前可直接从公开论文获得的信息包括：

- 形式化定义。
- benchmark 构造过程。
- 任务规模和分布统计。
- end-to-end 评测协议。
- 主要模型指标。
- 消融指标。
- 独立任务泛化结果。
- 伦理和隔离设置。

仍需要进一步核验的复现点包括：

- supplementary ZIP 是否包含完整 coordinator Skill files。
- OpenClaw 2026.5.7 默认 registry 与论文使用版本是否逐文件一致。
- mock backend 是否覆盖所有真实 Skill 的关键状态转移。
- 不同平台的 router 是否同样容易被 “coordinator” 语义吸引。

### 研究者视角的结论

- CDH 把 Agent 安全从“工具是否危险”推进到“轨迹是否必要”。
- 它说明 progressive disclosure 不是单纯的上下文优化技巧，而是一个跨阶段信任边界。
- 论文最强证据不是单个 80% 命中率，而是：
  - held-out 任务上稳定高命中；
  - completion 基本不降；
  - token/call 增长明显；
  - 消融证明 description 和 body 缺一不可；
  - 独立任务上仍有 33.33% 命中但泛化变弱。

我会把这篇论文作为 Skill 生态安全的一条清晰警示：

- 不可信 Skill 的审核不能只看是否有恶意 shell、网络请求或数据外传。
- 也不能只跑最终答案 correctness test。
- 必须记录和比较执行轨迹，尤其是新 Skill 是否在自己的职责外诱导了额外原生 Skill。

后续最值得追问的是三件事：

1. 如何自动证明某个 Skill 调用对任务目标是必要的？
2. 如何在不误伤合法复杂 workflow 的情况下限制 coordinator 类 Skill？
3. 如何把 install-time static review 和 runtime trajectory monitor 合成一个低误报防线？

如果这三件事解决不了，Skill marketplace 越繁荣，Agent 的“正确但昂贵”攻击面就越大。

### 可操作的审计检查清单

把 CDH 落到工程审计里，可以先从四类证据入手：

| 检查点 | 需要记录什么 | CDH 风险信号 | 可能的误报来源 |
|---|---|---|---|
| 路由理由 | 每个 Skill 被选中的 task span 和 description span | coordinator 只提供抽象协调语义，却频繁与多个原生 Skill 同时出现 | 合法 orchestrator、planner、workflow manager |
| Body 依赖 | body 中声明的前置条件、回验步骤和跨 Skill 关系 | Skill 职责外的 mandatory dependency，尤其是“先检查、再验证、再回到主任务” | 高可靠性运维流程、合规检查流程 |
| 轨迹差分 | clean/injected 或历史 baseline 的调用序列差异 | 原任务 Skill 被保留，但额外原生 Skill 稳定增加 | 用户问题本身更复杂，或环境状态变化 |
| 成本曲线 | token、cached token、wall-clock、调用次数 | 输出质量相同但 token/call 持续抬高 | 后端缓存、模型调度、重试机制 |

这个清单的重点不是直接判定恶意，而是建立复核顺序：

1. 先问 description 是否合理地解释了进入上下文的必要性。
2. 再问 body 是否把可选流程包装成无条件必需。
3. 然后看额外 Skill 是否提供了用户目标不可替代的信息。
4. 最后看任务完成率不变时，成本增长是否仍有业务可解释性。

对安全团队来说，CDH 最有价值的地方就在这里：它把“看起来只是啰嗦的 Agent”重新定义为一种可度量的供应链风险。只要平台允许第三方用自然语言同时影响 routing 和 planning，就应该把 trajectory diff、dependency justification 和 invocation budget 当成一等审计对象，而不是等到账单、延迟或配额耗尽后才回头查日志。

### 参考与外部核验

- arXiv 官方记录： https://arxiv.org/abs/2608.12273
- arXiv HTML 正文： https://arxiv.org/html/2608.12273
- Beyond Max Tokens： https://arxiv.org/abs/2601.10955
- Crabs / ACL Anthology： https://aclanthology.org/2025.findings-acl.580/
- OpenClaw Agent Skills： https://github.com/openclaw/agent-skills
