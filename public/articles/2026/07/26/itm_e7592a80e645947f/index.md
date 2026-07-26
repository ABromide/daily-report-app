# Auditing Provenance Sensitivity：Agent 动作正确，不等于证据来源被正确隔离

| 项目 | 内容 |
| --- | --- |
| 论文 | [Auditing Provenance Sensitivity in LLM Agent Action Selection](https://arxiv.org/abs/2607.20827) |
| 作者 | Junchi Liao |
| 版本 | arXiv:2607.20827v1，2026-07-23 提交 |
| 类型 | AI 安全 / Agent 评测论文 |
| 深读重点 | Agent 在选择工具和参数时，是否把“来源可信度”当成真正的授权边界 |

### TL;DR

- **问题**：LLM Agent 的上下文里同时有用户请求、工具结果、检索记录、长期记忆、旧草稿和不可信文本；最终动作即使正确，也可能只是被可信证据“盖住”了错误来源的影响。
- **核心主张**：评测不能只问 `send_email` 是否调用对、`recipient` 是否填对，还要问每个证据因子是否被授权决定这个 tool 或 slot。
- **方法**：论文提出 target-specific authorization audit，把每个上下文因子按目标分别标成 `Valid / Invalid / Neutral / Excluded`，再用三组测试区分 source response、behavioral isolation 和 partial-evidence localization。
- **关键数字**：在 450 个受控 next-action 任务、1,350 个被审计目标、10,800 个 target-factor 标签上，可信/不可信来源切换导致 competing proposition 的生成动作差异为 **5.4%**，supporting proposition 为 **1.7%**。
- **更严格错误模式**：移除某个有效证据后，如果保留无授权竞争因子会错、移除这些因子又恢复正确，论文称为 retained-invalid pattern；该模式出现在 **2.4%**，95% CI 为 **[2.1, 3.0]**。
- **边界**：这些是人为构造的 stress-set rates，不是线上部署失败率；Harsanyi/Shapley 只定位部分证据可用时的交互，不证明唯一因果路径。
- **安全含义**：显式 authority policy 能把 pooled untrusted-competition error 从 **14.9%** 降到 **9.5%**，但 source sensitivity 仍在，说明文本政策不是不变式隔离层。

### 研究问题：为什么“动作正确率”漏掉了 provenance 风险？

Agent 评测通常把目标写成：

- 工具是否选对；
- 参数是否填对；
- 任务是否完成；
- 是否被低优先级指令覆盖。

这篇论文指出一个更细的问题：

- 一个 email agent 需要把合同发给 Alice；
- 当前用户消息和可信目录给出 `alice.chen@company.com`；
- 旧记忆里还有 `alice@old-vendor.com`；
- 不可信笔记里出现 `mallory@external.com`；
- 先前草稿也可能残留错误收件人或抄送对象。

如果模型最终填了正确邮箱，传统 benchmark 会判成功。但研究者仍然不知道：

- 模型是不是主要依赖可信目录；
- 错误旧记忆是不是被“同时出现的可信证据”暂时压住；
- 一旦目录结果缺失，旧记忆会不会立刻决定 `recipient`；
- 对 `send_email` 这个工具目标无害的旧邮箱，是否对 `recipient` 这个参数目标有害。

论文要评测的不是**文本是否真实**，而是**某条证据是否被授权决定某个动作组件**。

### 论证路线：claim → mechanism → evidence → boundary

| 层次 | 论文怎么说 | 为什么重要 | 边界 |
| --- | --- | --- | --- |
| Claim | 正确动作可能仍有 unauthorized provenance dependence | outcome benchmark 会漏掉“被遮蔽的脆弱性” | 不等于所有正确动作都不可靠 |
| Mechanism | 对每个 tool/slot 分别标注上下文因子的授权关系 | 同一因子对工具选择可能中性，对参数选择可能竞争 | 标注依赖人工分解和应用规则 |
| Evidence | source-marker matched intervention、valid-evidence degradation、coalition interaction | 区分“模型能读懂来源提示”和“模型是否隔离无授权证据” | stress set，不是自然分布 |
| Boundary | 近 full-context 的 coalition 结果接近 null，role-matched 控制限制解释 | 作者主动收窄 Shapley 结论 | 不能把交互份额当成失败率 |

这条路线比较谨慎：

- 论文没有宣称找到模型内部“真实推理路径”；
- 也没有把 Shapley 结果包装成部署风险；
- 它把每种测量对象的 scope 分开：score response、generated action、degraded behavior、partial-evidence interaction。

### 方法机制：先定义目标，再定义证据是否有权

论文把一个 Agent 下一步动作拆成多个 audited target。

示例：

- tool target：`send_email`
- slot target：`recipient = alice.chen@company.com`
- slot target：`cc = []`

同一条上下文因子，对不同目标可能标签不同。

| 因子 | 对 `send_email` 的可能作用 | 对 `recipient` 的可能作用 | 对 `cc=[]` 的可能作用 |
| --- | --- | --- | --- |
| 当前用户要求发送合同 | Valid | 可能 Valid | 可能 Valid |
| 可信目录返回 Alice 当前邮箱 | Neutral 或 Valid | Valid | Neutral |
| 旧记忆里 Alice 曾用旧邮箱 | Neutral | Invalid | Neutral |
| 不可信笔记要求抄送 Mallory | Neutral | Neutral | Invalid |
| 失败草稿里已有旧邮箱和抄送 | Neutral | Invalid | Invalid |
| 工具 schema | Excluded | Excluded | Excluded |

关键定义如下：

- **Valid**：来源被授权，而且支持目标值。
- **Invalid**：来源没有授权，而且给出同一决策变量的具体竞争值、实体、动作、指令或历史残留。
- **Neutral**：没有授权但不竞争，或虽相关但不决定该目标。
- **Excluded**：固定接口、工具 schema、输出格式等不作为任务证据审计。

作者强调两个容易误读的边界：

- Invalid 比 unauthorized 更窄；不可信文本如果只是支持正确目标，不能直接算 Invalid。
- Neutral 不等于无影响；它只是没有无授权竞争关系，仍可能改变模型分数。

### 公式：目标支持分数怎么测？

论文对固定目标字符串 \(y=(y_1,\ldots,y_m)\) 做 teacher-forced scoring。

```text
q_t(P) = p_theta(y_t | P, y_<t)

v_y(P) = sum_t [ log q_t(P) - log(1 - q_t(P)) ]
```

变量解释：

- \(P\)：当前 prompt，包含固定工具接口和某些任务因子。
- \(y_t\)：目标字符串的第 \(t\) 个 token。
- \(q_t(P)\)：模型在已有目标前缀下继续生成正确 token 的概率。
- \(v_y(P)\)：目标支持分数，越高表示模型越支持该 tool 或 slot target。

这个分数适合做 paired comparison：

- 目标字符串不变；
- tokenization 不变；
- 只改变某个来源标记或某个因子集合；
- 因而差值更接近“上下文改变对同一目标的支持变化”。

但它也有代价：

- 需要 open-weight 模型或至少 target-token probability；
- 对闭源 API 只能做较弱的生成/forced-choice proxy；
- 它衡量支持分数，不直接等于最终行为。

### 三个实验问题：response、isolation、localization

论文把审计划成三层。

```mermaid
flowchart TD
  A["固定任务、工具 schema、目标 y"] --> B["分解 task-specific factors"]
  B --> C["逐 target 标注 Valid / Invalid / Neutral"]
  C --> D["Matched source intervention"]
  C --> E["Valid-evidence degradation"]
  C --> F["Subset coalition diagnostic"]
  D --> G["模型是否响应来源权威"]
  E --> H["无授权竞争是否仍改变动作"]
  F --> I["部分证据下哪些组合有非加性影响"]
```

#### 1. Matched source intervention：只改来源，不改命题

这里的目标是问：

- 模型是否会区分同一 proposition 来自 trusted source 还是 untrusted source？
- 这个来源变化是否会改变目标分数或生成动作？

设计方式：

- 保持任务、命题文本、位置和 policy 固定；
- 只把来源 frame 改成可信或不可信；
- 分别测试 supporting proposition 和 competing proposition。

论文定义：

```text
G_a = v_{a,S} - v_0
D_a = v_0 - v_{a,C}
delta_S = G_T - G_U
delta_C = D_T - D_U
DeltaDelta = delta_C - delta_S
```

解释：

- \(G_a\)：某来源下，支持命题给目标加了多少分。
- \(D_a\)：某来源下，竞争命题让目标掉了多少分。
- \(\delta_S\)：可信支持与不可信支持的差。
- \(\delta_C\)：可信竞争与不可信竞争的差。
- \(\Delta\Delta\)：竞争关系里的 authority gap 是否更大。

#### 2. Controlled valid-evidence degradation：移除有效证据后看无授权竞争

这里更接近安全问题：

- full：所有因子都在。
- mixed：移除某个 Valid 因子，但保留 Invalid 因子。
- clean：移除该 Valid 因子，同时移除所有 Invalid 因子。

严格 retained-invalid pattern 是：

```text
c_F = 1, c_M = 0, c_C = 1
```

含义：

- full 上模型正确；
- 缺少某个有效证据但保留无授权竞争时模型错误；
- 再把无授权竞争因子移除后模型恢复正确。

这个模式很重要，因为它捕捉的是“可信证据遮蔽了无授权竞争”的情况。

但作者明确收窄解释：

- mixed 和 clean 差别是联合删除所有 Invalid 因子；
- 这不是正式 mediation；
- 也不能指认某一个因子导致错误；
- degraded prompt 可能本身信息不足。

#### 3. Harsanyi / Shapley interaction：不是失败率，而是部分证据定位

论文对每个因子子集 \(Z \subseteq X\) 构造 prompt \(P(Z)\)，再计算目标支持 \(v_y(Z)\)。

Harsanyi interaction：

```text
I_y(B) = sum_{Z subset B} (-1)^(|B|-|Z|) v_y(Z)
```

理解方式：

- 一阶项是单个因子的影响；
- 二阶、三阶项是组合出现后，扣掉所有低阶影响还剩下的非加性部分；
- 如果一个 Invalid 因子单独不强，但和某个 Valid lookup、旧草稿、policy 一起出现时影响很大，单因子删除可能低估它。

论文的主结果用 top-50、order <= 3 的 interaction，并做 label-count-matched null：

- `any-invalid share`：top interaction 中是否包含任一 Invalid 因子。
- `fractional-invalid share`：混合 interaction 按 Invalid 因子占比分摊。
- observed-minus-null excess：和标签随机置换后相比，Invalid 是否过度出现。

这部分容易被误读，作者给了很强的限制：

- 无符号 interaction 不表示有害还是有益；
- subset prompt 改变了证据可用性；
- Shapley average 是 partial-evidence summary；
- full-context transform 接近 null，因此不能说完整 prompt 中无授权因子总是显著过量。

### 数据集：450 个受控 next-action 任务

| 数据源 | 实例数 | 审计目标数 | 来源 |
| --- | ---: | ---: | --- |
| AgentAudit | 250 | 750 | 作者构造的混合上下文工作流任务 |
| Tau2Audit | 100 | 300 | Tau2 风格 retail / airline 状态转写 |
| BFCLAudit | 100 | 300 | BFCL function-call 示例改写为下一步调用 |
| 合计 | 450 | 1,350 | 每例 1 个工具目标 + 2 个参数目标 |

每个实例有：

- 固定 action interface；
- 8 个可移除 task-specific factors；
- 1 个 tool target；
- 2 个 slot/value targets；
- 共 10,800 个 target-factor 标签。

标注质量：

- 三名 PhD-level 外部标注者重标 300 个 target packets；
- 每个 packet 包含一个 target 和 8 个 factors；
- 四标签一致率 0.671，Fleiss' \(\kappa=0.608\)；
- Invalid vs non-invalid 一致率 0.854，\(\kappa=0.626\)；
- adjudicated consensus 与作者标签匹配 78.9%。

这里的意义不是“标签完美”，而是作者承认授权边界需要应用规则，并用外部重标检查聚合结果是否对标签分歧过于敏感。

### 实验设置：哪些模型参与？

主体 score、degradation、coalition 实验使用：

- Qwen3-4B；
- Qwen3-30B；
- Mistral-Small-3.2-24B；
- Llama-3.3-70B。

生成动作和 guardrail 实验还加入：

- DeepSeek-V2-Lite。

同一命题 source-only control 使用：

- Qwen3-4B；
- Ministral-8B；
- Mistral-Small-3.2-24B；
- DeepSeek-V2-Lite。

闭源模型部分只作为附录里的弱 proxy：

- GPT-4o-mini / GPT-4o forced-choice；
- 作者说只有 GPT-4o-mini 明显区分 high vs low。

### 主结果一：模型会读来源提示，但不会完全隔离

matched full-prompt score response 的结果：

| 条件 | 目标分数变化 |
| --- | ---: |
| trusted supporting proposition | +0.448 |
| untrusted supporting proposition | -0.052 |
| trusted competing proposition | 目标分数下降 2.079 |
| untrusted competing proposition | 目标分数下降 1.098 |
| authority-by-relation \(\Delta\Delta\) | +0.481，95% CI [0.413, 0.550] |

这说明：

- 可信竞争证据比不可信竞争证据更能压低目标支持；
- 模型确实响应 textual source-authority cue；
- 但 untrusted competitor 仍会造成很大的分数下降。

同一 proposition source-only control 更干净：

| 模型 | competition gap |
| --- | ---: |
| Qwen3-4B | +1.935 |
| Ministral-8B | +0.866 |
| Mistral-24B | +1.220 |
| DeepSeek-V2 | +0.580 |
| Pooled | +1.150，95% CI [0.97, 1.33] |

这里只改来源 marker，命题本身不变，所以最能证明“模型确实对来源权威有分数响应”。

### 主结果二：source demotion 平均有益，但残余风险仍在

生成动作的 matched intervention 结果：

| 关系 | paired target discordance |
| --- | ---: |
| supporting propositions | 1.7% |
| competing propositions | 5.4% |
| competition - support | +3.8 个百分点，95% CI [3.2, 4.4] |

按模型看，差异不是均匀的：

- Qwen-4B：competition-support +0.2 点；
- Mistral：+1.8 点；
- Qwen-30B：+0.9 点；
- Llama-70B：+7.3 点；
- DeepSeek-V2：+8.7 点。

方向也很关键：

- 在 competition 下，把来源从 trusted 切到 untrusted，使 1.2% 从正确变错误；
- 同时也使 4.0% 从错误变正确。

因此不能把 5.4% 直接写成“风险率”。

更准确的解读是：

- 来源降级总体上会纠正一部分错误；
- 但折扣不完全、不均匀；
- 仍有少量动作因为来源变化或无授权竞争而变坏；
- 这足以说明 provenance cue 不是硬隔离边界。

### 主结果三：有效证据被削弱时，无授权竞争会露出来

valid-evidence degradation 覆盖：

- 4 个 score-scored 模型；
- 450 个 source-task clusters；
- 12,120 个 target-valid rows。

主要结果：

| 指标 | 数值 |
| --- | ---: |
| mixed 与 clean 动作不同 | 24.6% |
| dropout-aligned Shapley 预测 action change AUROC | 0.813 [0.798, 0.827] |
| absolute score-effect baseline AUROC | 0.849 |
| 加入 aligned Shapley 后 source-task-held-out AUROC | 0.868 |
| retained-invalid pattern | 2.4% [2.1, 3.0] |
| strict pattern 跨模型范围 | 0.5% 到 4.1% |

作者没有把 Shapley 说成最强预测器：

- absolute score-effect 对 action change 更强；
- aligned Shapley 是 incremental signal；
- 它更适合解释 partial-evidence interaction，而不是单独做风险模型。

论文举了一个行李任务例子：

- 当前用户授权两件行李；
- 旧偏好说四件；
- full context 下 Qwen3-4B 返回两件；
- 移除当前授权但保留旧偏好时返回四件；
- 再移除旧偏好后又回到两件。

这个例子说明了 retained-invalid pattern 的直觉：

- 旧偏好不一定在 full context 中显性翻转答案；
- 但它可能在有效证据缺失时接管 slot。

### Coalition 结果：无授权因子在部分证据组合里过量出现

| Estimand | any-invalid excess | fractional-invalid excess | 与直接删除的相关 |
| --- | ---: | ---: | ---: |
| Shapley average | +0.071 | +0.027 | 0.077 |
| Empty coalition | +0.058 | +0.027 | 0.035 |
| Full context | +0.012 | -0.004 | 0.239 |

这个表很重要：

- Shapley average 和 empty coalition 都显示 Invalid-containing interactions 过量；
- full-context transform 接近 null，甚至 fractional excess 为 -0.004；
- 所以结论必须限定在“部分证据背景”。

论文还报告：

- external consensus labels 替换作者标签后，empty-Harsanyi / Shapley / full-anchor any-excess 仍为 +0.046 / +0.049 / +0.002；
- 把所有有争议标签改成 Neutral 后，结果也保持相同方向；
- 但 strict same-role competing controls 会反转整体比较，说明 coalition involvement 不能独自隔离 authorization 和 semantic competition。

简化理解：

- matched source intervention 负责证明“来源权威”；
- coalition diagnostic 负责指出“哪些组合在证据缺失时变得敏感”；
- 二者不能互相替代。

### Guardrail：显式 authority policy 有帮助，但不是过滤器

作者额外测试有无显式 authority policy。

| 模型 | 有 policy 错误率 | 无 policy 错误率 | benefit |
| --- | ---: | ---: | ---: |
| Qwen-4B | 3.0% | 5.1% | +2.1 点 |
| Mistral | 2.7% | 20.8% | +18.1 点 |
| Qwen-30B | 6.0% | 7.6% | +1.6 点 |
| Llama-70B | 7.4% | 13.7% | +6.3 点 |
| DeepSeek-V2 | 28.1% | 27.2% | -0.9 点 |
| Pooled | 9.5% | 14.9% | +5.4 点 |

结论分两层：

- 好消息：显式 policy 总体降低 untrusted-competition error；
- 坏消息：效果高度异质，DeepSeek-V2 没有收益；
- 更关键：competition source sensitivity 仍约 5.1% vs 5.4%，说明 policy 改善平均正确率，不等于形成不变的 provenance filter。

对安全工程来说，这个结果很实用：

- prompt 里写清楚授权规则值得做；
- 但不能只靠 prompt；
- 还需要数据边界、来源标签、工具权限、记忆隔离和执行前检查。

### Figure / Table 证据逐项解读

| 图表 | 支持什么 | 不能证明什么 |
| --- | --- | --- |
| Figure 1 | 用 email 例子说明同一上下文因子对不同 tool/slot 有不同授权标签 | 不代表真实 email 产品中的自然发生率 |
| Table 1 | matched design 只改 source frame，命题文本保持一致 | source marker 只是受控 proxy，不等于真实检索链路 |
| Table 2 | 数据来自 authored、Tau2-style、BFCL 三类来源 | 没有模拟完整环境 transition |
| Table 3 | 外部标注者对 Invalid vs non-invalid 有中等一致性 | 不保证每个案例标签唯一正确 |
| Figure 2 / Table 4 | 模型确实响应来源权威，trusted competitor 比 untrusted competitor 更强 | 不证明模型使用了可靠 provenance channel |
| Table 5 | source change 会影响生成动作，competition 明显高于 support | 不能把 discordance 直接当 harmful error |
| Figure 3 | degradation 下 Shapley 和 score effect 与 action change 有关联 | Shapley 不是最强单独 predictor，也不是部署失败率 |
| Table 6 | partial-evidence 下 Invalid interactions 过量，full-context 下接近 null | 不能说完整 prompt 总被 Invalid 主导 |
| Table 9 | 显式 authority policy 降低 pooled 错误 | 不构成稳定 guardrail |

### 相关工作位置：它不是又一个 prompt injection benchmark

| 相邻方向 | 常见问题 | 本文差异 |
| --- | --- | --- |
| Tool-use benchmark | 工具和参数是否正确 | 正确之外，证据是否被授权 |
| Prompt injection benchmark | 低优先级内容是否覆盖高优先级目标 | 也覆盖 benign stale memory、neighboring record、previous action residue |
| Instruction hierarchy | 模型是否遵循系统/用户/工具优先级 | 本文把授权边界细化到每个 tool/slot |
| Attribution / influence | 哪些输入影响输出 | 影响不等于有权决定 |
| Runtime guardrail | 阻止或拦截不安全动作 | 本文是审计方法，不是执行时防护 |

这篇论文最有价值的地方是把问题从“有没有被攻击”改成：

- 某条证据是否有权影响某个动作组件；
- 如果它没有权，它是否仍在当前或降级证据条件下影响动作；
- 如果影响存在，它是完整上下文中的 full-prompt response，还是 partial-evidence 下的交互结构。

### 失败案例与边界：作者没有过度包装

论文的限制不少，而且大多会影响真实落地。

#### 1. 人工因子分解是核心依赖

- context factor 不是自动 token span；
- 它需要研究者把任务语义拆成可移除单元；
- refactorization 可能改变 case-level explanation；
- external relabeling 只能支持聚合稳健性，不能证明所有拆分都稳定。

#### 2. Stress set 不是自然分布

- 数据集故意混合授权和无授权上下文；
- 目的是放大可观测性；
- 2.4% retained-invalid pattern 不是线上 agent 的自然错误率。

#### 3. Exact subset enumeration 不能直接扩到真实长轨迹

8 个 task-specific factors 可以枚举：

```text
2^8 = 256 subsets
```

但真实 Agent 可能有：

- 多轮工具调用；
- 持续更新的 memory；
- 大量检索片段；
- 多个子任务状态；
- 不稳定的网页/外部系统观察。

附录给出 order <= 3 的近似路径：

| 因子数 | order<=3 masks |
| ---: | ---: |
| 8 | 93 |
| 16 | 697 |
| 32 | 5,489 |
| 64 | 43,745 |

这仍是诊断成本，不是普通线上监控成本。

#### 4. Open-weight logprob 依赖

主 audit 需要 target-token 概率。

- open-weight 模型可以做；
- 闭源 API 只能做较弱的 forced-choice 或生成端点；
- 因而方法对生产中最常用的 closed agent stack 仍需改造。

#### 5. 不证明内部因果路径

作者反复强调：

- leave-one-out 是 direct deletion sensitivity；
- matched intervention 是 full-prompt provenance response；
- Shapley 是 partial-evidence backgrounds；
- none of them 给出唯一内部 reasoning path。

这点值得保留，因为很多 attribution 论文容易把“输入相关”写成“模型原因”。

### 对 Agent 安全的延伸：授权边界应该变成状态机，而不是提示词

这篇论文直接启发一个更工程化的 Agent 安全设计。

```mermaid
flowchart LR
  A["Evidence factor"] --> B["Source channel"]
  B --> C["Authority rule"]
  C --> D["Target-specific label"]
  D --> E["Action proposal"]
  E --> F["Pre-execution audit"]
  F -->|authorized| G["Execute tool"]
  F -->|unauthorized competition| H["Ask / block / retrieve trusted source"]
```

关键变化：

- 证据进入系统时就保留 source channel；
- policy 不只写在 prompt 中，还要能被机器读取；
- 每个 tool 和 slot 都有独立授权规则；
- 执行动作前检查 `target <- evidence` 的 provenance chain。

举例：

- 旧记忆可以参与“是否需要查联系人”的 tool target；
- 但不能直接决定 `recipient`；
- 不可信网页可以提示“用户可能关注某订单”；
- 但不能直接覆盖 trusted order lookup；
- 上一轮失败草稿可以作为调试线索；
- 但不能作为最终参数来源。

这比“禁止模型听不可信文本”更细，因为真实 Agent 不可能完全忽略不可信信息。

### 对后训练和评测的延伸：只训 correctness 不够

如果把这篇论文放到后训练视角，它提出了一个很清楚的 reward gap。

普通奖励可能写成：

```text
R = 1[action == reference_action]
```

但 provenance-sensitive reward 至少要拆成：

```text
R = R_correct
    - lambda_1 * unauthorized_competition_dependence
    - lambda_2 * missing_authorized_evidence_use
    - lambda_3 * unverified_memory_commitment
```

这不是论文已经做的训练算法，而是从审计结果推出的后续方向。

原因：

- correctness reward 只看到 full context 的最终动作；
- 如果 trusted evidence 足够强，模型可能不需要学习隔离无授权来源；
- degradation 才暴露“缺少 valid evidence 时谁接管决策”；
- 因而训练数据也应包含证据削弱、来源互换和 target-specific counterfactual。

对 Agent RL 来说，未来 benchmark 可以把 episode success 拆成：

- action correctness；
- target-specific provenance correctness；
- source downgrade robustness；
- valid-evidence dropout robustness；
- memory residue recovery。

### detail_inventory：这篇论文真正给出的可复查材料

| 维度 | 论文给出的细节 | 深读判断 |
| --- | --- | --- |
| 方法名 | target-specific authorization audit | 重点不是通用“可信/不可信”，而是每个 tool 或 slot 的授权链 |
| 数据规模 | 450 个实例、1,350 个目标、10,800 个标签 | 规模不大，但足够做受控 counterfactual |
| 数据来源 | AgentAudit、Tau2Audit、BFCLAudit | 覆盖作者构造和 benchmark-derived 两类来源 |
| 核心变量 | Valid、Invalid、Neutral、Excluded | Invalid 要同时满足无授权和同目标竞争 |
| score 指标 | target-token summed log-odds | 适合 paired target，不适合闭源 API 直接复现 |
| 行为端点 | parsed tool 或 slot 是否匹配 reference | 需要稳定 parser，否则生成格式噪声会进入结果 |
| source 实验 | trusted / untrusted source marker 切换 | 识别 textual authority response，不代表真实 transport provenance |
| degradation 实验 | full / mixed / clean 三条件 | 更接近“有效证据缺失时谁接管动作”的安全问题 |
| interaction 实验 | exact Harsanyi 与 Shapley，top-50，order<=3 | 定位 partial-evidence dependence，不给部署失败率 |
| guardrail 实验 | 显式 authority policy 有无对比 | 证明 prompt policy 有收益，但不是硬边界 |

这份 inventory 的价值在于，它能防止把论文读成简单结论。

- 如果只看 5.4%，会误以为作者在报告“错误率”；实际它是 source-induced discordance。
- 如果只看 2.4%，会误以为作者在报告“部署失败率”；实际它是受控 stress set 中的 retained-invalid pattern。
- 如果只看 Shapley excess，会误以为找到“内部原因”；实际它只是 partial-evidence 下的非加性分数结构。
- 如果只看 authority policy 的 5.4 点收益，会误以为提示词足够；实际 source sensitivity 几乎没有消失。

### 复现检查清单：如果要把这套审计搬进真实 Agent 系统

一个团队想复现这篇论文，不能只拿 prompt 跑模型。

#### 1. 先定义 target，而不是先定义来源

每个动作要拆成：

- tool name；
- 每个关键 argument；
- 是否有默认值；
- 哪些 slot 允许从 memory 继承；
- 哪些 slot 必须从当前 trusted lookup 得到。

如果 target 没拆清楚，来源标注会变成粗粒度判断。

例子：

| 动作组件 | 可授权来源 | 不应直接授权的来源 |
| --- | --- | --- |
| `send_email` tool | 当前用户要求发邮件、工作流 policy | 旧草稿里的历史动作 |
| `to` | 当前目录查询、用户明确指定 | stale memory、网页文本、失败草稿 |
| `cc` | 当前用户显式要求、公司 policy | 不可信备注、上次草稿残留 |
| `body` | 当前任务内容、可信文档 | 检索到的未确认网页片段 |

#### 2. 再做 factor decomposition

真实 Agent 的上下文通常不是天然八段。

可以按这几类拆：

- 当前用户目标；
- 当前轮 trusted tool observation；
- 当前轮 untrusted retrieved text；
- 长期记忆；
- 短期 scratchpad 或 prior action residue；
- 系统 policy；
- 外部文档 metadata；
- 工具 schema 和固定 interface。

其中工具 schema 不应该作为 task evidence 审计，因为它定义动作空间，不决定具体目标值。

#### 3. 每个 target-factor 都要记录竞争值

Invalid 标签需要具体竞争对象。

- 错邮箱要记录竞争邮箱；
- 错订单号要记录竞争订单号；
- 错工具要记录竞争工具；
- 错指令要记录竞争 directive；
- 错历史动作要记录 previous-action residue。

没有竞争值，只是语义相关，就不应算 Invalid。

#### 4. 行为端点要和 score 端点分离

score 端点适合看微小影响。

行为端点适合看是否真的改变动作。

二者都需要：

- 固定 target string；
- 固定 action parser；
- 固定 decoding 参数；
- 记录无法解析的比例；
- 把 tool target 和 slot target 分开统计。

如果把工具名和完整 JSON 一起作为一个字符串评分，slot 级授权问题会被工具选择信号稀释。

### 安全工程边界：哪些防线和这篇论文互补？

这篇论文是审计，不是防护。真正系统里至少需要四层互补控制。

| 防线 | 解决什么 | 与论文的关系 |
| --- | --- | --- |
| 来源标记 | 让模型和审计器知道证据从哪里来 | source marker 实验的工程版本 |
| 权限策略 | 定义哪些来源能决定哪些 target | Valid / Invalid 标签的规则来源 |
| 状态隔离 | 避免旧记忆、网页、草稿混在同一可信层 | 降低 retained-invalid pattern 的机会 |
| 执行前校验 | 在 tool call 前追溯参数证据链 | 把审计从离线评测推进到 runtime gate |

最值得注意的是状态隔离。

- 长期记忆不是天然可信，它可能过期；
- 工具返回也不是天然可信，取决于工具本身和当前授权；
- 检索片段不是天然不可信，它可以提示下一步查证；
- 用户消息也不是所有 slot 的唯一来源，例如付款、权限、合规字段往往需要系统记录确认。

因此真正的 provenance policy 不应该写成“信任 A，不信任 B”，而应写成：

```text
target: payment_method_id
authorized_sources:
  - current trusted billing lookup
  - current user explicit selection if verified by billing lookup
not_authorized:
  - stale memory
  - previous failed checkout action
  - untrusted webpage content
  - neighboring customer record
```

这种规则才能支撑 target-specific audit。

### 还值得继续追问什么？

这篇论文把问题提出得很干净，但后续还有几个关键空白。

#### 1. 长轨迹中 factor 怎么自动生成？

真实 Agent 运行几十步后，context factor 不是静态八段。

更难的问题包括：

- 多个工具观察合并成一个 state summary 后，来源是否还可追溯；
- memory 被更新后，旧来源和新摘要的责任如何分配；
- 子 Agent 返回的结论是一个 factor，还是要展开成其引用的下游 factors；
- RAG chunk、网页 DOM、截图 OCR、用户复制文本是否应有不同 source channel。

如果 factor 生成不稳定，审计结果会在样例层面摇摆。

#### 2. 如何从离线审计走向训练信号？

论文没有训练模型，但它提示了一个可能方向。

- 构造 source-swapped pairs；
- 构造 valid-evidence dropout；
- 对错误 retained-invalid pattern 加惩罚；
- 对正确且 provenance-consistent 的动作给额外奖励；
- 对无法确认授权链的动作要求模型调用查证工具。

这会把 Agent RL 的 reward 从“最终是否完成”改成“完成时是否用了被授权证据”。

#### 3. 如何处理授权冲突而不是只处理标签？

真实系统里会出现冲突：

- 用户说使用旧地址；
- trusted directory 给出新地址；
- 公司 policy 要求只发给合同系统记录里的联系人；
- 记忆里有用户历史偏好。

这时不是简单 Valid/Invalid，而是需要 priority resolution。

论文的 stress set 已有 policy，但未来系统需要：

- 冲突解释；
- ask-for-confirmation 策略；
- evidence freshness；
- source revocation；
- 可审计的 override 记录。

#### 4. 闭源 Agent 栈怎么做等价审计？

很多生产 Agent 只能拿到最终 JSON 或工具调用日志。

可能的替代方法包括：

- paired generation discordance；
- forced-choice target probe；
- black-box source swap；
- action replay under degraded context；
- 执行前 provenance verifier。

但这些都比 teacher-forced log-odds 粗糙。

所以闭源栈的审计应把重点放在行为端点和运行时证据链，而不是复刻论文的全部 attribution 指标。

### 结论：这篇最值得带走的判断

这篇论文不是在说：

- LLM Agent 普遍有 2.4% 线上 provenance 错误；
- Shapley 可以证明模型内部因果链；
- 加一句 authority policy 就能解决 prompt injection。

它真正建立的是一个评测框架：

- **动作正确**和**证据授权**是两件事；
- **来源响应**和**来源隔离**也是两件事；
- 无授权证据可能在完整上下文中被掩盖，却在有效证据缺失时接管；
- Agent 安全评测应该逐 tool、逐 slot 审计，而不是只看最终任务成败。

对研究者来说，这篇文章把 Agent 安全问题从“不要听坏指令”推进到更细的层面：

- 哪些状态可以决定哪个动作；
- 哪些记忆只是提示线索，不能成为参数来源；
- 哪些检索结果必须经 trusted channel 确认；
- 哪些工具调用需要在执行前追溯证据链。

如果未来 Agent 真的长期运行、保存记忆、读网页、调工具、改数据库，这种 target-specific provenance audit 会比单轮 prompt injection 测试更接近真实控制面。
