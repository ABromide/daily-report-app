# Socratic-SWE：把 Coding Agent 的失败轨迹变成下一轮训练题

### 元信息

| 字段 | 内容 |
|---|---|
| 标题 | Socratic-SWE: Self-Evolving Coding Agents via Trace-Derived Agent Skills |
| 论文 | [arXiv:2606.07412](https://arxiv.org/abs/2606.07412) |
| 版本 | v1，2026-06-05 16:00:17 UTC 提交 |
| 作者 | Chuan Xiao, Zhengbo Jiao, Shaobo Wang, Wei Wang, Bing Zhao, Hu Wei, Linfeng Zhang, Lin Qu |
| 类型 | 论文 / Coding Agent 后训练方法 |
| 方向 | 大模型 Agent、软件工程 Agent、self-evolving post-training |
| 配套页面 | [Hugging Face Papers: 2606.07412](https://huggingface.co/papers/2606.07412) |

### TL;DR

- **这篇论文做什么**：Socratic-SWE 研究如何让软件工程 Agent 自我进化。它不只是让模型多做 SWE-bench 题，而是把 Solver 过去的解题轨迹、失败模式和有效修复动作蒸馏成结构化 skill，再让 Generator 用这些 skill 在真实仓库里造下一轮更有针对性的修复任务。
- **核心问题**：SWE 任务数据稀缺，固定 bug injection 或静态合成任务不能跟着模型能力变化；当 Agent 变强后，旧任务越来越少提供有效梯度，训练容易停滞。
- **怎么做**：同一个共享策略 `πθ` 轮流扮演 Generator 和 Solver。Solver 解题并产生 trace；trace 被蒸馏成 Agent Skill Registry；Generator 检索 skill，在仓库沙箱中构造任务和 verifier；任务经过格式、落地性、执行稳定性、语义可修复性四级 gate；最后用 solver-gradient alignment reward 选择对验证集方向有帮助的任务。
- **训练/实验设置**：作者使用 Qwen3.5-9B 作为 Generator/Solver，共享权重；Qwen3.6-27B 蒸馏 skill；每轮生成 12k validated training instances，跑 3 轮，总计 36k；评测覆盖 SWE-bench Verified、Lite、Pro 和 Terminal-Bench 2.0。
- **关键数字**：3 轮后 Socratic-SWE 在 SWE-bench Verified 达到 **50.40%**，比 Base Agent **+7.80**，比最强 baseline SSR **+3.40**；Lite 为 **36.67%**，Pro 为 **22.85%**，Terminal-Bench 2.0 为 **14.61%**。
- **证据强度**：论文给出主结果、5 轮扩展、组件消融、skill extractor 鲁棒性、Generator reward 消融、验证集大小敏感性和 compute overhead；其中去掉 Skill Registry 会让 Verified 从 50.40% 降到 46.20%，是最大消融损失。
- **局限**：评估是 fixed seed repositories 的 closed-world 设置；方法依赖可靠测试和沙箱；validation gradient 的代表性会影响课程选择；5 轮后 Verified 接近 52.00% plateau，不能证明开放世界持续自我提升。

### 研究问题：为什么 SWE Agent 需要“用失败造题”？

- 软件工程任务和短代码生成不同：
  - Agent 要在真实仓库里定位文件；
  - 读 issue 或 task spec；
  - 修改生产代码；
  - 运行测试；
  - 避免 regression；
  - 最后提交一个干净 patch。
- 这会让训练数据成为瓶颈：
  - 真实 GitHub issue 数量有限；
  - 人工验证成本高；
  - 静态 bug injection 常常只覆盖浅层模式；
  - 合成任务分布很难贴合当前 Agent 的弱点。
- 论文抓住的关键点是：
  - 每轮 Solver 解题都会留下大量 trace；
  - trace 记录了搜索、编辑、命令、测试、失败和修复；
  - 这些 trace 如果只被压缩成 reward，就丢掉了最有用的“为什么失败”。

因此 Socratic-SWE 的研究问题可以写成一句话：

> 能否把 coding agent 的历史解题轨迹转成结构化 skill，再用这些 skill 生成下一轮更贴近模型能力边界的 SWE 训练任务？

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| Solver trace 不应只用于 reward，而应成为课程演化材料 | Trace Collection 把成功与失败轨迹一起保留；Skill Extraction 总结策略、失败教训和修复原则 | 去掉 trace distillation 后，Verified 从 50.40% 降到 48.00% | Skill 仍由蒸馏模型总结，可能遗漏隐含上下文或误归因 |
| SWE 任务生成必须贴着当前 Solver 弱点走 | Agent Skill Registry 由 name、description、applicability、operations 四段组成，供 Generator 检索 | 去掉 Skill Registry 后降到 46.20%，损失 4.20 points | 固定仓库池下 registry 会逐渐覆盖已有缺口，后续信号变少 |
| 任务只“难”不够，必须对目标验证方向有帮助 | Generator reward 使用 `V_valid * cos(gτ, Gv)`，奖励与 held-out validation gradient 同向的任务 | Hardness/Uncertainty/Variance reward 分别低 3.00/2.20/1.60 points | 依赖 validation set 代表性；不同部署场景可能需要重选验证集 |
| Partial repair 信号比二元 pass/fail 更适合 SWE | Solver reward 拆成 full pass、failing tests repair rate、passing tests regression avoidance；GDPO 分组归一化 | 用 GRPO 替代 GDPO 后 Verified 从 50.40% 降到 48.60% | 仍要求可执行测试能正确反映任务语义 |
| Trace-derived skills 能转移到 terminal-native task | 同一训练信号不只学 issue repair，还学文件操作、命令链、环境导航等行为 | Terminal-Bench 2.0 从 10.11 提到 14.61，SSR 只到 12.36 | TB2 分数仍低，不能说明通用操作型 Agent 已成熟 |

### 图 1：从静态合成到 trace-skill-task 闭环

![Socratic-SWE motivation](/assets/2026/06/08/itm_1d035fe4c3bea590/motivation.png)

- 左侧传统范式是 open-loop：
  - 用静态规则、AST mutation 或 bug injection 生成任务；
  - Solver 解题；
  - trace 只被用来算 reward；
  - 下一批任务不理解 Solver 的新弱点。
- 右侧 Socratic-SWE 是 closed-loop：
  - Solver trace 进入 skill distillation；
  - skill 指导 Generator 造题；
  - 任务验证后进入 curriculum；
  - 新 Solver 再产生新 trace。
- 这张图的关键不是“多了一个 skill bank”，而是数据流方向变了：
  - 过去：`task -> trace -> reward -> update`；
  - 现在：`task -> trace -> skill -> task -> validation -> update`。

### 方法机制：Socratic-SWE 的四个状态对象

| 符号 | 含义 | 为什么重要 |
|---|---|---|
| `πθ` | 共享策略，同一个模型轮流当 Generator 和 Solver | 避免两个系统割裂；Generator 也被训练成会设计任务的 Agent |
| `R` | 仓库语料池，每个任务都要落在真实 repository sandbox | 防止任务漂浮在自然语言描述里，必须有可执行上下文 |
| `S` | Agent Skill Registry | 把历史 trace 压缩成可检索、可复用、可条件化的行为知识 |
| `D_t` | 第 t 轮 curriculum，元素是 `(r, τ, v)` | 每个训练样本绑定仓库、任务和验证信号 |

课程更新公式可以写成：

$$
(\tau', v') \sim \pi_\theta(\cdot \mid r, s, \mathcal{E}_t, \mathrm{role}=G)
$$

$$
\mathcal{D}_{t+1}
= \mathcal{D}_t \cup
\{(r,\tau',v') \mid \mathcal{V}_{valid}(\tau',v',r)=1\}
$$

变量解释：

- `r`：一个真实仓库沙箱；
- `s`：从 Skill Registry 检索出的 skill；
- `E_t`：Solver 在当前 curriculum 上留下的结果证据；
- `τ'`：Generator 新生成的修复任务；
- `v'`：对应的测试命令、检查器或 verifier；
- `V_valid`：四级 gate，只有全通过才进入下一轮训练。

### 图 2：完整训练闭环

![Socratic-SWE method overview](/assets/2026/06/08/itm_1d035fe4c3bea590/method.png)

这张方法图把论文贡献拆成两条边：

- **Solver side**：
  - 从 task pool 取任务；
  - 在 repository sandbox 里搜索、编辑、运行命令；
  - 产生 solving trace；
  - trace 暴露能力缺口。
- **Generator side**：
  - 从 Agent Skill Registry 检索 skill；
  - 在仓库中构造 targeted repair task；
  - 生成验证信号；
  - 通过 Verifier Gate 和 gradient alignment 过滤。

最重要的设计是中间的 Verifier Gate：

| Gate | 检查内容 | 如果缺失会怎样 |
|---|---|---|
| Format | `τ` 和 `v` 可解析、语法有效 | 训练样本会变成 prompt 噪声 |
| Grounding | 任务引用的文件、函数、模块真实存在 | Generator 会造出不存在的仓库问题 |
| Execution | verifier 可运行，且重复运行稳定 | reward 会被基础设施错误污染 |
| Semantics | verifier 能区分坏状态与修复状态，且至少存在一个有效 repair | 任务可能不可解、平凡或 reward hacking |

### Agent Skill Registry：skill 不是提示词，而是 trace 的结构化压缩

论文定义的 skill 有四个字段：

- `name`：技能名称；
- `description`：自然语言描述；
- `applicability conditions`：什么时候应该用；
- `operations`：按顺序执行的操作。

蒸馏流程有三步：

1. **Trace Collection**
   - 在 seed task set 上运行当前 checkpoint；
   - 记录 repository inspection、code edits、command execution、verification outcomes；
   - 成功 trace 和失败 trace 都保留。
2. **Skill Extraction**
   - 成功 trace 用来总结可泛化策略；
   - 失败 trace 用来总结能力缺口和修正原则；
   - 形式上是：

$$
\hat{\mathcal{S}}
=
\mathcal{M}_{distill}(\mathcal{T}^{+},\mathcal{T}^{-})
$$

3. **Registry Construction**
   - 按语义相似度去重；
   - 按 trace coverage 过滤；
   - 得到：

$$
\mathcal{S}
=
\mathrm{Dedup}(\hat{\mathcal{S}}, \delta_{sim})
=
\{s_1,\ldots,s_M\}
$$

这一步的意义在于：

- 它不是手写 taxonomy；
- 它也不是把完整 trace 塞回 prompt；
- 它把“模型曾经在哪些仓库模式上失败”变成可检索的任务生成条件。

### Generator reward：为什么不用“越难越好”？

Generator 先通过四级 gate 保证任务有效，但有效不代表有用。

论文进一步使用 solver-gradient alignment：

$$
R_G(\tau,v,r)
=
\mathcal{V}_{valid}(\tau,v,r)
\cdot
\cos(g_\tau, G_v)
$$

其中：

- `gτ`：Solver 在候选任务 `τ` 上 roll out 后估计出的策略梯度；
- `Gv`：held-out validation tasks 上的平均验证梯度方向；
- `cos(gτ, Gv)`：候选任务诱导更新是否朝向验证集改进方向；
- `V_valid`：无效任务直接归零。

这比 difficulty reward 更适合 SWE，原因是：

- 很难的任务可能只是依赖冷门库内部知识；
- 很容易的任务没有梯度；
- 半难不难的任务也可能和目标分布无关；
- SWE 的核心不是制造挫败，而是制造“对未来修复有用的挫败”。

论文附录的 reward 消融支持这一点：

| Generator reward | SWE-bench Verified | 相对 Full |
|---|---:|---:|
| Hardness `1 - p` | 47.40% | -3.00 |
| Uncertainty `1 - 2|p - 0.5|` | 48.20% | -2.20 |
| Variance Gaussian | 48.80% | -1.60 |
| Gradient-aligned | 50.40% | 0 |
| Gradient + Difficulty hybrid | 50.60% | +0.20 |

一个重要细节：

- hybrid 只多 0.20；
- 说明 cosine gradient 本身已经隐式排除了过易和过难任务；
- 因为全过或全挂都会让 advantage 接近无信息。

### Solver reward：把“部分修好”和“别弄坏”显式拆开

Solver 生成 patch 后，运行 verifier。

作者把测试集合拆成：

- `F`：原本失败的测试集合；
- `P`：原本通过的测试集合；
- `F✓`：patch 后通过的失败测试子集；
- `P✓`：patch 后仍通过的原通过测试子集。

Solver reward 是：

$$
r_S
=
\lambda_1 \mathbf{1}[F_\checkmark=F \wedge P_\checkmark=P]
+
\lambda_2 \frac{|F_\checkmark|}{|F|}
+
\lambda_3 \frac{|P_\checkmark|}{|P|}
$$

论文默认权重：

| 项 | 值 | 含义 |
|---|---:|---|
| `λ1` | 0.5 | 完整修复且无 regression |
| `λ2` | 0.3 | 原失败测试的修复比例 |
| `λ3` | 0.2 | 原通过测试的保留比例 |

这组 reward 的作用是：

- 让“修了一半”不是 0；
- 让“修坏其他功能”受惩罚；
- 让 long-horizon patch trajectory 比二元 pass/fail 有更密的训练信号。

作者没有直接用普通 GRPO 处理这个 reward，而是使用 GDPO：

- 每个 reward component 在组内单独归一化；
- 再聚合；
- 再做 batch normalization。

消融显示：

| Variant | Verified | 相对 Full |
|---|---:|---:|
| Socratic-SWE | 50.40% | 0 |
| w/o Skill Registry | 46.20% | -4.20 |
| w/o Trace Distillation | 48.00% | -2.40 |
| w/o GDPO, using GRPO | 48.60% | -1.80 |

### 算法流程：Input、State、循环、失败边界

```text
Input:
  shared policy πθ
  repository corpus R
  initial curriculum D0
  held-out validation set V
  iterations T
  group size K

State:
  Agent Skill Registry S
  Solver evidence Et
  task curriculum Dt
  validation gradient direction Gv

For t = 1 ... T:
  1. Solver Evidence:
     run current Solver on Dt
     collect traces: search, edit, shell commands, tests, pass/fail

  2. Skill Distillation:
     split traces into success traces T+ and failure traces T-
     distill recurring strategies and failure lessons into candidate skills
     deduplicate and filter by coverage to update S

  3. Generator Phase:
     for each sampled repository r and skill s:
       sample K candidate tasks (τk, vk)
       check format -> grounding -> execution -> semantics
       discard invalid, unstable, ungrounded, trivial, or unsolvable tasks

  4. Gradient Alignment:
     estimate Gv on trusted validation tasks
     estimate gτ for each accepted candidate
     score candidate by Vvalid * cos(gτ, Gv)

  5. Solver Training:
     add retained tasks to Dt+1
     train Solver with executable feedback reward rS
     use GDPO to normalize heterogeneous reward components

Output:
  trained SWE agent πθ

Failure boundaries:
  no reliable tests -> verifier gate weakens
  unrepresentative validation set -> generator reward targets wrong direction
  fixed repository pool -> skill registry saturates
  noisy trace distillation -> skill may encode spurious repair habits
```

### 实验设置：公平比较在哪里？

| 维度 | 设置 |
|---|---|
| Base model | Qwen3.5-9B |
| Generator/Solver | 同一个共享策略，角色条件化 |
| Skill extractor | Qwen3.6-27B |
| Agent harness | mini-swe-agent，SWE benchmark 只暴露 Bash |
| TB2 harness | little-coder |
| 训练轮数 | 3 |
| 每轮 validated instances | 12,000 |
| 总训练样本 | 36,000 |
| Validation set | BeyondSWE held-out 100 tasks |
| Group size | 8 |
| 学习率 | 1e-6 |
| GPU | 8 x A100-80G |
| 每轮 wall-clock | 约 15 小时 |

评测 benchmark：

| Benchmark | 规模/性质 | 论文中的用途 |
|---|---|---|
| SWE-bench Verified | 500 个人工验证仓库级 issue | 主指标，检验真实修复能力 |
| SWE-bench Lite | 300 个过滤 issue | 中等难度 SWE 修复 |
| SWE-bench Pro Public | 731 个复杂企业级软件问题 | 更复杂的 repository-level task |
| Terminal-Bench 2.0 | 沙箱终端任务 | 检验从代码修复迁移到 terminal-native agent 行为 |

Baseline 共五类：

- **SPIRAL**：把 SWE 修复改成缺陷注入者和修复者的零和博弈；
- **R-Zero**：Challenger-Solver co-evolution，用 majority vote 做 reward；
- **Absolute-Zero**：模型自己提出和解决代码任务，用执行验证做反馈；
- **Socratic-Zero**：Teacher-Solver-Generator 三角色，使用 397B Teacher；
- **SSR**：SWE 原生 self-play，通过 bug injection 和执行检查生成任务。

公平性控制：

- 所有方法使用同一 Solver 架构；
- 使用相同 mini-swe-agent harness；
- 使用相同 Terminal-Bench harness；
- 训练预算都是 12k instances x 3 iterations；
- 需要 seed task 的 baseline 用 10% SWE-smith；
- Socratic-SWE 只需要 seed repositories，不需要预先存在的 SWE task instances。

### 主结果：50.40% Verified 的含义

![Socratic-SWE main results](/assets/2026/06/08/itm_1d035fe4c3bea590/main_result.png)

| Method | Overall | Verified | Lite | Pro | TB2 |
|---|---:|---:|---:|---:|---:|
| Base Agent | 24.91 | 42.60 | 29.67 | 17.24 | 10.11 |
| SSR Iteration 3 | 28.51 | 47.00 | 34.00 | 20.66 | 12.36 |
| Socratic-SWE Iteration 1 | 27.82 | 46.20 | 33.00 | 19.70 | 12.36 |
| Socratic-SWE Iteration 2 | 29.64 | 48.40 | 35.33 | 21.34 | 13.48 |
| Socratic-SWE Iteration 3 | 31.13 | 50.40 | 36.67 | 22.85 | 14.61 |

主结果可以拆成三层读：

- **绝对能力**：
  - 50.40% Verified 对 9B coding agent 来说是强结果；
  - 但 TB2 仍只有 14.61%，说明 terminal-native 泛化很难。
- **相对 base**：
  - Verified +7.80；
  - Lite +7.00；
  - Pro +5.61；
  - TB2 +4.50。
- **相对 self-evolving baseline**：
  - SSR 是最强 baseline，Verified 到 47.00；
  - Socratic-SWE 比 SSR 多 3.40；
  - 差异主要来自 skill-guided targeting 和 gradient-aligned curriculum。

几个失败/反例也很关键：

- R-Zero 第 1 轮小幅提升后，第 3 轮跌到低于 Base；
- SPIRAL 和 Absolute-Zero 第 2 轮达到峰值后回退；
- Socratic-Zero 使用 397B Teacher，但第 3 轮相对第 2 轮下降；
- 这些现象支持作者判断：只靠自博弈或 Teacher 造题，不足以在 SWE 里稳定推进。

### 迭代扩展：为什么第 5 轮会 plateau？

![Socratic-SWE iteration scaling](/assets/2026/06/08/itm_1d035fe4c3bea590/iteration_scaling.png)

| 方法 | Iter 1 gain | Iter 2 gain | Iter 3 gain | Iter 4 | Iter 5 |
|---|---:|---:|---:|---:|---:|
| Socratic-SWE | +3.60 | +2.20 | +2.00 | 51.60% | 52.00% |
| SSR | +1.60 | +1.60 | +1.20 | 47.80% | 48.00% |

论文对 plateau 的解释是 closed-world：

- 仓库池固定；
- Skill Registry 逐渐覆盖 seed repositories 的常见缺口；
- 后续 Generator 更容易生成重复训练信号；
- 即使 gate 仍然通过，新增任务的边际价值下降。

这说明 Socratic-SWE 不是“无限自我提升”：

- 它能更充分榨取固定仓库池；
- 也能比 SSR 晚饱和；
- 但如果没有动态 repository augmentation 或跨仓库迁移，课程终究会撞到分布边界。

### Figure/Table 证据逐项解读

| 证据 | 支持什么 | 不能证明什么 |
|---|---|---|
| Motivation Figure | 说明论文真正改变的是 trace 的用途：从 reward-only 到 curriculum substrate | 不能证明 skill distillation 一定正确 |
| Method Figure | 展示 Solver、Skill Registry、Generator、Verifier Gate 和 task pool 的闭环 | 不能说明每个 gate 在真实工程中都低成本 |
| Main Result Figure/Table | 证明 36k budget 下 Socratic-SWE 四个 benchmark 都优于 baseline | 不能排除不同 base model 或 harness 下结果变化 |
| Iteration Scaling | 证明前 3-4 轮仍有持续增益，SSR 更早饱和 | 不能证明开放世界长期无限扩展 |
| Component Ablation | Skill Registry、Trace Distillation、GDPO 均有贡献 | 消融只在 Verified Iteration 3 上展示 |
| Reward Ablation | Gradient alignment 优于纯 difficulty reward | 依赖 validation set 构造，不是无条件最优 |
| Validation Size Ablation | 100 task 能稳定估计 `Gv`，20 task 噪声大 | 不能证明 BeyondSWE 对所有部署目标都代表性充分 |
| Compute Overhead Table | Gradient alignment 只增加约 8.4% 每轮耗时 | 仍需要 8 x A100-80G，非轻量方法 |

### 训练成本：这个方法贵在哪里？

论文给出的每轮 wall-clock 分解：

| Stage | Time | 占比 |
|---|---:|---:|
| Generator task proposal + validation | 4.2h | 28.0% |
| Solver rollout + execution feedback | 7.8h | 52.0% |
| Policy update | 1.7h | 11.3% |
| `Gv` computation，800 rollouts | 0.5h | 3.3% |
| Per-candidate scoring | 0.8h | 5.1% |
| Total | 15.0h | 100% |

关键判断：

- 成本大头不是 cosine scoring；
- 真正贵的是仓库环境中的 rollout、执行和验证；
- gradient alignment 额外 1.3h/iteration，约 8.4%；
- 作者用 +3.40 Verified over SSR 证明这个选择成本有回报。

但这也带来部署边界：

- 没有稳定 sandbox，不适合跑；
- 没有可重复测试，不适合跑；
- 没有足够 GPU 和执行环境，难以复现；
- 如果企业代码库测试慢且 flaky，Verifier Gate 会成为主要瓶颈。

### Worked example：OAuthLib skill 暴露了什么？

附录给了一个 OAuthLib repository-level skill 的缩写例子。

它包含四类 Solver 弱点：

- **Scope conversion**
  - Solver 能定位 `list_to_scope` 或 `scope_to_list`；
  - 但容易做 generic filtering、sorting、normalization；
  - 结果违反 OAuthLib helper contract。
- **Constructor storage**
  - endpoint/client constructor 有多个同类型字段；
  - Solver 容易交换字段、变换值、写错私有属性。
- **OAuth1 plumbing**
  - nonce、timestamp、realm、callback_uri 都像字符串；
  - 类型信息不足以区分语义。
- **OIDC inheritance**
  - OpenID Connect grant 包装 OAuth2 grant；
  - Solver 容易覆盖父类行为，而不是扩展或转发。

这例子说明 skill 不是“修 OAuthLib 的提示词”。

它实际编码的是：

- 仓库语义；
- 常见错误位置；
- Solver 历史失误；
- 任务生成边界；
- 验证反模式。

对 coding-agent 后训练来说，这比普通 bug injection 更有价值：

- bug injection 只问“哪里能造 bug”；
- Socratic-SWE skill 还问“当前 Solver 为什么会在这里修错”。

### 相关工作位置：它和 SWE-RL、SSR、SkillRL 的差异

| 方向 | 代表工作 | Socratic-SWE 的差异 |
|---|---|---|
| SWE RL | SWE-RL、SWE-Gym、SWE-Master | 这些工作强调 executable environments 和 RL pipeline；Socratic-SWE 更强调从历史 trace 反向塑造 task curriculum |
| 合成 SWE 数据 | SWE-smith、BugLab、SSR | 这些方法偏向 bug injection、mutation 或自博弈；Socratic-SWE 用 Solver 弱点和 gradient alignment 选择任务 |
| Self-evolving LLM | R-Zero、Socratic-Zero、Absolute-Zero | 这些方法多在数学、短代码或可验证环境里做自进化；Socratic-SWE 处理长轨迹 repository repair |
| Skill distillation | SkillRL、SKILL0、CODESKILL 类工作 | 这些工作把经验转 skill；Socratic-SWE 的重点是 skill 反过来驱动仓库级任务生成和训练 |
| Agentic RL | GRPO、GDPO、GiGPO、ARPO、SkyRL-Agent | Socratic-SWE 把 RL objective 放到完整 SWE Agent 的 trace、verifier、curriculum 闭环里 |

最值得注意的不是它“用了 skill”，而是它把三件事绑在一起：

1. **trace-derived skill**：来自真实 Solver 行为；
2. **execution-grounded validation**：任务必须可运行、可修复、稳定；
3. **validation-gradient alignment**：任务必须对目标验证方向有用。

少任何一个，论文消融都显示会退化。

### 证据边界与可复现性风险

这篇论文的边界很清楚：

- **Closed-world repository pool**
  - 作者自己承认固定 seed repository 会导致后期任务冗余；
  - 5 轮 scaling 已经看到 plateau；
  - 未来需要动态扩展仓库或跨仓库迁移。
- **Validation set dependency**
  - `Gv` 来自 BeyondSWE held-out 100 tasks；
  - 如果目标部署环境不同，Generator 可能优化错方向；
  - 20 tasks 的稳定性只有 0.34，说明估计噪声真实存在。
- **Executable verification assumption**
  - SWE-bench 和 TB2 有明确 verifier；
  - 真实企业仓库可能测试慢、覆盖差、flaky、缺 oracle；
  - 这会直接削弱 gate 和 reward。
- **Scale and infra cost**
  - 每轮 15 小时，8 x A100-80G；
  - 三轮约 45 小时；
  - 这不是个人开发者轻易复现的方案。
- **Trace distillation reliability**
  - Skill extractor 默认 Qwen3.6-27B；
  - 虽然 Qwen3.5-9B 自提取只低 0.60 points；
  - 但 skill 是否忠实总结失败原因，仍依赖模型判断。

### 研究者视角：这篇论文真正推进了什么？

- 它把 coding agent 后训练从“收集更多题”推进到“动态选择下一批题”。
- 它把 agent trace 从日志、debug 材料、reward 输入，提升为 curriculum substrate。
- 它说明 SWE 领域的 self-evolution 不能只追求可执行，还要追求任务与模型能力边界对齐。
- 它给了一个很实用的判断：
  - 难题不等于好题；
  - 可运行题不等于好题；
  - 能让 Solver 更新方向贴近验证目标的题，才是更好的训练题。

对后续 Agent 研究，至少有四个可继续追问的问题：

1. **Skill 是否应该跨仓库迁移？**
   - OAuthLib 的 scope helper skill 很仓库特定；
   - 但“同类型参数混淆”“父类行为被覆盖”有跨仓库价值；
   - 未来需要区分 repository-specific skill 和 transferable repair skill。
2. **Validation gradient 会不会过拟合？**
   - `Gv` 是稳定参照物；
   - 但也可能成为隐式 leaderboard；
   - 需要更多 target distribution、多验证集或在线切换机制。
3. **真实工程中的 flaky tests 怎么办？**
   - 论文有 stability reruns；
   - 但大型企业仓库的 flaky 和长耗时测试更复杂；
   - Verifier Gate 可能需要不确定性建模，而不是二元过滤。
4. **Agent 安全如何进入这个闭环？**
   - 现在 reward 主要奖励修复能力；
   - 但 coding agent 还会写危险命令、读敏感文件、过度改动；
   - 未来 skill registry 也可以记录安全失败模式，并让 Generator 构造权限、最小修改、secret handling 相关任务。

### 一句话结论

- Socratic-SWE 最有价值的地方，不是 50.40% 这个单点分数。
- 它真正展示的是一种可复用的训练思想：
  - **让 Agent 的失败轨迹成为下一轮任务分布的设计材料。**
- 在 coding agent 越来越像真实开发者的背景下，这个方向比单纯扩展静态 benchmark 更接近长期后训练的核心问题。
