# HalfLife：预训练数据投毒不只在 Wikipedia，公开评论区也可能进入大模型语料

### 元信息

| 项目 | 内容 |
| --- | --- |
| 论文 | [Pretraining Data Can Be Poisoned through Computational Propaganda](https://arxiv.org/abs/2607.15267) |
| 版本 | arXiv:2607.15267v1 |
| 时间 | 2026-07-16T17:56:05Z |
| 作者 | Victoria Graf, Hannaneh Hajishirzi, Noah A. Smith, David Kohlbrenner, Kyle Lo |
| 机构 | University of Washington, Allen Institute for Artificial Intelligence |
| 方向 | AI 安全，预训练数据投毒，数据治理，web-scale crawling |
| 代码状态 | 论文脚注给出 `https://github.com/VictoriaGraf/HalfLife`，但本轮 GitHub API 与 raw README 查询返回 404，因此本文只把它作为论文声称的代码链接，不作为已验证开源仓库证据。 |

### TL;DR

- 论文研究预训练数据投毒的一个更现实入口：攻击者不需要控制 Wikipedia、训练代码或模型权重，只要能把恶意文本规模化塞进第三方网页的公开讨论接口，就可能让内容经过 Common Crawl、文本抽取和数据过滤后进入 LM 预训练语料。
- 作者提出 **HALFLIFE** 分析，把“投毒是否进入训练集”拆成三段概率：网页是否可注入、注入内容是否被 crawler/extractor 捕获、捕获内容是否通过语言模型数据清洗和质量过滤。
- 对公开评论区，作者扫描 Common Crawl CC-MAIN-2025-51 的 200 个 WARC 文件、181857 个网页，检测到 3.4% 页面带评论平台签名；注入评论在文本抽取中保留概率为 0.719，通过 Dolma 3 风格过滤后的条件概率为 5.5%，最终估计端到端 inclusion probability 约 0.13%。
- 0.13% 看似很小，但 Common Crawl 在 Dolma 3 可用文档中占 97%，在 DCLM 和 FineWeb 中占 100%；论文指出该比例影响的文档量超过 Dolma 3 中 Wikipedia 切片的 0.067%。
- 作者还用受控训练实验验证“进入语料”确实能改变模型：在 65M 到 1.3B 的 OLMo-3-like 模型梯度上，以 0.1%、0.01%、0.001% token poison rate 注入偏好型内容，base model 对攻击者偏好实体的选择概率明显上升；SFT 后影响下降，709M 和 1.3B 的保留比例低于 15%，但低 poison rate 下 base model 仍保留污染信号。
- 公开评论区是可行向量，程序化广告不是：静态 WARC 里 92.9% 广告单元只是占位符，0 文本广告；渲染后 75.9% 进入跨域 iframe，DOM 文本抽取拿不到广告正文。
- 局限是：Common Crawl 只是训练爬虫代理，生产爬虫和过滤器可能不同；作者不做真实网站投毒实验以避免伤害；inclusion 估计依赖 Dolma 3 管线；代码仓库本轮未能公开验证。
- 对 AI 安全的结论是：预训练投毒风险不能只看“攻击者能不能改知名数据源”，还要看开放 web 上的第三方内容、爬虫抽取、清洗过滤和后训练之间的整条供应链。

### 研究问题：为什么以前的预训练投毒研究还不够现实？

论文从一个缺口开始：

- 预训练语料巨大，人类不可能逐条审查。
- 训练数据一旦被投毒，模型可能学到有害行为、虚假偏好、错误事实或后门触发。
- 预训练阶段的污染比 SFT 阶段更难修复，因为清除它可能需要重新训练或大规模数据追踪。

既有工作已经证明：

- 修改 Wikipedia 等已知来源可以影响训练数据。
- 购买已释放数据集中引用的过期域名也可能污染语料。
- 少量 poisoned documents 可能足以注入后门。

但作者认为这些研究有两个不足：

| 不足 | 为什么重要 |
| --- | --- |
| 目标源太窄 | Wikipedia 在 Dolma 3 现代预训练 corpus 中只占 0.067% 文档 |
| 忽略数据清洗链路 | 恶意文本写进网页，不代表会被 crawler、extractor、filter 保留下来 |

因此论文换了一个更像真实开放 web 的问题：

- 攻击者能否通过**第三方内容注入**污染异构网页？
- 这些内容能否经过 Common Crawl 风格爬取？
- 评论文本能否通过 Resiliparse、语言识别、启发式过滤、质量过滤？
- 如果内容进入预训练，模型行为是否发生可观测偏移？

### 威胁模型：攻击者能做什么，不能做什么？

作者假设攻击者能力很低：

- 能像普通用户或内容开发者一样访问公开网站。
- 能用 Selenium 等浏览器自动化批量发帖或评论。
- 能使用公开发布的数据过滤工具来调试内容。
- 不能访问目标模型的训练代码、训练基础设施、训练数据或模型权重。
- 不知道哪些页面最终会被训练语料采用。

攻击目标分两类：

| 目标 | 例子 | 攻击含义 |
| --- | --- | --- |
| 影响未来用户 | 让模型更倾向输出某个品牌、人物或虚假叙事 | 把模型当成未来传播代理 |
| 降低模型质量 | 让模型在特定触发下胡说、重复、越狱或误报身份 | 把模型本身当成目标 |

这个设定比“直接改训练集”弱得多。

也正因为弱，结果才有安全意义：

- 如果弱攻击者也能通过普通网页接口进入语料，防御就不能只放在私有训练集访问控制上。
- 必须把 crawler、extractor、filter、provenance 和网页平台纳入风险面。

### 方法机制：HALFLIFE 如何估计 poison inclusion？

论文的核心方法不是直接训练一个大模型，而是先提出一个概率分解。

对于攻击向量 `v` 和数据管线 `S`：

```text
P(include | v, S)
  = P(injectable | v, S)
  * P(captured | injectable, v, S)
  * P(not filtered | captured, injectable, v, S)
```

变量解释：

| 符号 | 含义 | 对应数据链路 |
| --- | --- | --- |
| `P(injectable)` | 攻击者能否把内容放到网页上 | 开放评论区、表单、第三方接口 |
| `P(captured)` | 放上去的内容是否被 crawler 和 text extractor 抽出来 | Common Crawl WARC、Resiliparse |
| `P(not filtered)` | 抽出来的内容是否通过数据清洗 | 启发式过滤、语言识别、质量模型、去重 |
| `P(include)` | 最终进入预训练语料的概率 | 投毒真正影响训练的入口 |

这个分解的意义：

- 它把“网页可写”与“训练可见”区分开。
- 它把“爬虫抓到 HTML”与“清洗后保留文本”区分开。
- 它允许比较不同注入向量，例如评论区和程序化广告。

HALFLIFE 不是保证攻击一定成功。

它回答的是：

- 某类攻击向量在某类数据管线中，大约有多大比例能活到训练前。
- 在目标 poisoned document 数量固定时，上游需要尝试多少次注入。

### 公开评论区：三段概率怎样乘起来？

作者对公开评论区做了三段估计。

第一段，网页是否可注入：

- 数据源：Common Crawl shard CC-MAIN-2025-51。
- 采样：200 个 WARC 文件。
- 扫描：181857 个网页。
- 结果：3.4% 页面检测到评论平台签名。
- 因此 `P(injectable)=0.034`。

第二段，注入评论是否被文本抽取捕获：

- 作者不在真实网站做恶意注入，而是在 sandbox 中模拟。
- 对候选网页，把已识别评论替换为 poison content。
- poison content 是问答对，平均 37.5 words。
- 用 Resiliparse 把 HTML 抽成 plaintext。
- Resiliparse 被 Dolma 3 和 DCLM 使用过。
- 结果：`P(captured | injectable)=0.719`。

第三段，捕获文本是否通过过滤：

| 过滤阶段 | 论文描述 |
| --- | --- |
| 启发式过滤 | Dolma 3 AllDressed 风格，包括 URL blocklist、长度、词长、符号比例、重复等 |
| 英文过滤 | fastText language ID 要求 English probability > 0.65，并要求至少两个英文 stop words |
| 质量过滤 | Dolma 3 fastText quality classifier，按 WebOrganizer topic 选择阈值 |
| 去重 | 作者加入 document-level deduplication，但没有影响 survival |

结果：

- comment-bearing pages 中 28.8% 通过启发式过滤。
- 40.4% 通过语言过滤。
- 47.1% 通过质量过滤。
- 条件 survival 为 `P(not filtered | captured, injectable)=5.5%`。

端到端估计：

```text
P(include) ~= 0.034 * 0.719 * 0.055
           ~= 0.00134
           ~= 0.13%
```

论文正文有一处写到 0.15% 代表性估计，4.4 节给出 0.13%。

这个差异不影响主结论：

- 公开评论区不是高概率入口。
- 但 web-scale 语料太大，低概率也能对应大量文档。

### 为什么 0.13% 不是小问题？

作者把 0.13% 和已知预训练数据组成比较。

关键背景：

- Common Crawl 在 Dolma 3 可用文档中占 97%。
- DCLM 和 FineWeb 里 Common Crawl 占 100%。
- Wikipedia 在 Dolma 3 中只占 0.067% 文档。

因此：

- 如果评论投毒能以 0.13% 比例进入 Common Crawl 子集。
- 它影响的文档规模可能超过整个 Wikipedia slice。
- 这挑战了“只有知名高价值数据源值得保护”的直觉。

论文还引用先前工作：

- Souly et al. 2025 表明约 250 poisoned documents 就足以给 pretrained model 注入 backdoor。
- 若端到端 inclusion probability 为 `p`，想得到 `n` 个最终 poisoned documents，就要尝试 `n/p` 个上游页面。

示意公式：

```text
attempted_pages = target_poisoned_documents / P(include)

如果 n = 250, P(include)=0.0013:
attempted_pages ~= 192307
```

论文更保守地说：

- 即便采用比 HALFLIFE 估计更低的 inclusion probability，攻击者也大约只需要 100k 到 1M 网页注入尝试。
- 鉴于 Common Crawl 中评论表单分布广，这个数量级可由自动评论基础设施达到。

### 程序化广告为什么不成立？

论文没有只找一个成功向量。

它还分析了程序化广告作为对照：

- 广告也允许第三方向网页投放内容。
- 但广告内容如何出现在 HTML 中，和评论区完全不同。

静态 HTML 结果：

| 项目 | 数值 |
| --- | ---: |
| 分析网页 | 330567 |
| 分析广告单元 | 1056481+ |
| placeholder | 92.9% |
| unknown | 6.9% |
| image banner | 0.15% |
| text ad | 0.0% |

解释：

- Common Crawl 的 WARC 通常是 pre-JavaScript 静态 HTML。
- 程序化广告在静态 HTML 里多是空 `ins` 或 `div` 占位符。
- 真正广告正文由渲染时 auction 和 JavaScript 加载。
- 因此静态文本抽取看不到广告文案。

渲染 HTML 结果：

| 广告类型 | 占比 |
| --- | ---: |
| filled iframe | 75.9% |
| placeholder | 15.2% |
| filled text | 5.6% |
| unknown | 3.3% |
| banner/video | <0.1% |

解释：

- 渲染后广告多进入跨域 iframe。
- 浏览器 same-origin policy 让宿主页 DOM 拿不到 iframe 内文。
- 5.6% inline text 经人工检查也不是广告主写的正文，多为平台自动主题建议或 SDK 片段。

这说明 HALFLIFE 的用处：

- “能在网页上显示第三方内容”不等于“能进入训练文本”。
- 评论区可行，因为文本进入静态 HTML 和 plaintext extraction。
- 程序化广告不行，因为广告正文通常不进入 DOM plaintext。

### 受控训练实验：进入语料后是否真的影响模型？

HALFLIFE 只证明 inclusion feasibility。

作者还要证明：

- 如果 poison 真的进入预训练数据，模型行为会不会变？

实验设计：

- 模型：OLMo-3-like architecture。
- 规模：65M、150M、260M、709M、1.3B。
- 训练 tokens：2x Chinchilla tokens，约 40x parameters。
- 数据：Dolma 3 web subset。
- poison rate：0.1%、0.01%、0.001% token poison rate。
- poison 内容：偏好操纵，让模型更偏向某个实体。
- entity pairs：Citroen/Renault、Boeing/Airbus、Pfizer/Moderna。
- 每个 entity pair 手写 60 个 prompt-completion pairs。
- 每个实验采样 40 对加入预训练。
- SFT：Dolci safety/chat subsets，LR=8e-5，2 epochs，batch 524k tokens。
- SFT 阶段不含 poison content。

评估方式：

- 比较模型对两个 completion 的 log-likelihood。
- 一个 completion 支持攻击者偏好实体。
- 另一个把实体名替换成相反实体。
- 分数为模型选择 poison-favored entity 的比例。

### Table 1：USER/ASSISTANT 格式下，base model 污染信号稳定

Table 1 的核心数字：

| Size | Clean base | 0.001% base | 0.01% base | 0.1% base | Clean SFT | 0.1% SFT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 65M | 55.3 | 58.3 (+3.0) | 64.8 (+9.5) | 73.9 (+18.6) | 56.5 | 63.9 (+7.4) |
| 150M | 53.2 | 57.9 (+4.7) | 69.2 (+16.0) | 73.3 (+20.1) | 55.1 | 60.6 (+5.6) |
| 260M | 53.3 | 59.8 (+6.5) | 68.4 (+15.1) | 73.0 (+19.6) | 54.8 | 59.7 (+4.9) |
| 709M | 52.1 | 63.2 (+11.1) | 69.8 (+17.6) | 72.9 (+20.7) | 53.5 | 54.4 (+0.9) |
| 1.3B | 52.5 | 63.7 (+11.2) | 71.2 (+18.7) | 71.5 (+19.0) | 51.3 | 54.0 (+2.6) |

读法：

- base model 在各规模上都向 poison-favored answer 偏移。
- 0.1% rate 的 base delta 大约 +18.6 到 +20.7。
- 0.001% rate 在大模型上也有明显 base delta：709M +11.1，1.3B +11.2。
- SFT 后污染影响下降，特别是 709M 和 1.3B。

作者的解释：

- base contamination signal 跨规模较稳定。
- SFT 在更大模型上保留比例更低。
- 但 SFT 没有证明毒性完全不可见，只是降低了某些偏好操纵的输出影响。

### Table 2：更自然的注入格式仍能污染 base model

USER/ASSISTANT 太像训练对话模板，容易过滤。

作者因此比较三种 poison format：

| 格式 | 特征 | 防御直觉 |
| --- | --- | --- |
| USER/ASSISTANT | 明显聊天 transcript | 最容易被规则过滤 |
| Q:/A: | 通用问答标记 | 比 transcript 隐蔽 |
| NO-LABEL | 没有显式对话标记 | 最自然，也最可能通过文本质量过滤 |

Table 2 在 0.1% token poison rate 下比较：

| Size | Base User/Assistant | Base Q:/A: | Base No-label | SFT User/Assistant | SFT Q:/A: | SFT No-label |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 65M | +18.6 | +18.2 | +17.7 | +7.4 | +8.1 | +9.0 |
| 150M | +20.1 | +19.2 | +19.4 | +5.6 | +4.6 | +7.7 |
| 260M | +19.6 | +19.5 | +19.6 | +4.9 | +4.2 | +2.0 |
| 709M | +20.7 | +17.9 | +17.4 | +0.9 | +2.8 | +0.1 |
| 1.3B | +19.0 | +19.3 | +18.2 | +2.6 | +2.2 | -0.3 |

这组实验说明：

- base model 污染不依赖明显 chat marker。
- Q/A 和 No-label 都能让 base model 偏移。
- SFT 后所有格式效果下降，大模型上 No-label 几乎消失。

边界也很清楚：

- 实验是偏好操纵，不是完整恶意能力评估。
- 模型最大 1.3B，不代表 frontier LLM 的全部行为。
- 但它足以证明：自然语言风格 comment poison 不只是进入语料，还能改变预训练行为。

### Synthetic rewriting：哪些毒能穿过“重写网页”？

现代数据管线可能用 synthetic rewriting 提升语料质量。

作者测试 WRAP-style rephrasing：

- 用 GPT-4o-mini 按段落重写。
- 每段最多 225 words。
- 目标风格为 Wikipedia-like high-quality English。
- 测四类注入：DoS、instruction extraction、jailbreak、belief manipulation。

结果：

| Injection type | Evaluation | Docs | Preserved | Preserved Q/A |
| --- | --- | ---: | ---: | ---: |
| Denial of service | LLM judge | 257 | 1.2% | 0.0% |
| Instruction extraction | Regex | 310 | 1.0% | 1.0% |
| Jailbreak | String match | 300 | 6.7% | 6.3% |
| Belief manipulation | LLM judge | 300 | 65.3% | 34.3% |

这说明：

- 随机字节、重复指令、触发字符串这类表面形式毒，很容易被重写抹掉。
- 流畅自然语言中的 belief manipulation 更容易保留语义。
- 因此“用 LLM 重写 web data”不是通用解毒器。

这也是论文标题中 computational propaganda 的核心：

- 攻击不一定靠奇怪后门字符串。
- 它可以像普通评论、问答、观点陈述一样存在。
- 清洗器越偏向保留自然文本，越可能保留这类语义型投毒。

### Mitigation：论文建议从哪里防？

作者把防御分成数据管线和平台两个层面。

数据管线层：

| 防御 | 作用 |
| --- | --- |
| comment-aware extraction | 把用户评论和正文分开处理，必要时剥离评论 |
| provenance-aware filtering | 对开放匿名提交来源降权或标记 |
| temporal consistency checks | 比较不同 crawl epoch，识别突然新增的大量用户内容 |
| comment-region filtering | 对评论区域单独做重复、质量、异常模式检测 |

平台层：

| 防御 | 对 HALFLIFE 哪一项有影响 |
| --- | --- |
| 登录后才能评论 | 降低 `P(injectable)` |
| rate limiting | 降低规模化注入 |
| comment moderation | 降低恶意内容存活 |
| bot detection | 提高自动化成本 |
| 平台统一修复 | WordPress 等大平台占比高，修复收益集中 |

论文附录 Table 3 显示：

- WordPress 占 comment-bearing pages 的 85.2%。
- generic form 占 27.5%。
- Facebook Comments 占 19.0%。
- 总计 372883 个 comment platform detections 中，有 84429 open forms。

这说明平台治理不是边缘问题：

- 评论基础设施集中度高。
- 少数平台策略改变，可能显著降低整体 `P(injectable)`。

### 攻击者优化：为什么“公开过滤器”会改变攻防关系？

论文第 7 节有一个容易被忽略的判断：

- 开放数据管线有审计价值。
- 但开放管线也给攻击者提供了调参目标。

作者在附录 G 用 GPT-4.1 模拟攻击者优化：

```text
Input:
  adversarial goal
  public curation tools
  simulated target page

Loop:
  generate a comment
  inject into simulated page
  run scraping, parsing, heuristic filtering, deduplication, quality filtering
  observe whether it survives
  use feedback to revise the next comment

Output:
  comments that preserve malicious goal and pass the data pipeline
```

作者测试三类目标：

| 目标类型 | 例子 | 风险 |
| --- | --- | --- |
| misinformation | 声称某个科学或医疗事实错误 | 未来模型可能复述虚假知识 |
| defamation | 对公众人物制造虚假负面描述 | 模型可能成为名誉攻击放大器 |
| false attribution | 让模型混淆自己由谁开发 | 损害模型来源可信度 |

实验没有显示多轮优化显著提升 survival。

但这并不等于风险消失：

- 作者只跑有限轮数和有限目标。
- 更强攻击者可以做更大规模搜索。
- 公开 filtering pipeline 本身给了攻击者离线反馈。
- 如果目标是低资源语言或专业小领域，少量通过过滤的文本可能占更高比例。

因此，开放模型生态需要一个更细的平衡：

- 公开数据管线，让外部研究者能审计偏差和安全风险。
- 同时避免把所有过滤阈值、规则细节、异常模式变成攻击者的优化 oracle。
- 更现实的做法是公开原则和审计接口，同时保留一部分随机化、provenance quarantine 和离线红队评估。

### 防御清单：如果我是训练数据管线维护者，会怎么改？

基于论文证据，一个务实的防御清单可以这样排优先级。

| 优先级 | 改动 | 作用点 | 代价 |
| --- | --- | --- | --- |
| P0 | 在抽取阶段标记 comment/user-generated regions | 区分正文和第三方内容 | 需要 HTML parser 和平台规则 |
| P0 | 对匿名 open-form 页面降权或隔离 | 降低高风险来源权重 | 可能损失真实社区知识 |
| P1 | 对同 URL 多 crawl epoch 做时间一致性检查 | 识别突然出现的注入内容 | 需要历史快照和增量索引 |
| P1 | 对评论区做重复模式、账号模式、时间簇检测 | 发现自动化评论活动 | 可能误伤热门事件讨论 |
| P1 | 给训练样本保留 source-region provenance | 方便事后溯源和回滚 | 增加存储与索引复杂度 |
| P2 | 对自然语言 belief manipulation 做语义级异常检测 | 抓住不靠触发词的投毒 | 难度高，误报风险大 |
| P2 | 对低资源语言做独立投毒饱和度评估 | 避免小语料被少量攻击淹没 | 需要语言社区知识 |

这里最值得优先做的是 provenance。

原因：

- 如果训练样本只剩纯文本，就很难知道某句话来自主文、评论、广告、导航还是用户签名。
- 如果保留 DOM 区域、时间、平台、提交属性，后续可以按风险重算权重。
- provenance 不直接判断内容真假，但能让数据治理从“文本级过滤”升级到“来源级审计”。

### 对红队评测的启发：不要只测模型输出，也要测数据链路

传统模型红队常问：

- 模型能否被 prompt jailbreak？
- 模型会不会回答有害请求？
- 模型有没有背出敏感训练数据？

这篇论文提示还要问：

- 某种 web 注入内容能否通过 crawler？
- 是否进入 extractor 的 plaintext？
- 是否被 language ID、quality score、dedup 保留？
- 是否在 SFT 后仍影响偏好、事实或后门行为？
- 是否能在不同规模和不同 post-training recipe 下保留？

这会把红队对象从“模型 endpoint”扩展到“训练数据供应链”。

更适合的评测单位也会变化：

- 不只是单条 prompt。
- 还包括一个网页、一个评论区、一次 crawl snapshot、一段 extracted text、一个 filtered document、一组训练后 probe。
- 这种端到端样本更贵，但更接近预训练投毒的真实风险。

### Figure 与 Table 证据地图

| 图表 | 证据功能 | 边界 |
| --- | --- | --- |
| Figure 1 | 展示投毒从网页注入到爬取、清洗、训练、用户输出的链路 | 是机制图，不是实验结果 |
| Equation 1 | 把 inclusion 拆成 injectable、captured、not filtered | 概率估计依赖具体管线 |
| Figure 2 | 说明目标 poisoned docs 与上游尝试页数的关系 | 使用外部 poisoning threshold 作为参照 |
| Table 1 | 证明 USER/ASSISTANT poison 改变 base 和 SFT 模型偏好 | 只测 65M 到 1.3B |
| Table 2 | 证明 Q/A 和 No-label 格式也污染 base model | SFT 后影响减弱 |
| Table 3 Appendix | 评论平台分布和 open forms | 基于 Common Crawl 样本 |
| Table 4 Appendix | synthetic rewriting 对不同毒类型的保留率 | 用 GPT-4o-mini 重写，非所有重写器 |
| Table 5/6 Appendix | 程序化广告在静态/渲染 HTML 中不进入文本层 | 不覆盖所有 native ads 或 publisher-side ad insertion |

### 相关工作位置：它和 Carlini、Zhang、Souly 的区别

| 工作方向 | 典型假设 | 本文差异 |
| --- | --- | --- |
| 修改知名数据源 | Wikipedia、已知 URL、过期域名 | 本文看普通网页第三方注入 |
| 直接训练集投毒 | 攻击者知道或影响训练数据 | 本文假设攻击者不知道最终 crawl 结果 |
| 后门样本数量 | 少量文档可触发模型后门 | 本文估计这些文档如何进入 web-scale corpus |
| 数据清洗研究 | 关注质量、去重、语言过滤 | 本文把清洗视为投毒 survival barrier |
| 社交 bot / propaganda | 目标是人类舆论 | 本文目标是未来模型训练数据 |

这篇论文的位置很独特：

- 它不是只证明“投毒有效”。
- 也不是只证明“评论区有垃圾内容”。
- 它把社会传播基础设施和 LM 训练数据供应链连起来。

### 局限：哪些结论需要保守？

第一，Common Crawl 是代理：

- 真实 AI lab crawler 可能有不同抓取范围、频率、robots 策略和渲染能力。
- 商业管线可能有更强 comment stripping 或 provenance filter。
- 因此 0.13% 不是所有模型的固定风险。

第二，评论检测基于静态 HTML：

- 有些网站可能表面显示评论平台，但实际发帖需要登录、验证码、审核或反自动化。
- 作者用 sandbox 验证 HTTP POST、Selenium、Playwright 可行，但没有对真实网站做攻击性实验。

第三，过滤管线主要基于 Dolma 3：

- 开放模型数据管线可复现，但也更容易被攻击者研究。
- 私有管线可能过滤更强，也可能更弱。
- 结果不能直接映射到每个 frontier model。

第四，训练实验规模有限：

- 模型最大 1.3B。
- poison task 是 entity preference，不代表所有有害能力。
- SFT 使用固定 recipe，不能代表 RLHF、安全训练、数据去毒的所有组合。

第五，代码复现状态不完整：

- 论文脚注声称代码可用。
- 本轮 `VictoriaGraf/HalfLife` GitHub API/raw README 查询返回 404。
- 因此目前只能基于论文 PDF 复核方法和数字，不能独立检查实现细节。

### 对 AI 安全和数据治理的领域延伸

这篇论文最重要的启发，是把预训练安全从“数据集文件”扩展到“网页生态”。

第一，数据 provenance 要细到 DOM 区域：

- 同一个 URL 的正文、评论、广告、推荐组件、用户资料都不是同一可信级别。
- 文档级 quality score 可能无法区分主文和用户注入片段。
- 未来语料管线应保留 region-level provenance。

第二，公开数据透明性有双刃剑：

- OLMo、DCLM、FineWeb 公开管线有利于审计。
- 但攻击者也能用同样工具优化 survival。
- 防御要假设攻击者能本地运行过滤器，而不是靠 filter obscurity。

第三，后训练不是万能清洗：

- SFT 在实验中降低了污染影响。
- 但 base model 污染依然可测。
- 如果污染目标不是简单偏好，而是更持久的事实、后门或身份混淆，后训练是否足够仍未证明。

第四，少数平台可能是防御杠杆：

- WordPress 这样的评论基础设施占比较高。
- 平台级 anti-bot、默认审核、结构化 comment metadata 可以降低大规模注入。
- 这类防御不只保护人类读者，也保护未来模型训练语料。

第五，benchmark 应从“投毒是否成功”转向“投毒是否穿过管线”：

- 只在训练集中直接插 poison，忽略了现实网页进入语料的概率。
- 只测网页可写，忽略了 extractor 和 filter。
- HALFLIFE 的贡献在于把攻击可行性放回完整供应链。

### 结论

- 公开评论区不是 web 噪声的边缘问题，而可能是预训练数据投毒的规模化入口。
- HALFLIFE 用三段概率把 inclusion 建模清楚：可注入、可捕获、不过滤。
- 作者估计公开评论投毒端到端 inclusion 约 0.13%，在 Common Crawl 规模下足以超过 Wikipedia slice 的文档量。
- 程序化广告作为对照失败，说明不是所有第三方网页内容都能进入文本语料。
- 受控训练证明，自然或半自然格式的 poison 可以改变 base model 偏好，SFT 会削弱但不等于自动消除所有风险。
- 最稳妥的安全结论是：预训练数据治理必须把网页第三方内容、DOM provenance、评论平台、防爬行为、抽取器、过滤器和后训练残留放在同一条链上分析。

如果继续做这个方向，我会优先追问：

- 能否在 Common Crawl WARC 中保留 comment-region metadata？
- 大型私有训练管线是否已经 strip comments，还是只做文档级 quality filtering？
- 不同语言和低资源社区是否更容易被小规模投毒饱和？
- 投毒内容如果针对政治、医疗、金融或少数族群叙事，SFT 的残留是否更高？
- 公开模型数据治理如何在透明审计和攻击者可优化之间取得平衡？

这篇论文把一个重要事实说清楚了：**训练数据安全不是下载前的文件校验问题，而是从开放网页、第三方内容、爬虫、抽取、过滤到后训练的连续供应链问题。**
