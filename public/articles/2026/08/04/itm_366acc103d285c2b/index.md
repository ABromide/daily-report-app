# MAPLE-Guard：把多 Agent 记忆从“上下文材料”提升为受控状态

### 元信息

| 字段 | 内容 |
|---|---|
| 论文 | MAPLE-Guard: Memory-Aware Link Enforcement Against Memory-Link Poisoning in Multi-Agent Systems |
| 作者 | Wenjun Xiong, Yijin Zhou, Jiaqian Wang, Shangding Gu, Bo Tang, Zhiyu Li, Feiyu Xiong, Ying Wen, Muning Wen |
| 机构 | Shanghai Jiao Tong University, Shanghai Innovation Institute, Xidian University, UC Berkeley, MemTensor |
| 官方链接 | [arXiv:2608.00426](https://arxiv.org/abs/2608.00426) |
| 官方代码 | [xiong-wenjun/MAPLE-Guard](https://github.com/xiong-wenjun/MAPLE-Guard) |
| 提交时间 | 2026-08-01 03:55:13 UTC |
| 类型 | AI 安全 / 多 Agent 系统 / 持久记忆防御 |

### TL;DR

1. **这篇论文研究什么**：多 Agent 系统越来越依赖 private memory 与 shared memory 来跨任务协作；论文指出，记忆不是普通上下文片段，而是一条能跨轮次、跨 Agent、跨共享存储传播的持久攻击通道。
2. **核心攻击面是什么**：攻击者只需写入一次“看起来像经验、偏好、总结或规则”的 poisoned memory，之后它可能被检索、提升到共享记忆、再被未见过原始攻击的 Agent 复用；伤害发生时，当前通信边上未必还有恶意消息。
3. **MAPLE-Guard 怎么做**：它把 memory lifecycle 拆成四个受控门：write、retrieval、promotion、cross-agent reuse；每次记忆要进入存储、提示词、共享区或另一个 Agent 前，都用同一组风险、信任、效用信号做 allow / demote / block。
4. **关键公式是什么**：记忆项 `m=(x,mu)` 包含可进入 prompt 的文本 `x` 与隐藏元数据 `mu=(sigma,p,l,phi)`；风险 `r(m,c_t)=sum_k w_k r_k(x_m,phi(m),P(m),c_t)` 汇总 provenance、lineage、指令性、答案绑定、触发敏感性、重复簇等信号。
5. **实验怎么做**：作者在 5 个 benchmark-attack pair 上评估：MMLU-MINJA、LongMemEval-MemoryGraft、AppWorld-AgentPoison、CSQA-PromptInject、InjectAgent-ToolAttack；主网格每个设置使用 200 个实例、8 个 Agent、3 个攻击者、3 轮通信、star/chain/tree 三种拓扑。
6. **关键数字是什么**：在 Qwen3.5-122B-A10B 上，LongMemEval 的 ASR@3 从 `38.2%` 降到 `0.9%`，MDSR@3 从 `54.0%` 升到 `74.3%`；AppWorld 的 ASR@3 从 `34.7%` 降到 `0.2%`，MDSR@3 从 `42.5%` 升到 `99.8%`。
7. **消融说明什么**：LongMemEval-MemoryGraft 上，完整 MAPLE-Guard 为 `73.60% MDSR@3 / 0.90% ASR@3`；去掉 promotion gate 后退化最大，MDSR@3 降到 `60.00%`，ASR@3 升到 `14.50%`，说明 private-to-shared 是核心传播点。
8. **局限在哪里**：论文假设 provenance metadata、retrieval trace、scope、lineage 等运行时记录可信；若攻击者能伪造这些元数据，或构造低于每个 gate 阈值但跨事件累积的 payload，MAPLE-Guard 不能给出完整安全保证。

### 研究问题：为什么“记忆链接”比“消息链接”更危险？

#### 论文反对的直觉

| 常见直觉 | MAPLE-Guard 的反驳 |
|---|---|
| 只要监控 Agent 之间的消息边，就能看到攻击传播 | 记忆可以在消息消失后继续存在，后续检索才触发影响 |
| prompt/action guard 足够拦截恶意内容 | poisoned memory 在 write 时可能像普通经验，retrieval 时才变成任务相关诱导 |
| shared memory 是协作便利层 | shared memory 也是攻击放大器，private 污染一旦 promotion，影响面从单 Agent 扩到团队 |
| 记忆只是 RAG 文档 | 多 Agent 记忆带有 writer、scope、lineage、outcome、promotion 状态，必须按状态机治理 |

#### 作者重新定义的对象

1. **Physical link**：
   - 指通信图 `G=(V,E)` 里的可见边；
   - 防御通常检查 Agent A 给 Agent B 的消息；
   - 适合捕捉当前轮次的显式恶意传播。

2. **Memory link**：
   - 指一次写入、检索、提升、复用或更新导致的状态依赖；
   - 记忆路径 `P(m)` 可以跨越多个任务和轮次；
   - 伤害发生时，攻击源与受害 Agent 之间可以没有直接消息。

3. **Memory-link poisoning**：
   - 攻击者写入一个 poisoned item `m*`；
   - 让它沿 `write -> retrieve -> promote -> reuse` 的路径移动；
   - 最终让良性 Agent 在未来任务里采用目标答案、目标工具或危险策略。

![Figure 1：物理通信边防御与记忆链接防御的差异](/assets/2026/08/04/itm_366acc103d285c2b/figure_1_comparison.png)

#### Figure 1 支撑了什么？

| 图中元素 | 论文想表达的安全含义 |
|---|---|
| 左上 physical-link defense | 只剪通信边，能阻止部分消息传播，但不能治理已经进入 memory store 的内容 |
| 右上 contamination still spreads | poisoned memory 进入共享存储后，可以经 recall、summary、retrieval 等路径继续污染 |
| 左下 memory-link defense | 防御点要落在 write、retrieve、promotion、cross-agent reuse 的状态转换前 |
| 右下 blocked propagation | 目标不是让所有记忆消失，而是只让经过验证的团队记忆被复用 |

### 威胁模型：攻击者能做什么，不能做什么？

#### 攻击者能力

1. **控制少数看起来正常的 Agent**：
   - 论文默认攻击者不是全局管理员；
   - 攻击者可以在普通任务互动中写入经验型记忆；
   - 也可以在可触达的存储里直接 seed memory。

2. **构造 experience-like payload**：
   - 伪装为“过去任务证明某选项可靠”；
   - 伪装为“某个工具在此类状态下应该使用”；
   - 伪装为“团队已经同意某个策略”。

3. **等待未来触发**：
   - payload 不必立即生效；
   - 它可以等待相似查询、相似工具状态或共享记忆检索；
   - 因此当前轮次的 prompt guard 很难把写入时刻和伤害时刻连起来。

#### 攻击者不能做什么

| 不能做的事 | 为什么重要 |
|---|---|
| 不能修改其他 Agent 的 private store | 论文仍在有限威胁模型内，不是全存储失陷 |
| 不能伪造 guard hidden signals | MAPLE-Guard 依赖 `phi(m)` 的完整性 |
| 不能修改通信拓扑 | 论文关注绕过通信拓扑的 memory path，而不是拓扑本身被攻击 |
| 默认不知道 guard | 结果不覆盖强 adaptive attacker 对阈值和信号的反向优化 |

### 方法机制：MAPLE-Guard 把记忆变成一个状态机

#### 记忆项如何表示？

论文把每条记忆写成：

```text
m = (x, mu)
mu = (sigma, p, l, phi)
phi(m) = (rho, tau, h, sigma, l, o)
```

| 符号 | 含义 | 防御作用 |
|---|---|---|
| `x` | 可能进入 prompt 的记忆文本 | 只有它会暴露给 backbone LLM |
| `sigma` | private / shared / blocked 等 access scope | 决定谁能读到记忆 |
| `p` | provenance 与来源路径 | 区分外部输入、Agent 输出、工具观察、导入记忆 |
| `l` | active / retrievable / promotable / quarantined 等生命周期状态 | 控制记忆能否被检索或提升 |
| `rho` | utility / Q-value | 成功任务中被使用的记忆效用上升 |
| `tau` | provenance trust | 与来源和任务结果相关的可信度 |
| `h` | content hazard | 对危险、指令性、答案绑定等内容风险的估计 |
| `o` | outcome history | 记录使用该记忆后的成功、失败或 harmful outcome |

#### 记忆链接如何定义？

记忆操作集合为：

```text
A = {write, retrieve, promote, reuse, update}
```

一次 memory-link event 写成：

```text
e_m^(t) = (u, v, m, a, t)
```

| 字段 | 解释 |
|---|---|
| `u` | 来源，可以是 Agent 或 memory store |
| `v` | 目标，可以是另一个 Agent 或共享存储 |
| `m` | 被移动、检索、复用或更新的记忆 |
| `a` | lifecycle action |
| `t` | 第几轮或第几个事件 |

这种建模的关键不是形式本身，而是让防御对象从“消息内容”变成“状态转换”。只要 `m` 要改变 scope、进入 prompt、进入 shared memory 或跨 Agent 复用，就出现了可治理的检查点。

![Figure 2：memory-link poisoning 与 MAPLE-Guard 的四个拦截点](/assets/2026/08/04/itm_366acc103d285c2b/figure_2_overview.png)

### 四个 gate：分别切断哪条传播路径？

#### 1. Write gate：在污染成为持久状态前处理

写入门不是简单 allow / deny，而是四类动作：

```text
Write(m) =
  reject      if forbidden(m)
  quarantine  if r(m) >= theta_w^high
  rewrite     if instr(m)
  private     otherwise
```

| 动作 | 适用对象 | 安全意义 |
|---|---|---|
| reject | 凭据、secret、明显不应记忆的内容 | 不让高危内容进入 memory substrate |
| quarantine | 高风险但仍需审计的记忆 | 保留供分析，但不可检索 |
| rewrite | 有用但措辞像指令的内容 | 去掉 imperative form，以低信任证据重存 |
| private | 低风险普通内容 | 限定在 private scope，而不是直接共享 |

#### 2. Retrieval gate：在记忆进入推理前过滤

检索打分公式为：

```text
S(m, q) = sim(q, m) + beta*rho + gamma*tau
          - lambda*h - eta*taint(m)
          - kappa*scope(m) - mu*r(m, c_t)
```

| 项 | 作用 |
|---|---|
| `sim(q,m)` | 保留正常 RAG / memory retrieval 的相关性 |
| `rho` | 奖励过去确实帮过任务的记忆 |
| `tau` | 奖励 provenance 更可信的记忆 |
| `h` | 惩罚内容 hazard |
| `taint(m)` | 惩罚外部、未验证或不干净来源 |
| `scope(m)` | 惩罚越权或不合适的作用域 |
| `r(m,c_t)` | 加入 query-conditioned 风险，防止“写入时无害、检索时有害” |

#### 3. Promotion gate：在 private 进入 shared 前检查

promotion 的核心条件为：

```text
Promote(m) = 1[rho >= theta_rho and tau >= theta_tau and h <= theta_h]
```

这一步的安全意义很直接：

1. **private memory 的影响面有限**：
   - 即使某个 Agent 被污染，危害仍局限在单个 store。

2. **shared memory 是放大器**：
   - 一旦进入 shared store，多个 Agent 都可能检索；
   - shared summary 会把污染包装成团队共识。

3. **消融证明它最关键**：
   - 去掉 promotion gate 后，LongMemEval-MemoryGraft 的 ASR@3 从 `0.90%` 升到 `14.50%`；
   - 这说明 private-to-shared 不是附带细节，而是主要传播节点。

#### 4. Cross-agent gate：在其他 Agent 复用共享记忆前检查

cross-agent gate 解决的是“共享不等于可任意复用”：

| 复用场景 | 风险 |
|---|---|
| Agent B 读 Agent A 的经验 | B 没见过原始上下文，无法判断来源 |
| shared summary 被多个 Agent 检索 | 总结可能隐藏了攻击者目标 |
| 工具选择记忆跨角色复用 | 某个角色安全的工具建议，对另一个角色可能越权 |

### 统一风险模型：不是按攻击名做分类器

#### 风险公式

论文把风险写成：

```text
r(m, c_t) = sum_k w_k * r_k(x_m, phi(m), P(m), c_t)
```

| 信号组 | 具体信号 | 直觉 |
|---|---|---|
| Origin | provenance、lineage | 来源是否外部、未验证、跨 Agent 或由共享路径继承 |
| Intent | self-claimed success、instruction-likeness、answer binding | 记忆是否自称“这条规则成功”、是否像指令、是否绑定固定答案 |
| Retrieval gaming | trigger sensitivity、cluster dominance | 是否用稀有触发词激活，或用近重复污染 store |
| Producer | source-agent trust | 生成该记忆的 Agent 过往是否可信 |

#### 固定超参数为什么重要？

Table 5 给出固定配置：

| 参数组 | 数值 |
|---|---|
| provenance / lineage weight | `0.24 / 0.20` |
| self-claim / instruction / answer-bind weight | `0.14 / 0.14 / 0.12` |
| trigger / cluster / agent-trust weight | `0.10 / 0.04 / 0.02` |
| retrieval score `beta/gamma/lambda` | `0.8 / 0.5 / 1.0` |
| retrieval penalty `eta/kappa/mu` | `1.0 / 2.0 / 1.15` |
| outcome update `alpha` | `0.2` |
| retrieval risk threshold `theta_r` | `0.48` |
| write hazard / trust threshold | `h >= 0.65, tau <= 0.35` |
| promotion threshold | `h >= 0.5 or tau < 0.62` |

作者强调没有对每个 benchmark、attack、backbone 做单独搜索。这让结果更可信一些，因为它不是“每个攻击调一个阈值”的后验拟合；但也意味着论文证明的是这组固定规则在 5 个设置里的有效性，不是对未知自适应攻击的泛化证明。

### 算法流程：一次多 Agent 任务中 MAPLE-Guard 如何运行？

```text
Input:
  MAS graph G=(V,E)
  per-agent memories Mem_i with hidden states phi(m)
  task query q
  communication rounds K

State:
  memory item m
  lifecycle path P(m)
  utility rho, trust tau, hazard h, scope sigma, status l, outcome history o

For t = 1..K:
  For each agent C_i in V:
    1. Retrieve candidates from Mem_i by relevance, utility and trust.
    2. Apply retrieval firewall; only passing memories enter prompt.
    3. Run C_i on filtered memories and current messages.
    4. Apply write firewall to newly proposed memories.
    5. Apply promotion gate before sharing private memory.
    6. Apply cross-agent gate before exposing shared memory to another agent.
  Aggregate round answer a^(t).

After final round:
  Observe task outcome R_n.
  Update rho and tau only for used memory items.
  Append outcome to memory history.

Output:
  final answer a^(K)
  updated memory states

Failure boundary:
  If runtime metadata is forged, or poisoning stays under every event threshold,
  this algorithm has no formal guarantee.
```

### 实验设置：五组攻击面各测什么？

| Benchmark-attack pair | 任务面 | 记忆攻击面 |
|---|---|---|
| MMLU-MINJA | 多选推理 | 存储的推理偏置 |
| LongMemEval-MemoryGraft | 长期用户历史检索 | poisoned experience retrieval |
| AppWorld-AgentPoison | 工具使用 / app 状态 | 诱导危险工具或错误策略 |
| CSQA-PromptInject | commonsense QA transfer | prompt injection 泛化测试 |
| InjectAgent-ToolAttack | 工具通道 transfer | 间接工具攻击 |

#### 主网格协议

| 维度 | 设置 |
|---|---|
| 每个 run 的实例数 | `200` |
| Agent 数 | `8` |
| 攻击者控制 Agent 数 | `3` |
| 通信轮次 | `3` |
| 控制拓扑 | star、chain、tree |
| 每个 topology run 数 | `15` |
| backbone | Qwen3.5-122B-A10B、gemma-4-31B |
| embedding | Qwen3-Embedding-8B |
| judge | Qwen3.5-122B-A10B, temperature 0 |

#### 指标如何理解？

| 指标 | 含义 | 注意事项 |
|---|---|---|
| ASR@3 | 第 3 轮最终落到攻击者目标的比例 | 越低越好 |
| MDSR@3 | 非攻击 Agent 达成正确且非目标共识的比例 | 越高越好 |
| PMUR | retrieved poison 真正进入 prompt 的比例 | 区分“仍存在”和“被使用” |
| PMUR-A | 非攻击 Agent prompt 中包含 poisoned item 的比例 | 衡量跨 Agent 暴露 |
| Sec. ASR | 工具安全 probe 中选择危险工具的比例 | 用于 AppWorld / InjectAgent 等工具任务 |

`ASR@3 + MDSR@3` 不一定等于 `100%`，因为普通错误既不是攻击成功，也不是正确防御成功。这一点很重要：论文不是把所有错误都算成安全失败，而是关注目标攻击是否命中。

### 主结果：MAPLE-Guard 主要赢在哪里？

#### Qwen3.5-122B-A10B 主结果

| 设置 | No Defense MDSR@3 | No Defense ASR@3 | MAPLE MDSR@3 | MAPLE ASR@3 |
|---|---:|---:|---:|---:|
| MMLU-MINJA | `46.7` | `51.4` | `89.5` | `0.3` |
| LongMemEval-MemoryGraft | `54.0` | `38.2` | `74.3` | `0.9` |
| AppWorld-AgentPoison | `42.5` | `34.7` | `99.8` | `0.2` |
| CSQA-PromptInject | `68.3` | `37.7` | `79.5` | `23.6` |
| InjectAgent-ToolAttack | `79.8` | `20.6` | `98.3` | `4.9` |

#### 结果怎么读？

1. **memory-native setting 改善最大**：
   - LongMemEval 与 AppWorld 都直接依赖长期记忆或工具状态；
   - MAPLE-Guard 的防御点正好覆盖 retrieval、promotion、cross-agent reuse；
   - 因此 ASR 降幅最明显。

2. **transfer setting 改善较弱**：
   - CSQA-PromptInject 的 ASR 仍有 `23.6%`；
   - InjectAgent 在 gemma-4-31B 上仍有 `56.1% ASR@3`；
   - 这说明固定规则不是万能攻击检测器。

3. **不同 backbone 差异很大**：
   - gemma-4-31B 的 MMLU 与 InjectAgent no-defense ASR 分别达到 `75.1%` 与 `84.4%`；
   - 同一 guard 在不同模型上可能有不同剩余风险；
   - 记忆防御不能替代 backbone 自身的遵循能力和安全能力。

### 攻击轮次：为什么多轮会放大污染？

论文在随机拓扑里跟踪 R1 到 R3 的变化：

| 设置 | No Defense MDSR 变化 | MAPLE-Guard MDSR 变化 | 含义 |
|---|---:|---:|---|
| MMLU | `-3.5` points | `+4.5` points | 消息和记忆多轮累积后，未防御系统更容易偏向目标 |
| LongMemEval | `-9.2` points | `-4.4` points | 长历史检索中污染会反复出现，guard 能减弱但未完全消除下降 |
| AppWorld | `-19.5` points | `0.0` points | 工具状态记忆的重复复用最容易放大错误工具选择 |

这组证据的边界也很清楚：

1. 它说明 round-level degradation 与 repeated retrieval / cross-agent reuse 一致；
2. 但它不是严格 causal mediation；
3. 随机拓扑是 stress test，不替代表 1 的 star/chain/tree 控制均值。

### 消融：四个 gate 哪个最关键？

#### LongMemEval-MemoryGraft gate ablation

| 变体 | MDSR@3 | ASR@3 | 解释 |
|---|---:|---:|---|
| Full MAPLE-Guard | `73.60` | `0.90` | 四个 gate 全部启用 |
| w/o promotion gate | `60.00` | `14.50` | 退化最大，说明 private-to-shared 是关键传播点 |
| w/o write gate | 低于 full | 高于 full | 源头写入过滤有贡献 |
| w/o retrieval gate | 低于 full | 高于 full | 进入 prompt 前过滤有贡献 |
| w/o cross-agent gate | 低于 full | 高于 full | 共享记忆跨 Agent 复用仍需单独治理 |

#### 为什么 promotion gate 影响最大？

1. **写入只决定是否进入某个 store**：
   - private store 中的坏记忆仍可能只影响一个 Agent。

2. **promotion 决定影响半径**：
   - shared memory 能被多个 Agent 读取；
   - 共享总结会让污染从“某人说过”变成“团队记得”。

3. **retrieval 与 cross-agent gate 是后续补救**：
   - 它们能降低暴露；
   - 但如果污染已经进入 shared store，系统需要在更多点反复拦截。

### 代码仓库：实现结构说明了什么？

官方仓库不是只有论文占位，它把实验框架按 memory lifecycle 拆开：

| 路径 | 作用 |
|---|---|
| `maple_guard/maple_guard_core.py` | lifecycle gates、MAS execution、methods、metrics |
| `maple_guard/memory_backend.py` | private/shared persistent-memory backend |
| `maple_guard/run_mmlu.py` | MMLU / MINJA runner |
| `maple_guard/run_longmemeval.py` | LongMemEval / MemoryGraft runner |
| `maple_guard/run_appworld.py` | AppWorld / AgentPoison runner |
| `maple_guard/infa_memlink_eval.py` | CSQA 与 InjectAgent transfer evaluator |
| `configs/*_{star,chain,tree}.yaml` | 5 个 benchmark 各 3 种固定拓扑 |
| `experiments/run_memory_surface_topology_sweep_200.sh` | 论文规模 memory surface 与 topology sweep |
| `communication_gnn/` | G-Safeguard 风格图模型和训练代码 |

复现上需要注意：

1. 数据集没有打包在仓库里；
2. AppWorld、LongMemEval、INFA-Guard transfer 数据路径需要按 YAML 配置补齐；
3. paper-scale launchers 假设本地模型端口、embedding 端口和若干 baseline 依赖；
4. README 提供 smoke test，但 paper-scale numbers 需要完整数据和模型服务。

### 相关工作位置：它和已有防线差在哪里？

| 方向 | 代表问题 | MAPLE-Guard 的位置 |
|---|---|---|
| prompt/action guard | 当前输入、计划、工具调用是否危险 | 只能看到当前上下文，未必看到记忆路径 |
| topology defense | 哪些 Agent 通信边在传播恶意影响 | 通信图不是记忆图，shared memory 会绕过消息边 |
| memory poisoning attack | 如何把恶意内容写进长期记忆 | MAPLE-Guard 接受“会被写入”这一现实，治理后续 lifecycle |
| single-agent memory defense | 一个 Agent 的 store 如何认证或过滤 | 多 Agent 场景多了 promotion 与 cross-agent reuse |
| taint tracking / information flow | 数据来源如何沿程序传播 | MAPLE-Guard 把类似思想迁移到 Agent memory lifecycle |

### 证据边界：哪些结论不能过度外推？

#### 已经被论文较好支持的结论

1. 在五个选定 benchmark-attack pair 中，memory-link poisoning 能产生显著 ASR；
2. 对 memory-native 任务，治理 write / retrieval / promotion / cross-agent reuse 能显著降低 ASR；
3. 固定信号和阈值在这些设置中不需要逐攻击调参就能工作；
4. promotion gate 的消融退化说明 shared memory 是高价值防御点。

#### 不能直接推出的结论

| 过度结论 | 为什么不能推出 |
|---|---|
| MAPLE-Guard 能防所有 memory poisoning | 论文只覆盖每个 benchmark 一个 attack pair |
| 这是一种形式化安全证明 | 风险模型是 deterministic rule / metadata signal，不是完整证明 |
| prompt guard 已经没必要 | 当前消息、工具动作和外部输入仍需单独检查 |
| 结果证明 unknown adaptive attack 也会失败 | 攻击者若知道阈值，可能构造低风险分片或伪造元数据 |
| 可直接部署到任意企业 Agent | 需要可信 provenance、完整 mediation、可审计 memory backend |

#### 作者自己列出的限制

1. **不是初始 compromise 防线**：
   - MAPLE-Guard 关注污染进入系统后的 containment；
   - 它不能阻止每一次恶意输入进入交互。

2. **依赖运行时元数据可信**：
   - source route、writer、scope、lineage 一旦可伪造，风险信号会失真；
   - 论文当前没有覆盖这种攻击者。

3. **每个 benchmark 只配一个 attack**：
   - 这支持同一设置内 guard 比较；
   - 但不能孤立“攻击入口点”本身的因果效应。

4. **阈值以下攻击仍是空白**：
   - payload 可以设计得每次事件都低风险；
   - 多个低风险事件跨轮聚合后可能仍改变系统行为。

### 失败案例细读：论文中的攻击为什么不是普通 prompt injection？

#### 三类 link pollution 的差别

Figure 2 把污染记忆分成三种形态，这个划分比“恶意文本”更有解释力：

| 污染类型 | 表面形态 | 真正危险点 |
|---|---|---|
| Poisoned Memory | 直接写入一条虚假记忆 | 未来检索时，模型把它当成历史事实 |
| Biased Experience | 诱导 Agent 反思出偏置经验 | payload 经 benign Agent 改写后更像可信总结 |
| Malicious Summary | 把恶意共识包装成团队摘要 | shared memory 里出现“大家已经同意”的假状态 |

这里最值得注意的是第二类和第三类：

1. **Biased Experience 不是直接注入**：
   - 攻击者不一定写下危险命令；
   - 它可以诱导良性 Agent 生成“曾经成功”的经验；
   - 后续 guard 若只看来源 Agent，可能误以为这是良性 Agent 自己总结的内容。

2. **Malicious Summary 会改变语义身份**：
   - 原始攻击是某个 Agent 的发言；
   - summary 后变成“任务历史”或“团队规则”；
   - 这类身份转换正是 promotion gate 要拦截的对象。

3. **直接 prompt filter 很难保留上下文链**：
   - 当 Agent C 在未来检索到一条 summary，当前 prompt 里没有 Agent A 的原始攻击；
   - 若没有 parent lineage，系统无法知道这条 summary 来自可疑路径；
   - 这说明 memory path `P(m)` 是安全证据，而不是日志装饰。

#### AppWorld 为什么是强证据？

AppWorld-AgentPoison 的结果很高，原因不是它比所有任务都重要，而是它把记忆污染落到了工具选择上：

| 维度 | 普通 QA 污染 | AppWorld 工具污染 |
|---|---|---|
| 输出形态 | 错选答案 | 选择 API、工具或状态变更 |
| 安全后果 | 推理错误或目标答案命中 | 可能调用 risky tool |
| 记忆作用 | 偏置判断 | 给工具选择提供伪经验 |
| 防御观察 | ASR/MDSR | 还可以看 Sec. ASR 和 PMUR-A |

这解释了为什么论文不只报告最终 ASR。工具任务里，攻击成功前常有几个中间信号：

1. poisoned item 被写入；
2. poisoned item 没被 quarantine；
3. 它在相似 app 状态下被检索；
4. 它进入非攻击 Agent prompt；
5. Agent 选择 risky tool；
6. 最终任务落到攻击者目标。

MAPLE-Guard 的价值在于它可以在链条的多个位置降低概率，而不是只在最后问模型“这个工具危险吗”。

### 可复现性细读：这篇论文哪些部分更容易复现？

#### 容易复现的部分

| 部分 | 原因 |
|---|---|
| 代码目录结构 | 官方仓库公开了 runner、configs、experiments 与 metrics 工具 |
| 小规模 smoke test | README 给出 `TASKS=20 METHOD=maple_guard CONFIG_YAML=...` 的运行方式 |
| 固定拓扑配置 | `configs/*_{star,chain,tree}.yaml` 明确对应 benchmark 与 topology |
| gate ablation | 方法名包含 `maple_guard_no_write`、`maple_guard_no_retrieval`、`maple_guard_no_promotion`、`maple_guard_no_cross_agent` |

#### 难复现或需要额外条件的部分

| 部分 | 需要补齐什么 |
|---|---|
| 论文主表完整数字 | 需要五组 benchmark 数据、两个大模型服务、embedding 服务、baseline 依赖 |
| AppWorld / LongMemEval | 数据集路径没有随仓库打包，需要按 YAML 配置放置 |
| INFA-Guard transfer | CSQA 与 InjectAgent 的外部数据和 official guard baseline 需要额外准备 |
| gemma-4-31B 对比 | 需要同等推理设置、judge 设置和三拓扑 15 runs |
| token audit | 需要固定 task ID、随机邻接、轮次和生成限制，否则 token 节省数字不可比 |

#### 复现实验时最容易踩的坑

1. **把 MDSR 当成普通准确率**：
   - MDSR 是 under attack 的 correct non-target consensus；
   - benign mistake 不属于 MDSR，也不一定属于 ASR。

2. **把 topology std 当成 task-level 置信区间**：
   - Table 1 的小数是 star/chain/tree 三个 topology mean 之间的标准差；
   - 它不是 45 个 run 的总体不确定性。

3. **忽略 evaluator separation**：
   - 论文强调 poison IDs、target `y*`、attack-success annotations 只在 evaluator map；
   - 如果实现时把这些标签泄漏给 guard，结果会变成 oracle defense。

4. **用 hash embedding smoke test 复现论文数字**：
   - README 说 hash embeddings 只是 smoke-test fallback；
   - paper run 应使用配置的 Qwen3-Embedding-8B 或等价 embedding endpoint。

### 对 AI 安全研究的延伸问题

#### 1. Agent memory 需要像数据库一样有访问控制

多 Agent 系统里，memory store 不应只看成 prompt cache 或向量数据库：

1. 写入需要 provenance；
2. 检索需要 scope；
3. promotion 需要 trust 与 utility；
4. cross-agent reuse 需要 mediation；
5. outcome update 需要可追踪到使用过的 memory item。

这更接近数据库、信息流控制和审计日志问题，而不是单纯“召回更相关文档”的 RAG 问题。

#### 2. 记忆安全的核心指标不只是 ASR

MAPLE-Guard 引入 PMUR 与 PMUR-A 很有价值：

| 指标 | 为什么比只看 ASR 更细 |
|---|---|
| PMUR | 区分 poison 是否被检索候选选中、是否进入 prompt |
| PMUR-A | 衡量非攻击 Agent 的暴露范围 |
| persistence rate | 区分 poison 是否仍活跃保留 |
| Sec. ASR | 在工具任务里专门看是否选择危险 API |

后续研究应进一步拆分：

1. write-time commit rate；
2. dormant survival time；
3. promotion latency；
4. cross-agent fanout；
5. harmful outcome attribution。

#### 3. 自适应攻击会针对 metadata 和阈值

如果 MAPLE-Guard 类系统进入真实部署，攻击者不会只写“X is best”这种显性 payload。更现实的攻击会尝试：

1. 分散写入多个低风险 memory；
2. 利用真实成功 outcome 提升 `rho`；
3. 诱导良性 Agent 代写，从而提高 provenance trust；
4. 把固定答案绑定改写成偏好、风格、流程或例外规则；
5. 攻击 memory summarizer，让 summary 看起来像团队共识。

这说明下一步安全研究要评估 adaptive poisoning，不只是复用已有 attack benchmark。

#### 4. 后训练与运行时防御应分工

MAPLE-Guard 的结果容易被误读成“只要加规则就够了”。更准确的分工是：

| 层 | 负责问题 |
|---|---|
| 模型后训练 | 降低对恶意记忆的服从、提高不确定性表达、识别上下文冲突 |
| 运行时 memory guard | 约束哪些记忆能进入 prompt、共享区和跨 Agent 路径 |
| 系统审计 | 记录 memory lineage、promotion decision、tool outcome |
| 红队评测 | 构造跨轮、跨 Agent、低信号、可累积的 poisoning |

模型知道“不要盲信记忆”有帮助，但只靠模型自觉无法保证每条 memory path 都被 mediation。

#### 5. 系统设计应记录“为什么这条记忆能被看见”

真实多 Agent 平台若想借鉴 MAPLE-Guard，不能只加一个危险文本分类器。更关键的是，每次检索都应该能回答：

| 审计问题 | 需要的运行时证据 |
|---|---|
| 这条记忆是谁写的？ | writer ID、origin task、source route |
| 它是否被改写或总结过？ | parent memory IDs、summary lineage |
| 它为什么从 private 进入 shared？ | promotion decision、utility、trust、hazard |
| 当前 Agent 为什么有权看到？ | allowed agents、allowed task classes、scope |
| 它是否导致过失败或危险工具选择？ | outcome history、security probe、used-item trace |

如果系统无法回答这些问题，即使模型层有很强的安全训练，也很难在事故后定位污染路径。MAPLE-Guard 的研究价值不只在降低某几个 benchmark 的 ASR，也在提醒开发者：Agent memory 的安全日志必须能连接“写入时刻、检索时刻、共享时刻、使用后果”。

#### 6. 最需要补的评测：低信号长链攻击

下一代 memory poisoning benchmark 可以围绕四个更困难的方向设计：

1. **低信号分片**：
   - 单条 memory 看起来普通；
   - 多条 memory 组合后才形成偏置策略。

2. **良性代理代写**：
   - 攻击者不直接写 shared memory；
   - 它让高信任 Agent 通过总结、反思或任务复盘代写 payload。

3. **延迟 promotion**：
   - 初始写入长期保持 private；
   - 等几次成功 outcome 抬高 `rho/tau` 后再进入 shared。

4. **跨任务语义迁移**：
   - payload 不绑定固定答案；
   - 它绑定“遇到异常就跳过审计”“优先选择更快 API”这类流程偏好。

这些攻击会比显式的“prefer X”更接近真实系统风险，也更能检验 MAPLE-Guard 式 metadata defense 的边界。

### 结论：这篇论文最值得带走的判断

1. **记忆不是附属上下文，而是持久状态**：
   - 只要一个 Agent 可以写 memory，安全边界就从 prompt 扩展到 memory lifecycle。

2. **多 Agent 的传播图不等于通信图**：
   - shared memory、summary、retrieval、promotion 会形成另一张隐形图。

3. **防御点应该落在状态转换前**：
   - write、retrieval、promotion、cross-agent reuse 都是可审计、可拒绝、可降级的事件。

4. **实验支持 memory-aware link enforcement 的必要性**：
   - LongMemEval 与 AppWorld 的 ASR 降幅说明，memory-native 攻击不能只靠消息边防御处理。

5. **但它仍是有限威胁模型内的运行时 containment**：
   - provenance metadata、trace 完整性、自适应低阈值攻击，是后续必须补的部分。

6. **对 Agent 安全的长期启发**：
   - 越多系统把“记住用户、记住工具结果、记住团队经验”作为能力卖点，越需要把 memory store 当成有访问控制、信息流、审计和失效机制的安全对象。
