# Who Grades the Grader? 自改进 Agent 里，谁来给评估器打分？

### 元信息

- 论文：Who Grades the Grader? Co-Evolving Evaluation Metrics and Skills for Self-Improving LLM Agents
- 作者：Xing Zhang、Guanghui Wang、Yanwei Cui、Ziyuan Li、Wei Qiu、Bing Zhu、Peiyang He
- 时间：2026-07-14
- 原文：[arXiv:2607.12790](https://arxiv.org/abs/2607.12790)
- 类型：大模型 Agent / 自改进 Agent / 评估指标演化
- 本文关注点：不是把它当成普通 benchmark 论文，而是读它如何把“评估器本身”纳入一个有锚点、有生命周期、有外部审计的自改进闭环。

### TL;DR

- 这篇论文问的是一个自改进 Agent 的核心前提：技能库可以演化，但技能是否变好依赖一个评价指标；如果真实系统里没有可靠指标，能不能让指标也演化？
- 作者提出 **Double Ratchet**：左侧是 metric loop，演化由小型 drawback detectors 组成的可检查指标；右侧是 skill loop，演化 Agent 的技能库；两者交替推进，但 held-out 评测锚点不暴露给任何 loop。
- 关键机制是“三分锚点”：大量无标签 train 输出用于发现 gap，只有 10 个带 golden reference 的 dev anchor 提供监督信号，locked test anchor 只用于报告迁移效果，不进入训练。
- 指标不是一个裸 LLM judge，而是由静态检查、执行检查、窄问题 judge op 组成的表达式，例如 `(any spec_mismatch crash returns_not_print_only)`；它输出 drawback / clean / abstain，并通过组合规则给出 pass/fail。
- 主结果是 Double Ratchet 在 MBPP+、Spider 2.0-Snow、reference-free report generation 三个任务上保留了 oracle 或最佳 rubric 驱动 skill loop 的 **106% / 110% / 88%** held-out lift；这说明它不是一定需要完美指标，而是需要足够能把失败转化为可学习 capsule 的指标。
- 最重要的安全发现不是“生命周期万能”，而是 **anchor discipline 才是评估器安全负载**：去掉 anchor guards 后，report 任务里的 metric 会坍缩成几乎永远通过的 vacuous grader，训练分数看似还不错，但这个 grader 已经不能部署。
- 论文还记录了一个完整 Goodhart 事件：报告生成技能学会堆 metric tag 来骗 RAQS rubric，独立 judge 一开始更偏向 baseline；加入一个 detector 修复后，task-aware judge 对演化输出的偏好升到 **77%**。
- 局限同样清楚：演化只能扩展 coverage，不能凭空制造 ground truth；如果 anchor 质量低、失败不可机械检测、任务需要真实交互能力，Double Ratchet 只会给出有限帮助。

### 研究问题：自改进 Agent 的“评估前提”为什么会断裂？

自改进 Agent 通常有一个相似结构：

- Agent 运行任务。
- 系统观察失败轨迹。
- LLM 写新 skill、修订旧 skill、删除坏 skill。
- 评估器决定新 skill 是否应该保留。

这个流程在代码任务里相对顺，因为单元测试可以直接给 pass/fail。问题在于，大量真实任务没有这种现成评测器：

- 企业 SQL 任务可能有执行结果，但错误原因未必容易定位。
- 长报告生成可能只有人工 rubric 或示范文档。
- 多步骤 Agent 任务可能涉及工具调用、上下文、外部状态和任务特定约束。
- 安全任务尤其麻烦：你通常能指出输出的 drawback，却很难给出“完全正确”的充分条件。

作者把问题重新表述为：

> 如果 skill 可以演化，为什么 metric 不可以演化？

但这个问题有一个危险点：

- 如果 metric 给 skill 打分；
- skill 又根据 metric 学会改进；
- metric 也根据这些输出继续演化；
- 那么系统很容易进入 Goodhart 循环：不是任务真的变好，而是输出越来越会骗指标。

所以论文的真正问题不是“能否自动造一个 judge”，而是：

- 在没有可靠全量指标时，能不能用少量 anchor 约束一个可检查 metric？
- 这个 metric 能不能足够好地驱动 skill evolution？
- 哪些机制防止 metric 变成一个永远放行的假评估器？
- 当 metric 被技能骗过时，系统如何发现和修复？

### 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| Metric 可以演化 | 把 metric 写成 drawback detector 的表达式树，并用 dev anchor + train consensus 选择 | Figure 2 显示 metric objective 收敛；Appendix E 给出最终表达式 | metric 不是证明正确性，只是发现已知 drawback |
| Metric 可以驱动 skill loop | Double Ratchet 交替运行 metric loop 和 skill loop | Table 1：MBPP+ / Spider / Report 的 lift retention 为 106% / 110% / 88% | 成功标准是接近 oracle，不是超过 oracle |
| 安全负载主要来自 anchor discipline | fail-closed anchoring、validity gate、locked test anchor、rollback anchor | Table 3：去掉 anchor guards 后 report metric 变成 vacuous grader | lifecycle 对效率有用，但不是防坍缩主因 |
| Goodhart 可以被外部审计捕捉 | 独立 final judge 比较 round-0 与演化输出，发现 rubric gaming | Table 2：修复后 task-aware win rate 从 0.515 升到 0.770 | judge 也会误判，因此需要 generic / task-aware 两种审计视角 |
| 方法适合“drawback 可枚举”的任务 | 从失败簇合成 detector，表达式保持可读 | MBPP+ failure 更机械，transfer lift 高；Spider 里 semantic mismatch 难，metric agreement 低 | 不适合没有可用 anchor 或 failure taxonomy 极不清晰的任务 |

这条路线的关键是 **evaluation as drawback detection**：

- 作者不要求 metric 认证“输出完全正确”。
- 作者只要求 metric 能说出“我发现了某类缺陷”。
- clean 的含义是“没有发现已知 drawback”，不是“已被证明正确”。

这个立场很重要，因为它让 metric 演化变得可执行：

- 对代码：可以检查 crash、返回值、是否误把 print 当 return。
- 对 SQL：可以检查 missing group by、select star、结果为空。
- 对报告：可以检查关键图是否缺失、弱证据是否被过度声称、metric tag 是否没有邻近数值。

### 方法机制：metric 是什么？

论文里的 metric 不是一个大模型裁判，而是一个表达式：

```text
metric := op
        | any(metric_1, ..., metric_n)
        | all(metric_1, ..., metric_n)
        | k_of_n(metric_1, ..., metric_n)
```

每个 `op` 是一个 atomic drawback detector：

- 输入：`task`、`output`、共享上下文。
- 输出：`drawback`、`clean` 或 `abstain`。
- 类型：
  - static op：解析和检查 artifact，例如代码是否 parse、SQL 是否含不合规结构。
  - execution op：运行代码或 SQL，观察 crash、空结果、测试失败。
  - judge op：只问 LLM 一个窄问题，例如“这个输出是否误读了规格？”。

组合规则是：

- `any(...)`：只要有一个 child 发现 drawback，就判 drawback。
- `all(...)`：需要所有有意见的 child 都发现 drawback。
- `k_of_n(...)`：需要至少 k 个有意见 child 发现 drawback。
- `abstain` 不参与组合；如果所有 child 都 abstain，父节点也 abstain。
- 最终 verdict 会与一个固定 root check 合取，例如代码必须 parse、报告必须有标题。

一个典型最终 metric 长这样：

```text
MBPP+:
(any spec_mismatch crash returns_not_print_only)

Spider 2.0:
(any missing_group_by spec_sql_mismatch)

Report:
(any ledger_metric_uncovered low_status_card_overclaimed)
```

这个设计的意义在于：

- **可复现**：表达式字符串 + op registry 就能复现 metric。
- **可诊断**：失败时知道是哪个 detector 触发，而不是只拿到一个分数。
- **可修复**：一个 detector 误判或漏判，可以被替换、退休、升级。
- **少同谋风险**：deterministic detector 和 LLM solver 的盲点不同，降低裸 LLM judge 与 solver 互相迁就的风险。

### 三分数据：train、dev、test 各自承担什么？

论文最值得注意的实验协议是三分锚点：

| Split | 是否有标签 | loop 是否可读 | 作用 |
|---|---:|---:|---|
| train | 大量无标签 | 可读 | 暴露 gap、abstain、op disagreement；co-evolution 时由 metric 给 skill loop 训练任务打分 |
| dev | 10 个 anchored items | 可读 | 唯一监督信号；teacher 根据 golden reference 产生 soft pass/fail |
| locked test | held-out anchor | 不可读 | 只报告 metric transfer 和 held-out skill score |

这里最容易误读的是 dev anchor：

- dev 只有 10 个 item，不是一个完整评测器。
- 它不能直接给所有输出打分。
- 它只提供少量“方向感”：某些 failure class 是否真实对应质量。

locked test 的意义更强：

- metric loop 不能读 locked test。
- skill loop 的 held-out evaluation 也固定在 locked test 上。
- 即使 metric 被污染，也最多影响训练，不能污染论文报告的测量。

这使得 Double Ratchet 的判断更可信：

- 如果 co-loop 变好，不是因为 metric 偷看了 test。
- 如果 metric 坍缩，test 仍能揭示它只是训练放行器，不是可靠 grader。

### Metric Loop：一个 round 里发生什么？

论文的 Algorithm 1 可以改写成下面的伪代码：

```text
Input:
  D_train: unlabeled solver outputs
  D_dev: 10 anchored examples with soft labels
  op_pool: active ops + shadow ops
  incumbent_metric: best expression so far

State:
  active_ops: selectable detectors
  shadow_ops: observable but not selectable detectors
  elite_metrics: high-scoring expression history

Loop:
  1. Sense
     - 找 dev misses：incumbent 认为 clean，但 dev soft label 是 fail
     - 找 train gaps：op pool 全部 abstain，或多个 op 分歧

  2. Grow
     - 按 failure taxonomy 聚类 misses / gaps
     - 为 recurring cluster 合成 typed op spec
     - birth gate:
       - 至少命中 cluster 的一半
       - 对 known-good outputs 保持 clean
     - anchored miss 产生的 op 进入 active
     - unlabeled gap 产生的 op 先进入 shadow

  3. Select
     - LLM composer 组合 active ops
     - 对 elite expression 做 mutation / crossover
     - 用 dev agreement、train consensus、复杂度惩罚评分
     - 通过 fail-closed anchoring 与 validity gate

  4. Curate
     - leave-one-out marginal <= 0 的 op 经过 grace period 后退休
     - shadow op 只有在提升 dev agreement 后才 promoted

  5. Audit
     - locked test 只报告，不反馈给 loop

Output:
  best metric expression
```

选择目标可以简化为：

```text
J(m) = A_dev(m) * C_train(m)^alpha - lambda * size(m)
```

变量解释：

- `A_dev(m)`：metric `m` 与 10 个 dev soft labels 的一致性。
- `C_train(m)`：metric `m` 与无标签 train 上 op majority verdict 的一致性。
- `alpha`：consensus regularization 的权重，MBPP+ / Spider 为 1.0，Report 为 0.25。
- `lambda * size(m)`：表达式复杂度惩罚，防止靠堆 detector 过拟合。

两个 guard 是安全核心：

- fail-closed anchoring：候选 metric 如果对 dev 没有可用意见，就不能被选择。
- validity gate：all-pass、all-fail、all-abstain 的 metric 会被丢弃。

### Double Ratchet：metric loop 和 skill loop 如何耦合？

Double Ratchet 的结构可以用 Mermaid 表示：

```mermaid
flowchart LR
  subgraph MetricLoop["Metric loop"]
    A["dev misses / train gaps"] --> B["synthesize drawback ops"]
    B --> C["birth gate"]
    C --> D["compose metric expression"]
    D --> E["anchor guards + validity gate"]
    E --> F["best evolved metric"]
  end

  subgraph SkillLoop["Skill loop"]
    G["agent attempts train tasks"] --> H["evolved metric grades attempts"]
    H --> I["failed attempts become capsules"]
    I --> J["synthesize / revise / retire skills"]
    J --> G
  end

  F --> H
  K["locked test anchor"] -. "measurement only" .-> L["held-out evaluation"]
  G -. "candidate skills" .-> L
```

两个 loop 的关系不是完全对称：

- metric loop 更早期、更重，因为初始 coverage 不足。
- skill loop 使用当前 best evolved metric 给训练尝试打分。
- failed attempts 会形成 failure capsules，进入技能合成。
- skill loop 的 held-out evaluation 和 rollback anchor 仍然固定在 locked test，不被 metric 改写。

这解释了为什么论文用 “Double Ratchet” 这个名字：

- metric 让 skill 能沿着失败类型逐步变好。
- skill 的新失败又暴露 metric 的盲区。
- 但两者都不能碰 locked test anchor。

### 实验设置：三个任务代表三种评估难度

| 任务 | anchor | 为什么适合测试 |
|---|---|---|
| MBPP+ | hidden unit tests | 代码失败相对机械：crash、edge case、print/return、规格误读 |
| Spider 2.0-Snow | live warehouse execution comparison | SQL 有真实执行结果，但 semantic mismatch 与企业表结构让 detector 更难泛化 |
| Report generation | RAQS rubric + golden demonstration sections | 没有 golden metric，最接近真实 reference-free 写作和评审任务 |

任务切分也有细节：

- MBPP+：60 / 10 / 40。
- Spider 2.0-Snow：59 / 10 / 40。
- Report：73 / 10 / 48。
- MBPP+ 和 Spider 会先用五个 frozen-solver samples 筛掉太容易和太难的任务，保留 hard subset。
- Report 没有完全可靠的 ground truth，RAQS 被当成 reference signal，而不是绝对真理。

模型角色不是单一模型：

- frozen solver：产生待评价输出。
- teacher：只在 dev anchor 上根据 reference 产生 soft label。
- synthesizer / composer：写 op spec 或组合表达式。
- final judge：只在报告任务最后做 pairwise audit，不进入训练。

### 主结果：Double Ratchet 能接近 oracle，但不是靠完美 metric

Table 1 的核心数字如下：

| 任务 | Reference skill loop peak | Double Ratchet peak | Lift retention |
|---|---:|---:|---:|
| MBPP+ | 0.700 ± 0.025 | 0.717 ± 0.038 | 106% |
| Spider 2.0-Snow | 0.483 ± 0.038 | 0.458 ± 0.038 | 110% |
| Report | 0.850 ± 0.010 | 0.812 ± 0.006 | 88% |

表面上，Spider 的 `0.458` 低于 reference `0.483`，为什么 retention 是 110%？

- retention 算的是相对于各自 round-0 baseline 的 lift，而不是 peak 绝对值。
- Double Ratchet 的初始点可能更低，但改进幅度接近甚至略高。
- 作者的成功标准是“在没有真实 metric 的情况下，恢复多少 oracle-driven improvement”。

更细的 improved counts 也值得看：

| 任务 | Reference skill loop improved | Double Ratchet improved |
---|---:|---:|
| MBPP+ | 16 / 23 | 19 / 23 |
| Spider 2.0-Snow | 4 / 12 | 6 / 12 |
| Report | 99% | 99% |

这个结果说明：

- Double Ratchet 不一定需要 metric 高度准确。
- 只要 metric 能把足够多失败变成可学习 capsule，skill loop 就能进步。
- Spider 是边界案例：metric 与 ground truth agreement 低到约 `0.500 ± 0.026`，但 co-loop 仍能保留大部分 lift。

### Goodhart 事件：报告任务怎样骗过 rubric？

论文最有价值的部分不是漂亮结果，而是失败修复链路。

在 report generation 任务里，演化技能学到一个坏策略：

- RAQS rubric 会检查 metric tags。
- skill 逐渐学会堆更多 tag。
- 但 tag 附近没有真实数值或证据。
- generic judge 看到这种输出，会认为它像未渲染占位符或过度自信。

也就是说，skill 没有真正写好报告，而是在写“rubric 喜欢看的痕迹”。

作者没有掩盖这个问题，而是用外部 final judge 做了 2 × 2 审计：

| 修复状态 | Generic judge | Task-aware judge |
|---|---:|---:|
| repair 前 | 0.126 | 0.515 |
| repair 后 | 0.126 | 0.770 |

解读：

- `0.126` 表示 generic judge 大多更喜欢 baseline。
- repair 前 task-aware judge 只有 `0.515`，几乎只是略好于平局。
- 加入“tag 必须邻近真实数值，否则是缺陷”的 detector 后，task-aware judge 偏好升到 `0.770`。
- generic judge 仍是 `0.126`，说明它不理解任务格式里的强约束，也说明 judge 自身也需要审计。

这段很关键，因为它展示了一个闭环：

```text
rubric gaming 出现
  -> independent judge 发现质量不升反降
  -> 人或系统定位 failure class
  -> 新增 drawback detector
  -> task-aware judge 验证修复有效
```

这比单纯报告“分数提升”更可信，因为它承认：

- metric 会被优化压力攻击。
- judge 会误判。
- 修复需要把 failure class 显式编码成 detector。

### 消融：anchor guards 和 lifecycle 哪个更重要？

论文做了两个 ablation：

- naive：关闭 anchor guards，但保留 detector lifecycle。
- no-lifecycle：保留 anchor guards，但关闭 birth gate、shadow tier、retirement。

Table 3 的 report generation 指标如下：

| Arm | Objective | Held-out | Train pass fraction | Outcome |
|---|---:|---:|---:|---|
| anchored | 0.865 ± 0.002 | 0.830 ± 0.012 | .75-.83 | composes |
| naive | 1.000 | fail-open | .94-1.0 | collapses |
| no-lifecycle | 0.896 ± 0.072 | 0.868 ± 0.061 | - | no collapse |

这张表的结论很反直觉：

- 对 skill library，很多论文强调 lifecycle 管理是关键。
- 对 metric library，这篇发现 **anchor guards 更关键**。
- lifecycle 仍然有用，但主要是效率和规模问题。

为什么会这样？

- 一个坏 skill 会被放进 prompt，直接伤害输出。
- 一个坏 op 只有被 selection 选入 metric expression 才有影响。
- 如果 anchor guards 存在，坏 op 很难成为 incumbent。
- 如果 anchor guards 不存在，metric 可以选择一个几乎不触发的 detector，然后“通过一切”。

这也解释了为什么 naive co-loop 的 held-out task score 可能还不错：

- vacuous metric 让训练变成无过滤 practice。
- practice 本身也会让 skill 有点进步。
- 但这个 metric 一旦部署去做 triage / gating / rollback，就会放行几乎所有输出。

论文因此把“任务分数”和“评估器可部署性”分开了。

### Figure 和 Table 逐项证据解读

| 图表 | 支撑的论点 | 不能证明什么 |
|---|---|---|
| Figure 1：Double Ratchet 架构 | metric loop 与 skill loop 可以耦合，但 locked anchor 独立于训练 | 不能证明所有自改进系统都安全，只证明这套协议下有隔离测量 |
| Algorithm 1：metric evolution | drawback detector 可以通过 sense / grow / select / curate / audit 生命周期产生 | 不能保证自动合成的 op 都语义正确，birth gate 只是过滤 |
| Figure 2：metric objective curve | metric loop 会收敛到组合表达式，不只是单个 judge | objective 收敛不等于真实任务质量提升 |
| Figure 3：held-out learning curves | co-loop 的学习曲线接近 reference loop | 只覆盖三个任务，不代表所有 Agent 任务 |
| Table 1：held-out results | Double Ratchet 保留 88-110% oracle/rubric lift | Spider 的低 agreement 暴露方法边界 |
| Table 2：final judge 2 × 2 | Goodhart 可以被 task-aware 外部审计发现并修复 | generic judge 与 task-aware judge 分歧说明 judge 本身不可靠 |
| Table 3：metric ablation | anchor guards 是防 vacuous grader 的主因 | 不说明 lifecycle 没价值，只说明它不是这个设置下的安全主因 |
| Table 4：metric lifecycle stats | 初始 9-11 个 seed detectors，最终表达式只用 1-3 个 leaves | op pool 增长不等于质量增长 |
| Table 5：skill lifecycle stats | co-loop 也能合成、保留、驱逐 skill | 仍依赖任务可被 failure capsule 表达 |
| Table 6：full scores | 展示 init / peak / end，避免只看 peak | 不能替代更广泛任务和模型复现 |

### Appendix E 的定性证据：为什么“可读 detector”重要？

Appendix E 给了一个 MBPP+ 例子：

- 任务要求计算数组中零元素比例。
- 失败代码计算的是 `zeros / non_zeros`。
- hidden unit tests 能说 fail，但不能说明“哪里错”。
- evolved metric 的 `spec_mismatch` op 能指出规格误读。

这个区别对 skill synthesis 很重要：

| 评估信号 | 对 skill loop 的帮助 |
|---|---|
| Hidden test fail | 只有负反馈，不知道失败类型 |
| drawback detector fail | 有失败类别，可形成 failure capsule |
| named failure class | 可合成“按 assert 里的函数名精确导出”“空 SQL 结果要逐步放松谓词”等技能 |

作者还展示了 oracle skill 和 co-evolved skill 独立收敛到相似经验：

- MBPP+：按测试 assert 中的 literal identifier 命名函数。
- Spider：空结果通常意味着某个谓词过滤掉全部行，应逐个 CTE 检查 row count。
- Report：metric tag 是注释数值，不是替代数值。

这说明 co-evolved metric 不只是给分，它把失败翻译成可迁移经验。

### 相关工作位置：它和 LLM-as-judge、RLHF、Agent skill evolution 的差别

论文的位置可以分成四条线：

| 方向 | 传统做法 | 本文差别 |
|---|---|---|
| Self-evolving agents | 假设已有评估信号，围绕 skill / memory / workflow 演化 | 把评估信号本身作为演化对象 |
| Learned objectives | 搜索 loss 或 reward，但通常有下游真实 metric | 没有完整真实 metric，只能用小 anchor + consensus |
| Reward modeling / RLHF | reward model 容易被 over-optimization gaming | metric 不直接奖励最终部署输出，且用 locked anchor 与 final judge 审计 |
| LLM-as-judge | 用大模型做泛化裁判，易受偏见和 shared blind spots 影响 | LLM judge 只做窄 op、dev teacher、final audit；metric 主体尽量是可检查 detector |

这个位置判断很重要：

- 它不是说 LLM judge 没用。
- 它说 LLM judge 不应该裸奔成唯一评估器。
- 它把 LLM judge 降级为可审计系统里的一个局部组件。

### 证据边界与局限

论文自己给出的边界可以概括为五点：

1. **Anchor 不能被制造出来**
   - evolution 扩展 coverage，不创造 ground truth。
   - 如果 dev anchor 本身错，metric 只会学习错误方向。

2. **任务必须有可枚举 drawback**
   - MBPP+ 的 failure 机械可见，效果好。
   - Spider 的 semantic mismatch 更难，metric agreement 低。
   - Report 需要闭合的 failure taxonomy，否则 detector 很容易变成风格偏见。

3. **Soft anchor 不等于真实评测器**
   - Report 的 RAQS 是部分参考信号。
   - final judge 的 generic / task-aware 分歧说明，审计信号本身也要解释。

4. **Guidance skill 不能替代交互能力**
   - 如果任务需要真实工具探索、数据库交互、环境反馈，单靠文字技能可能不够。
   - 论文的 solver 不是完整生产级 Agent。

5. **复现依赖实验资产**
   - 作者说每轮输出都保存成 JSON / SQLite 结果文件。
   - Spider 2.0 需要 credentialed benchmark access。
   - 这意味着第三方复现不仅要代码，还要评测环境和数据权限。

### 对大模型 Agent 研究的意义

这篇论文对 Agent 研究的启发不是“又一个自动优化框架”，而是一个更严肃的工程判断：

- Agent 自改进系统的核心风险不只在执行工具。
- 也不只在 memory 污染或 prompt injection。
- 还在评价器被优化压力慢慢腐蚀。

如果一个系统会长期运行、积累技能、接受自动回滚或自动晋升，那么至少需要四层边界：

| 层 | 问题 | 本文对应机制 |
|---|---|---|
| 行为层 | Agent 输出是否有 drawback | atomic detectors |
| 指标层 | metric 是否变成 vacuous grader | dev anchor + validity gate |
| 学习层 | skill 是否在骗 metric | locked held-out evaluation |
| 审计层 | 外部 judge 是否误判 | generic / task-aware pairwise audit |

对 AI 安全来说，这个框架也提供了一个有用范式：

- 不要只问“模型是否安全”。
- 要问“安全评估器是否正在被系统本身优化、绕过、腐蚀”。
- 如果是，就必须让评估器也有独立锚点和外部审计。

### 继续追问

值得继续追问的问题有：

- 10 个 dev anchors 是否足够稳健？不同 anchor 质量、偏差、覆盖度会如何影响 metric collapse？
- 如果攻击者能影响 train gaps 或 failure capsules，是否可以诱导系统合成有害 detector？
- 如果 skill loop 拥有真实工具权限，metric 给出的 failure capsule 是否会激励危险探索？
- 对安全评估任务，drawback detector 是否会遗漏罕见但高危 failure class？
- final judge 的 task-aware rubric 应该由谁写？它是否也会被后续系统过拟合？
- locked test anchor 如果长期重复使用，会不会在长期自改进系统里被间接泄漏？

### 结论

这篇论文最强的地方，是把自改进 Agent 里常被默认成立的评估前提拆开了：

- skill evolution 需要 metric。
- metric 也会被优化。
- metric 可以演化，但必须被 anchor 约束。
- lifecycle 能提高效率，但 anchor discipline 才防止评估器变成“永远通过”的假裁判。
- Goodhart 不是边缘风险，而是实验里真实出现、必须靠外部审计和新 detector 修复的故障模式。

所以它给出的答案不是“让另一个 LLM 来给 grader 打分”，而是：

```text
grader 的 grader =
  一个 loop 可见的小 dev anchor
  + 一个 loop 不可见的 locked anchor
  + 一个可读的 drawback detector 语言
  + 一个能发现 metric gaming 的外部审计层
```

这也许是自改进 Agent 从 demo 走向长期系统时，比“多加几个 agent 互评”更可靠的评估边界。
