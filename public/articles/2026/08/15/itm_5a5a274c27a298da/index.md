# Vero：当 Coding Agent 不只写代码，还必须证明整个仓库正确

| 项目 | 信息 |
|---|---|
| 论文 | Vero: Can AI Agents Build Formally Verified Software Repositories? |
| 类型 | 大模型 Agent / 编码 Agent 评测论文 |
| 版本 | arXiv:2608.13522v1，2026-08-13 17:41:27 UTC |
| 作者 | Zhe Ye、Hantao Lou、Yuechun Sun、Peiyang Song、Zhengxu Yan、Timothe Kasriel、Qingyang Zhang、Kaiyu Yang、Soonho Kong、Jingxuan He、Dawn Song |
| 原文 | https://arxiv.org/abs/2608.13522 |
| HTML | https://arxiv.org/html/2608.13522 |
| 代码与基准 | https://github.com/sunblaze-ucb/vero |

### TL;DR

1. **Vero 问的问题很硬**：编码 Agent 能不能从真实多模块仓库出发，同时写实现和机器可检查证明，而不是只通过单元测试或只证明一个给定函数。
2. **基准单位不是函数题**：Vero 包含 43 个 Lean 4 多模块实例，来源覆盖 Python、Dafny、Verus、Coq，论文主文统计为 743 个 scored APIs 与 2705 个 specifications；项目 README 当前 inventory 合计写作 2706 个 specs，存在一个很小的口径差。
3. **任务有两种模式**：proof-only 给定参考实现，只补证明；code-and-proof 隐去实现，要求 Agent 自己写 API body，并证明所有 specification 对自己的实现成立。
4. **核心机制是 RepoImpl scaffold**：每个 specification 都写成 `RepoImpl -> Prop`，因此同一组规格既能绑定参考实现，也能绑定 Agent 自己的实现，还能表达“不存在任何实现满足这些规格”的 audit 证据。
5. **实验结论并不乐观**：最强配置 GPT-5.5 xhigh 在 code-and-proof 中完整解决 27/43，在 proof-only 中解决 25/43；10 个实例在所有 8 个配置与两种模式下都没有被完整解决。
6. **高单项通过率不等于仓库完成**：GPT-5.5 xhigh 在 code-and-proof 通过 87.3% specifications，但仍有 16 个仓库没有 full solve；剩下的规格往往需要跨模块不变量、协议一致性和可复用 lemma library。
7. **Agent 的实现自由是双刃剑**：有 13 个 instance-agent pair 只在 code-and-proof 完整解决，说明 Agent 可把难证明算法替换成更易证明实现；也有 17 个 pair 只在 proof-only 解决，因为自己改实现会破坏编译或 proof target。
8. **Vero 的边界也明确**：它测的是 Lean 4 中形式化后的一组规格是否被证明，不等于证明原始 Python/Dafny/Verus/Coq 项目的全部行为、性能复杂度或生产安全性质。

### 研究问题：为什么“仓库级 verified coding agent”不是函数级证明的放大版？

Vero 的出发点不是“模型会不会写 Lean tactic”，而是一个更接近真实软件工程的问题：

> 如果一个 Agent 负责一个多文件代码库，它能不能同时维护实现、规格和证明之间的一致性？

这比 HumanEval 风格函数题多出几层依赖：

| 层次 | 函数级任务常见假设 | 仓库级验证里的额外难点 |
|---|---|---|
| 实现 | 单个函数 body 足够 | API 分布在多个模块，修改一个定义会影响后续证明 |
| 规格 | 单个 postcondition 或 theorem | 多个 specifications 可能共享同一组不变量 |
| 证明 | 局部 tactic search | 需要先设计 lemma library，再复用到多个 proof obligation |
| 评测 | 运行测试或检查一个 theorem | 需要整个 Lean project build，并逐项检查 axiom 依赖 |
| 错误来源 | 多数错误归因于模型 | 还要区分模型失败、规格冲突、参考实现错误和 reward hacking |

论文的关键判断是：

<u>仓库级形式化验证不是把 43 个函数题排在一起，而是让 Agent 在一个共享逻辑环境里维护全局一致性。</u>

这也是 Vero 与很多 coding-agent benchmark 的分叉点：

1. 单元测试只覆盖样例输入，无法排除规格覆盖范围内的所有边界错误。
2. proof-only benchmark 固定实现，绕开了“实现是否为了可证明性而设计”的问题。
3. 函数级 proof benchmark 隐藏了跨模块 lemma、build hygiene、API 复用和全局 invariant。
4. Agent 真实可用时必须有工具访问、文件编辑、构建命令和反复尝试，而不是一次性输出答案。

### 论文主张与论证路线

作者的论证可以压成四段：

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 需要仓库级评测 | 把真实项目转成 Lean 4 多模块实例 | 43 个实例、743 APIs、2705 specs | Lean 形式化只覆盖写入规格的性质 |
| 需要同时测实现和证明 | 支持 proof-only 与 code-and-proof 两种模式 | 13 个 pair 只 code-and-proof，17 个 pair 只 proof-only | 两种模式不是简单难度排序 |
| 需要 audit | 允许 Agent 证明 spec unsat 或 reference incorrect | released instances 中 audit 产生 38 个 adjudicated spec defects 与 6 个 joint-unsat groups | audit 仍依赖 curator review 和证据解释 |
| 当前 Agent 仍不够 | full solve 作为主指标，拒绝 partial-score 幻觉 | 最强 27/43，10 个实例全配置未解 | 90 分钟预算、特定 harness、特定 Lean 版本 |

这个路线的意义在于：

1. 作者没有只报告“模型通过了多少 theorem”。
2. 他们把 through-line 放在 **repository completion**。
3. 他们同时分析完成样本里的证明结构，说明 full solve 需要什么。
4. 他们也分析失败样本，说明未完成不是随机剩余，而是撞到共享墙。

### 数据格式：Vero 如何把实现和证明绑在一起？

Vero 的核心抽象是 `RepoImpl`。

简化后，一个实例可以写成：

```lean
-- API signatures
abbrev CreateAccountSig := AccountId -> Ledger -> Ledger
abbrev AccountExistsSig := AccountId -> Ledger -> Bool
abbrev GetBalanceSig := AccountId -> Ledger -> Option Balance

-- one field per API
structure RepoImpl where
  createAccount : CreateAccountSig
  accountExists : AccountExistsSig
  getBalance : GetBalanceSig

-- specification is a predicate over any implementation
def spec_create_zero_balance (impl : RepoImpl) : Prop :=
  forall (id : AccountId) (ledger : Ledger),
    impl.accountExists id ledger = false ->
    impl.getBalance id (impl.createAccount id ledger) = some 0

-- proof obligation targets canonical
theorem proof_create_zero_balance :
  spec_create_zero_balance canonical := by
  sorry
```

这个格式有三个关键后果：

1. **规格不写死到某个函数实现**：
   - `spec_create_zero_balance` 接收任意 `RepoImpl`。
   - 同一个 specification 可以套到 reference implementation，也可以套到 Agent 的 implementation。
2. **code-and-proof 有真实实现义务**：
   - Agent 不能只补 theorem。
   - 它还要给 `createAccount`、`accountExists`、`getBalance` 等 API body。
3. **audit 可以被形式化表达**：
   - 如果某个 spec 本身不可满足，Agent 可提交 `¬ ∃ impl, spec impl`。
   - 如果多个 specs 单独可满足但联合冲突，Agent 可提交 joint-unsat 证据。

用集合符号表示：

```text
给定：
  API 集合 A = {a_1, ..., a_m}
  规格集合 S = {S_1, ..., S_n}
  接口结构 RepoImpl = product(A)

proof-only:
  canonical := reference_impl
  目标：对所有 S_i，证明 S_i(canonical)

code-and-proof:
  canonical := agent_impl
  目标：对所有 API 写实现，并对所有 S_i 证明 S_i(canonical)

audit:
  proof-only 可证明 ¬ S_i(reference_impl)
  code-and-proof 可证明 ¬ ∃ impl, S_i(impl)
  或证明一组 specs 不能同时满足
```

这个设计比“把源仓库翻译成 Lean，然后让模型填空”更细：

| 组件 | 谁提供 | 是否可改 | 评测作用 |
|---|---|---|---|
| data types / helpers | curator | frozen | 定义语义空间 |
| API signatures | curator | frozen | 限定实现接口 |
| formal specifications | curator | frozen | 定义要证明的性质 |
| reference implementations | curator | proof-only 使用 | 作为 proof-only target |
| agent implementations | Agent | code-and-proof 填写 | 作为 code-and-proof target |
| proof bodies | Agent | 两种模式都填写 | 通过 Lean kernel 与 grader 检查 |

### 两种模式：为什么 code-and-proof 不是 proof-only 的加强版？

直觉上，code-and-proof 好像更难，因为 Agent 要多写实现。

Vero 的实验却显示它不是单调关系：

| matched instance-agent pair 结果 | 数量 | 说明 |
|---|---:|---|
| 两种模式都 full solve | 26 | 说明一些仓库的证明结构稳定 |
| 只在 code-and-proof full solve | 13 | Agent 可选择更易证明实现 |
| 只在 proof-only full solve | 17 | 自写实现带来 build failure、破坏证明目标或漏填 slot |
| 两种模式都未 full solve | 116 | 多数 pair 仍卡在仓库级验证 |

这组结果解释了一个容易忽略的研究点：

1. **实现自由有时降低证明难度**：
   - Agent 可以放弃 reference algorithm。
   - 只要满足同一 specification，就可写更朴素、更易归纳的版本。
   - 论文手动检查到 5 个 instance-agent pair 属于这种行为，覆盖 3 个 repository。
2. **实现自由也会扩大失败面**：
   - 一处 implementation slot 为空会让整个 repository build 失败。
   - code-and-proof 中 build 失败不是局部扣分，而是这个实例无法被 certified。
3. **proof-only 给了一个已编译 scaffold**：
   - Agent 只和证明交互。
   - 它不会因为自己写错 implementation 而把整个 project 搞坏。

一个典型负例是 Huffman：

| 实例 / 配置 | proof-only | code-and-proof | 失败机制 |
|---|---:|---:|---|
| Huffman / Claude Opus 4.8 | 116/127 specs | 0/127 specs | code-and-proof 留下 3 个 implementation slots 为空，build failure 导致全实例归零 |

所以 Vero 的真正问题不是“证明更难还是写实现更难”。

更准确地说：

<u>Agent 要在证明搜索、实现设计、构建完整性和全局不变量之间做协调，而当前 Agent 往往把实现早早固定，后半程只在 proof layer 上消耗预算。</u>

### Curation pipeline：为什么这个基准比普通题库更难做？

Vero 的数据来源不是人手写 43 个玩具题。

作者把真实项目转成 Lean 4，并分成两条 track：

| Track | 来源 | 需要做什么 | 例子 |
|---|---|---|---|
| Track 1 | Dafny、Verus、Coq 等形式化项目 | 翻译既有类型、定义、规格、证明语义 | `deposit_sc`、`verified_ironkv`、`vest` |
| Track 2 | Python 项目 | 翻译实现，并人工写规格 | `base58`、`networkx`、`sortedcontainers`、`rsa` |

pipeline 大致是：

```mermaid
flowchart TD
  A[Select source repository] --> B[Translate definitions into Lean 4]
  B --> C[Write or translate API signatures]
  C --> D[Write formal specifications]
  D --> E[Validate build and reference behavior]
  E --> F[Human review gate]
  F --> G[Benchmark instance]
  G --> H[Agent run: proof-only or code-and-proof]
  H --> I[Clean re-render and grading]
  I --> J{Audit evidence?}
  J -->|yes| K[Curator review and benchmark correction]
  J -->|no| L[Pass / fail report]
```

这个 pipeline 关心三种可信性：

1. **语义可信**：
   - Lean 翻译要保留原项目核心行为。
   - Python 项目的 specification 不能只写成 trivial property。
2. **污染控制**：
   - 源项目可能在训练语料中出现。
   - 但 Vero 的 Lean 4 formalization 是新构造，公开网页上没有直接 ground-truth Lean solution。
3. **可扩展性**：
   - pipeline stage 共享格式。
   - README 说明添加新 source language 主要是写新的 curation skill。

这也是论文对“benchmark 是否可靠”的回答：

| 风险 | Vero 的处理 |
|---|---|
| 原始仓库代码已经被模型见过 | 重新翻译成 Lean 4，ground-truth proof 不直接公开存在 |
| 人工规格可能错误 | audit mechanism 接受 machine-checked negative evidence |
| Agent 改 frozen files | grader 只抽取 marker slot body，重新渲染干净项目 |
| Agent 注入 axiom 或 sorry | `#print axioms` 检查依赖集合 |
| Agent 利用 Lean 机制 reward hacking | rule-based + LLM judge 筛查 typeclass / implemented_by 等模式 |

### Anti-cheat：为什么“Lean 编译通过”还不够？

形式化验证最容易被误解的一点是：

> 只要 Lean 接受 theorem，就一定说明 Agent 证明了吗？

Vero 的回答是否定的。原因是：

1. Lean 允许 `sorry` 占位。
2. 用户可声明 axiom，让定理无实际证明地成立。
3. 某些 tactic 或 typeclass trick 会把语义目标绕开。
4. Agent 可编辑 frozen helper 或 spec，如果 grader 信任整个工作目录，就会被污染。

Vero 的防线是三层：

| 层 | 检查对象 | 拦截什么 |
|---|---|---|
| slot-scoped re-rendering | 只抽取 marker 内部内容 | 修改 frozen file、改 spec、改 API signature |
| axiom allowlist | 每个 theorem 的 `#print axioms` | `sorryAx`、用户 axiom、非信任 axiom |
| declaration screening | Agent 新增声明 | hollow typeclass、priority shadowing、decidability laundering、`@[implemented_by]` proof/runtime split |

axiom allowlist 特别关键。

作者只接受 Lean 逻辑中的标准 axiom：

```text
Allowed axioms:
  Classical.choice
  propext
  Quot.sound

Rejected:
  sorryAx
  agent-introduced axiom
  other untrusted axiom dependency
```

论文附录报告：

| 现象 | 数字 |
|---|---:|
| 因 axiom layer 被拒绝的 specification outcomes | 368 |
| 集中实例 | base58 67、verified_bitmasks 60、reedsolo 53、sortedcontainers 52 |
| 典型模式 | `native_decide` 通过 compiler evaluation 而非 kernel proof 关闭有限域目标 |

这组数字说明：

1. reward hacking 不是想象风险。
2. naive “build ok” 会高估 Agent 能力。
3. verified coding benchmark 必须定义“什么算证明”，不能只交给工具链默认成功状态。

### 实验设置：谁被测，怎么测？

Vero 评测四个 frontier coding-agent configurations：

| Harness | Model / profile | 说明 |
|---|---|---|
| Codex v0.140.0 | GPT-5.5 medium | Codex 默认 reasoning effort |
| Codex v0.140.0 | GPT-5.5 xhigh | 更高 reasoning effort |
| Claude Code v2.1.191 | Claude Opus 4.8 xhigh | xhigh reasoning |
| Claude Code v2.1.191 | Claude Sonnet 5 xhigh | xhigh reasoning |

共同条件：

1. 都有完整文件系统编辑权限。
2. 都能调用 Lean 4 toolchain。
3. Lean 版本固定为 v4.29.1。
4. 每个配置在 43 个实例上跑 proof-only 与 code-and-proof。
5. 主指标是 **full solve count**，不是 partial specification pass rate。

作者为什么强调 full solve？

| 指标 | 问题 |
|---|---|
| spec pass rate | 可被简单规格膨胀；剩下一个全局 invariant 未证，仓库仍不可信 |
| theorem count | 不同仓库 specs 数量差异大 |
| build success | 可编译不等于证明所有性质 |
| full solve | 要求一个实例所有 scored specs 都被通过，最贴近“这个仓库被验证了” |

这条指标选择很严格，也带来一个成本事实：

| Agent | code-and-proof 总成本 | proof-only 总成本 |
|---|---:|---:|
| GPT-5.5 xhigh | $2865 | $2964 |
| GPT-5.5 medium | $928 | $1094 |
| Claude Opus 4.8 | $1983 | $2279 |
| Claude Sonnet 5 | $633 | $791 |

作者进一步归一化后指出：

1. GPT-5.5 xhigh 花费最高，但 code-and-proof 每个 full solve 成本最低，约 $106。
2. 弱配置每个 specification 可能更便宜，因为它们能解决很多容易 specs。
3. 但对 full solve 来说，未完成仓库会吞掉大量预算却不给仓库级通过。

### 主结果：最强 Agent 仍没有跨过仓库级门槛

核心结果表：

| 配置 | code-and-proof full solve | proof-only full solve |
|---|---:|---:|
| GPT-5.5 xhigh | 27/43 | 25/43 |
| Claude Opus 4.8 | 8/43 | 10/43 |
| GPT-5.5 medium | 2/43 | 6/43 |
| Claude Sonnet 5 | 2/43 | 2/43 |

几个解释点很重要：

1. **GPT-5.5 xhigh 明显领先**：
   - code-and-proof 完整解 27 个。
   - proof-only 完整解 25 个。
   - 45 分钟内分别已达到 25 与 23 个 full solves。
2. **Vero 仍 frontier-resistant**：
   - 10 个 instances 在所有 8 个 configuration-mode cells 中都没被完整解决。
   - 很多 solved instance 只被一个配置解决，说明没有稳定跨模型能力。
3. **单项覆盖率掩盖仓库失败**：
   - GPT-5.5 xhigh 在 code-and-proof 通过 87.3% specs。
   - proof-only 通过 85.8% specs。
   - 但仓库级 full solve 仍停在 27/43 与 25/43。

这解释了 Vero 的研究价值：

```text
如果一个仓库有 100 个规格：
  通过 87 个规格 = 看起来很强
  剩下 13 个规格 = 可能正是跨模块不变量、协议一致性或全局数学理论

因此：
  spec_pass_rate 高
  不推出 repository_verified
```

### 证明结构：完成仓库靠的是 lemma library，而不是独立 theorem 堆叠

论文最有价值的分析之一，是读取 full solve 里的 proof architecture。

在 82 个 full solves 中：

| 指标 | code-and-proof | proof-only |
|---|---:|---:|
| helper theorem 中 proof lines 中位占比 | 73.6% | 71.6% |
| 至少有一个 helper 被 2 个以上 specs 共享 | 80/82 full solves | 同一统计口径 |
| 至少有一个 helper 被 5 个以上 specs 共享 | 65/82 full solves | 同一统计口径 |

这说明：

1. 完成的仓库不是“每个 spec 单独找一个 tactic”。
2. Agent 必须先写一组中间 lemma。
3. 这些 lemma 形成共享证明库。
4. 深层 specs 的失败来自前置 lemma chain 没搭起来。

作者用 helper-chain depth 做了更细的分析：

| helper-chain depth | 其他运行中的 pass rate 变化 |
|---|---|
| 0 | code-and-proof 83.9%，proof-only 80.1% |
| >= 4 | code-and-proof 50.6%，proof-only 39.1% |

这个数字支持一个机制判断：

<u>当前 Agent 的短板不只是“不会证明某个 theorem”，而是不会系统性构造可复用的中间理论。</u>

把它翻译成 Agent 工作流，就是：

```text
Input:
  Lean repository with APIs and specs

State:
  implementation choices
  local lemmas
  shared lemmas
  failed proof goals
  build state

Loop:
  inspect failing specs
  identify common invariant
  write helper theorem
  prove helper theorem
  refactor specs to reuse helper
  if implementation blocks proof:
    decide whether to refactor implementation
  run lake build

Output:
  buildable repository
  all specs closed without untrusted axioms

Failure boundary:
  local proof search continues
  but shared invariant is missing
  or implementation cannot support the target proof
```

Vero 的结果表明，当前 Agent 往往停在局部 proof loop：

1. 先把实现写定。
2. 后半程主要增加 proof lines。
3. 遇到 hard specs 时，很少回头重构实现或抽象新的全局 invariant。

论文报告：

| 现象 | 数字 |
|---|---:|
| GPT-5.5 xhigh median implementation lines 在第 30 分钟固定 | 65 lines |
| 此后 proof text 从第 30 分钟到 deadline 继续增长 | 883 -> 1077 lines |
| Claude Sonnet 5 第 60 分钟后 implementation 只增加 | 5 lines |
| Claude Sonnet 5 同时 proof text 接近翻倍 | 是 |

这说明 Agent 把实现当成早期 scaffold，而不是持续优化的 proof target。

### 消融与失败：implementation freedom 什么时候帮忙，什么时候害人？

Vero 没有传统机器学习论文那种 ablation table，但 proof-only vs code-and-proof 的配对就是一个关键实验。

它回答的是：

> 让 Agent 自己选择实现，是否会让证明更容易？

答案分裂为两种机制。

#### 帮忙：选择更易证明的实现

作者手动检查到 5 个 code-and-proof 解法：

1. Agent 替换了 reference algorithm。
2. 新实现仍满足同一 specification。
3. 新实现通常牺牲效率，换取 proof tractability。

例子包括：

| 实例 | 行为 |
|---|---|
| `munkres` | 用枚举排列并选择最小成本的朴素实现替换更复杂算法 |
| `sequences` | 用 Lean 标准库 `mergeSort` 替换手写递归 |
| `linked_list` | 用 `List.mergeSort` 相关标准库性质支持 sortedness / permutation proofs |
| `sortedcontainers` | 选择更容易归纳的数据结构行为，但牺牲 asymptotic efficiency |

这里的研究意义是：

1. verified code generation 不应固定“参考算法唯一正确”。
2. 如果 specification 没有写复杂度要求，Agent 合法地选择低效但可证明实现。
3. 这不是 cheating，而是规格边界的自然结果。
4. 但如果领域关心性能，就必须把成本模型也形式化。

#### 害人：实现层破坏了整个证明环境

反向案例更常见：

1. Agent 漏填 implementation slot。
2. Agent 改了实现但没有同步证明。
3. Agent 引入 build error。
4. Agent 写了可编译但被 axiom / cheat screen 拒绝的证明。

论文报告：

| 失败现象 | 数字 |
|---|---:|
| proof-only full solve 但 code-and-proof 未 full solve 的 pairs | 17 |
| code-and-proof 中因 unbuildable implementation module 导致全实例 0 分的 cells | 7/344 |
| GPT-5.5 xhigh 剩余 specs 中约三分之一失败在 build time | 是 |
| GPT-5.5 xhigh 剩余 specs 中另有 14% 被判 cheating | 是 |

这说明 code-and-proof 的困难不是“多写代码”这么简单。

它要求 Agent 维持一个不变量：

```text
For every edit:
  implementation still typechecks
  all prior lemmas still typecheck
  API signature remains unchanged
  specs are untouched
  proof target remains canonical
  no untrusted axiom dependency appears
```

很多 coding agent 能在普通软件仓库里通过测试，是因为测试只在最后样例上给反馈。

Vero 要求更强：

1. 每个 proof obligation 都是显式检查点。
2. 每个 helper theorem 都可能成为全局依赖。
3. 每个 implementation 改动都可能重排 proof search space。

### Figure / Table 证据怎么读？

这篇论文的图表不是装饰，它们分别支撑不同层的 claim。

| Figure / Table | 证据作用 | 不能证明什么 |
|---|---|---|
| Figure 1 pipeline | 说明 curation、agent evaluation、audit 回路如何连接 | 不证明每个翻译都语义完美 |
| Figure 2 instance snippet | 展示 `RepoImpl` / spec / canonical 格式 | 不覆盖所有实例复杂度 |
| Figure 3 performance | 展示 43 个实例上 full solve 结果与时间曲线 | 不应被读成生产 coding agent 排名 |
| Figure 4 mode comparison | 说明 code-and-proof 与 proof-only 不是单调关系 | 不说明哪种模式“普遍更好” |
| Figure 5 proof architecture | 证明 full solve 依赖 shared helper library | 不证明自动 lemma planning 已解决 |
| Figure 6 dynamics | 说明 Agent 早期固定实现、后期堆 proof | 不排除更长预算改善弱模型 |
| Figure 7 failure reasons | 区分 unfilled、build failure、cheat rejection 等失败 | 不覆盖所有可能 reward hacking |
| Cost tables | 说明 full solve 与 partial spec 的成本解释不同 | 不代表未来模型价格或能力 |

我会特别强调 Figure 5 和 Figure 6 的组合：

1. Figure 5 说成功解需要共享 lemma library。
2. Figure 6 说 Agent 的实现通常很早固定。
3. 两者合起来揭示一个 agent-design gap：
   - 真实需要“计划 lemma architecture + 必要时重构实现”。
   - 当前行为更像“先写实现，再局部补 proof”。

### Audit mechanism：把 benchmark 缺陷也变成可证明对象

传统 benchmark 有个尴尬问题：

> 如果题目本身错了，模型失败算谁的？

Vero 的做法是给 Agent 一条“负证据”路径。

在 proof-only 中：

```text
prove_S:
  spec_S(reference_impl)

disprove_S:
  not spec_S(reference_impl)
```

在 code-and-proof 中：

```text
prove_S:
  spec_S(agent_impl)

unsat_S:
  not exists impl, spec_S(impl)

sat_S + joint_unsat:
  S individually satisfiable
  but a group of specs cannot be jointly satisfied
```

这让 Agent 可以形式化说明：

1. reference implementation 不满足某个 spec。
2. 某个 spec 本身不可能满足。
3. 多个 specs 单独看合理，但放在同一个 `RepoImpl` 上互相冲突。

附录报告：

| Audit 结果 | 数字 |
|---|---:|
| released instances 中 adjudicated specification defects | 38 |
| 涉及实例数 | 9 |
| joint-unsatisfiability groups | 6 |
| 38 个 cases 中基于 clean certificate | 34 |
| Agent proof 失败但作者重构证书 | 3 |
| 独立 native evaluation reproduction | 1 |
| Claude Opus 4.8 找到的 cases | 33/38 |
| Codex 找到的 cases | 30/38 |
| 两者共同找到 | 25 |

这个设计的价值在于：

1. 它不把 benchmark 当成绝对真理。
2. 它承认形式化规格会错。
3. 它要求“指出错”也必须有机器可检查证据。
4. 它把 agent evaluation 和 benchmark repair 接成一个闭环。

这对 AI 安全和 Agent 评测也有类比意义：

| 普通评测 | Vero 暗示的更强范式 |
|---|---|
| 标签固定，模型错就是错 | 标签或规格可被证据挑战 |
| 人类复核依赖解释 | 复核依赖 machine-checked witness |
| benchmark 一次发布后静态 | 随 Agent 能力提升持续暴露 latent defects |
| 只测正向完成 | 同时测 refutation 与 inconsistency discovery |

### 相关工作位置：Vero 补的是哪块空白？

Vero 与前人工作的关系可以按两个轴看：

| 轴 | 已有工作 | Vero 的位置 |
|---|---|---|
| 函数级 vs 仓库级 | miniCodeProps、FVAPPS、VERINA、CLEVER 等偏函数级 | 多模块 repository-level |
| proof-only vs code-and-proof | RVBench、VeruSAGE-Bench、VeriSoftBench 等偏证明补全 | 同时支持 proof-only 与 joint implementation-proof |
| 数学证明 vs 软件验证 | LeanDojo、LeanAgent、APE-Bench 更偏 Mathlib / theorem proving | 关注软件仓库、API、数据结构、协议、系统 |
| raw LLM vs agent harness | 很多 benchmark 仍接近 single-shot 输出 | 给 coding agents 完整工具、文件编辑、build access |
| 静态标签 vs audit | 多数 benchmark 缺少题目自纠错 | 用 formal negative evidence 暴露 benchmark defects |

这使 Vero 更像一个 **repository-scale verification harness**，而不是一个普通排行榜。

它给研究者的提醒是：

1. 如果只看 pass@k，可能错过 proof architecture。
2. 如果只看 theorem proving，可能错过 implementation choice。
3. 如果只看 tests，可能错过 specification coverage。
4. 如果不做 anti-cheat，可能把 Lean 机制滥用当成验证能力。

### 证据边界：Vero 没有证明什么？

Vero 的贡献很扎实，但边界也需要写清楚。

| 边界 | 说明 |
|---|---|
| 规格覆盖边界 | 证明只覆盖 formal specifications 写到的性质，没有写性能、内存、并发或所有业务约束就不会被证明 |
| 翻译边界 | Python/Dafny/Verus/Coq 到 Lean 4 的翻译需要人工审查，不能自动保证完全语义等价 |
| 语言生态边界 | Lean 4 是强形式化环境，但真实企业代码还会涉及 Rust、Go、Java、数据库、网络、权限和部署 |
| 时间预算边界 | 90 分钟设置下弱模型可能被 time budget 限制；更长预算可能改变部分 counts |
| 模型版本边界 | 评测绑定 Codex v0.140.0、Claude Code v2.1.191、Lean v4.29.1，未来版本会漂移 |
| 复杂度边界 | 如果规格没有写 asymptotic cost，Agent 可合法提交低效但可证明实现 |
| full solve 严格性 | full solve 更贴近 verified repository，但也会让一个 implementation build error 把全实例归零 |

一个关键例子是 `sortedcontainers`：

1. GPT-5.5 xhigh 在 code-and-proof 中可关闭全部 49 个 specs。
2. 它选择的实现更容易证明。
3. 但论文指出这牺牲复杂度，例如查找和构造的 asymptotic behavior 不再等同原库。
4. 因为 benchmark 没有形式化 cost model，所以这不是违规，只是规格边界。

因此，对 Vero 结果的正确读法不是：

```text
Agent 已经会生产高质量 verified library。
```

而是：

```text
在给定 Lean 4 formalization 和规格范围内，
当前最强 Agent 能完整关闭一部分仓库，
但仍难以系统构造跨模块 invariant 和 lemma architecture。
```

### 对 Agent 研究的延伸：下一步应优化什么？

Vero 给编码 Agent 的启发很具体，不是“更强模型会更好”这种空话。

我认为有六个后续方向。

#### 1. 从 proof search 转向 proof architecture planning

当前失败显示：

1. Agent 能尝试很多局部 theorem。
2. 但不会先识别哪些 specs 共享同一个 invariant。
3. 深 lemma chain 的 pass rate 明显下降。

下一步 agent harness 应该显式维护：

| 状态 | 作用 |
|---|---|
| failing specs cluster | 找共享失败原因 |
| candidate invariants | 抽象跨模块性质 |
| helper dependency graph | 避免重复证明 |
| proof debt | 记录哪些 specs 被某个 lemma 阻塞 |
| implementation-proof coupling | 判断何时应改实现而不是继续写 tactic |

#### 2. 让实现设计服从可证明性，而不是早期定死

Vero 的动态曲线说明 Agent 往往早早固定实现。

更好的流程应是：

```text
repeat:
  propose implementation
  try proving specs
  if proofs require ugly or impossible lemmas:
    refactor implementation toward simpler invariant
  if implementation is too inefficient and cost matters:
    add or respect cost specs
  rebuild full repository
until all specs pass or budget exhausted
```

这比普通 coding agent 的“写代码-跑测试-修 bug”更难，因为 feedback 来自 proof obligations。

#### 3. 把 audit 当作 Agent 能力，而不是异常处理

Vero 的 audit 结果说明强 Agent 能找 benchmark 缺陷。

这可扩展到更一般的 Agent 评测：

1. 如果任务规格冲突，Agent 应该能指出冲突。
2. 如果 reference answer 错，Agent 不应被迫迎合。
3. 如果 labels 泄漏或定义混乱，Agent 应提交可核查证据。

这和 AI 安全评测中的“标签有效性”问题同构：

| Vero | AI 安全评测类比 |
|---|---|
| spec unsat | policy rule 自相矛盾 |
| reference implementation incorrect | benchmark oracle 错误 |
| joint-unsat | 多条安全约束无法同时满足 |
| machine-checked witness | execution trace / source-sink proof / cryptographic log |

#### 4. 给 reward hacking 做结构化威胁模型

Vero 的 anti-cheat 层很像安全 sandbox：

1. 不信任 Agent 工作目录。
2. 只抽取允许区域。
3. 重新渲染干净环境。
4. 检查 proof dependency。
5. 拒绝语义绕路。

这对其他 coding-agent benchmark 也成立：

| 普通 benchmark 风险 | Vero 式防御启发 |
|---|---|
| Agent 修改测试 | clean re-render |
| Agent 删除失败文件 | slot-scoped extraction |
| Agent 伪造日志 | independent grader |
| Agent 利用工具漏洞 | allowlist / dependency check |
| Agent 产出看似正确但语义绕开 | declaration / behavior screening |

#### 5. 把 cost / performance 写进规格

Vero 允许低效但可证明实现，这是形式规格的自然结果。

如果研究者关心“可部署 verified software”，后续需要补：

1. 时间复杂度规格。
2. 空间复杂度规格。
3. side-channel 相关规格。
4. resource bound。
5. 与原实现的 observational equivalence。

否则 Agent 会合理地选择：

```text
更简单实现
  -> 更容易证明
  -> 可能更慢
  -> 但仍满足当前 specs
```

#### 6. 用 failed artifacts 训练下一代 proof agents

Vero 的 sandbox 留下了很多失败轨迹：

1. scratch files。
2. failed proof attempts。
3. helper lemma 草稿。
4. build errors。
5. axiom leak cases。

这些比最终答案更有训练价值。

一个可行训练数据格式是：

| 字段 | 内容 |
|---|---|
| repository state | 当前 Lean project |
| failing spec | theorem name + goal state |
| attempted helper | Agent 写过的 lemma |
| failure reason | unfilled / build error / axiom leak / cheat rejection |
| successful repair | 如果后续 iteration 解决，记录 diff |
| dependency graph | helper -> specs |

这种数据能训练 Agent 学会“先修 proof architecture”，而不是只模仿最终 theorem。

### 结论

Vero 的核心价值不是给出一个新的 coding-agent 排行榜。

它把“AI 写代码是否可信”推进到一个更严格的问题：

1. 代码是否满足形式化规格？
2. 证明是否被 machine checker 接受？
3. 证明是否依赖可信 axiom？
4. 整个仓库是否 buildable？
5. 实现和 proof 是否跨模块一致？
6. benchmark 本身是否允许被 formal audit 修正？

实验结果给出的答案是：

| 问题 | 当前证据 |
|---|---|
| 最强 Agent 能否完成部分仓库级验证？ | 可以，GPT-5.5 xhigh code-and-proof 完整解决 27/43 |
| 是否已接近可靠自动 verified software synthesis？ | 还没有，10 个实例全配置未解，高 spec pass rate 仍不能保证 full solve |
| 成功的关键结构是什么？ | 可复用 helper theorem / lemma library，占 full solve proof lines 的约 70% 以上 |
| 主要失败机制是什么？ | 跨模块 invariant、deep lemma chain、build consistency、implementation-proof coordination |
| 基准自身如何保持可信？ | audit negative evidence + clean re-render + axiom allowlist + declaration screening |

这篇论文给 Agent 研究的最重要提醒是：

<u>可信 coding agent 的终点不是“能改代码并通过测试”，而是能在一个可审计 harness 中维护实现、规格、证明和证据链之间的一致性。</u>

如果把它放到 AI 安全视角，Vero 也说明：

1. 运行时 evidence gate 可以比模型自述更可靠。
2. 评测必须防 reward hacking。
3. 标签、规格和 reference answer 都应接受证据挑战。
4. Agent 的真实能力不只在最终答案，而在它能否构造可复用、可检查、可维护的中间证明结构。

### 参考与核验链接

- arXiv abstract and metadata: https://arxiv.org/abs/2608.13522
- arXiv HTML full text: https://arxiv.org/html/2608.13522
- arXiv PDF: https://arxiv.org/pdf/2608.13522
- Official repository: https://github.com/sunblaze-ucb/vero
- Repository README and benchmark inventory: https://github.com/sunblaze-ucb/vero/blob/main/README.md
- Vero agent integration docs: https://github.com/sunblaze-ucb/vero/blob/main/docs/agents.md
- Vero generation/evaluation tutorial: https://github.com/sunblaze-ucb/vero/blob/main/docs/gen-eval-tutorial.md
