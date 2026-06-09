# AGENTSERVESIM：多轮 Agent Serving 为什么需要程序级硬件模拟器

## 元信息

| 项目 | 内容 |
|---|---|
| 论文 | AGENTSERVESIM: A Hardware-aware Simulator for Multi-Turn LLM Agent Serving |
| 作者 | Rakibul Hasan Rajib, Mengxin Zheng, Qian Lou |
| 机构 | University of Central Florida |
| 发布时间 | 2026-06-08 15:20:23 UTC |
| 原文 | [arXiv:2606.09613](https://arxiv.org/abs/2606.09613) |
| 类型 | 大模型 Agent 系统论文 |

### TL;DR

- 这篇论文研究的是 **LLM Agent serving**，不是普通聊天请求 serving：一个 coding agent 会反复调用模型、读写文件、运行测试、等待工具结果，再进入下一轮推理。
- 作者提出 **AgentServeSim**，一个硬件感知模拟器；它把评估单位从独立 request 改成 program，并显式建模 turn 顺序、tool gap、session-aware routing、program-aware scheduling 与跨轮 KV cache residency。
- 论文用 mini-swe-agent 跑 SWE-Bench Verified 采集 50 个程序轨迹；平均每个程序约 41.9 轮，工具调用时间为 1161±4125 ms，单程序 token 总量为 356031±184632。
- 验证覆盖 RTX 3090、H100-SXM、B200，模型包括 Llama-3.1-8B 和 Llama-3.1-70B；在 80 个 configuration/policy/JPS cell 上，JCT 误差低于 5%，吞吐聚合误差低于 2%。
- 设计空间实验显示：session-aware routing 保持 96.26% prefix-cache hit rate，round-robin/least-loaded 会损失 3.3 到 3.6 个百分点；工具延迟达到原始尺度后，Continuum 静态 TTL mean JCT 比 FCFS 低 26.7%。
- 局限很明确：工具 gap 主要来自 replay trace，不能预测同一 Agent 重新运行时会选择哪些不同工具；验证只覆盖两个模型规模和三类 NVIDIA GPU；代码 artifact 仍需要进一步公开复现。

### 研究问题：为什么单请求模拟器不够？

- 传统 LLM serving simulator 往往把工作负载看成独立的 prefill-decode request：
  - 每个请求有输入长度和输出长度；
  - 请求结束后，后续请求不继承 program identity；
  - 调度器看见的是 request arrival time；
  - cache 管理看见的是单轮 KV 生命周期。
- 多轮 Agent 程序不符合这个模型：
  - 同一个任务会产生几十轮 LLM call；
  - 每轮之间夹着工具调用，工具耗时从百毫秒到数秒甚至更长；
  - 后续 prompt 大量复用前文，KV cache 是否保留会直接影响 prefill 成本；
  - 用户感知的是整个 program 完成时间，也就是 JCT，而不是某一次请求的 TTFT 或 TPOT。
- 论文的核心问题可以写成一句话：
  - **当 Agent 程序是 stateful、multi-turn、tool-interleaved 时，serving 系统该如何在不同硬件、路由、调度和 KV 策略下做可信评估？**

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 现有 simulator 缺 Agent 语义 | Vidur、APEX、LLMServingSim 等主要处理独立请求，缺 program identity、tool gap、program-aware scheduling、session routing、cross-turn KV management | Table 1 逐项比较能力覆盖 | 表格证明能力缺口，不证明 AgentServeSim 在所有 workload 上都准确 |
| AgentServeSim 能复现真实 serving 行为 | Program Orchestrator、Tool Simulator、Session-Aware Router、Program-Aware Batch Scheduler、KV Residency Model 组合 program-level execution | JCT 每个 configuration-policy cell 误差低于 5%，吞吐聚合误差低于 2% | H100 上仍有接近 5% 的平台校准偏差 |
| 多实例路由首先是 cache-locality 问题 | 用 program-to-instance affinity 保持后续 turn 回到 home engine | session-aware hit rate 为 96.26%，round-robin/least-loaded 降到 92.6% 到 93.0% | 只在两实例 H100/8B/vLLM-FCFS 设置下验证 |
| KV retention 的收益取决于 workload | 扫描 prefix reuse $\eta$ 与 tool latency scale $k$ | $\eta=0.9$ 时策略差距到 3.3x；$k=1$ 时 Continuum 比 FCFS mean JCT 低 26.7% | SWE-Bench 工具时间双峰，其他 Agent 轨迹未必相同 |
| Memory tiering 适合用模拟器探索 | 参数化 HBM-only、HBM+CPU、HBM+CXL_32/64/128 | HBM-only 从 JPS 0.04 到 0.12 的 mean JCT 从 170s 涨到 418s；HBM+CPU 在 JPS 0.12 收回 28% 损失 | CXL 是 effective bandwidth 模拟，不是真实产品端到端测量 |

### 架构：五个模块怎样把 Agent 程序放进 serving engine？

![AgentServeSim 架构图](/assets/2026/06/08/itm_2b975780dd8e06c6/agent_simulator.png)

#### Program Orchestrator

- Program Orchestrator 把 Agent 表示为 program record：
  - `program_id` 贯穿所有 turn；
  - `turn_index` 记录当前轮次；
  - `outstanding_tool` 表示上一轮是否仍在等待工具；
  - attained service、累计 tokens、queue state 供调度器读取。
- 它维护四类事件：
  - `New Turn`：下一轮 LLM call 可以进入 serving；
  - `Turn Complete`：模型完成当前 turn；
  - `Invoke Tool`：Agent 发起外部工具；
  - `Tool Complete`：工具结束，释放下一轮。
- 这个模块的意义是：
  - 没有 turn barrier，模拟器会把一个 program 的多轮调用压平成独立请求；
  - 一旦 program identity 丢失，JCT、attained service、KV reuse 都无法定义。

#### Tool Simulator

- Tool Simulator 把外部工具等待变成模拟时间。
- 它有两种模式：
  - replay mode：直接重放采集轨迹中的工具耗时，用于真实系统和模拟器对齐；
  - generative mode：按工具名采样，用于 counterfactual sweep。
- 它不模拟工具内部执行逻辑，而是模拟工具造成的 inter-turn idle interval。
- 这很关键：
  - KV 是否值得保留，取决于工具等待是否短于重新 prefill 或 swap/restore 成本；
  - 没有 tool gap，Continuum 的 TTL、InferCept 的 preserve/swap/discard 都没有评估对象。

#### Session-Aware Router

- 多实例 serving 中，round-robin 或 least-loaded 会把同一 program 的连续 turn 分散到不同 engine。
- AgentServeSim 用 program-to-MSG affinity table：
  - 首轮确定 home Model Serving Group；
  - 后续 turn 优先回到 home MSG；
  - home MSG 过载时，策略可以等待、迁移 KV 或在其他实例重新 prefill。
- 这让 routing 从“哪个实例最空”变成“这个 program 的 KV state 在哪里”。
- 机制后果是：
  - 等待增加 queueing；
  - 迁移增加 KV transfer cost；
  - 重新 prefill 增加 compute cost；
  - 打散 session 不再是免费的负载均衡。

#### Program-Aware Batch Scheduler

- Batch Scheduler 读取 program-level state，而不是只读 request arrival time。
- 它可以表达：
  - vLLM-FCFS：request-level FCFS，turn 结束后 KV eviction；
  - Autellix：program-level attained service scheduling；
  - InferCept：在工具 gap 处选择 discard、retain 或 swap；
  - Continuum：program-level FCFS 加成本模型指导的 TTL retention。
- 论文把策略差异限制在 ordering 和 KV-disposition hook 上：
  - admission path 和 continuous batching 尽量保持一致；
  - 策略比较不容易混入底层 engine 差异；
  - 这也是系统论文里控制变量的关键。

#### KV Residency Model

- KV Residency Model 基于 RadixAttention-style prefix cache。
- 它追踪每个 program 的 KV block：
  - 是否仍在 HBM；
  - 是否迁到 host DRAM 或 CXL；
  - 是否被 eviction；
  - 是否因 TTL miss 需要重新 prefill。
- 它给 tool gap 赋予 deadline：
  - 静态策略可以给固定阈值，例如 2 秒；
  - 自适应策略可以比较 retain、recompute、swap/restore 的成本；
  - memory pressure 可能强制 override deadline。

### 算法流程：一次 program turn 怎样被模拟？

```text
Input:
  P = captured or generated agent programs
  C = cluster configuration
  H = per-device hardware profiles
  Policy = routing, scheduling, KV residency policy

State:
  program_state[p] = {turn_index, outstanding_tool, home_msg, attained_service}
  kv_state[p] = {prefix_blocks, tier, deadline, residency_status}
  event_queue = time-ordered simulation events

Loop:
  while event_queue is not empty:
    event = pop_next_event()

    if event.type == NewTurn:
      p = event.program_id
      if program_state[p].outstanding_tool:
        hold turn until ToolComplete
      else:
        msg = SessionAwareRouter.route(p, program_state[p], kv_state[p])
        BatchScheduler.enqueue(msg, p, Policy)

    if event.type == TurnComplete:
      update attained_service and token statistics
      if program has next tool:
        gap = ToolSimulator.duration(p, turn)
        KVResidencyModel.assign_deadline(p, gap, Policy)
        push InvokeTool and ToolComplete events
      else:
        record program JCT

    if event.type == ToolComplete:
      clear outstanding_tool
      push NewTurn for the next turn

Output:
  Runtime statistics: throughput, memory usage, TTFT, TPOT
  Program statistics: JCT, KV hit rate, policy ranking
```

### 实验设置：作者怎样控制变量？

| 维度 | 设置 |
|---|---|
| 真实 serving stack | vLLM |
| 硬件 | RTX 3090 24GB GDDR6X、H100-SXM 80GB HBM3、B200 180GB HBM3e |
| 模型 | Llama-3.1-8B、Llama-3.1-70B |
| workload | mini-swe-agent 跑 SWE-Bench Verified，OpenRouter endpoint 为 Qwen3.6-plus |
| 程序数 | 每个 cell 50 个 programs |
| 到达过程 | Poisson arrivals，JPS in {0.02, 0.04, 0.06, 0.08, 0.1} |
| 重放字段 | prompt、generated-token count、tool duration |
| policy | vLLM-FCFS、Autellix、InferCept、Continuum |
| 主要指标 | per-program JCT、aggregate throughput、KV-cache hit rate |

### Workload 细读：SWE-Bench 轨迹为什么能支撑问题意识？

- 作者采集的 SWE-Bench Verified 轨迹有三个重要统计：
  - 50 个 programs；
  - 每个 program 平均 41.9 轮，标准差 14.9；
  - 单次工具调用耗时为 1161±4125 ms；
  - 单程序 token 总量为 356031±184632。
- 这些数字支撑了论文的三个前提：
  - turn 数足够多，program identity 不能丢；
  - token 总量足够大，prefix reuse 与 KV retention 有实际价值；
  - 工具时间标准差远大于均值，固定保留或固定丢弃都可能在某些 turn 上错得很离谱。
- 工具 CDF 的含义：
  - `sed` 在 p99 仍低于 300 ms；
  - `grep` 与 `cat` 的 p50 约 160 到 180 ms，但 p99 可到约 3 秒；
  - `python` p50 约 600 ms；
  - `git` p99 可到 9 秒；
  - 更罕见的 `pip install` 和 full-suite `pytest` 会产生更长尾。
- 论文定义 prefix-reuse rate $\eta$：

$$
\eta_t = \frac{\text{turn }t\text{ 输入中已在 turn }t-1\text{ 出现的 token 数}}{\text{turn }t\text{ 的输入 token 数}}
$$

- 在 SWE-Bench 轨迹中，median program 的 $\eta \approx 0.95$。
- 这说明 coding agent 的上下文高度累积；如果每轮都重新 prefill，系统会重复计算大量共享 prefix。

### 指标字典：这些数字分别回答什么问题？

| 指标 | 定义 | 作用 | 常见误读 |
|---|---|---|---|
| JCT | program 第一轮开始到最终完成的总时间 | 衡量用户感知的 Agent 任务完成速度 | 不能等同于单次请求延迟 |
| TTFT | 单次请求到首 token 的时间 | 检查 prefill 与 queueing 行为 | 单独优化 TTFT 不保证 program 更快 |
| TPOT | decode 阶段相邻 token 的平均间隔 | 检查 steady-state decode 成本 | 对工具长尾和跨轮缓存不敏感 |
| Prefix-cache hit rate | 后续 turn 命中已有 prefix KV 的比例 | 解释 routing、retention、tiering 为什么影响 JCT | hit rate 高不等于所有 token 都免费 |
| JPS | jobs per second | 控制 program 到达率 | 不能直接和普通 QPS 对齐 |
| $\eta$ | consecutive turns 的 prefix reuse rate | 刻画 workload 是否适合跨轮 KV reuse | 人工 sweep 不代表所有真实轨迹 |

- 这些指标形成层级：
  - TTFT/TPOT 是 request-level；
  - throughput 是 engine-level；
  - hit rate 是 memory-policy-level；
  - JCT 是 program-level。
- 论文想证明的是：
  - 如果只看 request-level 指标，Agent serving 的关键问题会被遮住；
  - 如果只看 JCT，又可能不知道差距来自 routing、scheduler 还是 KV residency；
  - 所以模拟器需要同时输出 runtime statistics 和 program statistics。

### 验证结果：模拟器是否可信？

#### JCT validation

| Configuration | vLLM-FCFS | Continuum | Autellix | InferCept | 解读 |
|---|---:|---:|---:|---:|---|
| RTX 3090 / Llama-3.1-8B | +3.26% | +2.12% | +3.97% | +4.70% | 全部为 over-predict，仍低于 5% |
| B200 / Llama-3.1-8B | +3.53% | +2.78% | +2.64% | +4.15% | B200/8B 也整体 over-predict |
| B200 / Llama-3.1-70B | -2.05% | -2.60% | -2.67% | -1.89% | 70B 上出现轻微 under-predict |
| H100 / Llama-3.1-8B | -4.53% | -4.55% | -4.71% | -4.79% | H100 偏差接近上界，需要谨慎外推 |

- 这个表的意义不是每个点完美，而是：
  - 每个 configuration-policy cell 都在 5% 内；
  - 误差符号按硬件/模型配置聚类；
  - 这更像平台校准偏差，而不是某个策略被模拟器系统性偏爱。
- 对 design-space exploration 来说：
  - 如果某个策略差距只有 1% 到 2%，不能过度解读；
  - 如果差距达到 10%、20% 或倍数级，就超出了校准噪声。

#### Throughput validation

- 论文还验证 instantaneous throughput：
  - 指标是单位真实或模拟时间内生成 token 数；
  - 曲线覆盖 admission、steady state、drain；
  - 80 个 configuration/policy/JPS cells 的 aggregated throughput error 低于 2%。
- 这补足了 JCT 验证：
  - JCT 是 program-level 用户结果；
  - throughput 是 engine-level 动态过程；
  - 两者同时接近，说明模拟器不是只把最终平均值拟合对。

### 设计空间结果一：Session affinity 是多实例 Agent serving 的默认前提

| 路由策略 | NPU prefix-cache hit rate | 机制解释 |
|---|---:|---|
| Session-aware | 96.26%，所有 JPS 上保持 | 同一 program 后续 turn 回到 home engine |
| Round-robin | 约 92.6% 到 93.0% | 连续 turn 被分散，prefix 在多个 engine 上重复 materialize |
| Least-loaded | 约 92.6% 到 93.0% | 负载均衡收益抵不过 locality loss |

- 作者在两实例 H100/Llama-3.1-8B/TP=1 集群上做实验。
- 结论是：
  - 多实例 Agent serving 不是先问哪个实例最空；
  - 而是先问这个 program 的 KV state 在哪里。
- 3.3 到 3.6 个百分点 hit rate 损失会被多轮程序放大：
  - 每个 miss 会带来 re-prefill 或迁移；
  - 程序轮数越多，累积损失越大；
  - prompt 越长、模型越大，每次 miss 越贵。

### 设计空间结果二：Prefix reuse 决定策略差距什么时候变成倍数级

- 作者扫描 $\eta \in \{0.1, 0.3, 0.5, 0.7, 0.9\}$。
- 固定条件：
  - B200 / Llama-3.1-70B / TP=1；
  - JPS = 0.06；
  - 比较 Autellix 与 InferCept。

| Prefix reuse $\eta$ | p95 JCT 差距 | 解释 |
|---:|---:|---|
| 0.1 | 1.8x，2601.1s vs 3783.1s | prefix reuse 低，重算占主导 |
| 0.5 以上 | 策略选择开始显著 | cache hit 逐渐成为主要变量 |
| 0.9 | 3.3x，538.3s vs 1751.4s | retention 策略差异被高复用放大 |

- 这个实验把“Agent-aware policy 有用吗”拆成条件句：
  - 如果 workload prefix reuse 很低，策略差距可能被校准误差吞掉；
  - 如果 workload prefix reuse 很高，选错策略会产生倍数级 JCT 代价；
  - SWE-Bench median $\eta \approx 0.95$，所以它天然放大 KV reuse 策略的重要性。

### 设计空间结果三：工具延迟决定 retain/discard 边界

- 作者把所有记录的 `tool_ms` 按比例 $k$ 缩放：

$$
tool\_ms'_i = k \cdot tool\_ms_i,\quad k \in \{0.25, 0.5, 1, 2, 4\}
$$

- 比较三类 retention 规则：
  - vLLM-FCFS：baseline，turn 结束后 KV eviction；
  - static-TTL Continuum：固定 2 秒 pinning threshold；
  - InferCept：逐请求比较 preserve/discard 成本。

| 工具延迟尺度 | 观察 | 机制解释 |
|---|---|---|
| $k \leq 0.5$ | 三个策略几乎重合，mean JCT 差异低于 0.2s | 多数 gap 低于 2 秒阈值，KV 都能保住 |
| $k = 1$ | Continuum mean JCT 比 FCFS 低 26.7%，190.9s vs 260.5s | 原始工具等待开始让 retention 决策变得关键 |
| $k \geq 2$ | Continuum 与 InferCept 都继续优于 FCFS | 长 gap 增多，简单 eviction 付出更多重复 prefill |

- 微妙结论是：
  - InferCept 的动态 preserve/discard 没有在 SWE-Bench 上超过静态 TTL；
  - 原因不是动态策略没价值，而是 SWE-Bench 工具时间分布呈 bimodal；
  - 固定 2 秒阈值刚好落在两个模式之间，已经足够接近正确决策。

### 设计空间结果四：Memory tiering 回答真实集群难以穷举的问题

- 作者在 B200 / Llama-3.1-70B / TP=1 / Continuum 下比较：
  - HBM-only；
  - HBM + CPU DRAM，约 64 GB/s effective；
  - HBM + CXL，32/64/128 GB/s effective。

| 条件 | mean JCT | 说明 |
|---|---:|---|
| HBM-only, JPS=0.04 | 170.5s | 工作集基本 fit in HBM |
| HBM-only, JPS=0.12 | 417.8s | 从低负载到高负载膨胀 2.45x |
| HBM+CPU, JPS=0.12 | 300.7s | 相比 HBM-only 收回 28.0% 损失 |
| HBM+CXL_128, JPS=0.10 | 246.3s | 相比 HBM-only 改善 30.5%，相比 HBM+CPU 改善 9.8% |
| HBM+CXL_128, JPS=0.12 | 293.7s mean, 492.4s p95 | mean 优势收窄，tail 仍受益 |

- 这个实验说明模拟器的独特价值：
  - CXL bandwidth sweep 很难在真实集群上逐项搭建；
  - 模拟器可以把 HBM、host DRAM、CXL 当成参数化 memory hierarchy；
  - 当差距超过约 4% 的校准漂移时，结果可以作为设计判断。

### 失败边界：哪些地方不能过度解读？

- **Session-aware routing 的胜利不是所有负载均衡都错。**
  - 论文只证明在高 prefix reuse 的多轮 coding trace 上，保持同一 program 的 locality 很重要；
  - 如果 workload 每轮上下文变化很大，session affinity 的收益会下降；
  - 如果某个实例过载严重，等待 home engine 也可能不如迁移。
- **静态 TTL 的胜利不是动态策略没有必要。**
  - SWE-Bench 工具时间呈双峰，2 秒阈值刚好有利；
  - 如果工具时间连续分布，或网络调用受外部状态影响更大，动态 preserve/swap/discard 可能重新占优。
- **CXL_128 的收益不是 CXL 真实产品评测。**
  - 论文模拟的是 effective bandwidth；
  - 真实系统还会有协议、NUMA、调度、并发访问和隔离成本。
- **JCT 误差低于 5% 不等于所有中间指标都完美。**
  - JCT 可能掩盖 TTFT、TPOT、throughput 的局部误差；
  - 论文额外验证 throughput，是为了降低这种风险；
  - 对更多硬件、更多模型、MoE 或 TPU，仍需要重新校准。

### 机制公式：把 JCT 拆成可解释变量

$$
JCT(p) =
\sum_{t=1}^{T_p}
\left(
Q_{p,t}
+ P_{p,t}(1-H_{p,t})
+ D_{p,t}
+ G_{p,t}
+ M_{p,t}
\right)
$$

| 变量 | 含义 | 对应模块 |
|---|---|---|
| $Q_{p,t}$ | 第 $p$ 个 program 第 $t$ 轮排队时间 | Program-Aware Batch Scheduler |
| $P_{p,t}$ | miss 时重新 prefill 的成本 | KV Residency Model + System Simulator |
| $H_{p,t}$ | prefix/KV hit 指示或比例 | KV Residency Model |
| $D_{p,t}$ | decode 与 operator execution 成本 | Hardware profile + execution backend |
| $G_{p,t}$ | 工具等待时间 | Tool Simulator |
| $M_{p,t}$ | KV migration/swap/restore 成本 | Session-Aware Router + memory tier |

- 这个公式不是论文原文目标函数，而是帮助理解系统分解：
  - vLLM-FCFS 主要会放大 $P_{p,t}(1-H_{p,t})$；
  - round-robin 会让 $H_{p,t}$ 降低，并可能增加 $M_{p,t}$；
  - Continuum 通过 TTL 改变 $H_{p,t}$ 与 memory pressure；
  - Autellix 通过 program-level ordering 改变 $Q_{p,t}$；
  - CXL/CPU second tier 改变 $M_{p,t}$ 与重新 prefill 的替代成本。

### Detail inventory

| 类别 | 可复用细节 |
|---|---|
| 方法名 | AgentServeSim、Program Orchestrator、Tool Simulator、Session-Aware Router、Program-Aware Batch Scheduler、KV Residency Model |
| Workload | mini-swe-agent + SWE-Bench Verified + Qwen3.6-plus via OpenRouter |
| 数据规模 | 50 programs；41.9±14.9 turns/program；1161±4125 ms tool time/call；356031±184632 tokens/program |
| 硬件 | RTX 3090 24GB、H100-SXM 80GB、B200 180GB |
| 模型 | Llama-3.1-8B、Llama-3.1-70B |
| Baseline | vLLM-FCFS、Autellix、InferCept、Continuum |
| 关键验证 | JCT cell error < 5%；aggregate throughput error < 2%；80-cell sweep |
| 关键 DSE | session routing、prefix reuse $\eta$、tool latency scale $k$、HBM/CPU/CXL tiering |
| 失败边界 | replay trace 不覆盖 Agent-side nondeterminism；工具分布外推有限；硬件 profile 需要平台校准 |

### 逐节细读：作者怎样一步步说服读者？

#### Introduction：从 workload shift 推出 simulator shift

- 论文开头没有直接宣称自己做了一个新工具，而是先指出 serving workload 正在变化：
  - 过去的主流对象是单次 query 或短对话；
  - 现在的 coding assistant、function-calling pipeline、web-search agent、long-horizon planner 都更像程序；
  - 这些程序会在 LLM call 与外部工具之间来回切换。
- 这个开场的作用是把问题从“优化某个 kernel 或 batching 策略”改写成“重新定义工作负载”。
- 如果读者接受这一点，后面的模拟器设计就不再是添加几个 feature，而是补齐一个新的执行语义。
- 论文随后引入 InferCept、Continuum、Autellix：
  - InferCept 关注 interruption-aware KV handling；
  - Continuum 关注 TTL-based KV retention；
  - Autellix 关注 program-level scheduling。
- 这些相关工作共同说明：
  - Agent serving 已经出现了专门策略；
  - 但这些策略如果只能在少量真实部署上测，很难知道它们在不同硬件和 workload 条件下是否仍成立。

#### Simulator comparison：Table 1 的论证功能

- Table 1 对比 Vidur、APEX、LLMServingSim、LLMServingSim 2.0 和 AgentServeSim。
- 它列出的能力不是普通功能清单，而是 Agent serving 的五个必要条件：
  - multi-turn programs；
  - tool gap modeling；
  - program-aware scheduling；
  - session-aware routing；
  - cross-turn KV cache management。
- 这张表的强点是清楚：
  - 即使 LLMServingSim 2.0 有更完整的异构硬件和 disaggregated serving 建模，它仍然只 partial 支持 cross-turn KV cache；
  - 更关键的 program identity 和 tool gap 仍缺失。
- 这张表的弱点也要看到：
  - 它比较的是抽象能力，不是代码成熟度；
  - 没有开源 artifact 时，外部读者无法马上确认每个 check mark 的工程实现质量。

#### Architecture：模块边界对应问题边界

- Program Orchestrator 对应 turn dependency 问题。
  - 它保证 turn $t+1$ 只能在 turn $t$ 和工具 gap 完成后释放；
  - 这避免多轮 Agent 被误建模为一批互不相关的请求。
- Tool Simulator 对应工具时间问题。
  - replay mode 服务于验证；
  - generative mode 服务于假设分析；
  - 二者共同让工具等待成为可控变量。
- Session-Aware Router 对应多实例 locality 问题。
  - 如果后续 turn 被路由到不同实例，prefix cache 可能需要迁移或重算；
  - 因此路由策略必须把 cache state 纳入代价函数。
- Program-Aware Batch Scheduler 对应 program-level priority 问题。
  - request FCFS 无法知道某个 program 已经服务了多久；
  - program-level attained service 则能表达“长程序不要被连续插队”一类目标。
- KV Residency Model 对应跨轮状态驻留问题。
  - 它把 HBM、host DRAM、CXL、eviction 统一到一个 deadline-aware controller；
  - 这让 retention/offload 不再只是系统实现细节，而是可实验变量。

#### Experimental setup：为什么 replay 是合理的？

- 作者选择 replay captured prompt、generated-token count 和 tool duration。
- 这一步的价值是控制 Agent 侧随机性：
  - 真实 Agent 重新跑同一个任务时，可能选择不同文件、不同命令、不同测试路径；
  - 如果把这种行为变化混进验证，JCT 差异无法归因；
  - replay 让真实系统和模拟器面对同一条轨迹。
- 但 replay 也带来边界：
  - 它更适合验证 serving simulator；
  - 不适合直接预测“换一个模型后 Agent 会怎样探索”；
  - 也不适合预测真实用户任务中的工具分布漂移。

#### Results：先证明误差边界，再解释策略差距

- 论文先给 JCT validation，再给 throughput validation。
- 这个顺序是正确的：
  - 如果没有 JCT 验证，后面的策略差距只是模拟器内部故事；
  - 如果没有 throughput 验证，JCT 接近也可能只是误差抵消。
- JCT 表里的硬件相关误差很重要：
  - RTX 3090 和 B200/8B 主要 over-predict；
  - B200/70B 和 H100/8B 主要 under-predict；
  - 这提醒读者不要把模拟器结果当成零误差真值。
- 吞吐误差低于 2% 的意义是：
  - 模拟器不只拟合最终完成时间；
  - 它也能追踪 admission、steady state、drain 这些动态阶段；
  - 这对研究调度和 KV policy 很重要，因为策略差异常常发生在队列堆积和释放过程中。

### 图表证据逐项解读

| 图表 | 支撑的结论 | 需要保留的边界 |
|---|---|---|
| Table 1 | 现有 simulator 缺少 Agent serving 所需语义 | 不是成熟度、性能或开源质量比较 |
| Figure 1 | 五个模块如何连接 program event、routing、scheduler、KV residency 与 hardware simulator | 架构图不能证明实现误差 |
| Trace statistics table | SWE-Bench 轨迹有多轮、长上下文、工具长尾 | 不能代表所有 Agent workload |
| JCT error table | 80-cell sweep 中 JCT 误差低于 5% | H100 误差接近上界，外推要谨慎 |
| Throughput validation figure | 模拟器能跟住 admission、steady state、drain | 聚合误差低不代表每个瞬时窗口都完美 |
| Routing DSE | session affinity 保持 96.26% hit rate | 只覆盖两实例 H100/8B 设置 |
| Prefix reuse sweep | 高 $\eta$ 把策略差距放大到倍数级 | $\eta$ 是人工控制变量 |
| Tool latency sweep | 工具 gap 变长后 retention 策略更重要 | SWE-Bench 双峰工具分布有利于静态 TTL |
| KV tiering table | second-tier memory 在高负载下明显改善 JCT | CXL 参数是模拟 effective bandwidth |

### 可复现性与 artifact 风险

- 论文的 arXiv source tarball 包含完整 LaTeX、实验章节和图件。
- 这对读者理解论文是足够的：
  - 可以查看架构图；
  - 可以查看 JCT 表；
  - 可以查看 DSE 表格和附录数值。
- 但对完整复现还不够：
  - 论文正文没有给出 simulator 代码仓库；
  - SWE-Bench trace 数据是否随 artifact 发布仍需等待；
  - 真实 vLLM 部署、OpenRouter endpoint、硬件 profile 采集脚本都需要可执行 artifact 才能复查。
- 因此这篇论文当前最适合的读法是：
  - 把它当成 Agent serving measurement framework 的设计与证据草图；
  - 不要把所有数值当成已被社区复现实验确认的 benchmark；
  - 后续如果代码和 trace 发布，才适合进入可复现实验比较。

### 与后训练、Agent RL 和安全的关系

- 对后训练系统来说，Agent rollout 的 serving 成本会影响训练吞吐：
  - 如果 RL 环境要求 agent 运行真实工具；
  - 如果每条 trajectory 有几十轮；
  - 那么 serving policy 会影响单位时间可采样的轨迹数量。
- 这意味着 post-training 不只是算法问题：
  - reward model、policy update、rollout workers 之外；
  - serving scheduler 和 KV retention 也会影响整体训练效率。
- 对 Agent RL 来说，可以进一步考虑把 serving cost 纳入 reward：
  - 鼓励更少无效工具调用；
  - 鼓励更低 prefix churn；
  - 鼓励更短但信息密度更高的上下文维护。
- 对 AI 安全来说，KV residency 是安全边界的一部分：
  - 跨轮 KV state 可能包含敏感上下文；
  - host DRAM/CXL offload 可能改变敏感数据驻留位置；
  - session affinity 保留上下文有利于性能，但也要求更严格的租户隔离和审计。
- 因此 AgentServeSim 的抽象可以被安全研究复用：
  - 不只模拟性能；
  - 也可以模拟数据驻留时间、跨实例迁移、工具 gap 中的状态暴露窗口。

### 读者应该怎样使用这篇论文？

- 如果你在做 Agent benchmark，不要只记录任务是否成功：
  - 还应该记录每轮输入长度、输出长度、工具名、工具耗时、上下文复用比例；
  - 否则很难解释为什么两个成功率相近的 Agent 在系统成本上差异巨大。
- 如果你在做 Agent serving 系统，不要把多实例路由当成普通负载均衡：
  - 同一个 program 的后续 turn 可能携带大量可复用 prefix；
  - 打散到不同 engine 会把一次调度选择转化成多次 prefill 成本；
  - session affinity 应该成为默认 baseline，再讨论何时迁移。
- 如果你在做后训练基础设施，不要把 rollout workers 看成只受模型推理速度限制：
  - 工具 gap、KV retention、prefix churn、queueing 都会改变有效采样吞吐；
  - 训练算法看到的样本成本，实际由 Agent 行为和 serving policy 一起决定。
- 如果你在做安全隔离，不要只盯 prompt 和工具权限：
  - KV state 的驻留位置、迁移路径、保留时长也会影响敏感信息暴露窗口；
  - 高性能 retention 策略和多租户隔离之间可能存在需要量化的冲突。
- 这篇论文最实用的地方，是提供了一套提问模板：
  - 我的 workload 是否真的 multi-turn？
  - prefix reuse 是否足够高？
  - 工具时间分布是短尾、长尾还是双峰？
  - 多实例路由是否破坏 session locality？
  - second-tier memory 的收益是否超过模拟器校准误差？
- 这些问题比单纯比较平均延迟更接近 Agent 基础设施的真实决策。
- 也更能避免把模型能力问题误判成系统能力问题，或反过来把系统瓶颈误判成 Agent 推理失败。

### 领域延伸思考

- 对 Agent 系统研究来说，这篇论文把 evaluation target 往下压了一层：
  - 不只是问 Agent 是否能解题；
  - 还要问解题轨迹在 serving infrastructure 上如何排队、缓存、迁移和完成。
- 对后训练和 RL Agent 来说，轨迹效率会变成训练成本的一部分：
  - 如果 RL 环境里的 Agent 每轮都产生长上下文；
  - 如果工具调用分布有长尾；
  - serving policy 会影响 rollout throughput，进而影响训练系统吞吐。
- 对 AI 安全来说，program identity 和 tool gap 也不是纯性能问题：
  - session-aware routing 会保留更多跨轮状态；
  - retention/offload 会改变敏感上下文在 HBM、host DRAM、CXL 中停留的时间；
  - 审计、隔离和权限控制需要知道这些状态驻留在哪里。
- 后续值得追问：
  - 能否把 AgentServeSim 和真实 observability trace 接起来，让生产系统自动校准模拟器？
  - 对 web browsing、GUI、mobile agent 这类工具时间更不稳定的 workload，静态 TTL 是否仍然足够？
  - 如果 Agent 训练阶段把 serving cost 纳入 reward，是否会学出更短工具链、更低 prefix churn 的行为？
  - 当多租户安全约束要求隔离 KV state 时，session affinity 与安全隔离之间如何折中？

### 结论

- AgentServeSim 的贡献不是一个新的线上 serving engine，而是一个把 Agent serving 关键变量放到同一坐标系里的测量工具。
- 它补齐了多轮 Agent serving 的基本抽象：
  - program identity；
  - tool-induced gap；
  - session-aware routing；
  - program-aware scheduling；
  - cross-turn KV residency；
  - hardware-aware memory hierarchy。
- 论文最值得带走的判断是：
  - 高 prefix reuse 时，KV retention 策略决定 JCT；
  - 多实例下，session affinity 是 cache-locality 约束；
  - 工具时间分布决定静态 TTL 和动态策略谁更合适；
  - second-tier memory 的收益随负载上升，但在饱和点会从 mean gain 转向 tail gain。
