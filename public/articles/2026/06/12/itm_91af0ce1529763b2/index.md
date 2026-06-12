# EurekAgent：当科学发现 Agent 的瓶颈从 workflow 转向 environment

## 元信息

| 项目 | 内容 |
|---|---|
| 论文 | EurekAgent: Agent Environment Engineering is All You Need For Autonomous Scientific Discovery |
| 作者 | Amy Xin, Jiening Siow, Junjie Wang, Zijun Yao, Fanjin Zhang, Jian Song, Lei Hou, Juanzi Li |
| arXiv | arXiv:2606.13662v1 |
| 日期 | 2026-06-11 17:56:35 UTC |
| 类型 | 论文 + 开源系统 |
| 方向 | 大模型 Agent；自主科学发现；环境工程；CLI agent orchestration |
| 原文 | <https://arxiv.org/abs/2606.13662> |
| HTML | <https://arxiv.org/html/2606.13662v1> |
| 代码 | <https://github.com/THU-Team-Eureka/EurekAgent> |

## TL;DR

- **EurekAgent 的核心判断**：随着 Claude Code、Codex 这类通用 CLI agent 变强，自主科学发现的主要瓶颈正在从“设计复杂研究 workflow”转向“设计 agent 所处的环境”。
- **所谓 environment engineering**：不是继续规定 agent 每一步怎么想，而是配置资源、权限、artifact、预算、人类监督接口，让 agent 在可控边界内自由探索。
- **系统主循环很简单**：`Prepare -> [Propose_r -> {Implement_{r,p}}]_{r=1}^{R}`，每轮先提出最多 `P` 个候选假设，再并行实现、提交、评分、排名，并把历史结果写回共享 artifact。
- **四个环境维度**：permissions engineering 防止 evaluator 泄露和 score tampering；artifact engineering 用文件系统与 Git history 做共享长期记忆；budget engineering 控制时间、API cost、GPU；HITL engineering 通过 TUI 与 web monitor 支持人类观察和干预。
- **实验覆盖三类 metric-driven research task**：数学优化、Kernel engineering、机器学习工程。Table 1 报告 EurekAgent 在所有数学与 kernel 任务上刷新 SOTA，并在选定 MLE-Bench Lite 子集上 any-medal rate 达到 85.71%。
- **关键数字**：Circle Packing 从 previous best AI 2.635986 到 2.635999；Erdos minimum overlap 从 0.380876 到 0.380870；1st autocorrelation inequality 从 1.502863 到 1.502861；TriMul median runtime 从 2247.78 us 到 2005.03 us；MLE-Bench 子集从 71.43% 到 85.71%。
- **成本与复现边界**：数学三任务使用 Claude Code + GLM-5.1，平均 API 成本低于 17 美元，26-circle packing 约 11 美元；但实验仍聚焦有可执行 evaluator 的 metric-driven task，尚不能直接外推到开放式、难验证的科学发现。

## 1. 问题意识：为什么不是再造一个 research workflow？

### 1.1 现有系统大多在“规定行为”

自主科学发现系统通常会明确规定 agent 如何推进：

- 维护候选程序 population。
- 按 evaluator feedback 做 mutation / selection。
- 建立 solution tree。
- 让多个角色分别做 proposal、critique、implementation。
- 定期反思、总结、再规划。

这些 workflow 有效，但也带来一个问题：

| 设计方式 | 优点 | 风险 |
|---|---|---|
| 显式 workflow | 可解释、可控、可复现 | 限制强 agent 自己发现策略 |
| 多角色 agent | 分工清楚 | 协调成本与角色假设很重 |
| 演化框架 | 适合程序搜索 | 对非程序化研究问题不一定自然 |
| 自反思模块 | 可积累局部经验 | 容易变成固定 prompt scaffold |

EurekAgent 反过来问：

> 如果通用 CLI agent 本身已经能读代码、搜资料、跑实验、修 bug，那么系统是不是应该少规定 workflow，多设计环境边界？

### 1.2 论文的关键背景判断

作者引用 ResearchClawBench 的现象：

- 在 40 个研究任务、10 个不同领域上，Claude Code 和 Codex 作为 standalone general-purpose agents，已经超过多个 research-specific agent systems。
- 这说明“能力”可能已经部分存在于通用 agent 中。
- 真正困难的是让这种能力在科学发现任务里可靠释放。

但科学发现不能只看分数：

- agent 可能污染 evaluator。
- agent 可能篡改 artifact。
- agent 可能 reward hack。
- agent 可能复制同轮 peer solution，造成虚假多样性。
- agent 可能在长期运行中耗尽预算却没留下可审计轨迹。

因此 EurekAgent 的主张不是“放任 agent”，而是：

- 在探索上给自由。
- 在评价上给隔离。
- 在进度上给持久 artifact。
- 在成本上给边界。
- 在监督上给人类可介入接口。

## 2. 核心概念：environment engineering 是什么？

论文借用 Gibson 的 affordance 视角：环境决定行动者可以做什么、容易做什么、难以做什么。

在 autonomous scientific discovery 中，一个环境应该同时做两件事：

| 放大 productive affordances | 抑制 harmful affordances |
|---|---|
| 开放式探索 | evaluator 泄露 |
| 准确奖励反馈 | score tampering |
| artifact 管理 | 同轮抄袭 |
| inter-agent collaboration | GPU 竞争 |
| 人类监督 | 无边界成本消耗 |
| 可恢复长运行 | 无日志、不可审计 |

这就是 EurekAgent 的设计哲学：

> 不把 agent 当需要逐步遥控的机器人，而是把它当有能力的研究者；系统要提供实验室、记录制度、经费限制、安全边界和导师接口。

## 3. 系统总览：Prepare / Propose / Implement

### 3.1 主循环公式

论文把 EurekAgent 的外层调度写成：

```text
Prepare -> [ Propose_r -> { Implement_{r,p} }_{p=1}^{P_r} ]_{r=1}^{R},  P_r <= P

变量:
  R   = 最大迭代轮数
  P   = 每轮最多并行 implementation sessions
  r   = 第 r 轮
  p   = 第 p 个并行实现会话
```

这个公式很重要，因为它说明 EurekAgent 没有复杂的内置研究策略：

- 外层只负责 stage transition。
- 内层研究策略交给 CLI agent。
- 系统负责记录、隔离、评分、预算和恢复。

### 3.2 Prepare：先确保运行环境可信

Prepare stage 只在开始时执行一次。

它做的事情包括：

- 读取 problem description。
- 读取 submission requirements。
- 读取 optional initial code。
- 测试 hidden evaluation service。
- 安装或验证 runtime dependencies。
- 如果设置含糊或 broken，暂停并请求人类澄清。
- 写 preparation summary 与 completion artifact。

这里的重点是：不要让优化从不可靠环境开始。

如果 evaluator、依赖、提交格式、初始代码本身有问题，后面的高分都可能是噪声。

### 3.3 Propose：把历史证据压缩成下一轮假设

每一轮开始时，proposal session 会读取：

- 任务输入。
- preparation summary。
- previous rounds 的 ranked best solutions。
- previous-round workspaces。
- web search / browsing 获得的相关文献或开源方案。

然后它产出：

- 最多 `P` 个候选 hypotheses。
- 每个 hypothesis 的 implementation-ready description。
- 一个 proposal manifest。

这一步是 fan-in：

- 把过去实验结果聚合起来。
- 把外部信息纳入候选。
- 把下一轮探索方向变成并行可执行任务。

### 3.4 Implement：并行探索并把分数写回历史

Implement stage 是 fan-out。

对每个 hypothesis：

- 系统启动一个独立 implementation agent session。
- 每个 session 有单独 workspace。
- agent 可根据 hidden evaluator feedback 迭代、debug、修改方案。
- 提交通过 secure evaluation service 评分。
- 系统记录所有 evaluated submissions。
- 系统维护 best valid result。
- 结束后自动排序有效提交。
- ranked solution history 写回下一轮共享上下文。

这个设计试图兼顾：

- 并行多样性。
- 同轮隔离。
- 跨轮知识积累。
- 可审计 score history。

## 4. 四类环境工程

### 4.1 Permissions Engineering：给工具，但锁住高风险边界

EurekAgent 给 agent 的能力很强：

- 可配置 Python 环境。
- workspace-level shell access。
- web search 和 browser tools。
- 访问同一 run 的 previous-round artifacts。
- 对 GPU 任务可申请 GPU。

但它同时设了边界：

| 风险 | 环境约束 |
|---|---|
| 修改外部文件 | 每个 run 在 Docker container 中执行 |
| 读取 hidden tests | hidden evaluator 不挂载到 agent workspace |
| 篡改官方分数 | controller-owned result files 阻止 agent 修改 |
| 同轮抄袭 | parallel implementation sessions 不能看同轮 peer workspace |
| GPU 争用 | 默认 deny，必须通过 GPU helper API 获取 lock |

这部分是论文最像 AI 安全工程的一节。

它承认自主 agent 需要强工具，但把关键安全点从 prompt 移到环境权限：

- agent 可以提交候选。
- agent 可以收到分数。
- agent 不能读 evaluator。
- agent 不能改 controller-owned official result。

### 4.2 Artifact Engineering：文件系统 + Git history 作为长期记忆

EurekAgent 把 artifact 当作 agent 协作与记忆的基础设施。

保存的内容包括：

- preparation summaries。
- proposal manifests。
- hypotheses。
- solution code。
- evaluator feedback。
- scored submissions。
- web-search history。
- ranked historical solutions。
- session logs。
- run snapshots。

另外，每个 session 内用 Git commits 跟踪 solution evolution。

作者要求 commit message 说明：

- 当前 standalone solution 是什么。
- 相比上一版改了什么。

这比单纯保留 chat transcript 更可靠：

- 后续 agent 能直接 inspect code。
- 人类能看见结果如何演化。
- 中断后可恢复。
- 错误路径也能成为下一轮参考。

### 4.3 Budget Engineering：预算不是停止规则，而是操作接口

EurekAgent 控制两类预算：

- wall-clock time。
- API cost。

时间预算细分到：

- proposal session time limit。
- implementation session time limit。

agent 获取时间信息有两种方式：

1. 主动：调用 time-checking helper API。
2. 被动：deadline 接近且 deliverable 缺失时，系统注入 warning。

API cost 的设计更谨慎：

- 系统跟踪 token usage。
- 不把 token consumption 暴露给 agent。
- 达到 cost limit 时终止 run。
- 保留当前 workspace 作为 final snapshot。

预算也支持恢复：

- 记录 session id。
- 记录 status。
- 记录 elapsed time。
- 记录 effective budget。
- 中断后从最新 filesystem state 继续。
- 用户可增加 resume time。

这说明预算不是简单 kill switch，而是长程研究流程的控制面。

### 4.4 Human-in-the-loop Engineering：不是接管，而是可观察与可打断

EurekAgent 提供两类接口：

| 接口 | 作用 |
|---|---|
| TUI | 看每个 approach 的实时输出，进入 session，给 active agent 发消息 |
| Web monitor | 看 run 状态、score evolution、per-round best、global best、budget usage、完整 transcript |

这保留了 agent autonomy：

- 默认可以全自动跑。
- 人类不需要每一步确认。
- 但当研究方向跑偏、依赖坏掉、预算异常时，人类可以介入。

## 5. 代码项目读取：README 里的工程契约

### 5.1 运行依赖

仓库 README 把 EurekAgent 定位为 Docker-first 系统。

主要依赖：

- Docker。
- Node.js 22+。
- Claude Code。
- Python 3.12。
- uv。
- 可选 MCP：web-search-prime 与 Playwright。

README 说明它驱动 off-the-shelf CLI agents：

- host 上安装 Claude Code，用于问题作者ing与 `/generate-inputs` skill。
- agent container 中也预装 Claude Code。
- `.claude/settings.json` 里配置鉴权、base URL、默认模型等。

### 5.2 新问题需要的文件

一个问题目录至少需要：

| 文件 | 用途 |
|---|---|
| `INSTRUCTION.md` | 问题描述、优化目标、约束、run contract |
| `SUBMISSION_FORMAT.md` | 候选 JSON schema、score semantics |
| `hidden_eval_dir/evaluate.py` | private evaluator |
| `initial.py` | 初始代码，推荐提供 |
| `run.sh` | 启动脚本，推荐提供 |

`evaluate.py` 必须定义：

```python
grade_submission(submission_path: str, context: dict) -> dict
is_better(new_score: float, old_score: float) -> bool
```

这说明 EurekAgent 的边界很明确：

- 它不替用户定义科学问题。
- 它要求用户提供可执行 evaluator。
- 它围绕 metric-driven optimization 运转。

### 5.3 Docker runtime model

README 明确区分两个容器：

| 容器 | 能看到什么 | 作用 |
|---|---|---|
| Agent container | `/workspace` | 跑 Claude Code sessions、写方案 |
| Grader container | `/workspace` + read-only `/hidden_eval` | 跑 secure evaluation server |

这个设计与论文的 permissions engineering 一致：

- agent 能写 submission。
- grader 能读 hidden evaluator。
- agent 不能直接看 hidden evaluator。

## 6. 实验结果：Table 1 的证据链

### 6.1 总览表

论文 Table 1 汇总了五个任务/子集。

| Domain | Task | Previous Best AI | EurekAgent | 方向 |
|---|---|---:|---:|---|
| Mathematics | Circle Packing | 2.635986 | **2.635999** | 越高越好 |
| Mathematics | Erdos Min. Overlap | 0.380876 | **0.380870** | 越低越好 |
| Mathematics | 1st Autocorr. Ineq. | 1.502863 | **1.502861** | 越低越好 |
| Kernel Eng. | TriMul | 2247.78 us | **2005.03 us** | 越低越好 |
| Machine Learning | MLE-Bench subset | 71.43% | **85.71%** | 越高越好 |

作者还报告：

- 数学三任务平均 API 成本低于 17 美元。
- 26-circle packing API 成本最低，为 11 美元。
- 所有实验使用 Claude Code 作为 CLI agent。
- GLM-5.1 作为 base LLM。

### 6.2 数学任务：小数点后的 SOTA

三个数学任务都属于可执行 metric-driven optimization：

- Circle Packing：优化圆的放置，总半径/packing score 越高越好。
- Erdos minimum overlap：寻找更小 overlap，越低越好。
- 1st autocorrelation inequality：目标值越低越好。

这些改进幅度看起来小，但在数学优化 SOTA 上通常意味着：

- 已接近极限。
- evaluator 很明确。
- 需要大量局部尝试。
- agent 的价值在于自动搜索与代码化验证。

### 6.3 Kernel engineering：TriMul 速度优化

TriMul 任务结果：

| Rank | Agent / Solution | LLM | Median us | Mean us |
|---:|---|---|---:|---:|
| 1 | EurekAgent-CUDA Graph | GLM-5.1 | **2005.0307** | **2014.1874** |
| 2 | EurekAgent-INT8 BMM | GLM-5.1 | **2006.9998** | **2013.5141** |
| 3 | EurekAgent-Fused Front-End | GLM-5.1 | **2016.5718** | **2020.2674** |
| 4 | EurekAgent-Triton Autotune | GLM-5.1 | **2030.6877** | **2041.5578** |
| 5 | strongest regraded leaderboard solution | N/A | 2096.0441 | 2105.1655 |
| 6 | TTT-Discover | gpt-oss-120b | 2247.7849 | 2248.2307 |

作者总结：

- top four EurekAgent solutions 全部低于 2031 us。
- 最优解比 strongest regraded leaderboard 约快 4.3%。
- 比 TTT-Discover 约快 10.8%。

这支持“不是单个 lucky candidate”的判断，因为多个独立方向都超过 prior best。

### 6.4 MLE-Bench Lite 子集

作者从 MLE-Bench Lite 的 22 个 competition 中选 7 个：

- 按 prior-agent medal rate 估计难度。
- 分 Easy / Medium / Hard。
- 采样 2 Easy、2 Medium、3 Hard。
- 覆盖图像、文本、音频、表格预测。

结果：

| Rank | Agent | LLM | Any Medal | Gold | Above Median |
|---:|---|---|---:|---:|---:|
| 1 | EurekAgent | GLM-5.1 | **85.71%** | **71.43%** | **100.00%** |
| 2 | AIBuildAI | Claude-Opus-4.6 | 71.43% | 57.14% | 85.71% |
| 3 | Famou-Agent | Gemini-2.5-Pro | 71.43% | 57.14% | **100.00%** |
| 4 | Famou-Agent 2.0 | Gemini-2.5-Pro | 71.43% | 65.39% | 95.24% |
| 5 | LoongFlow | Gemini-3-Flash-Preview | 71.43% | 57.14% | 71.43% |
| 6 | CAIR MARS+ | Gemini-3-Pro-Preview | 71.43% | **71.43%** | **100.00%** |

这个表的边界也要读清楚：

- EurekAgent 是 7 个任务的子集，不是完整 MLE-Bench。
- baseline 如果有多 run，作者取 reported range 上界。
- 结果证明它在该子集有竞争力，但不等于完整 leaderboard 领先。

## 7. Figure / Table 证据解读

### 7.1 Figure 1：26-circle packing score evolution

Figure 1 展示 26-circle packing 的分数演化。

它的作用不是展示界面，而是说明：

- agent 不是一次性生成答案。
- 分数随 rounds 和 implementations 逐步提高。
- ranked history 能把有效改进带入下一轮。
- 环境允许探索，同时保存最佳候选。

### 7.2 Figure 3：Web monitor

Figure 3 是 web monitor。

它承载的证据是可观察性：

- run status logs。
- score evolution。
- per-round best approaches。
- global best approaches。
- budget usage。
- session transcripts。

这说明 HITL engineering 不只是“可以聊天”，还包括研究过程审计。

### 7.3 Figure 4：TUI

Figure 4 是 terminal UI。

它展示：

- prepare-stage snapshot。
- implement-stage snapshot。
- 三个 parallel implementation sessions。
- 用户可进入单个 session inspect detail。
- 用户可向 agent 发消息。

这解释了论文所说的“preserve autonomy while allowing intervention”。

### 7.4 Table 5：超参数设置

附录 Table 5 给出 `R`、`P` 与时间预算：

| Task | R | P | t_propose | t_implement | Notes |
|---|---:|---:|---|---|---|
| Circle Packing | 5 | 3 | 20 min | 120 min | - |
| Erdos Min. Overlap | 8 | 3 | 20 min | 120 min | - |
| 1st Autocorr. Ineq. | 8 | 3 | 20 min | 120 min | - |
| TriMul | 13 | 3 | 20 min | 160 min | A100 evaluation |
| MLE-Bench Lite | 12 | 3 | 20 min | 100 min | one GPU per run |

这张表很重要，因为它给出成本与搜索强度边界：

- 每轮最多 3 个并行实现。
- 数学任务 5-8 轮。
- kernel engineering 13 轮。
- MLE-Bench Lite 12 轮。

## 8. 核心判断与证据边界

### 8.1 论文真正证明了什么？

比较强的结论：

- 在有明确 evaluator 的 metric-driven task 中，环境工程足以把强 CLI agent 转化成有效搜索系统。
- Docker 隔离、hidden evaluator、artifact history、budget control、HITL monitor 是自主科学发现系统的一等设计对象。
- 对若干数学/kernel/MLE 子任务，EurekAgent 取得了高于 previous best AI 或 public baseline 的结果。

### 8.2 论文没有证明什么？

还不能推出：

- 任何开放式科学问题都能被 EurekAgent 自动解决。
- environment engineering 可以替代 domain expertise。
- 只要有 Claude Code + Docker 就能稳定复现所有 SOTA。
- 它比所有 research-specific workflows 都更优。
- 它在真实高风险科学领域已经足够安全。

主要原因：

- 任务都需要可执行 evaluator。
- hidden evaluator 的设计质量由用户决定。
- metric 可能与真实科学价值不一致。
- long-horizon agent 仍可能 reward hack。
- 论文没有系统消融四类 environment engineering 的单独贡献。

## 9. 与 Agent / AI 安全的关系

### 9.1 对 Agent 运行时设计的启发

EurekAgent 把 agent runtime 分成几个明确平面：

| 平面 | 设计问题 |
|---|---|
| 权限平面 | agent 能访问什么，不能访问什么 |
| 评估平面 | 分数如何产生，谁能修改 |
| artifact 平面 | 历史如何被保存和复用 |
| 预算平面 | 时间、GPU、API cost 如何控制 |
| 人类接口 | 何时观察、何时介入、如何恢复 |

这比“写更好的 system prompt”更接近工程现实。

### 9.2 对 AI 安全的启发

论文中的风险不是抽象风险，而是具体操作风险：

- evaluator leakage。
- score tampering。
- artifact manipulation。
- same-round solution copying。
- uncontrolled compute contention。
- hidden procedural violations。

这些风险和 AI safety 里的 agent containment / tool-use safety 高度相关。

一个重要推论是：

> 对强 agent 的安全控制，不应只靠“告诉它不要作弊”，而应通过环境把作弊路径从 affordance space 中移除。

### 9.3 对后续研究的挑战

下一步值得追问：

1. **消融**
   - permissions、artifact、budget、HITL 哪个贡献最大？
   - 如果只保留 Docker + hidden evaluator，性能下降多少？
2. **对抗性 evaluator**
   - agent 是否会利用 grader latency、文件名、缓存、副作用？
   - 是否能检测 subtle reward hacking？
3. **开放式科学**
   - 没有单一 metric 时，environment engineering 如何定义 feedback？
   - 论文写作、实验设计、统计检验能否进入同一闭环？
4. **多模型与多 CLI agent**
   - README 提到欢迎 Codex adapter。
   - 不同 agent 的工具偏好、失败模式和预算曲线可能不同。

## 10. 结论

EurekAgent 的价值不只是刷新几个 benchmark 数字。

更重要的是它提出了一个清晰的 Agent 系统设计方向：

- 不再把 autonomous research agent 的核心只放在 prompt、role、workflow。
- 把环境当成决定 agent 行为的主要杠杆。
- 用权限、artifact、预算、人类监督把强 CLI agent 放进可探索、可审计、可恢复、可控成本的科学发现实验室。

它的边界也清楚：

- 目前最适合 metric-driven、可执行 evaluator 的任务。
- 对无明确 metric 的科学探索还只是方向性启发。
- 对 reward hacking 的防御需要更多红队和消融。

但如果未来的研究 agent 越来越像“会使用完整开发环境的研究者”，那么 EurekAgent 提出的 environment engineering 很可能会成为比 workflow prompt 更基础的一层。
