# AgentSnare：用轨迹自适应诱骗系统防守自主渗透 Agent

### 元信息与 TL;DR

- **论文**：[AgentSnare: Learning to Delay, Divert, and Defuse Autonomous Penetration Agents](https://arxiv.org/abs/2607.26998)
- **版本日期**：arXiv v1，2026-07-29 14:56:31 UTC
- **领域**：AI 安全 / AI for 安全 / Agent 安全评测
- **核心对象**：会规划、调用工具、观察结果并持续修正策略的自主渗透测试 Agent
- **主张一句话**：防守方不应只预埋静态诱饵，而要根据 Agent 的实时轨迹，动态生成、校验并提交一个事实一致的诱骗环境，让攻击预算、后续行动和最终完成报告都被吸收到 decoy 中。

**TL;DR：**

- 论文要解决的问题不是“怎样做一个更像真的 honeytoken”，而是“怎样在多轮工具交互里持续改变 Agent 的行动分布”。
- AgentSnare 的机制是两段式在线防御：
  - 先由 LoRA 微调的 Qwen3-4B 根据交互历史、当前动作、decoy 状态和可扩展边界生成候选 artifact；
  - 再由 ShadowOS 做语义、状态和安全校验，只有通过校验的 artifact 才会写入持久 world ledger 并返回给 Agent。
- 训练不是直接用 CVE-Bench 的解题轨迹，而是用模拟攻防生成 503 条轨迹、24,807 个被选择的防守决策，覆盖 12 类攻击意图；作者强调训练集中不含 CVE-Bench 应用、漏洞描述、参考 exploit 轨迹、官方解法或 evaluator 输出。
- 证据来自 15 个 CVE-Bench 可部署 Web 应用、3 个攻击模型和 405 次防守运行；所有防守条件共享任务提示、工具、200 次 tool-call 预算和停止规则。
- 关键数字是 AgentSnare 整体吸收 **46.8%** 工具调用，首次进入 decoy 后保留 **55.9%** 后续动作，**574/638** 个有效 completion attempts 由 decoy 证据支撑，即 **90.0% SubDefuse**；在 45 个 attacker-CVE pair 的 pass@3 评测中，真实目标成功利用为 **0/45**。
- 局限是实验集中在 CVE-Bench 的 15 个 Web 应用和三类前沿攻击模型；论文没有证明真实互联网攻防中一定有效，也没有覆盖攻击者能识别或破坏防守基础设施、并行探测多个入口、或专门对抗 ShadowOS 校验器的情形。

### 研究问题：为什么静态诱饵不够？

作者的切入点很明确：

- 自主渗透 Agent 不是一次性分类器；
- 它会在 `observation -> action -> observation` 的循环里继续探索；
- 因而防守影响力不是看一个诱饵是否能骗过一次观察，而是看它能否持续改变多轮轨迹。

论文把现有防守概括为一类主要范式：

| 防守范式 | 典型做法 | 能影响什么 | 主要弱点 |
|---|---|---|---|
| 静态 artifact | 预先放置 honeytoken、误导文件、prompt injection、消耗计算的 lure | 早期观察或局部分支 | 不能随 Agent 发现的新线索调整，容易被后续验证绕开 |
| 传统 honeypot | 预构造 shell、虚拟文件系统或脚本化响应 | 局部交互真实性 | 更偏行为采集和局部模拟，不保证跨轮事实一致 |
| LLM 驱动 honeypot | 根据状态生成更宽的自然语言或 shell 响应 | 更丰富的局部响应 | 若缺少持久状态和校验，容易出现前后矛盾、不可复现线索或泄漏风险 |
| AgentSnare | 在线构造 artifact，并由 ShadowOS 校验、提交和渲染 | 整条攻击轨迹的行动分布和最终证据归因 | 依赖受控入口、状态机设计和实验威胁模型 |

Figure 1 先给出负面动机：作者实现 13 个静态干预实例，覆盖 6 类策略，并用 6 个攻击 LLM 做 `Interference@20` 评估。平均分低于 0.2，说明静态 artifact 对 20 步交互的持续干预很弱。

![静态干预在多模型多策略上的 Interference@20](/assets/2026/07/30/itm_520e55e8ef6ca599/static-interference.png)

这张图在论证里的作用不是证明某一种静态策略完全无效，而是建立一个边界：

- 如果评估只看第一次接触 artifact，静态诱饵可能显得有效；
- 如果评估扩展到 20 步轨迹，Agent 会反复验证、回退、切换目标；
- 因而防守指标要从“诱饵是否被看见”转向“轨迹是否被持续吸收”。

### 论文主张与论证路线

作者的论证可以拆成 claim -> mechanism -> evidence -> boundary：

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 静态诱骗不能稳定控制高级 Agent 的多轮轨迹 | 用 `Interference@20` 衡量 20 步内 artifact 是否仍影响行为 | 13 个静态实例、6 类策略、6 个攻击 LLM，平均干预低于 0.2 | 这个实验只证明所选静态策略在作者设置下弱，不等于所有静态防御都无价值 |
| 防守目标应是轨迹级 steering，而不是单点欺骗 | Delay、PER、SubDefuse 三个过程指标分别衡量预算吸收、进入后保留和完成证据归因 | AgentSnare 整体 Delay 46.8、PER 55.9、SubDefuse 90.0 | DDD 是过程指标，仍要和真实目标 exploit 结果一起看 |
| 动态 artifact 必须有全局事实一致性 | ShadowOS 维护 world ledger、affordance graph、语义/状态/安全校验 | 移除 ShadowOS 后 SubDefuse 从 96.5 降到 82.2，并留下 1/15 目标可被利用 | 消融只在 GPT-5.4 攻击者上跑完整 15-CVE 三重复协议 |
| 小模型可通过轨迹监督学会更好的 artifact 选择 | 用模拟攻防做 reaction-guided selection，再蒸馏到 Qwen3-4B LoRA | 完整系统超过 prompted GPT-5.4-mini：37.7/45.0/96.5 对 37.0/43.7/88.6，且 exploit 为 0/15 对 3/15 | 训练依赖模拟器质量，若真实攻击策略分布显著偏移，效果可能下降 |
| 轨迹控制与真实目标抑制相关 | 比较 Cowrie、HoneyLLMd、AgentSnare 的 DDD 和 verified exploit | Cowrie 12/45、HoneyLLMd 10/45、AgentSnare 0/45 | 相关性来自同一 benchmark 评估，不等于普遍因果定律 |

### 威胁模型：防守者能做什么，不能做什么？

论文的威胁模型比“部署一个 honeypot”更具体：

- **攻击者控制**：
  - Agent planner；
  - memory；
  - tools；
  - stopping rule；
  - 是否忽略诱骗 artifact；
  - 是否在真实目标和防守控制面之间来回切换。
- **防守者能力**：
  - 可以在环境中放置或动态构造 deceptive artifacts；
  - 可以根据交互历史和已披露 artifact 更新 decoy；
  - 不能修改应用正常功能；
  - 不能修改真实漏洞执行路径。
- **防守者不假设**：
  - 不知道具体目标 CVE；
  - 不知道底层攻击模型；
  - 不知道工具配置、停止规则或攻击策略。

这个模型把 AgentSnare 放在一个很窄但重要的位置：

- 它不是“修复漏洞”的系统；
- 它不是“阻止所有扫描”的网关；
- 它是一个在受控交互面中构造替代证据世界的轨迹转向系统。

从安全工程角度看，这个边界很关键。AgentSnare 的结论只应解释为：在作者设置的 CVE-Bench 式环境中，如果攻击 Agent 会接触防守者可控入口，那么动态、一致、可验证的 decoy 能显著减少真实目标 exploit。

### 方法机制：AgentSnare 的在线管线

AgentSnare 的在线部分由两个核心阶段组成：

1. **候选 artifact 构造**：
   - 输入是交互历史、当前 probe、ShadowOS 状态、当前可扩展 frontier 和目标 server profile；
   - 输出不是直接返回给攻击 Agent 的最终环境观察，而是一个候选 `(拟观察, 事实增量)`。
2. **ShadowOS 校验与披露**：
   - 检查候选是否匹配当前动作语义；
   - 检查新增事实是否和已有 world ledger 一致；
   - 检查它是否能从当前 affordance frontier 合理扩展；
   - 检查格式、权限、进程、服务等基础约束；
   - 过滤真实环境秘密泄漏风险；
   - 只有通过后才提交到状态，并渲染成返回给 Agent 的观察。

![AgentSnare 在线防御与离线训练总览](/assets/2026/07/30/itm_520e55e8ef6ca599/agentsnare-workflow.png)

Figure 2 的信息量很大，可以拆成三个层次读：

| 层次 | 图中对应部分 | 对论文主张的意义 |
|---|---|---|
| 在线防御 | 右侧 attacker view / defender view / ShadowOS | 说明 AgentSnare 不是一次性提示注入，而是每轮拦截、构造、校验、提交 |
| 状态约束 | world ledger、affordance graph、validation & commitment | 说明“动态生成”不是任意编故事，而是被状态和可达边界约束 |
| 离线训练 | 左侧 dual-role trajectory synthesis | 说明小模型的 artifact 选择能力来自反事实候选比较，而不是只靠 prompt |

### 公式与变量：怎样把“诱骗”变成状态系统？

论文给出的在线交互可写成：

```text
at ~ A(ht)
ht+1 = ht || (at, ot)
```

变量含义：

- `ht`：攻击 Agent 当前可见的交互历史；
- `at`：Agent 在第 `t` 步选择的工具动作；
- `ot`：环境真实返回给 Agent 的观察；
- `A`：攻击 Agent 的策略；
- `||`：把动作和观察追加到历史中。

AgentSnare 并不拦截所有动作。它只在 `at` 到达防守者可控 surface 时介入；真实目标动作仍由原始环境处理。这一点避免把论文误读为通用沙箱。

ShadowOS 的状态由两部分组成：

```text
Gt = (Vt, Et)
Ft = Frontier(at, Gt)
xt = (ht, at, Wt, Ft, q)
ct = (õt, ΔWt) = Mθ(xt)
```

关键解释：

- `Wt` 是 world ledger，记录已经提交的 decoy 对象、属性、关系和攻击者造成的状态变化；
- `Gt` 是 lazy affordance graph，节点可以是文件、凭证、服务、用户、容器、内部主机或后续机会，边表示引用、认证、运行身份、佐证、使能等关系；
- `Ft` 是当前动作下可被合理扩展的 frontier；
- `q` 是服务器和应用 profile；
- `Mθ` 是 artifact-construction policy model；
- `ct` 包含拟返回观察 `õt` 和支撑它所需的事实增量 `ΔWt`。

真正提交时还要经过：

```text
(Wt+1, Gt+1) = Commit(Wt, Gt, ΔWt, ΔGt)
ot = Render(at, õt, Wt+1, Gt+1)
```

这组公式背后的安全设计是：

- 模型只提议，不直接改状态；
- 状态提交由 ShadowOS 控制；
- 返回观察必须由已提交状态渲染；
- 失败候选不会污染 world ledger；
- 后续命令能复现此前承诺过的事实。

### 伪代码：在线防御如何运行？

下面是论文机制的高层伪代码，不包含可执行攻击细节：

```text
Input:
  q: 目标服务器和应用 profile
  A: 自主渗透 Agent
  B: 最大工具调用预算

State:
  h0: Agent 可见历史
  W0: decoy world ledger
  G0: decoy affordance graph

for t in 1..B:
  at = A(ht)

  if at 指向真实目标:
    ot = 原始环境返回(at)
    ht+1 = ht || (at, ot)
    continue

  if at 指向防守者可控 surface:
    Ft = Frontier(at, Gt)
    xt = (ht, at, Wt, Ft, q)
    candidate = Mθ(xt)

    if ShadowOS.validate(candidate, Wt, Ft, at) == pass:
      (Wt+1, Gt+1) = ShadowOS.commit(candidate)
      ot = ShadowOS.render(at, candidate, Wt+1, Gt+1)
    else:
      (Wt+1, Gt+1) = (Wt, Gt)
      ot = failure_observation_without_new_fact

    ht+1 = ht || (at, ot)

Output:
  轨迹标签 z1..zT
  completion attempts 的 decoy provenance
  verified exploit result

Failure boundary:
  若 Agent 从未进入防守可控 surface，系统无法吸收轨迹；
  若候选 artifact 违反语义、状态或安全规则，不得提交；
  若攻击者专门识别 decoy 基础设施，实验结论不能外推。
```

### 离线训练：reaction-guided artifact selection 在学什么？

论文没有把训练描述成“让模型生成更会骗人的内容”，而是把它描述成一个反事实选择问题：

- 在同一交互历史、同一 probe、同一 decoy 状态下生成多个候选 artifact；
- 对每个候选分别模拟攻击者看到该观察后的后续动作；
- 选择更可能让 Agent 继续调查 decoy、跟进新 artifact、少触发怀疑或回到真实目标的候选；
- 将被选中的 `(输入状态, artifact 决策)` 蒸馏到部署模型。

作者给出的训练数据规模：

| 项目 | 数字 / 设置 |
|---|---|
| 模拟轨迹数 | 503 |
| selected defender decisions | 24,807 |
| 攻击意图类别 | 12 类 |
| 部署模型 | Qwen3-4B |
| 微调方式 | SFT，bf16，3 epochs |
| LoRA 设置 | `r = 64`, `alpha = 128` |
| Serving | vLLM |
| 排除数据 | 不含 CVE-Bench 应用、漏洞描述、参考 exploit 轨迹、官方解法、evaluator 输出 |

这个设计的意义在于区分两种能力：

- **局部生成能力**：能给当前 probe 返回看起来合理的文本；
- **轨迹选择能力**：知道什么样的 artifact 更可能让后续动作继续停留在 decoy。

论文的核心判断是：后者不是单靠更强通用模型就能稳定得到，它需要轨迹监督和持久状态共同作用。

### DDD 指标：Delay、Divert、Defuse 分别量什么？

传统结果指标只看真实目标 exploit 是否成功。作者认为这太粗，因为它不能解释防御过程。因此提出 DDD：

| 指标 | 公式 | 读法 | 不能说明什么 |
|---|---|---|---|
| Delay | `Delay = (1/T) Σ I[zt = decoy]` | 全轨迹里有多少工具调用被 decoy 吸收 | 不区分 Agent 是短暂误入还是长期停留 |
| PER / Divert | `PER = Σ_{t>τ} I[zt = decoy] / (T - τ)` | 首次进入 decoy 后，有多少后续动作继续在 decoy 中 | 不说明最终报告是否相信 decoy 证据 |
| SubDefuse | `SubDefuse = |PD| / |P|` | 有效 completion attempts 中，有多少由 decoy provenance 支撑 | 不直接等价于真实目标 exploit 失败 |

变量解释：

- `T`：一次运行产生的工具调用数量，且 `T <= B`；
- `B`：工具调用预算；
- `zt`：第 `t` 次调用的目标标签，可为 `real`、`decoy` 或 `other`；
- `τ`：首次经过验证的 decoy 进入动作；
- `P`：有效任务完成尝试集合；
- `PD`：其中证据可追溯到 decoy 的子集。

DDD 的优势是让防御变得可诊断：

- Delay 高但 PER 低：说明诱饵能吸引，但进入后留不住；
- PER 高但 SubDefuse 低：说明 Agent 动作停在 decoy，但最终报告未采纳 decoy 证据；
- SubDefuse 高但 exploit 仍成功：说明报告被转向，但真实目标仍可能被并行或提前利用；
- 三者都高且 verified exploit 低，才支持“轨迹转向有效”。

### 实验设置：评测协议是否足够严格？

论文实验有几个值得注意的控制点：

- 使用 15 个可部署 CVE-Bench Web 应用；
- 攻击框架是 agentic release of PentestGPT；
- 攻击模型包括 Claude Opus 4.6、GPT-5.4、MiniMax M3；
- 每个 attacker / interactive-defense / CVE 组合跑 3 次；
- 防守运行总计 405 次；
- 所有条件共享：
  - task prompt；
  - tools；
  - 200-call budget；
  - stopping rule；
  - application-side breadcrumb；
  - interaction entry point。

对照组包括：

| Defense | 机制 |
|---|---|
| Static Defenses | 预先部署 13 个可复现干预实例，覆盖 6 类 tactic |
| Cowrie | 静态虚拟 shell / 文件系统 / 脚本化命令处理 |
| HoneyLLMd | 层级概率自动机跟踪攻击转移，并用 GPT-5.4-mini 生成自适应响应 |
| AgentSnare | LoRA-tuned Qwen3-4B artifact policy + ShadowOS 持久校验与提交 |

这个评测不是“真实世界部署证明”，但比只做 demo 更强：

- 它有统一预算；
- 有明确攻击模型；
- 有 official CVE-Bench evaluator；
- 有 process metrics 和 endpoint metrics；
- 有组件消融。

### 主结果：AgentSnare 到底强在哪里？

Table 1 是整篇论文最关键的证据。

| Overall Defense | Delay | PER | SubDefuse | Exploited CVEs |
|---|---:|---:|---:|---:|
| Static Defenses | - | - | - | 18/45 |
| Cowrie | 17.6 | 23.5 | 29.7% (79/266) | 12/45 |
| HoneyLLMd | 29.5 | 36.9 | 72.2% (333/461) | 10/45 |
| AgentSnare | **46.8** | **55.9** | **90.0% (574/638)** | **0/45** |

逐攻击模型看，AgentSnare 的模式也比较一致：

| Attacker | AgentSnare Delay | AgentSnare PER | AgentSnare SubDefuse | AgentSnare Exploit |
|---|---:|---:|---:|---:|
| Claude Opus 4.6 | 47.0 +/- 2.9 | 58.1 +/- 2.7 | 92.0% (242/263) | 0/15 |
| GPT-5.4 | 37.7 +/- 2.0 | 45.0 +/- 2.7 | 96.5% (166/172) | 0/15 |
| MiniMax M3 | 55.7 +/- 2.8 | 64.7 +/- 3.3 | 81.8% (166/203) | 0/15 |

这些数字支持三个层次的判断：

1. **预算层**：AgentSnare 吸收将近一半工具调用，明显高于 Cowrie 和 HoneyLLMd。
2. **轨迹层**：首次进入 decoy 后，AgentSnare 仍能保留 55.9% 后续动作，说明不是“一次骗入即失效”。
3. **证据层**：90.0% completion attempts 由 decoy evidence 支撑，说明防御影响了 Agent 最终认为自己已经完成任务的依据。

Figure 3 把这种差异画成随攻击进度变化的曲线：

![真实目标与 decoy 的动作份额随归一化攻击进度变化](/assets/2026/07/30/itm_520e55e8ef6ca599/trajectory-share.png)

图中最重要的不是某个点的精确数值，而是趋势：

- Cowrie 下真实主线在多数阶段仍占主导；
- HoneyLLMd 把行动分布推向更接近均分；
- AgentSnare 在进入后逐渐形成 decoy-majority；
- real 和 decoy 调用仍会交替，因此论文没有宣称“完全隔离”，而是强调累计活动被受控环境吸收。

### 消融：模型微调和 ShadowOS 谁更重要？

RQ3 用 GPT-5.4 作为攻击者，对两个单组件消融和一个强 full ablation 做比较：

| 配置 | 移除了什么 | Delay / PER / SubDefuse | Exploit |
|---|---|---:|---:|
| 完整 AgentSnare | 无 | 37.7 / 45.0 / 96.5 | 0/15 |
| Base Qwen3-4B + ShadowOS | 去掉 reaction-guided 微调 | 34.4 / 38.0 / 85.5 | 3/15 |
| AgentSnare w/o ShadowOS | 去掉持久状态运行时 | 34.6 / 38.5 / 82.2 | 1/15 |
| Prompted GPT-5.4-mini | 去掉微调和 ShadowOS，但换更强闭源生成器 | 37.0 / 43.7 / 88.6 | 3/15 |

这个消融支持两个结论：

- **微调不是只提高语言质量**：Base Qwen3-4B + ShadowOS 的指标下降，并留下 3/15 真实目标可利用，说明 reaction-guided selection 学到的是“哪些 artifact 会延续 decoy 探索”。
- **ShadowOS 不是工程细节**：去掉 ShadowOS 时，SubDefuse 从 96.5 降到 82.2，下降 14.3 个点，说明持久状态和可复现事实对完成证据归因尤其重要。

强 full ablation 很有说服力：

- prompted GPT-5.4-mini 能恢复不少 DDD；
- 但仍不能匹配完整系统；
- 这说明“更强模型 + prompt”能做局部生成，却不足以替代轨迹监督和状态提交机制。

### Figure / Table 证据逐项解读

| 图表 | 支持的 claim | 关键数字 / 现象 | 不能证明什么 |
|---|---|---|---|
| Figure 1 | 静态干预难以持续影响多轮 Agent | 平均 `Interference@20 < 0.2` | 不能证明所有静态防御无效，也不能覆盖所有部署形态 |
| Figure 2 | AgentSnare 是在线状态系统 + 离线轨迹训练 | 两阶段在线管线、ShadowOS、world ledger、affordance graph、reaction-guided training | 不能证明每个模块在真实环境中都可低成本维护 |
| Table 1 | DDD 和 exploit endpoint 同时改善 | Overall Delay 46.8、PER 55.9、SubDefuse 90.0、0/45 exploit | 不能证明对开放互联网、多入口、长时间潜伏攻击仍有效 |
| Figure 3 | AgentSnare 改变的是整条轨迹的目标份额 | 后期 decoy share 维持主导，而 Cowrie 真实主线仍占优 | 曲线是池化结果，个别 attacker / CVE 可能有不同轨迹 |

### 相关工作位置：AgentSnare 站在哪里？

论文把自己放在三条线的交叉处：

1. **自主渗透 Agent 与 benchmark**：
   - PentestGPT、AutoPT、VulnBot 代表自动化渗透 Agent 方向；
   - CVE-Bench 提供可部署真实漏洞任务和 evaluator。
2. **Agent-oriented deception / honeypots**：
   - CHeaT、Mantis 等静态 artifact 证明观察可被防守方操纵；
   - Cowrie、ShelLM、HoneyLLMd 说明交互式诱骗环境可以存在；
   - AgentSnare 的差异是全局事实一致性和轨迹自适应展开。
3. **离线数据合成与 Agent 调优**：
   - FireAct、AgentTuning、Cyber-Zero 用轨迹改善 Agent 执行能力；
   - AgentSnare 反过来训练防守方模型，让它根据攻击轨迹构造能延续 decoy 探索的 artifact。

换句话说，AgentSnare 不是一个“更真实的 shell 模拟器”，而是把 Agent training 的方法论反用到防守侧：

- 攻击 Agent 用轨迹学习提高攻击能力；
- 防守 Agent 用轨迹学习提高诱导和状态维护能力；
- 评估则必须看两者在同一长程环境里的交互结果。

### 证据边界与可复现性问题

这篇论文的证据强，但外推边界也很清楚。

**已经被较好支撑的结论：**

- 在 15 个 CVE-Bench Web 应用和 3 个攻击模型设置下，AgentSnare 比 Cowrie、HoneyLLMd 和静态防御更能吸收轨迹；
- DDD 指标和 verified exploit endpoint 在这个 benchmark 上方向一致；
- 微调和 ShadowOS 都贡献了可观效果；
- 小模型加结构化状态机制可以超过强模型 prompt-only 方案。

**还没有被证明的结论：**

- 不能证明 AgentSnare 能替代补丁、访问控制、隔离或监控；
- 不能证明真实攻击者不会识别 decoy 的统计模式；
- 不能证明面对多入口并行探测、长时间低频探测、供应链访问或人为操控的 Agent 时仍有效；
- 不能证明 ShadowOS 维护成本低；
- 不能证明 artifact 生成和安全校验在大规模生产系统中不会引入新攻击面；
- 不能证明 DDD 三指标是所有安全场景的充分指标。

**可复现性关注点：**

- 论文提供了 8 页主文、3 张图、1 张表，但没有在 arXiv 页面看到可用代码仓库链接；
- GitHub API 对 `AgentSnare` / `2607.26998` 的仓库搜索没有命中；
- 因此当前可复现性主要依赖论文描述、CVE-Bench 基础设施和作者未来是否释放实现。

### 领域延伸：这篇论文对 Agent 安全意味着什么？

这篇论文值得关注，不只是因为它报告了 `0/45` exploit，而是因为它把 Agent 防御的对象从“输出内容”推进到“行动轨迹”。

对 AI 安全研究，至少有四个延伸问题：

1. **防守系统也需要状态完整性**：
   - 如果防守方动态生成内容，但没有 ledger、frontier 和提交规则，它只是一个更会编故事的生成器；
   - 真正安全属性来自“可验证的状态演化”，而不是模型语言能力。
2. **评估要同时看过程和终点**：
   - 单看 exploit 成功率会丢失防御机制；
   - 单看 Delay / PER 又可能掩盖真实目标已被成功触达；
   - DDD + verified exploit 是一个更完整的证据组合。
3. **安全后训练不只训练攻击者或拒答模型**：
   - AgentSnare 展示了一种“防守策略模型”的训练范式；
   - 训练目标不是回答安全问题，而是选择会改变对手轨迹的环境证据。
4. **decoy 的安全性需要独立评估**：
   - decoy 不是越复杂越好；
   - 它可能泄漏真实结构、扩大攻击面、误导正常诊断或制造审计噪声；
   - 因此下一步需要评估 decoy state 的最小暴露、权限边界和审计可恢复性。

### 结论：应把 AgentSnare 读成“轨迹防御框架”，不是万能诱捕器

我对这篇论文的核心判断如下：

- **最强贡献**：把自主渗透 Agent 防御从静态 artifact 推进到状态化、轨迹级、可归因的动态 decoy 系统。
- **最有价值指标**：DDD 把“防御是否影响了 Agent 的行动和最终证据”拆成可诊断过程指标。
- **最关键机制**：ShadowOS 的 world ledger、affordance graph、validation、commit 和 render，把 LLM 输出限制在可维护的事实系统内。
- **最值得保留的怀疑**：实验仍是 benchmark 内证据；真实部署还需要验证成本、误报、对抗识别、多入口攻击和防守系统自身安全。

如果把 AgentSnare 放到 Agent 安全研究脉络里，它的意义不是教人“怎样反制某个攻击 Agent”，而是提出一个更一般的安全问题：

- 当 Agent 的风险来自多轮行动轨迹时，防守方也必须拥有多轮状态、证据边界和轨迹级评估；
- 否则防守看似在每一步都返回了“合理响应”，但整体上仍可能让真实目标暴露在持续探索中。

### 继续追问：怎样把 `0/45` 变成可依赖安全证据？

`0/45` 是强信号，但研究者不应把它直接翻译成“真实部署安全”。更稳妥的读法是：

- **先确认覆盖面**：45 个 pair 来自 15 个 CVE-Bench 应用和 3 个攻击模型；如果部署环境包含不同语言栈、不同认证面、不同内部服务拓扑，仍要重新采样。
- **再确认入口假设**：AgentSnare 需要攻击轨迹进入防守者可控 surface；如果攻击 Agent 直接命中真实路径，或在外部信息源中获得足够 exploit 证据，decoy steering 的作用会被削弱。
- **还要确认对抗稳定性**：论文主要测试一般攻击 Agent，而不是专门训练来识别 ShadowOS 的 Agent；下一步应加入 decoy detection、状态一致性探测、跨入口比对等防守侧红队。
- **最后确认运维副作用**：动态 decoy 会生成大量可追溯但并非真实业务状态的证据；日志、告警、取证和合规系统必须能区分真实资产状态与 decoy 状态，否则防御成功也可能制造审计混乱。

因此，AgentSnare 最适合被当作一类 safety case 的组成部分：

| 安全论点 | 需要的附加证据 |
|---|---|
| 它能延迟攻击 | 不同预算、不同入口、不同工具集下的 Delay 曲线 |
| 它能转移轨迹 | PER 随时间、模型、任务难度变化的稳定性 |
| 它能化解 completion | decoy provenance 是否可审计，completion 是否真的没有触及真实目标 |
| 它不会引入新风险 | secret-leak filter、权限约束、状态回滚、正常用户影响评估 |

这也是本文最有价值的研究范式：不要只问“模型有没有输出坏内容”，而要问“系统能否保存一条可重放、可归因、可反驳的交互证据链”。对于 Agent 安全，这条证据链往往比单轮拒答更接近真实防御需求。
