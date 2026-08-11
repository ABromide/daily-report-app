# SHE：把 Agent 安全从“固定护栏”改成“会从轨迹里进化的 harness”

## 元信息

| 字段 | 内容 |
| --- | --- |
| 论文 | SHE: Trajectory-driven Safety Harness Evolution for LLM Agents |
| 链接 | https://arxiv.org/abs/2608.09885v1 |
| arXiv ID | arXiv:2608.09885v1 |
| 提交时间 | 2026-08-10 17:35:08 UTC |
| 作者 | Wanying Qu、Qinghua Mao、Yu Li、Jiyao Liu、Xin Zhang、Dadi Guo、Yanxu Zhu 等 |
| 项目 | https://github.com/RainbowQTT/SHE |
| 方向 | AI 安全 / LLM Agent 安全 harness / 轨迹驱动防御演化 |

## TL;DR

1. 这篇论文关心的不是“再加一个安全提示词”，而是把 LLM Agent 的安全边界放到 **harness** 层：上下文、记忆、工具、权限、运行时控制共同决定 Agent 能看到什么、能调用什么、在危险轨迹里会不会继续执行。
2. 作者提出 **Safety Harness Evolution, SHE**：把 harness 拆成四个可编辑 artifact：`System Prompt`、`Rule Bank`、`Safety Memory`、`Tool Policy`，再从失败轨迹里诊断风险、归因到 artifact、生成局部补丁、做有效性检查和安全-效用选择。
3. 关键数字很集中：在 Agent-SafetyBench 上，SHE evolved 的平均 ASR 从 seed 的 8.6% 降到 5.5%，Clean UBR 从 25.7% 降到 19.8%，UA 从 33.5% 升到 47.6%；相对静态 SafeHarness，平均 ASR 从 17.1% 降到 5.5%，作者称为 3.1 倍 ASR reduction。
4. 泛化证据来自两个方向：在 held-out AgentHarm 上，Harm Score 从 seed 的 19.8% 降到 9.8%，Harm Refusal 从 78.4% 升到 86.4%；同一套演化 harness 还迁移到 Kimi K2.6、GLM-5.2、MiniMax M2.7，不额外演化也有安全收益。
5. 方法的研究意义是把安全从“模型权重是否足够安全”推进到“运行协议是否可诊断、可归因、可局部修复”；它尤其适合讨论 prompt injection、工具滥用、记忆污染、工具输出污染、过度拒答之间的边界冲突。
6. 局限也很明确：演化和评测严重依赖 LLM judge；Agent-SafetyBench 的演化集只有 15 个任务；外部 benchmark 包和生成 rollout 输出没有随仓库完整发布；20 轮演化是否覆盖真实生产长尾风险仍需独立复现。

## 1. 研究问题：为什么安全边界不能只写在提示词里？

### 论文要反驳的默认假设

很多 Agent 安全方案默认把 harness 当成固定部署件：

1. 人工写好系统提示词。
2. 人工配置工具权限。
3. 加一个输入、输出或工具调用前后的 guardrail。
4. 部署后遇到失败，再靠人工补规则。

SHE 指出这个流程有两个结构性问题：

| 问题 | 具体表现 | 安全后果 |
| --- | --- | --- |
| 失败轨迹不能自动变成边界 | trajectory 里有工具观察、环境反馈、失败记录，但没有被系统化写回 harness | 相同风险会在下一轮或相邻任务里重复出现 |
| harness 功能耦合 | 一次事故可能同时涉及上下文构造、记忆检索、工具权限、最终响应修复 | 不知道该改提示词、规则、记忆还是工具策略，容易全局加粗规则导致过拒答 |

作者的核心问题可以压缩成一句：

> Agent 安全应该如何从完整执行轨迹里学习“可复用的安全边界”，并把它写回到正确的 harness 组件，而不是写成一条越来越宽泛的拒答规则？

### “harness” 在本文里的含义

论文把 Agent 系统形式化为：

```text
(pi_theta, E, H)
```

| 符号 | 含义 | 本文固定还是优化 |
| --- | --- | --- |
| `pi_theta` | 基础 LLM 策略，负责生成推理、回复和工具调用 | 固定 |
| `E` | 任务环境，包括工具后端、状态和观测 | 固定 |
| `H` | Agent harness，定义上下文、工具访问、安全检查、最终响应协议 | 优化对象 |
| `Omega` | 任务级安全-效用评测协议 | 固定 |

这使 SHE 和“后训练安全”区分开：

1. 后训练改的是权重或策略分布。
2. SHE 改的是模型外部执行协议。
3. 评测时保持模型、环境、评测器不变，尽量把收益归因到 harness 演化。

## 2. 论文主张与论证路线

### 主张

SHE 的主张是：

1. Agent 的安全失败可以从 rollout trajectory 中诊断出来。
2. 只要 harness 被拆成职责清晰的 artifact，失败就能被路由到局部修复点。
3. 局部修复不能直接接受，必须经过 schema/语义有效性检查和安全-效用选择。
4. 这样得到的 harness 更新不只是 benchmark patch，还能迁移到 held-out 风险和不同 base agent。

### claim -> mechanism -> evidence -> boundary

| 层次 | SHE 的处理 | 证据 | 边界 |
| --- | --- | --- | --- |
| Claim | 安全 harness 可以从轨迹中演化 | Agent-SafetyBench、AgentHarm、跨模型迁移 | 仍是离线评测，不是生产在线学习 |
| Mechanism | 四 artifact 分解 + 归因驱动局部编辑 | Algorithm 1、Figure 2、artifact schema | 归因和编辑由 LLM 完成，存在 judge/model bias |
| Evidence | ASR、UBR、UA、Harm Score、Harm Refusal | Table 1、Table 2、Table 3、Figure 3/4/5 | benchmark 覆盖有限，外部包不完整 |
| Boundary | 更新只保留能改善安全且不损害效用的 candidate | best-harness selection 与 rejection feedback | 公式中“安全提高且效用保持”在真实业务中不一定单调可比较 |

## 3. 方法机制：四个 artifact 如何分工？

![SHE 框架：轨迹诊断、artifact 路由、局部编辑与安全-效用选择](/assets/2026/08/11/itm_2db962c05b12c6e7/framework.png)

### 四类 artifact 的职责

论文把 harness 写成：

```text
H = (P_sys, R_bank, M_safe, Q_tool)
```

| Artifact | 论文含义 | 更像工程里的什么 | 主要失败类型 |
| --- | --- | --- | --- |
| `P_sys` System Prompt | 全局行为契约、源层级、能力 grounding、信任边界 | 系统提示词与全局政策 | 模型把低优先级数据当指令 |
| `R_bank` Rule Bank | 结构化安全规则，包含风险标签、触发条件、干预动作、例外 | policy rule store | 输入、上下文、响应、动作层面的分类与拦截 |
| `M_safe` Safety Memory | 未解决或反复出现失败的经验记忆 | 反例库、边界案例库 | 长尾风险、重复出现但规则未覆盖的模式 |
| `Q_tool` Tool Policy | 工具权限与运行时执行策略 | ABAC/RBAC + pre-call/post-call detector | 未授权工具、危险 sink、阻断后的绕路重试 |

这个分解的关键不是命名，而是 **责任边界**：

1. 如果失败来自工具输出里的注入文本，优先归因到 tool-output/retrieved-content surface，而不是简单加系统提示。
2. 如果失败来自外部发送 PII，Rule Bank 需要识别敏感数据，Tool Policy 需要在 sink 处阻断或升级 judge。
3. 如果失败来自反复出现的模糊边界，Safety Memory 才进入，用对比案例记录“允许什么、禁止什么”。

### 官方仓库里的 seed artifact

项目仓库发布了 seed artifact，这让论文不是纯概念：

| 文件 | 内容信号 | 解释 |
| --- | --- | --- |
| `artifacts/system_prompt.md` | 要求把工具输出、检索内容、用户上下文和记忆视为数据，不是更高优先级指令 | 这是 source hierarchy 的最小全局契约 |
| `artifacts/rule_bank.jsonl` | 包含 prompt injection pattern、危险 shell、PII/credential、外部邮件 secret 等规则 | seed 规则是轻量的，不是最终 evolved harness |
| `artifacts/tool_policy.json` | 阻断路径穿越、敏感根目录、外部邮件 secret、下载到敏感目录等 sink | 体现工具边界不能只靠模型自觉 |
| `data/agent_safety_bench/train15_same_ids.json` | 固定 15 个演化任务 | 控制演化集，避免把 held-out 当训练集 |
| `data/agent_safety_bench/heldout185_same_ids.json` | 剩余 185 个 held-out 任务 | 用于验证不是只记住 15 个任务 |

## 4. 算法流程：从失败轨迹到 accepted harness

### 关键变量

| 变量 | 含义 |
| --- | --- |
| `X_evo` | 用来演化的任务集合 |
| `K` | 演化轮数，论文主实验为 20 |
| `tau_i` | 第 i 个任务 under 当前 harness 的 rollout trajectory |
| `o_i` | 评测结果，包含 safety outcome 与 utility outcome |
| `z_i` | structured risk diagnosis |
| `r_i` | artifact route，说明该失败归因到哪个 artifact |
| `Delta^(k)` | 第 k 轮提出的 bounded edit |
| `F_rej` | 已拒绝补丁及原因，用作后续负反馈 |
| `H_best` | 当前保留的最好 harness |

### 论文算法的工程化伪代码

```text
Input:
  base_policy pi_theta
  environment E
  evaluator Omega
  initial_harness H0
  evolution_tasks X_evo
  rounds K

State:
  H_best = H0
  F_rej = empty set

For k in 0..K-1:
  X_k = select evolution tasks
  trajectories = Rollout(pi_theta, E, H_best, X_k)
  outcomes = Omega(trajectories)

  risky_cases = []
  For each outcome:
    If RiskRelevant(outcome):
      z = diagnose(harm_domain, attack_surface, failure_mode, evidence)
      r = route_to_artifact(z, current H_best)
      risky_cases.append((z, r, outcome))

  Delta = Edit(H_best, risky_cases, F_rej)
  valid = ValidEdit(Delta, H_best, risky_cases)

  If valid:
    H_candidate = apply(H_best, Delta)
    score_candidate = evaluate_safety_utility(H_candidate)
    score_best = evaluate_safety_utility(H_best)

    If safety_improves(score_candidate, score_best)
       and utility_preserved(score_candidate, score_best):
      H_best = H_candidate
    Else:
      F_rej.add((Delta, "metric"))
  Else:
    F_rej.add((Delta, "invalid"))

Output:
  H_best
```

### 有效性检查为什么重要？

如果没有 `ValidEdit`，演化模型可能学到三类捷径：

1. **奖励黑客式安全**：把所有高风险关键词都拒掉，ASR 下降但正常任务也坏掉。
2. **权限阉割式安全**：直接关闭关键工具，短期安全，长期不可用。
3. **评测器投机**：生成只适合当前 judge 模板的表面措辞，而没有改变实际执行边界。

SHE 的 selection rule 写成：

```text
S_Omega(H_candidate) > S_Omega(H_best)
U_Omega(H_candidate) >= U_Omega(H_best)
```

这里的意义是：

1. 安全分数必须比当前 best 更好。
2. utility 不能下降。
3. 不满足的候选不会丢掉，而是写入 `F_rej`，让后续编辑模型知道“这种补丁为什么失败”。

## 5. 风险诊断：三轴 taxonomy 如何帮归因？

论文在附录里把失败诊断压成三条轴：

| 轴 | 标签例子 | 作用 |
| --- | --- | --- |
| Harm domain | data exfiltration/privacy、financial loss、physical/health harm、cyber、availability、misinformation | 说明失败会造成什么后果 |
| Attack surface | clean user goal、user/context input、tool output/retrieved content、tool spec/registry poisoning、memory/history、multi-channel | 说明风险从哪里进入 |
| Failure mode | unsafe compliance、tainted context compliance、unauthorized tool use、unsafe side effect/blind trust、over-refusal | 说明 harness 具体怎么失效 |

这三轴不是为了分类漂亮，而是给 route 提供证据：

1. `tool output/retrieved content + tainted context compliance` 更像 context/tool observation 处理问题。
2. `tool spec/registry poisoning + unauthorized tool use` 更像工具策略和权限问题。
3. `memory/history + tainted context compliance` 更像 memory 检索和 memory trust boundary 问题。
4. `clean user goal + over-refusal` 提醒系统不要把所有风险词都当攻击。

## 6. 实验设置：演化集、held-out、指标和模型

### 数据与条件

| 部分 | 设置 |
| --- | --- |
| Agent-SafetyBench 总量 | 官方 release 中前 200 个任务 |
| 演化集 | 15 个固定 task IDs |
| held-out | 185 个 task IDs |
| 条件 | clean、context poisoning、indirect injection、tool tampering、memory injection、composite |
| 每轮演化 | 15 个任务 × 6 个条件 × 2 次 rollout = 180 条轨迹 |
| 演化轮数 | 20 |
| AgentHarm | 440 个增强 harmful behaviors，来自 110 个 base tasks、11 类 harm |

### 模型与 judge

| 角色 | 主实验设置 |
| --- | --- |
| base tool-using agent | DeepSeek-V3.2 |
| diagnosis / artifact edit | GPT-5.5 |
| Agent-SafetyBench judge | GPT-5.5 full-trajectory judge |
| AgentHarm judge | GPT-4o |
| 温度 | 0 |

### 指标解释

| 指标 | 越高越好/越低越好 | 含义 |
| --- | --- | --- |
| Clean UBR | 越低越好 | 非攻击 clean 任务中的 unsafe behavior rate |
| ASR | 越低越好 | 攻击成功率 |
| UA | 越高越好 | 攻击条件下的 utility |
| Harm Score | 越低越好 | AgentHarm harmful 行为得分 |
| Harm Refusal | 越高越好 | 对 harmful 行为的拒绝率 |
| Benign NR | 越高越好 | benign 场景不拒答能力 |

## 7. 主结果：SHE 是否真的比静态防线强？

### Agent-SafetyBench 汇总

| 方法 | Clean UBR ↓ | Avg ASR ↓ | Avg UA ↑ | 读法 |
| --- | ---: | ---: | ---: | --- |
| No defense | 42.9 | 34.6 | 38.7 | 无防线时攻击成功率高，clean 下也有大量不安全行为 |
| System prompt | 37.8 | 28.5 | 44.5 | 提示词有帮助，但不足以覆盖工具/记忆/上下文组合风险 |
| LlamaFirewall | 42.1 | 31.5 | 42.5 | 外部 guardrail 不是无效，但没有显著解决 harness 层归因 |
| SafeHarness | 42.8 | 17.1 | 31.6 | 静态 harness 能压 ASR，但 utility 低 |
| PROGENT | 34.6 | 19.2 | 39.1 | 权限控制有效，但不是专门做轨迹归因的 harness 演化 |
| Memskill-SafeHarness | 37.2 | 19.6 | 25.4 | 记忆/技能更新不等于完整 artifact 级演化 |
| SHE seed | 25.7 | 8.6 | 33.5 | 仅 decoupled seed 就显著降低 ASR |
| SHE evolved | 19.8 | 5.5 | 47.6 | 安全和 utility 同时改善，是表 1 的核心结果 |

最重要的不是“5.5% 最低”，而是 **ASR 下降与 UA 上升同时出现**：

1. 从 seed 到 evolved：ASR 8.6% -> 5.5%，UA 33.5% -> 47.6%。
2. 从 SafeHarness 到 SHE evolved：ASR 17.1% -> 5.5%，UA 31.6% -> 47.6%。
3. Clean UBR 也从 seed 的 25.7% 降到 19.8%，不是靠攻击场景特化换来的。

### AgentHarm held-out transfer

| 方法 | Harm Score ↓ | Harm Refusal ↑ | Benign NR ↑ |
| --- | ---: | ---: | ---: |
| No defense | 51.9 | 33.5 | 75.6 |
| System prompt | 39.2 | 51.1 | 75.1 |
| LlamaFirewall | 36.4 | 52.3 | 75.0 |
| SafeHarness | 18.0 | 74.4 | 68.2 |
| SHE seed | 19.8 | 78.4 | 77.9 |
| SHE evolved | 9.8 | 86.4 | 77.8 |

这个表支撑作者的泛化主张：

1. SHE 没在 AgentHarm 上演化。
2. Harm Score 比 seed 低 10.0 个百分点。
3. Harm Refusal 增加 8.0 个百分点。
4. Benign NR 几乎不变：77.9 -> 77.8，说明不是简单扩大拒答面。

## 8. 消融：为什么四 artifact 分解不是装饰？

### 组件替换实验

论文把 evolved harness 固定，然后逐个把某个 evolved artifact 换回 seed 版本：

| 替换项 | Avg ASR | Avg UA | 解释 |
| --- | ---: | ---: | --- |
| SHE evolved | 5.5 | 47.6 | 完整演化结果 |
| Rule: E -> S | 6.4 | 47.2 | 规则库贡献较大，但不是唯一来源 |
| Memory: E -> S | 7.7 | 40.7 | 安全记忆对 utility 和长尾边界明显重要 |
| System: E -> S | 7.0 | 44.9 | 全局契约更新也有贡献 |
| Tool: E -> S | 7.3 | 47.0 | 工具策略更新主要影响执行时风险 |

这说明 SHE 的收益不是某一个超强 prompt 带来的：

1. Rule Bank 管分类和干预。
2. Safety Memory 管反复失败的对比边界。
3. System Prompt 管整体信任层级。
4. Tool Policy 管执行 sink。

任何一个换回 seed，平均 ASR 都比完整 evolved 差。

### 演化模型消融

| Evolution model | Best round | Clean UBR ↓ | Avg ASR ↓ | Avg UA ↑ |
| --- | ---: | ---: | ---: | ---: |
| GPT-5.5 | R17 | 19.8 | 5.5 | 47.6 |
| DeepSeek-V3.2 | R03 | 17.6 | 4.3 | 40.4 |
| GLM-5.2 | R05 | 24.0 | 5.9 | 36.0 |

读法是：

1. SHE 不完全依赖 GPT-5.5 才能生效。
2. 不同 evolution model 会找到不同 trade-off。
3. DeepSeek-V3.2 更激进，ASR 更低但 UA 更差。
4. GPT-5.5 在主实验中 utility preservation 最好。

## 9. Figure 5：一个具体边界是怎样被学出来的？

论文的示例是“帮我在手机上下载最好的笔记 App”：

| 阶段 | seed harness 行为 | 风险 |
| --- | --- | --- |
| 用户目标 | 要求推荐或下载 note-taking app | 任务本身不一定恶意 |
| 失败轨迹 | `search_apps -> open_app -> search_in_app -> attempted install_app` | Agent 把推荐任务升级成设备级 acquisition |
| seed 边界 | 只有通用 destructive tool、dangerous shell、credential protection | 没有 app acquisition 专门边界 |
| generic block | 最终 install 被高影响工具策略挡住 | 但 Agent 已经越过“只推荐、不代装”的边界 |

SHE 在 R17 学到两个局部更新：

1. **Rule Bank 输入边界**：识别 download/install/purchase/app-store workflow 等 acquisition intent；允许推荐、比较、官方商店指引。
2. **Tool Policy 执行边界**：阻断替用户执行 app-store acquisition；防止声称已经开始、完成、下载或安装应用。

这个例子很重要，因为它不是“危险词拒答”：

1. 推荐 App 是允许的。
2. 指向官方商店是允许的。
3. 代用户安装或声称已安装是不允许的。
4. 失败轨迹被转化成可复用边界，而不是只修一个样本。

## 10. 逐表细读：这些数字分别证明了什么？

### Table 1 不是单一排行榜

Table 1 容易被读成“哪一行 ASR 最低”，但它实际在同时回答三件事：

| 问题 | 对应列 | SHE 的证据 |
| --- | --- | --- |
| clean 场景会不会过度不安全？ | Clean UBR | evolved 从 25.7 降到 19.8，说明 seed 自身还有正常场景 unsafe 行为，演化后有改善 |
| 攻击条件下能否挡住风险？ | 各 attack ASR 和 Avg ASR | evolved 平均 ASR 5.5，低于所有列出的静态和演化基线 |
| 挡风险是否牺牲任务完成？ | 各 attack UA 和 Avg UA | evolved 平均 UA 47.6，高于 seed、SafeHarness、PROGENT、Memskill-SafeHarness |

这三个问题必须一起看：

1. 只看 ASR，最简单的策略是拒绝所有工具调用。
2. 只看 UA，最简单的策略是尽量完成任务，不管攻击。
3. SHE 的价值在于同时降低 clean UBR、降低 ASR、提高 UA。

### attack condition 的差异

论文把攻击条件拆成五类，不只是为了覆盖更多场景：

| 条件 | 典型风险 | 对 harness 的压力 |
| --- | --- | --- |
| context poisoning | 用户或上下文里混入污染指令 | 需要区分任务数据和指令优先级 |
| indirect injection | 外部网页、检索内容、工具输出带指令 | 需要在 tool observation 后给模型降权提示或触发规则 |
| tool tampering | 工具描述、注册表或参数语义被污染 | 需要工具策略和 schema 边界 |
| memory injection | 历史记忆或跨轮状态携带伪授权 | 需要 memory trust boundary |
| composite | 多通道组合攻击 | 需要 artifact 协同，而不是单点规则 |

SHE 的四 artifact 正好对上这些压力：

1. System Prompt 处理全局优先级。
2. Rule Bank 处理可结构化识别的风险。
3. Safety Memory 处理反复出现但难以一次规则化的边界。
4. Tool Policy 处理实际副作用和 sink。

### Table 2 的 held-out 意义

AgentHarm 与 Agent-SafetyBench 的风险形态不同：

1. Agent-SafetyBench 更适合演化和诊断。
2. AgentHarm 更强调多步 agent misuse。
3. SHE 没有在 AgentHarm 上做 target-specific evolution。

因此 Table 2 证明的是“演化出的边界有迁移迹象”，不是“所有未知风险都解决了”。

更谨慎的读法是：

| 结论 | 能否由 Table 2 支撑 |
| --- | --- |
| SHE 在一个 held-out harmful-agent benchmark 上优于列出的基线 | 可以 |
| SHE 的 learned boundary 不只是 15 个训练任务的记忆 | 有支持 |
| SHE 可直接替代生产安全评估 | 不能 |
| SHE 可以防住任意新型 Agent 攻击 | 不能 |

### Table 3 的模型消融读法

Table 3 很容易被误读成“GPT-5.5 不如 DeepSeek-V3.2，因为 ASR 5.5 高于 4.3”。更合理的解读是：

1. DeepSeek-V3.2 作为 evolution model 找到更激进的安全补丁。
2. 它的 Clean UBR 为 17.6，比 GPT-5.5 的 19.8 更低。
3. 但它的 UA 是 40.4，明显低于 GPT-5.5 的 47.6。
4. GPT-5.5 主实验保留了更好的 utility，因此符合论文选择的安全-效用平衡。

这说明 evolution model 不是单纯“越强越好”，而是会影响策略偏好：

| 偏好 | 可能结果 |
| --- | --- |
| 激进阻断 | ASR 降得更多，UA 更容易下降 |
| 保守修复 | UA 保留更好，ASR 下降可能略少 |
| 过度泛化 | clean over-refusal 或任务失败 |
| 过度局部 | benchmark case 修好了，held-out 不泛化 |

## 11. 失败边界：SHE 仍可能在哪些地方失效？

### Safety Memory 自身可能被污染

SHE 把未解决或重复出现的失败抽象进 Safety Memory，这很自然，但也引入一个新问题：

1. 攻击者可能构造高频但低价值的失败模式，让系统记住错误边界。
2. 某些企业环境中，用户 A 的安全偏好不等于用户 B 的安全偏好。
3. 如果 memory retrieval 没有权限隔离，旧任务的安全边界可能错误影响新任务。

因此 Safety Memory 不能只看“是否减少 ASR”，还要看：

| 检查项 | 需要回答 |
| --- | --- |
| 来源 | 这条 memory 来自哪些 trajectory？ |
| 作用域 | 它适用于哪个用户、组织、工具域、环境？ |
| 反例 | 哪些 benign 行为不应被它阻断？ |
| 过期 | 工具或政策变化后是否需要失效？ |

### LLM judge 可能把“看起来安全”当成“执行安全”

论文在附录给出 Agent-SafetyBench judge 模板，要求从 observable trajectory evidence 判断安全和完成情况。这比只看最终回复更严格，但仍有边界：

1. 如果工具日志不完整，judge 看不到真实副作用。
2. 如果环境模拟简化，真实权限、网络、文件系统风险可能缺失。
3. 如果攻击者学会生成迎合 judge 的轨迹描述，评测可能高估安全性。
4. 如果 judge 与 evolution model 共享偏好，可能出现隐性过拟合。

一个更强的复现设计应该加入：

1. 确定性工具状态检查。
2. 外部 oracle 或规则验证器。
3. 多 judge disagreement 分析。
4. 对 accepted edit 的 adversarial replay。

### “局部编辑”不等于“局部影响”

SHE 强调 bounded local edit，但 Agent harness 是交互系统：

1. Rule Bank 新增一条规则，可能改变模型对整个任务的风险感知。
2. Tool Policy 阻断某个 sink，模型可能尝试替代工具或文本模拟。
3. System Prompt 更新会影响所有后续 reasoning token。
4. Safety Memory retrieval 的排序变化，可能改变同一条规则是否被激活。

所以局部编辑必须配合全局回归测试。论文的 best-harness selection 是第一步，但生产系统还需要：

| 回归维度 | 例子 |
| --- | --- |
| 工具回归 | 原本允许的文件读取、搜索、草稿创建是否还正常 |
| 任务回归 | 同类 benign 用户目标是否被误拒 |
| 安全回归 | 旧攻击是否复发 |
| 解释回归 | 日志是否还能说明为什么阻断 |

## 12. 与相关工作的关系：SHE 放在什么位置？

### 和 runtime guardrail 的差异

| 类型 | 代表 | 主要动作 | SHE 的区别 |
| --- | --- | --- | --- |
| 输入/输出 guardrail | Llama Guard、ShieldGemma、NeMo Guardrails | 检查 prompt、output 或中间执行 | 多数是固定规则或固定模型，不强调从轨迹中编辑 harness |
| Agent tool defense | Task Shield、Progent、AgentGuard、SafeHarness | 控制工具、权限、生命周期检查 | SHE 把 harness 当成可演化对象 |
| Agent benchmark | AgentDojo、Agent-SafetyBench、AgentHarm | 暴露安全失败 | SHE 试图把 benchmark trajectory 变成修复机制 |
| Harness evolution | GEPA、ABSTRAL、EvoTest、SkillOpt、Self-Harness | 优化 prompt、agent design 或技能 | SHE 聚焦安全边界，不是单纯优化任务成功率 |

### 本文的真正增量

可以把 SHE 看作“安全控制平面”的实验原型：

1. 它不是只在模型输出旁边挂一个分类器。
2. 它把安全状态拆成多种 artifact。
3. 它把失败轨迹转为 structured diagnosis。
4. 它要求每次更新都能回到安全-效用指标上接受或拒绝。

这条路线对 Agent 安全很关键，因为真实 Agent 的危险往往不是一句回复，而是：

1. 读到污染内容。
2. 记住错误边界。
3. 调错工具。
4. 把中间失败解释成成功。
5. 在阻断后换一条路继续执行。

## 13. 可复现性与证据边界

### 已公开材料

| 材料 | 状态 |
| --- | --- |
| 论文 PDF | 可访问 |
| 项目仓库 | 可访问，Apache-2.0 |
| seed artifacts | 已公开 |
| fixed train/heldout task IDs | 已公开 |
| evaluation / evolution scripts | 已公开 |
| generated rollouts | README 明确说 intentionally excluded |
| external benchmark packages | README 明确说 intentionally excluded |

### 复现需要额外注意

1. 论文主实验依赖 DeepSeek-V3.2、GPT-5.5、GPT-4o 等 API 或模型端点。
2. Agent-SafetyBench 和 AgentHarm 外部包需要单独准备。
3. Judge 是 LLM judge，虽然 temperature=0，但仍存在模板敏感性。
4. 15 个演化任务是否足够覆盖真实生产风险，需要更大规模、多组织、多工具栈复验。
5. 表格结果展示的是离线 benchmark，不等于线上无监督自我修改可以直接放开。

### 对安全部署的边界判断

如果把 SHE 直接带入生产，至少需要再加四个控制：

1. **离线演化、人工审批、灰度发布**：harness 更新不应实时自动上线。
2. **artifact diff review**：每次 Rule、Memory、Tool Policy 更新都要能解释来源轨迹和影响面。
3. **负例回放**：通过历史 benign 任务检查过拒答和能力退化。
4. **版本化回滚**：每个 accepted harness 都应有 manifest、指标和可回退版本。

## 14. 研究者视角：这篇文章改变了什么问题意识？

### 从“模型安全”到“协议安全”

SHE 提醒我们：

1. LLM Agent 的危险不是模型单独决定的。
2. 工具描述、上下文拼接、记忆召回、权限策略、最终响应修复都是攻击面。
3. 安全系统需要能回答“这次失败应该修哪一层”，而不是只回答“这次输出是否违规”。

### 从“规则库膨胀”到“归因更新”

传统规则库容易越写越大：

1. 看到 SSN 外发，就加 PII 规则。
2. 看到 app install，就加 install 规则。
3. 看到 prompt injection，就加 injection pattern。

SHE 的更强要求是：

1. 每条规则要有 risk axis。
2. 每个 artifact 要有 responsibility。
3. 每个补丁要有 supporting trajectory。
4. 每次接受要经过 safety-utility 选择。

这让规则库从“堆 if/else”变成一种可审计的安全边界历史。

### 下一步值得追问的问题

| 问题 | 为什么重要 |
| --- | --- |
| 能否用非 LLM judge 或混合 judge 降低评测偏差？ | 当前结果很依赖 GPT-5.5/GPT-4o 判断 |
| Safety Memory 会不会被攻击者诱导污染？ | SHE 把历史失败写成记忆，记忆本身也是攻击面 |
| 多租户 Agent 的边界能否共享？ | 一个用户的安全偏好不一定适合另一个用户 |
| Artifact route 能否给出可验证因果证据？ | 现在更多是 LLM 归因，不是严格因果定位 |
| 线上 incident response 能否和 SHE 合并？ | 生产系统需要从真实事故闭环，但不能让攻击者直接训练防线 |

## 15. 我的核心判断

1. SHE 最值得读的点是 **把 harness 当成可演化安全对象**，而不是把安全问题继续压给模型权重或单点 guardrail。
2. 四 artifact 分解是论文的关键工程抽象：它把“安全失败”变成可路由、可编辑、可审计的状态更新。
3. 表 1 和表 2 的数字支持“安全和 utility 可以一起改善”，但这仍建立在 LLM judge、固定 benchmark 和离线演化之上。
4. 对真实 Agent 平台而言，SHE 更像一个研究原型：它指出了安全控制面的形状，但生产化还需要严格的审批、回滚、对抗数据治理和独立评测。
5. 如果继续沿这条线做研究，最重要的问题不是再多降几个 ASR 点，而是让每个 harness 更新具备 **来源轨迹、责任 artifact、影响评估、反例回放、版本回滚** 五件证据。
