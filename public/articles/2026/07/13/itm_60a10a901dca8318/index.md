# SCALECUA：把 Computer-Use Agent 的在线 RL 扩到可验证任务池

| 项目 | 内容 |
| --- | --- |
| 原文 | [SCALECUA: Scaling Computer Use Agents with Verifiable Task Synthesis and Efficient Online RL](https://arxiv.org/abs/2607.11185) |
| 代码与资源 | [THUDM/SCALE-CUA](https://github.com/THUDM/SCALE-CUA) |
| 类型 | 论文与开源框架 |
| 方向 | 大模型 Agent / Computer-use agent / RLVR |
| 日期 | arXiv v1: 2026-07-13 07:32:35 UTC；GitHub 最近提交: 2026-07-12 |
| 本文判断 | 它不是单纯再训练一个 GUI agent，而是在回答：当 GUI 任务没有天然判题器、交互又慢又长时，怎样把 RLVR 做成可扩展的数据、采样和训练系统。 |

## TL;DR

- **问题**：Computer-use agent 直接操作屏幕、鼠标、键盘和桌面应用，适合用 RLVR 训练；但 GUI 任务不像数学/代码那样天然有 verifier，且多轮屏幕轨迹会让 rollout 与训练都变慢。
- **方法**：SCALECUA 由三块组成：`VeriGen` 生成可执行 judge 的 GUI 任务；`Frontier Sampling` 用每个任务的成功率 EMA 把 rollout 分配到当前能力边界；`Visual Context Segmentation` 用滑动视觉窗口保留近期截图、保留完整文本历史，降低长轨迹训练开销。
- **数据证据**：VeriGen 在 100+ agent worker 和 100+ Docker 环境并行下，生成 24K+ 可验证任务，筛出近 3K 高质量 RL 任务；生成 judge 的可执行率为 94.5%。
- **实验结果**：Qwen3.5-9B 版本在 OSWorld 达到 68.7%，超过 Kimi K2.5 的 63.3% 和 EvoCUA-32B 的 56.7%；在 ScienceBoard 达到 54.0%，略高于 Claude Opus 4.6 的 52.7%。
- **效率结果**：Visual Context Segmentation 在 Qwen3.5-9B 设置下把每步总时间从 750 秒降到 265 秒，约 2.83 倍加速；中等窗口 `K=3-5` 在 pass@k 上也优于过小或过大的视觉上下文。
- **消融结论**：完整系统 OSWorld 为 68.7%；去掉 VeriGen 退回 43.9%，去掉 Frontier Sampling 为 63.7%，去掉 Visual Context Segmentation 为 62.2%，三块都贡献明显。
- **局限**：episode 上限是 50 turn；评测环境主要是 Ubuntu 桌面；公开视频/模型/数据支持复现评测，但完整在线 RL 训练仍依赖部分非公开任务池、VM 镜像或本地服务配置。

## 研究问题：为什么 GUI Agent 的 RLVR 难扩展？

### 1. GUI 任务缺少天然判题器

- 数学题有最终答案，代码题有测试用例。
- GUI 任务通常只有：
  - 初始桌面状态；
  - 一条自然语言指令；
  - 多步屏幕交互；
  - 一个最终桌面状态。
- 论文把“可验证 GUI 任务”定义成：任务必须配有确定性 judge，例如检查文件系统、浏览器状态、文档属性或 Python 函数返回的环境状态。
- 这一步很关键，因为 RLVR 的 reward 不能长期依赖人工或 LLM judge；否则训练规模一上来，reward 成本、噪声和延迟都会变成瓶颈。

### 2. 随机生成任务会浪费 GRPO 组内优势

- GRPO 类训练需要同一任务下多个 rollout 形成组内相对优势。
- 如果一个任务太简单，所有 rollout 都成功，advantage 接近 0。
- 如果一个任务太难，所有 rollout 都失败，advantage 也接近 0。
- 所以任务不仅要“可判定”，还要“处在当前模型刚好能学到东西的难度带”。

### 3. 多轮视觉上下文会挤压两个引擎

- CUA 的每一步都可能带截图，完整轨迹训练会导致视觉 token 快速增长。
- 如果把每一步拆成独立训练样本，训练样本数又随 turn 数线性膨胀。
- 论文把这个矛盾拆成两个压力：
  - rollout engine 需要快速生成长轨迹；
  - training engine 需要处理可训练 token 与 reference logprob。
- SCALECUA 的设计目标，就是同时处理“任务从哪里来”“rollout 采哪些任务”“长轨迹怎样喂给训练器”。

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 可验证 GUI 任务可以规模化生成 | VeriGen 用 proposer、judger、checker、fixer 和 Docker execution-in-loop 生成任务与 judge | 24K+ verifiable tasks；近 3K high-quality RL tasks；judge executable rate 94.5% | judge-human agreement 只有 82.5%，说明可执行不等于完全正确 |
| 大任务池必须按能力边界采样 | Frontier Sampling 用每个任务成功率 EMA 和高斯权重偏向 `p≈0.5` 的任务 | 对比 uniform、DAPO、curriculum，训练 reward 更持续 | 需要初始 pass-rate 与持续 rollout 统计，冷启动和分布迁移仍有成本 |
| 长 GUI 轨迹不该完整保留所有截图 | Visual Context Segmentation 保留最近 `K` 张图，文本历史继续保留，assistant token 只优化一次 | per-step total 750s -> 265s，2.83x speedup | `K` 需要调；过小丢目标，过大引入陈旧视觉干扰 |
| 在线 RL 可以显著提升开源 CUA | 在 GLM-4.6V、Qwen3-VL-8B、Qwen3.5-9B 上应用同一 pipeline | Qwen3.5-9B OSWorld 68.7%，ScienceBoard 54.0% | 主要验证 8B-9B 级 VLM；更小/更大模型未充分刻画 |

## 方法机制一：VeriGen 不是“写任务”，而是写可执行奖励

### 输入与角色

- VeriGen 的输入包括两类材料：
  - 环境知识文档，例如应用帮助页、任务蓝图、缓存材料；
  - 模型 rollout 轨迹，例如成功/失败 trace、截图、原始配置和结果记录。
- 多 agent loop 包含三类核心角色：
  - `proposer`：提出任务、setup、instruction 和 verifier；
  - `judger`：做静态语义检查，判断指令是否明确、verifier 逻辑是否合理；
  - `checker`：在 Docker 环境里动态试跑，检查任务是否可达、judge 是否能评价最终状态。
- 论文还在消融里讨论了 fix agent 和 rule validator，说明生成可验证任务不是一次 LLM 生成，而是一条验证-修复闭环。

### 任务 schema 的核心

| 字段 | 含义 | 为什么重要 |
| --- | --- | --- |
| `instruction` | 用户看到的自然语言任务 | 决定任务是否可理解 |
| `setup config` | 下载文件、打开应用、初始化 VM | 保证任务从确定初态开始 |
| `judge func` | 最终判题函数名 | 把自然语言目标转成代码入口 |
| `result getter` | 从最终环境取文件、属性或状态 | 连接桌面状态与 reward |
| `expected rule` | 期望满足的属性 | 防止 judge 只检查任务是否运行 |
| `validation` | LLM judge、规则验证、执行验证记录 | 给后续筛选和审计提供证据 |

### 从失败与成功轨迹再造任务

- 对失败轨迹，VeriGen 不是简单丢弃，而是定位 agent 最早偏离目标的步骤。
- 然后它把原任务拆成更小的子任务，让模型学习已经接近但还没稳定掌握的局部技能。
- 对成功轨迹，VeriGen 会在同一应用内聚类相似任务，把目标和 verifier 组合成更难的多目标任务。
- 这使 task pool 可以随模型能力演化：
  - 失败产生更易训练的技能切片；
  - 成功产生更难的组合任务；
  - pass rate 变成下一轮数据生成与采样的状态变量。

### VeriGen 伪代码

```text
Input:
  environment_docs, seed_tasks, rollout_trajectories
  live_docker_pool, code_agent, llm_judge

State:
  candidate_tasks = []
  validation_records = []

for source in environment_docs or rollout_trajectories:
  task, judge = proposer.generate(source)

  static_review = judger.review(task, judge)
  dynamic_review = checker.execute_in_docker(task, judge)

  while static_review fails or dynamic_review fails:
    task, judge = fixer.repair(task, judge, static_review, dynamic_review)
    static_review = judger.review(task, judge)
    dynamic_review = checker.execute_in_docker(task, judge)

  if rule_validator.pass(task, judge) and dynamic_review.pass:
    candidate_tasks.append(task.with_executable_judge(judge))
    validation_records.append(all_reviews)

Output:
  verifiable_task_pool with setup, instruction, judge, expected rule, validation metadata
```

## 方法机制二：Frontier Sampling 把 rollout 预算放在学习边界

### EMA 成功率

论文为每个任务维护一个成功率估计：

```text
变量:
  p_hat_i: 第 i 个任务的 EMA 成功率
  alpha: EMA 平滑系数，实验中为 0.2
  n: 每个任务的 rollout 数，实验中为 8

更新:
  p_hat_i <- (1 - alpha) * p_hat_i
             + alpha * mean(success(rollout_j) for j in 1..n)
```

- 如果任务一直成功，`p_hat_i` 接近 1。
- 如果任务一直失败，`p_hat_i` 接近 0。
- 最有训练价值的是中间区域，因为同组 rollout 既有成功也有失败，advantage 不会退化。

### 高斯采样权重

Frontier Sampling 用下面的权重挑任务：

```text
w_i = exp( - (p_hat_i - mu)^2 / (2 * sigma^2) )

mu = 0.5
sigma = 0.25
gamma = 0.2
```

- `mu=0.5` 表示目标是成功率约一半的任务。
- `sigma=0.25` 控制能力边界的宽度。
- `gamma=0.2` 保留 20% uniform exploration，避免完全困在当前估计里。
- 论文在训练细节里说明：会先选 `3 * B` 个 frontier candidates，再按 `w_i` 采样 `(1-gamma)B` 个任务，其余 `gamma B` 从外部 uniform 采样。

### 它和 curriculum 的差别

| 采样方式 | 决策依据 | 主要问题 | SCALECUA 的转向 |
| --- | --- | --- | --- |
| Uniform | 每个任务概率相同 | 大池子里容易抽到已掌握或太难任务 | 按成功率估计动态重排 |
| DAPO-style filtering | 过滤 rollout 或样本 | 不直接建模 per-task capability | 在任务级别分配 rollout |
| Fixed curriculum | 预设难度顺序 | 难度不一定等于当前模型能力 | 用在线 pass-rate 追踪能力边界 |
| Frontier Sampling | `p_hat_i` 接近 0.5 | 依赖可靠 judge 和初始统计 | 配合 VeriGen 和 uniform exploration |

## 方法机制三：Visual Context Segmentation 管住长轨迹

### 三种训练包装方式

| 方式 | 训练样本数 | 优点 | 问题 |
| --- | --- | --- | --- |
| Trajectory-level | `O(n)` | 保留完整视觉历史 | 长序列拖慢 rollout 与训练 |
| Step-wise | `O(nT)` | 每步短、局部清晰 | 样本数随 turn 数膨胀 |
| Visual Context Segmentation | `O(nT/K)` | 近期视觉 + 完整文本 + 较少样本 | `K` 需要随任务和算力调 |

### 滑动窗口算法

```text
Input:
  episode with T turns
  K images to keep
  Delta removal threshold

State:
  token_id_stream
  text_history
  loss_mask
  rollout_logprob
  segments = []

for each turn t:
  sample assistant action from rollout policy
  append generated assistant tokens with loss_mask = 1
  execute action and receive screenshot observation

  if image_count > K + Delta:
    save current token_id_stream as one training segment
    drop the oldest Delta screenshots from text_history
    re-tokenize remaining history with loss_mask = 0
  else:
    append token diff for new observation with loss_mask = 0

assign the same trajectory reward to all segments
optimize each assistant response exactly once
```

- 这里最容易忽略的是 `loss_mask`。
- 历史 token 作为上下文保留，但不会重复训练。
- 这样可以减少视觉 token 压力，同时避免 step-wise 方式把同一条长轨迹切成过多训练项。

### 为什么 `K` 不是越大越好？

- 论文的 case study 是一个多应用 OSWorld 任务：把多个 Chrome 博客页保存成 PDF，并按标题命名到指定目录。
- `K=1` 时，agent 能机械保存文件，但容易忘记命名要求。
- `K=8` 或 `K=15` 时，早期终端、文件管理器、对话框等陈旧截图会干扰注意力，导致重复动作和执行时间膨胀。
- `K=5` 在 8 次 rollout 中成功 7 次；`K=3` 成功 5 次；`K=1/8/15` 都是 0/8。
- 这说明视觉历史不是越全越可靠，关键是保留“最近仍有因果关系的状态”。

## 训练目标与配置

### RL objective

论文使用 AgentRL + GRPO，并加 DAPO-style asymmetric clipping 与 reference KL：

```text
L(theta) =
  - E_{i in B} E_{j=1..n}
      sum_{s in S_ij} sum_{t in s}
        min(
          rho_t * A_hat_ij,
          clip(rho_t, 1 - eps_l, 1 + eps_h) * A_hat_ij
        )
    + lambda * KL(pi_theta || pi_ref)

rho_t = pi_theta(a_t | x_<t) / pi_rollout(a_t | x_<t)
```

| 符号 | 含义 |
| --- | --- |
| `B` | Frontier Sampling 选出的任务 batch |
| `n` | 每个任务 rollout 数，实验中为 8 |
| `S_ij` | 第 `i` 个任务第 `j` 条轨迹经过 VCS 后的 segments |
| `A_hat_ij` | 同一任务内的 group-relative advantage |
| `rho_t` | 当前 policy 与 rollout policy 的重要性采样比 |
| `eps_l / eps_h` | asymmetric clipping，下界 0.2，上界 0.28 |
| `lambda` | reference KL 系数，实验中为 `1e-4` |

### 训练配置表

| 配置项 | 数值 |
| --- | --- |
| 算法 | GRPO |
| 学习率 | `3e-6` |
| batch size | 32 tasks per iteration |
| rollouts per task | 8 |
| 最大 iteration | 1000 |
| rollout temperature | 0.8 |
| episode 上限 | 50 turns |
| 最大序列长度 | 40,000 |
| incomplete penalty | -0.2 |
| OSWorld visual window | `K=5` |
| ScienceBoard visual window | `K=8` |
| GPU 集群 | 8 节点，每节点 8 张 H800 80GB，共 64 GPU |
| rollout engine | vLLM, TP=2 |
| training engine | Megatron-LM, TP=4 |
| rollout/env concurrency | OSWorld 600；ScienceBoard 300 |

## 实验结果：主表说明了什么？

### OSWorld

| 模型 | Steps | Overall |
| --- | ---: | ---: |
| Qwen3.5-9B base | 未列 | 41.8 |
| ComputerRL-9B | 50 | 48.0 |
| EvoCUA-32B | 50 | 56.7 |
| Kimi K2.5 | 100 | 63.3 |
| Claude Sonnet 4.5 | 100 | 62.9 |
| SCALECUA-GLM-4.6V-Flash | 50 | 66.5 |
| SCALECUA-Qwen3-VL-8B | 50 | 67.7 |
| SCALECUA-Qwen3.5-9B | 50 | 68.7 |

- Qwen3.5-9B 从 41.8 到 68.7，绝对提升 26.9。
- 这个结果强的地方，不只是超过 32B 级开源 baseline。
- 更重要的是三种 backbone 都获得接近的提升，说明 pipeline 的贡献不完全绑定某一个模型。
- 但 OSWorld 仍是 Ubuntu 桌面任务，不能直接推断 Windows/macOS 商业软件栈。

### ScienceBoard

| 模型 | 观测 | Overall |
| --- | --- | ---: |
| Human | - | 60.3 |
| Claude Opus 4.6 | screen | 52.7 |
| GPT-4o | screen + a11y | 14.4 |
| Qwen3-VL-225B | screen | 6.5 |
| SCALECUA-GLM-4.6V-Flash | screen | 49.4 |
| SCALECUA-Qwen3-VL-8B | screen | 51.9 |
| SCALECUA-Qwen3.5-9B | screen | 54.0 |

- ScienceBoard 包含 KAlgebra、ChimeraX、GrassGIS、Lean、Celestia、TeXstudio 等专业软件。
- Qwen3.5-9B 在 TeXstudio 为 86.7%，在 Lean 为 19.0%。
- Lean 仍然很低，但已经高于表中 proprietary baseline 的上界。
- 这支持一个较窄结论：VeriGen 不只适合浏览器或办公软件，也能构造专业科学软件里的可验证任务。

## 消融与失败边界

### 系统组件消融

| 配置 | OSWorld |
| --- | ---: |
| Full SCALECUA | 68.7 |
| w/o VeriGen / Base | 43.9 |
| w/o Frontier Sampling | 63.7 |
| w/o Visual Context Segmentation | 62.2 |

- 去掉 VeriGen 的下降最大，因为任务池本身是 RLVR 的燃料。
- 去掉 Frontier Sampling 仍有 63.7，说明任务池可用，但 rollout 预算没对准学习边界。
- 去掉 VCS 为 62.2，说明效率机制也影响最终能力，不只是省算力。

### VeriGen 角色消融

| 配置 | Judge executable rate |
| --- | ---: |
| Full pipeline | 94.5 |
| w/o LLM Judge Agent | 62.3 |
| w/o Fix Agent | 78.1 |
| w/o Rule Validator | 86.2 |

- 静态语义判断最关键，去掉后可执行率下降 32.2 点。
- Fix agent 和 Rule Validator 的作用也明确，但它们更像可靠性增强。
- 这个表支持论文的一个隐含判断：自动任务生成如果缺少独立审查，很容易生成“看起来合理、执行时无效”的 verifier。

### 人类审计暴露的边界

| 审计项 | 数字 |
| --- | ---: |
| 样本数 | 160 |
| OSWorld agreement | 78.0% |
| ScienceBoard agreement | 90.0% |
| Overall agreement | 82.5% |
| False positives | 11 |
| False negatives | 17 |

- 82.5% agreement 是积极证据，但不是“judge 完全可靠”的证明。
- OSWorld 的 OS domain agreement 只有 60.0%，说明某些桌面状态更难被程序化判断。
- False negatives 多于 false positives，意味着一些真实成功可能被 judge 判失败。
- 对 RL 来说，这类噪声会带来保守训练压力：模型可能避免做某些人类看作成功但 judge 不承认的路径。

## Figure/Table 证据逐项解读

| 图表 | 支撑什么 | 不能证明什么 |
| --- | --- | --- |
| Figure 1 | OSWorld 68.7% 以及 task 数量扩展带来的性能上升 | 不能证明所有 GUI 域都会随任务数单调增长 |
| Figure 2 | 47-step 多应用任务展示模型能完成长链路桌面操作 | 单个 case 不能代表平均鲁棒性 |
| Figure 3 | VeriGen、Frontier Sampling、VCS 如何连接成端到端 pipeline | 框图不证明每个模块都有独立贡献 |
| Figure 4 | VCS 的 token stream、视觉窗口和 loss mask 机制 | 不说明最佳 `K` 在其他系统也相同 |
| Figure 6 | Frontier Sampling 比 uniform/DAPO/curriculum 更能维持 reward；VCS 2.83x 加速 | 曲线依赖任务池和 backbone，不是通用定理 |
| Figure 7 | 中等 `K=3-5` 的 pass@k 最好 | 只覆盖 OSWorld 与给定模型设置 |
| Table 2 | SCALECUA-Qwen3.5-9B OSWorld 68.7% | benchmark 仍可能与真实用户环境不同 |
| Table 3 | ScienceBoard 54.0%，专业软件也能受益 | ScienceBoard 总体离 human 60.3 仍有差距 |
| Table 4 | 三个模块和多 agent filtering 均有消融收益 | 消融没有穷尽所有替代设计 |
| Table 6 | judge 与专家标签 82.5% agreement | reward noise 仍会影响 RL |
| Table 8 | 训练与评测 near-duplicate 很少 | 无法排除更高层技能迁移造成的 benchmark 熟悉性 |

## 与相关工作的相对位置

### 和 OpenGVLab 的 ScaleCUA 区分

- 同名的 2025 ScaleCUA 更偏跨平台 computer-use 数据与模型。
- 本文的 SCALECUA 重点是 verifiable task synthesis 与 online RL efficiency。
- 两者都在“扩大 CUA 数据”上做文章，但本文更关心 RLVR 的判题器、采样和训练闭环。

### 和 ComputerRL、DART、EvoCUA 的区别

| 工作 | 重点 | SCALECUA 的差异 |
| --- | --- | --- |
| ComputerRL | 桌面 CUA 在线 RL | SCALECUA 进一步扩 task synthesis 与 VCS |
| DART | 高效多轮 RL 与数据选择 | SCALECUA 明确用 per-task frontier sampling |
| EvoCUA | 自演化在线 RL | SCALECUA 把失败/成功轨迹转成 VeriGen 任务再训练 |
| GUI-Genesis | 可验证 GUI 任务生成 | SCALECUA 强调 live OS containers 与大规模并行 |
| CUA-Gym | 可验证训练环境与任务 | SCALECUA 的独特处是 task generation + sampling + VCS 一体化 |

## 开源复现边界

### 公开资源

- GitHub 仓库提供：
  - `VeriGen/` 任务与 judge 生成 pipeline；
  - `scalecua_rl/` AgentRL 训练框架；
  - `osworld_env/` 在线 RL 环境层；
  - `osworld_eval/` OSWorld 与 ScienceBoard evaluation code；
  - `REPRODUCE.md` 复现评测步骤。
- README 列出 6 个 RL checkpoint 和 6 个 SFT 起点 checkpoint。
- VeriGen task dataset 也公开在 Hugging Face/ModelScope。

### 仍需注意的缺口

- 复现评测比复现完整在线 RL 更容易。
- `REPRODUCE.md` 明确说明：在线 RL 训练代码和环境层公开，但部分完整训练所需的 task pools、VM 镜像或服务配置不完全公开。
- ScienceBoard VM 下载体积大，文档标注解压后约 44GB。
- 某些 OSWorld 任务依赖 Google、Thunderbird、proxy 或本地文件缓存，实际复现需要准备测试账号和本地资产。

## 对 Agent 训练的研究启发

### 1. CUA 的难点正在从“会不会点屏幕”转向“可验证交互数据如何循环”

- 如果没有可执行 judge，在线 RL 只能停留在小规模人工任务或 LLM-as-judge。
- VeriGen 的价值在于把任务、setup、最终状态读取、metric 函数和验证记录绑在一起。
- 这比单独生成 instruction 更接近 RLVR 所需的数据单元。

### 2. Agent RL 的数据选择要状态化

- Frontier Sampling 把任务采样从静态 curriculum 变成状态估计问题。
- 每个任务的 `p_hat_i` 是训练状态的一部分。
- 对长期运行的 agent 系统，这意味着 data loader 不只是读取数据，而是一个持续更新的控制器。

### 3. 多模态长轨迹需要“记忆压缩”而不是“全部保留”

- VCS 的核心不是简单截断上下文。
- 它保留文本历史，限制视觉历史，并用 token-ID stream 避免 logprob 对齐被重分词破坏。
- 这对未来 browser agent、IDE agent、mobile agent 也有借鉴意义：历史不必全部以高成本视觉形式保留。

### 4. Reward correctness 仍是安全边界

- CUA 可以执行真实文件、浏览器、终端和办公操作。
- 如果 judge 错误奖励了危险或偏离目标的轨迹，RL 会把这种偏差放大。
- Table 6 的 false positives / false negatives 提醒我们：可执行 verifier 不是安全充分条件。

### 5. 更难的问题是跨环境泛化

- Ubuntu desktop 上学到的 action pattern，未必迁移到 Windows/macOS。
- 专业软件里的 GUI 状态常常依赖版本、插件、文件格式和本地缓存。
- 如果未来要把这类 pipeline 用于生产型 agent，还需要：
  - 环境版本锁定；
  - judge 沙箱隔离；
  - 任务来源审计；
  - reward hacking 检测；
  - 人类复核抽样机制。

## Detail inventory：这篇论文实际提供了哪些可复查细节？

| 维度 | 可提取细节 | 研究意义 |
| --- | --- | --- |
| 方法名 | VeriGen、Frontier Sampling、Visual Context Segmentation | 三个模块分别对应数据、采样、训练包装 |
| 数据规模 | OSWorld 22,322 个生成任务；ScienceBoard 5,529 个生成任务；最终近 3K RL 任务 | 说明作者不是只做小规模 toy verifier |
| judge 质量 | executable rate 94.5%；expert agreement 82.5%；FP 11、FN 17 | 同时给出积极证据和 reward 噪声边界 |
| benchmark | OSWorld、ScienceBoard | 一个偏通用桌面，一个偏专业科学软件 |
| backbone | GLM-4.6V-Flash、Qwen3-VL-8B、Qwen3.5-9B | 用三个视觉语言模型说明 pipeline 不只服务单一底座 |
| baseline | Kimi K2.5、EvoCUA、ComputerRL、Claude Sonnet/Opus、OpenAI CUA 等 | 覆盖开源和闭源 agent 参照 |
| 采样超参 | `mu=0.5`、`sigma=0.25`、`gamma=0.2`、`alpha=0.2` | 让 Frontier Sampling 可复现而不是概念描述 |
| 训练超参 | GRPO、LR `3e-6`、rollout `n=8`、max turns 50、KL `1e-4` | 支撑“在线 RL”不是黑盒榜单 |
| 系统资源 | 8 节点 64 张 H800；rollout 16 GPU；actor/ref 48 GPU | 说明结果背后有明显工程成本 |
| 复现说明 | 评测 checkpoint 与 dataset 公开；完整训练部分仍需额外环境资产 | 避免把开源仓库误读成端到端完全复现 |

## 关键设计逐点细读

### 为什么 judge 需要同时过静态审查和动态执行？

- 静态审查回答的是“任务语义是否合理”：
  - 指令是否歧义；
  - 目标是否能用环境状态表达；
  - verifier 是否检查了真正的目标属性。
- 动态执行回答的是“任务物理上是否可做”：
  - 文件是否能下载；
  - 应用是否能打开；
  - GUI 动作是否到达目标状态；
  - getter 是否能从最终环境取到可判定数据。
- 只做静态审查，容易生成逻辑漂亮但无法落地的 verifier。
- 只做动态执行，可能出现“刚好通过但语义不对”的任务。
- Table 4 中去掉 LLM Judge Agent 后 executable rate 从 94.5% 降到 62.3%，说明语义层审查直接影响可执行 reward 的可靠性。

### 为什么轨迹引导任务增强比普通合成更有价值？

- 普通合成只从文档或缓存出发，容易覆盖应用功能，但不一定覆盖模型当前失败点。
- 轨迹引导合成把模型行为反馈引入数据生产：
  - 失败轨迹暴露“模型卡在哪里”；
  - 成功轨迹暴露“模型已经掌握哪些局部技能”；
  - 任务拆分和任务组合让数据难度随模型移动。
- Figure 8 显示加入 trajectory-guided tasks 后，OSWorld test score 从 64.6% 提到 68.7%。
- 这个 4.1 点提升的意义是：task synthesis 不只是扩大数量，也能把训练分布对准模型学习状态。

### 为什么 Frontier Sampling 不是简单 hard-example mining？

- hard-example mining 常常偏向低成功率任务。
- 对 GRPO 来说，全部失败的 hard task 反而没有有效组内差异。
- Frontier Sampling 的目标不是“越难越好”，而是“最好有一半成功、一半失败”。
- 这和人类 curriculum 的直觉不同：
  - curriculum 以外部难度排序为中心；
  - Frontier Sampling 以当前策略的可学性为中心。
- 因此同一个任务在训练早期可能太难、训练中期刚好、训练后期太简单。
- 采样器必须随 `p_hat_i` 更新，才不会把 rollout 持续花在已经失去学习信号的任务上。

### 为什么 VCS 的收益不只是省显存？

- 论文报告的是 per-step 时间，而不只是显存占用。
- step-wise baseline 的 actor phase 为 485 秒，reference phase 为 241 秒，总计 750 秒。
- VCS `K=5` 后 actor phase 为 154 秒，reference phase 为 88 秒，总计 265 秒。
- 这说明 VCS 同时减少了：
  - actor 更新中要处理的训练 item 数；
  - reference policy 重新计算 logprob 的负担；
  - 长视觉上下文造成的尾延迟。
- 它不是把上下文粗暴截断，而是将视觉历史和文本历史分开处理：
  - 视觉只保留近期；
  - 文本保留完整；
  - 训练 mask 确保 assistant token 只被优化一次。

## 失败案例应该怎样读？

### 1. `K=1` 的失败不是模型不会做任务

- case study 里，`K=1` 仍能完成机械保存流程。
- 它失败在“按文章标题命名”这种跨步骤约束。
- 这说明过小视觉窗口损失的是任务级约束记忆，不只是局部 UI 定位。
- 对 agent 训练来说，这类失败常被误判成“规划弱”，但论文指出它也可能是上下文包装策略的问题。

### 2. `K=8/15` 的失败不是信息不足

- 大窗口保留更多截图，却导致重复动作和时间膨胀。
- 这说明陈旧视觉上下文可能成为干扰项。
- 多模态 agent 不是简单拥有更多感知就更强；它需要知道哪些视觉状态已经不再相关。
- 这对未来记忆系统也有启发：长期记忆如果没有 relevance gate，也可能强化错误注意。

### 3. judge false positive 的风险比榜单更关键

- 如果 judge 把错误完成判成成功，RL 会正向强化坏策略。
- 如果 judge 把真实完成判成失败，RL 会抑制可行策略。
- Table 6 里总共有 11 个 false positives 和 17 个 false negatives。
- 对一次 benchmark 报告来说，这些噪声可以作为局限。
- 对持续训练系统来说，这些噪声会累积成策略偏差，所以未来需要：
  - 定期抽样人工审计；
  - judge mutation test；
  - 对 reward 分布异常的任务降权；
  - 对高影响动作加入更严格的终态检查。

## 如果复现实验，我会优先检查什么？

| 检查项 | 为什么先查 |
| --- | --- |
| released checkpoint 是否能跑通 OSWorld sample | 先确认评测链路和 action parser 没问题 |
| `server_agent.py` 的 output-file resume 行为 | 长评测中断很常见，重复跑会浪费资源 |
| ScienceBoard VM 与 task assets 路径 | 这类专业软件任务最容易因本地资产缺失失败 |
| `dynamic_sampling.initial_pass_rate_file` | Frontier Sampling 依赖初始 pass-rate，缺失会改变训练分布 |
| `K` 和 `Delta` 是否匹配任务长度 | 窗口太小/太大都会改变结果 |
| judge 运行日志与 human audit 抽样 | 确认 reward 没有系统性误判 |
| 训练/评测 overlap audit | 防止 generated tasks 与 benchmark objective 过近 |

## 对 AI 安全和 Agent 系统的有限外推

### 1. 可验证 reward 会扩大能力，也会扩大错误奖励的影响

- SCALECUA 展示了 executable judge 的力量。
- 但 executable 不等于 aligned。
- 一个 judge 只检查“文件存在”，就可能奖励错误内容。
- 一个 judge 只检查“网页状态变化”，就可能忽略用户授权或数据泄露。
- 因此安全型 CUA 训练不能只追求 deterministic reward，还要追求 reward specification completeness。

### 2. Frontier Sampling 可以迁移到安全训练，但目标函数要变

- 对安全任务来说，`p≈0.5` 的任务可能是模型最容易学到边界的区域。
- 但如果失败代表真实危险动作，训练时不能直接让 agent 在真实环境中探索。
- 更合理的做法是：
  - 在沙箱中构造可逆副作用；
  - 对高危动作使用模拟器；
  - 用 policy gate 阻止越权执行；
  - 把安全 judge 和任务成功 judge 分开记录。

### 3. VCS 暗示 agent memory 需要分层

- GUI 任务里，近期截图承担状态定位。
- 长期文本历史承担目标、约束和已完成步骤。
- 安全任务还需要第三层：不可丢失的 policy constraints。
- 如果把这三类记忆混在同一上下文窗口里，模型可能因为视觉陈旧、文本过长或策略提示稀释而失控。
- SCALECUA 没有直接解决安全 memory hierarchy，但它给出一个工程信号：不同模态、不同时间尺度的信息应该有不同保留策略。

## 结论

- SCALECUA 的贡献不只是一个 68.7% OSWorld 模型。
- 它更像一份 CUA 在线 RL 的系统配方：
  - 用 VeriGen 解决可验证任务供应；
  - 用 Frontier Sampling 解决 rollout 预算浪费；
  - 用 Visual Context Segmentation 解决长视觉轨迹训练成本；
  - 用消融、专家审计和重叠审计说明 reward 与数据的边界。
- 最值得后续追问的是：当 verifier 有 10%-20% 噪声、环境扩到 Windows/macOS、任务影响真实账户或文件时，SCALECUA 这种闭环如何加入安全约束，而不是只优化最终成功率。
