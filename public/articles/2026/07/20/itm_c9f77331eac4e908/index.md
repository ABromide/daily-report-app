# RESOURCE2SKILL：把人类多模态教程蒸馏成可执行 Agent 技能库

| 字段 | 内容 |
| --- | --- |
| 论文 | RESOURCE2SKILL: Distilling Executable Agent Skills from Human-Created Multimodal Resources |
| arXiv | https://arxiv.org/abs/2606.29538 |
| PDF | https://arxiv.org/pdf/2606.29538 |
| HF Papers | https://huggingface.co/papers/2606.29538 |
| 官方代码 | https://github.com/microsoft/Resource2Skill |
| 官方数据 | https://huggingface.co/datasets/microsoft/RESOURCE2SKILL |
| 当前窗口证据 | arXiv v4 于 2026-07-17 17:01:23 UTC 更新，HF Papers 页面在 2026-07-20 提交并标为当日论文 |

### TL;DR

- **这篇论文做什么**：RESOURCE2SKILL 研究如何把人类已经公开留下的多模态操作知识，转成软件 Agent 可浏览、可组合、可执行的技能库。资源来源包括教程视频、代码仓库、文章、文档和参考产物。
- **核心方法**：作者把每个 skill 表示成 `(p, x_text, x_visual, x_code, m)`。`p` 是领域分类路径，`x_text` 解释机制与适用条件，`x_visual` 保留截图或渲染预览，`x_code` 提供可执行或可改写片段，`m` 记录元数据与 provenance。
- **执行方式**：Agent 先用 MetaBrowse 在层级 Skill Wiki 中检索候选，再由语言模型选择最多 5 个技能读全量内容，并通过 MCP 暴露的领域 backend 直接执行技能代码或参考技能说明。
- **关键实验**：作者在 Web、Excel、Reaper、PPT、Blender、CAD、UE5 七个软件创作领域、四个模型后端上评测。`w Skills` 在 28/28 个模型-领域单元格中超过无技能基线，平均 overall 从 45.0% 提到 56.8%，提升 +11.9 个百分点。
- **与强 harness 对比**：ClaudeCode-H 与 Codex-H 已经能提升 no-skill agent，但 full RESOURCE2SKILL 仍在 26/28 个主聚合单元格超过两者中的更强者；两个例外都在 1 分以内。
- **消融结论**：视频是最不可替代的资源族；去掉视频后五域平均从 68.9% 降到 59.4%。完整多模态 entry 又比纯文本 entry 多 +3.9 个百分点，说明技能不是简单 prompt 记忆。
- **在线补技能的边界**：标准任务上 online acquisition 只带来 +0.7pp；专门构造的 novel task 上，从 41.2% 提到 62.8%，提升 +21.6pp。作者因此把在线搜索定位为补洞机制，而不是常规增强器。
- **局限**：评测集中在创作型软件产物，由模型评审打分；人工一致性样本只有 17 个 task-artifact pair。失败案例显示，技能检索到但 grounding 不充分时，可能引入占位文本、公式错误或过度字面组合。

### 研究问题：Agent 的 skill 从哪里来？

这篇论文回应的不是“Agent 是否应该有技能”，而是更具体的问题：

- 如果技能都靠人工写，规模会很慢。
- 如果技能只从 Agent 自己的失败轨迹里长出来，覆盖会被已有任务分布限制。
- 如果技能只是文本说明，很多软件创作任务里的视觉节奏、参数习惯、排版结构和代码细节会丢失。
- 如果直接把互联网资源塞进上下文，Agent 会遇到噪声、检索粒度、可执行性和 provenance 难题。

作者的切入点是：人类已经留下了大量可学习的程序性知识。

- 视频里有时间顺序、视觉效果和操作节奏。
- 代码仓库里有 API 调用、参数组合和工程结构。
- 文章与文档里有概念解释、风格约束和设计意图。
- 参考 artifact 里有成品形态，可以提供视觉或结构 anchor。

因此，论文把问题重新定义为一个 **resource-to-skill distillation** 问题：

| 原始资源 | 普通 RAG 的用法 | RESOURCE2SKILL 的目标 |
| --- | --- | --- |
| 教程视频 | 截 transcript 或摘要 | 抽出时序操作、视觉变化、可复用步骤 |
| 代码仓库 | 检索 README 或代码片段 | 归纳 API pattern 与可执行 skill body |
| 文章/文档 | 作为背景知识引用 | 提炼适用条件、风格规则、任务边界 |
| 参考产物 | 当作示例图片 | 形成视觉 preview 与目标结构描述 |

这个定义对 Agent 研究很关键。它把“知识”从回答型 facts 转向可重复调用的 procedure，也把技能库从手写 prompt 库转向可验证的外部记忆系统。

### 论文主张与论证路线

作者的论证可以按 `claim -> mechanism -> evidence -> boundary` 阅读：

| Claim | Mechanism | Evidence | Boundary |
| --- | --- | --- | --- |
| 多模态资源可以被蒸馏成软件 Agent 可用技能 | 构造 operator `f_theta` 从视频、代码、文章、artifact 中抽取文本、视觉、代码和元数据 | 七个创作领域的 skill library 被用于完整 benchmark，官方仓库释放 runtime 与 skill libraries | `f_theta` 仍是 vision-capable LM 调用，不是端到端训练出的稳定编译器 |
| 层级 Skill Wiki 比平铺文本库更有效 | taxonomy path 进入 BM25 候选池，LM 再读结构化证据做 subset selection | Wiki 组织在 Web、Excel、Reaper、PPT、Blender 五域都优于 flat pure-text | taxonomy 由领域设计决定，迁移到新软件需要先有合理领域分类 |
| 技能提升不只是 harness 更强 | 同一模型、同一 brief、同一 judge、同一 backend 下比较 `w Skills`、`w/o Skills`、ClaudeCode-H、Codex-H | `w Skills` 平均 56.8%，`w/o Skills` 45.0%，Codex-H 50.5%，ClaudeCode-H 50.4% | judge 主要是模型评审；虽然有人工一致性检查，但样本有限 |
| 视频资源不可被代码、文章、artifact 完全替代 | 视频保留 temporal operation 和 visual sequencing | 去掉视频后五域平均 68.9% -> 59.4%；视频-only 仍比 no-video 三源组合高 7.4pp | 结论来自软件创作领域，未必等价于纯文本 coding 或纯数据分析任务 |
| online acquisition 应该补洞，不该无边界扩上下文 | 离线池不足时才调用同一个 construction operator，online pool 与 offline pool 分离 | 标准任务 +0.7pp，novel task +21.6pp | online 搜索质量依赖外部资源可得性和验证 predicate |

这条路线的重点是“控制变量”。作者不是只说 Agent 有技能会更好，而是拆开了：

- 技能是否带来增益；
- 层级组织是否带来增益；
- 多模态 entry 是否带来增益；
- 资源类型之间是否可替代；
- 在线补技能何时真正有用；
- 强 agentic CLI harness 是否已经能替代技能库。

### 方法机制：Skill Wiki 的数据结构

论文中 skill 被形式化为：

```text
s = (p, x_text, x_visual, x_code, m)
```

变量含义如下：

| 变量 | 含义 | 对 Agent 的作用 |
| --- | --- | --- |
| `p` | 领域 taxonomy 路径 | 把技能放进可浏览的类别树，帮助检索和过滤 |
| `x_text` | 文本视图 | 说明名称、机制、适用条件、输入、预期效果 |
| `x_visual` | 视觉视图 | 保存截图、thumbnail、render preview 或 diagram |
| `x_code` | 代码视图 | 保存可执行或可改写的程序片段 |
| `m` | 元数据 | 用于 provenance、审计、去重、过滤、可执行性标记 |

这个 tuple 的意义不是“把所有资源压成一段长 prompt”。它把技能拆成几个可被不同阶段使用的视图：

- 检索阶段主要看 `p`、name、tags、applicability。
- 选择阶段读 compact frontmatter 与候选 evidence。
- 执行阶段才展开完整 text、visual 和 code。
- 审计阶段依赖 source、hash、`exec_ok` 等 metadata。

论文强调，某些 skill 的 `x_code` 可以为空。也就是说，Skill Wiki 不是只保存能直接运行的代码模板：

- 有些技能是 reference-only，用于风格、构图、设计或概念迁移。
- 有些技能有 executable code body，可以直接对 domain backend 执行。
- 默认 verified-only mode 会过滤掉 `exec_ok=False` 的可执行体，但 reference-only 条目仍可能提供有用的文本与视觉 grounding。

### Resource-to-Skill Construction：从资源到技能的五道门

构造阶段可以写成：

```text
Input:
  D: domain, such as web, ppt, excel, blender
  R_D: resources from videos, repositories, articles, artifacts
  T_D: domain taxonomy

For each resource r in R_D:
  candidate_skills = f_theta(r, D)
  For each candidate skill s_tilde:
    s = normalize(s_tilde)
    if A_D(s) == 1:
      add s to Sigma_D

Output:
  Sigma_D: accepted Skill Wiki for domain D
```

这里 `f_theta` 是 vision-capable LM 驱动的 distiller。它做四类抽取：

- 从视频里抽 key frames 和可见操作序列。
- 从代码里抽 code regions、参数签名和 API pattern。
- 从文章里抽 prose passages、适用条件和解释性规则。
- 从 artifact 里抽 rendered exemplars 和目标形态。

接受 predicate `A_D` 是论文里最值得注意的工程设计之一。它不是让 LM 判断“这个技能好不好”，而是做五类门控：

| Gate | 检查什么 | 为什么重要 |
| --- | --- | --- |
| completeness | schema 字段是否完整 | 防止 skill 只有标题没有可用内容 |
| traceable provenance | 来源是否可追溯 | 后续调试与审计需要知道技能从哪里来 |
| deduplication | 是否与已有 skill 重复 | 防止库规模膨胀但有效覆盖没有增加 |
| modality consistency | 文本、视觉、代码是否互相一致 | 防止截图说一种事、代码做另一种事 |
| structural executability | 有代码时能否结构性运行 | 防止 Agent 拿到不可运行的伪代码 |

这个设计有一个研究价值：它把“技能质量”拆成可操作的工程约束，而不是把所有责任交给最终任务评分。

### MetaBrowse：为什么不是普通向量检索？

给定用户 brief `q`，MetaBrowse 的第一步不是直接从全库做 embedding nearest neighbor，而是把 taxonomy path 放入 lexical scoring：

```text
C_K(q) = TopK_{s in Sigma_D} BM25(
  q,
  name(s) ⊕ tags(s) ⊕ applicability(s) ⊕ p(s)
)
```

然后语言模型读取候选集合的结构化证据，选择一个 subset：

```text
S(q) = pi_phi(q, {Phi(s): s in C_K(q)})
```

这里有两个关键点。

第一，`p(s)` 进入 BM25，说明作者相信 taxonomy 本身是可检索语义的一部分。

- 在 PPT 里，layout、typography、motion 是不同操作族。
- 在 Blender 里，geometry、material、lighting、camera 是不同操作族。
- 在 Excel 里，formula、chart、dashboard layout 之间也不是同一种技能。

第二，选择是 subset，不是单一 top-1。

- Agent 可以组合多个技能。
- LM selector 可以选择少于 5 个。
- 如果没有好候选，它可以选零个，回到 free-form execution。

这比“检索一个最相似文档”更适合软件创作任务，因为一个最终 artifact 往往同时需要布局、风格、数据结构、渲染或验证技能。

### 执行循环：技能通过 MCP 进入真实软件 backend

论文把运行过程统一成四步：

```text
Input:
  q: task brief
  Sigma_D: domain skill wiki
  MCP tools: browse/search/read/apply/render

State:
  selected_skills = []
  artifact_path = required output path

Loop:
  1. Plan task requirements.
  2. MetaBrowse:
     - list or search skill categories.
     - inspect candidate metadata.
     - read selected text, visual, code views.
  3. Apply:
     - execute selected skill code when verified.
     - adapt reference-only evidence when no executable body exists.
     - call domain apply tool against live backend.
  4. Render and verify:
     - produce screenshot, deck frames, workbook contact sheet, audio preview, 3D render, or CAD/UE5 viewport.

Output:
  final artifact plus trace of selected skill IDs, calls, errors, and judge result.

Failure boundary:
  if skill bindings do not resolve, apply tool returns not-applicable,
  or rendered artifact is missing/too small/silent,
  the run receives overall = 0 or lower artifact-quality score.
```

这个循环的重要性在于，skill code 在存在时可以直接对 live MCP server 执行，中间没有再让语言模型把技能“翻译”成另一个模糊版本。

同时，论文也没有把 online acquisition 做成开放式浏览器乱搜。只有当 `C_K(q)` 不足时，同一个 `(f_theta, A_D)` 会被调用：

- 发出 targeted queries；
- 从同一资源族返回资源；
- 蒸馏成 temporary candidates；
- 通过相同 validation；
- 暴露为当前任务或当前 split 的 separate online pool；
- 不写回 offline pool。

这让 online 结果可控，也让标准评测能区分“离线技能库本身的能力”和“在线搜索补洞的能力”。

### 实验设置：七个软件创作领域、四个 Agent backend

主实验覆盖七个领域：

| Domain | Backend / 产物 | 评测渲染方式 | 论文给出的 active wiki size |
| --- | --- | --- | --- |
| PPT | SVG 到 `.pptx` native shapes | deck playback、frame 或 contact sheet | 996 |
| Excel | openpyxl / xlsxwriter | LibreOffice 导出成 worksheet contact sheet | 632 |
| Web | HTML/CSS/JS | Playwright 1280 viewport screenshot | 941 |
| Blender | `bpy` headless | final PNG 或 hero-shot render | 661 |
| Reaper | ReaScript over MCP | WAV bounce，再转 MP3 preview 给 audio judge | 934 |
| CAD | ezdxf / FreeCAD fallback | 两个正交角度 viewport screenshot | 312 |
| UE5 | UE5-MCP bridge | editor viewport HighResShot | 417 |

每个领域有 80 个人工筛选 brief。主比较、scaling、online/offline 使用固定 matched `N=80` 子集；消融使用 matched `N=40` 子集。

比较系统包括：

- `w Skills`：完整 RESOURCE2SKILL。
- `w/o Skills`：同一 Agent 可以对 domain apply tool 写自由代码，但没有 skill library。
- `ClaudeCode-H`：off-the-shelf Claude Code harness。
- `Codex-H`：off-the-shelf Codex harness。

所有 agent 和 judge 调用使用 temperature 0、reasoning effort low。非音频 artifact 由 GPT-5.4 vision judge 评分；Reaper 由 GPT-4o-series audio-capable judge 评分。

评分方式是每个领域五个轴，每轴 0-10，再乘以 10 变成百分制。overall 是五轴无权平均。缺失、无法打开、过小或静音 artifact 按 overall 0 处理。

### 主结果：技能库的增益大于单纯 harness 增益

Table 1 的主结果可以压缩成几个关键数字：

| 对比 | 平均 overall | 结论 |
| --- | ---: | --- |
| `w Skills` | 56.8% | 完整技能库 |
| `w/o Skills` | 45.0% | 无技能同 backend |
| Codex-H | 50.5% | 强 agentic harness baseline |
| ClaudeCode-H | 50.4% | 强 agentic harness baseline |

更细的结果如下：

| Model | `w Skills` Avg. | `w/o Skills` Avg. | 最大结构性观察 |
| --- | ---: | ---: | --- |
| GPT-5.5 | 65.8 | 51.9 | 技能库在 Blender、UE5、PPT 上有明显增益 |
| GPT-5.4 | 66.9 | 51.9 | Web 82.4、Excel 76.4、Reaper 77.3、UE5 67.3 |
| GPT-5.4 Mini | 51.9 | 41.4 | 小模型仍能从 skill grounding 获益 |
| GPT-5.4 Nano | 42.8 | 34.7 | 最弱 backend 也保持正向提升 |

作者强调两点：

- `w Skills` 在 28/28 个 model-domain cell 中超过 `w/o Skills`。
- 与 ClaudeCode-H、Codex-H 中更强者相比，`w Skills` 赢下 26/28 个 cell。

两个例外很有解释力：

- GPT-5.5 Web 上 ClaudeCode-H 比 `w Skills` 略高。
- GPT-5.4 Nano PPT 上 Codex-H 比 `w Skills` 略高。
- 两者都在 1 分以内，不能支持“harness 已经替代技能库”的强结论。

论文还报告，`w Skills` 对 `w/o Skills` 的 paired Wilcoxon p-value 在已报告单元格中都小于 `10^-3`。这至少说明，在作者的 matched brief 设计下，提升不是由某些随机 brief 分布差异造成。

### 结果该怎么解释：lift 集中在“约定密集”的软件环境

论文对主结果的解释不是泛泛说“知识越多越好”，而是指出增益集中在约定密集、难以从 prompt 临场重建的领域。

典型例子是 UE5：

- UE5 Python API、level lighting、actor placement、sequencer、material assignment 都有强约束。
- free-form code agent 经常难以组出最低可用场景。
- 主结果中 UE5 在较大 backend 上出现 +30 到 +40pp 级别提升。

Blender、Web、Excel 也类似：

- Blender 的材质、灯光、camera、composition 需要具体参数经验。
- Web 的视觉层级、section richness、modernness 不只是写 HTML。
- Excel 的 dashboard、named range、formula pattern 和 chart quality 容易因细节缺失而掉分。

Reaper 增益较小，作者认为可能是 no-skill prior 已经相对强。这提醒我们：skill library 的价值不是均匀分布的，它更像是对“高摩擦工具环境”的补偿。

### 消融一：skill 数量增长到约 200 后开始饱和

Skill-pool scaling 研究控制 agent、judge、brief set 和 wiki interface，只改变可见 skill pool 大小。

主要结论：

- 每个领域都随 library size 单调提升。
- `0 -> 200` 是最大增益段。
- `400 -> Full` 每个领域最多只增加 +0.8pp。

这说明技能库不是越大越线性变好。

- 早期 skill 覆盖 common operations 和 recovery routines。
- 后期 skill 更多填补 domain-specific gaps。
- 检索预算固定时，库太大如果组织不好，可能反而增加选择难度。

因此，RESOURCE2SKILL 的重点不是盲目扩大库，而是让 taxonomy、metadata、frontmatter 和 selection policy 共同控制规模。

### 消融二：online acquisition 是补洞，不是常规 booster

Table 2 把 offline-only 和 offline+online 放到两个 task set 中比较：

| 配置 | Offline Pool | Online Pool | Task Set | Mean Overall | 增量 |
| --- | ---: | ---: | --- | ---: | ---: |
| Offline-only | 891 | 0 | `T_standard` | 65.4 | - |
| Offline+Online | 891 | 100 | `T_standard` | 66.1 | +0.7pp |
| Offline-only | 891 | 0 | `T_novel` | 41.2 | - |
| Offline+Online | 891 | 100 | `T_novel` | 62.8 | +21.6pp |

这个表很重要，因为它反驳了一个常见误解：

- online search 不是每次都该开。
- 对常规任务，离线库已经覆盖主要需求，在线补技能几乎没有收益。
- 对 offline pool 明确缺口的任务，online acquisition 才是关键机制。

这和 Agent 安全也有关。无限制在线扩展会带来不可控资源、污染来源和评测泄漏风险。作者把 online pool 和 offline pool 分离，至少在实验里避免了“跑完一次就把测试分布写进长期记忆”的问题。

### 消融三：视频是最不可替代的资源族

Table 3 做 resource-source mix 消融。最关键的五域平均结果：

| Source 组合 | Avg. |
| --- | ---: |
| Code + Article + Artifact，无 Video | 59.4 |
| Video only | 66.8 |
| Video + Code | 67.6 |
| Video + Article | 68.1 |
| Video + Artifact | 67.7 |
| Video + Code + Article + Artifact | 68.9 |

作者的解释是：视频携带时间顺序和视觉变化。这些信息在软件创作任务里很难从静态代码或文章恢复。

例如：

- Excel dashboard 不只是公式，还包括从数据表到 KPI block 再到 chart 的组织步骤。
- Web landing page 不只是 CSS 属性，还包括 section rhythm、层级和视觉完成度。
- Blender scene 不只是 `bpy` API，还包括材质、灯光、构图的连续调整。

但 supplemental source 仍有价值：

- code 提供 API 细节和可执行 fragment；
- article 提供概念解释和设计理由；
- artifact 提供成品样式与结构 anchor。

所以完整资源组合虽然只比最强两源多 0.3 到 0.9pp，但它提供 coverage insurance。

### 消融四：多模态 entry 不是纯文本记忆

Table 4 控制了相同 resource pool、accepted skill IDs、metadata、BM25-then-LM budget、agent 和 judge，只改变 post-retrieval content。

| 暴露内容 | Avg. |
| --- | ---: |
| Text | 65.0 |
| Text + Visual | 66.9 |
| Text + Code | 67.0 |
| Text + Visual + Code | 68.9 |

这组结果说明两件事：

- text 已经很强，因为它继承了 applicability、routing cues 和 curated skill ID。
- visual 与 code 各自提供约 +2pp，完整组合最好。

从研究角度看，这比“多模态一定更好”的口号更具体。作者证明的是：

- 在同一批 skill、同一检索预算下；
- Agent 多看到 visual 或 code；
- 最终 artifact score 仍然提升。

这种设计能排除一个弱解释：不是因为多模态版本挑了更好的技能，而是同一技能的表达视图更有用。

### 消融五：层级选择策略胜过 BM25、Embedding 和随机抽样

Table 5 对 selection strategy 的五域平均：

| Method | Avg. |
| --- | ---: |
| Ours: hierarchy-then-LM MetaBrowse | 68.9 |
| BM25 | 66.0 |
| BM25+Embed | 64.2 |
| Embed | 60.0 |
| Random-FullPool | 58.0 |
| No-Skill | 57.3 |

最大差距出现在：

- Excel：Ours 比最强 retrieval-only baseline 高 +5.0pp。
- PPT：高 +3.8pp。
- Blender：高 +2.3pp。

这说明软件 skill 的匹配不是简单语义相似度问题。

- 一个 PPT brief 可能同时需要 corporate shell、agenda layout、chart motif 和 motion constraint。
- 一个 Excel brief 可能需要 formula pattern、dashboard layout 和 chart formatting。
- 一个 Blender brief 可能需要 material、lighting、camera 的组合。

Embedding 对“语义接近”敏感，但对“能不能和其他技能一起构成可执行方案”不一定敏感。层级 browse 让 Agent 先缩小到功能区域，再让 LM 读 evidence 选择组合，这更符合技能组合任务。

### Figure / Table 证据逐项解读

| 图表 | 论文中支持的主张 | 不能证明什么 |
| --- | --- | --- |
| Figure 1 | 展示从多模态资源到七个创作领域 Skill Wiki 的总体想法 | 不提供定量证据 |
| Figure 2 | 展示 construction、wiki organization、selection、execution 的 pipeline，以及 online acquisition 复用同一 operator | 不证明 operator 在所有外部资源上都可靠 |
| Table 1 | 主结果：技能库在七领域四 backend 上稳定超过 no-skill，并多数超过强 harness | 不证明真实人类用户会同样偏好所有 artifact |
| Scaling figure | 技能数量增长的收益曲线和饱和趋势 | 不说明新领域的 200-skill 阈值也成立 |
| Table 2 | online acquisition 对 novel gap 有大收益，对 standard task 收益很小 | 不证明在线搜索没有安全风险 |
| Table 3 | 视频资源不可替代，多源组合有覆盖保险 | 不证明纯代码领域也需要视频 |
| Table 4 | text、visual、code 视图分别贡献增益 | 不证明所有技能都需要三种视图 |
| Table 5 | hierarchy-then-LM selection 优于检索-only 策略 | 不证明 taxonomy 设计可以自动得到 |
| Case-study figures | 展示成功和失败的具体 artifact 差异 | 失败案例是手写 boundary probes，不进入主聚合结果 |

本篇没有本地化图片，因为关键证据由 Table 1-5 和附录协议中的数字承载。Figure 1/2 主要是概念图，正文用流程和表格即可复现其论证功能。

### 失败案例：技能不是越复杂越安全

附录 J 很有价值，因为它没有只展示成功样例。作者给了 Web、PPT、Excel、Blender、Reaper 的 success/failure pairs。

几个失败边界尤其值得看：

| 领域 | 失败现象 | 说明的机制边界 |
| --- | --- | --- |
| Web | retro-futurist tabletop game 页面中，skill arm 更稀疏、完成度不如 no-skill | 检索到的 skill 可能与 brief 风格只部分匹配 |
| PPT | quarterly review deck 中出现 placeholder text 和 JSON-like fragments | 技能组合可能把中间表示泄露到最终 artifact |
| Excel | dashboard 复用组件后留下 `#NAME?` 公式错误 | 公式绑定和命名范围 grounding 没解决时，skill 会放大错误 |
| Blender | perfume bottle macro 中曝光和相机参数未继承，最终瓶子不可辨识 | 视觉技能组合依赖连续参数协调 |

这些失败案例让论文的结论更可信。它说明 RESOURCE2SKILL 的技能库不是 magic memory：

- 检索错了会伤害产物。
- 技能局部正确但参数没绑定，会比简单方案更糟。
- reference-only skill 需要 Agent 自己理解，不能保证执行。
- executable skill 通过 structural executability 只证明能跑，不证明适合某个 benchmark brief。

### 评测可信度与复现边界

论文在附录里给了不少防泄漏设计：

- benchmark brief 是 task brief，不是 demonstration。
- brief generator 不接收 skill ID、wiki listing、library size 或 taxonomy tree。
- resource collection query 来自 taxonomy，不来自 benchmark brief。
- acceptance predicate 的阈值在 benchmark scoring 前冻结。
- benchmark failure rates 和 judge scores 不回流到 library。
- scaling pool 和 offline/online split 在 launch 前固定，rerun 复用同一 skill IDs。

这些设计降低了“技能库偷偷记住测试题”的风险。

但仍有几个边界：

- 自动 judge 是核心评分来源。
- 人工一致性检查只抽 17 个 task-artifact pair。
- 论文报告 overall 轴上 Spearman `rho = 0.71`、ICC `= 0.66`，属于可用但不是完美一致。
- utility 轴分歧更高，说明模型 judge 可能偏好视觉完成度而非真实可用性。

因此，主结果更适合被理解为：

- 在作者控制的 artifact-first benchmark 中，技能库显著提升模型评审下的产物质量。
- 它还不能完全证明真实工作流中的长期维护成本、用户偏好和错误修复成本。

### 与已有 Agent / memory / tool-use 工作的关系

RESOURCE2SKILL 和几条研究线相邻，但问题不同：

| 相邻方向 | 常见目标 | RESOURCE2SKILL 的差异 |
| --- | --- | --- |
| Agent trace memory | 从 Agent 自己的成功/失败轨迹学习 | 从人类资源中蒸馏，覆盖不被历史 Agent 任务限制 |
| RAG over docs | 检索文本知识支持回答或编码 | 把资源转成可执行、可浏览、可审计的 skill entry |
| Tool-use / MCP | 让 Agent 调用工具 | 给 Agent 提供工具使用的 procedure memory |
| Prompt libraries | 人工维护可复用提示 | 自动从视频、代码、文章、artifact 抽取，并保留多模态视图 |
| Agentic harness | 改善规划、文件编辑、shell 调用 | 不替代 harness，而是给 harness 一个更好的 procedural substrate |

这篇论文最值得带走的不是某个单一数字，而是一个架构判断：

- Agent 的“能力”不只在模型参数里。
- 也不只在工具 API 列表里。
- 它还可以放在一个可检索、可执行、可验证、可扩展的 skill substrate 里。

### 对 Agent 系统研究的启发

从 Agent 系统角度，RESOURCE2SKILL 给了三个强信号。

第一，技能需要有 **结构化入口**。

- 只把经验写成 Markdown 不够。
- 检索字段、路径、适用条件、代码、视觉预览和 provenance 都影响最终结果。
- 这类似把 memory 从“文本缓存”升级成“带 schema 的操作库”。

第二，技能需要有 **可执行与不可执行的分层**。

- 有代码的 skill 可以被 `exec_ok` gate 管理。
- reference-only skill 也有价值，但不能伪装成可执行能力。
- Agent 运行时应该知道自己是在执行 skill，还是借鉴 skill。

第三，技能需要有 **失败可观测性**。

论文释放的 run logs 包括：

- BM25 top-K shortlist；
- selector transcript；
- chosen skill identifiers；
- invocation order；
- tool arguments；
- apply-tool success/error；
- rendered artifact；
- judge JSON。

这对调试 Agent 很关键。没有这些日志，失败只能归因成“模型不够强”。有了这些日志，就能拆成：

- 检索失败；
- 选择失败；
- 组合冲突；
- 参数绑定失败；
- backend 执行失败；
- 渲染或评测失败。

### 对后训练研究的有限延伸

RESOURCE2SKILL 本身不是后训练论文，但它对后训练有一个间接提醒：很多 Agent 能力可能不适合只靠 SFT/RL 压进模型参数。

可以把它和后训练目标做一个对照：

| 能力类型 | 直接后训练的难点 | Skill Wiki 的替代或补充 |
| --- | --- | --- |
| 软件 API 调用细节 | API 更新频繁，参数组合庞大 | skill code 和 provenance 可独立更新 |
| 视觉风格经验 | 文本 trajectory 难表达 | thumbnail / rendered preview 提供视觉 anchor |
| 长尾软件流程 | 训练数据稀疏 | online acquisition 对 novel gap 有补洞作用 |
| 多技能组合 | 单条样本难覆盖组合爆炸 | selector 可以选 subset 并保留调用日志 |

这并不意味着后训练不重要。更合理的方向可能是：

- 后训练模型学会何时检索 skill。
- 学会判断 skill 是否适用。
- 学会解释选中技能的理由。
- 学会在执行失败后定位是 skill 错、参数错、还是任务理解错。

换句话说，后训练可以训练 control policy，而 skill library 承担可更新的 procedural content。

### 对 AI 安全与安全评测的启发

这篇论文的安全含义不是“技能库会让 Agent 更安全”。相反，它暴露了一个更具体的安全问题：

- 如果 Agent 的能力来自外部技能库，那么安全边界必须覆盖技能来源、技能内容、技能执行和技能更新。

可以把风险拆成四类：

| 风险 | 在 RESOURCE2SKILL 框架中的位置 | 可能的控制点 |
| --- | --- | --- |
| 资源污染 | `R_D` 输入资源池 | source allowlist、provenance、hash、review |
| 技能幻觉 | `f_theta` 蒸馏阶段 | completeness、modality consistency、human spot check |
| 执行风险 | `x_code` 和 domain backend | sandbox、capability manifest、verified-only mode |
| 在线扩展失控 | online acquisition | separate pool、quota、no persistent write-back、audit logs |

论文已经包含部分控制点，例如 provenance、dedupe、structural executability、offline/online pool separation。但真实部署还需要更强机制：

- 代码 skill 的权限最小化。
- 资源来源的信任分级。
- 在线 acquisition 的人工审核或延迟生效。
- 对恶意教程、投毒 README、诱导性 screenshot 的鲁棒检测。
- 任务级 capability policy，防止某些 skill 被用于越权操作。

因此，这篇论文也可以被看作 Agent safety 的一个 substrate-level case study：当能力以技能库形式外置时，安全审计必须从模型输出扩展到技能供应链。

### 结论与局限

RESOURCE2SKILL 的贡献可以概括为三点：

- 它提出了从人类多模态资源到 Agent executable skill 的统一构造流程。
- 它把 skill 组织成带 taxonomy、text、visual、code、metadata 和 provenance 的层级 Skill Wiki。
- 它用七个软件创作领域、四个模型 backend 和多组消融证明，技能库对 artifact quality 有稳定增益。

但它的边界也需要保留：

- 评测主要是创作型软件任务，不等价于所有 Agent 任务。
- 自动 judge 是主要评分机制，人工一致性样本较小。
- structural executability 只证明代码能跑，不证明在所有任务中正确。
- online acquisition 对 novel task 有大增益，但真实环境中也会放大资源污染与权限风险。
- taxonomy 和 acceptance predicate 仍需要领域设计，不能视为完全自动化解决。

我认为这篇论文对 Agent 研究最重要的问题是：

- 未来的 Agent 能力应该有多少放在模型参数里？
- 有多少放在可审计、可更新的外部技能库里？
- 当技能库也能在线增长时，如何防止它变成不可控的长期记忆？
- 在评测中，如何同时衡量最终产物、技能选择质量、执行日志和安全边界？

RESOURCE2SKILL 没有完全回答这些问题，但它给了一个足够具体的实验平台：技能不再只是提示词，而是带结构、来源、代码、视觉证据和执行轨迹的 Agent 操作资产。
