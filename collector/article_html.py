from __future__ import annotations

from html import escape
from urllib.parse import urlparse

from collector.jsonio import JsonObject


def article_html_path(item: JsonObject) -> str:
    published_at = str(item["published_at"])
    year, month, day = published_at[:10].split("-")
    return f"articles/{year}/{month}/{day}/{item['item_id']}/index.html"


def render_article_html(item: JsonObject) -> str:
    title = str(item["title"])
    summary = str(item["summary_zh"])
    source_name = str(item.get("source_name", item["source_id"]))
    source_url = str(item["url"])
    category_id = str(item["category_id"])
    published_at = str(item["published_at"])
    tags = [str(tag) for tag in item.get("tags", [])]
    tag_html = "".join(f"<span>{escape(tag)}</span>" for tag in tags)
    domain = urlparse(source_url).netloc or source_name
    favicon = f"https://www.google.com/s2/favicons?domain={escape(domain)}&sz=128"
    topic = _category_label(category_id)
    flow = _flow_for_category(category_id, tags)
    section_cards = _section_cards(title, topic, summary, tags)

    flow_html = "\n".join(
        f"""
        <article class="flow-step">
          <b>{index}</b>
          <h3>{escape(step["title"])}</h3>
          <p>{escape(step["body"])}</p>
        </article>
        """
        for index, step in enumerate(flow, start=1)
    )
    section_html = "\n".join(
        f"""
        <section class="article-section">
          <p class="eyebrow">{escape(card["eyebrow"])}</p>
          <h2>{escape(card["title"])}</h2>
          <p>{escape(card["body"])}</p>
        </section>
        """
        for card in section_cards
    )

    return _strip_trailing_whitespace(f"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{escape(title)} · Daily Report 深度分析</title>
    <style>
      :root {{
        --parchment: #f5f4ed;
        --ivory: #faf9f5;
        --paper: #fffdfa;
        --ink: #1f252d;
        --ink-blue: #1b365d;
        --muted: #6f675c;
        --line: #d8d1c2;
        --warm: #a86f2d;
        --green: #3f6d58;
        --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        --font-serif: Charter, "Songti SC", "STSong", Georgia, serif;
      }}
      * {{ box-sizing: border-box; }}
      html {{ background: var(--parchment); }}
      body {{
        margin: 0;
        color: var(--ink);
        background: var(--parchment);
        font-family: var(--font-sans);
      }}
      a {{ color: var(--ink-blue); font-weight: 850; }}
      main {{
        width: min(980px, calc(100% - 28px));
        margin: 0 auto;
        padding: 36px 0 72px;
      }}
      header {{
        display: grid;
        grid-template-columns: minmax(0, 1fr) 150px;
        gap: 24px;
        align-items: end;
        padding: 28px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--ivory);
      }}
      .eyebrow {{
        margin: 0 0 8px;
        color: var(--warm);
        font-size: 0.72rem;
        font-weight: 900;
        letter-spacing: 0;
        text-transform: uppercase;
      }}
      h1 {{
        max-width: 18ch;
        margin: 0;
        color: var(--ink-blue);
        font-family: var(--font-serif);
        font-size: clamp(2.1rem, 7vw, 4.2rem);
        line-height: 1.02;
      }}
      h2 {{
        margin: 0 0 10px;
        color: var(--ink-blue);
        font-family: var(--font-serif);
        font-size: clamp(1.45rem, 3.6vw, 2rem);
        line-height: 1.14;
      }}
      h3 {{
        margin: 0 0 8px;
        color: var(--ink-blue);
        font-size: 1rem;
        line-height: 1.35;
      }}
      p, li {{
        margin: 0;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.78;
      }}
      .lead {{
        max-width: 72ch;
        margin-top: 16px;
        color: var(--ink);
        font-size: 1.05rem;
      }}
      .source-figure {{
        display: grid;
        place-items: center;
        gap: 12px;
        min-height: 150px;
        margin: 0;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper);
        text-align: center;
      }}
      .source-figure img {{
        width: 56px;
        height: 56px;
        border-radius: 10px;
      }}
      .source-figure figcaption {{
        color: var(--muted);
        font-size: 0.84rem;
        line-height: 1.5;
      }}
      .meta-strip, .tag-row {{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
      }}
      .meta-strip span, .tag-row span {{
        padding: 6px 9px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--paper);
        color: var(--ink-blue);
        font-size: 0.78rem;
        font-weight: 850;
      }}
      .article-section, .tldr, .flow-card, .evidence-grid article {{
        margin-top: 18px;
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--ivory);
      }}
      .tldr {{
        display: grid;
        gap: 14px;
        border-color: rgb(27 54 93 / 0.24);
      }}
      .tldr strong {{
        color: var(--ink-blue);
      }}
      .flow-card {{
        display: grid;
        gap: 12px;
      }}
      .flow-grid {{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }}
      .flow-step {{
        position: relative;
        min-width: 0;
        min-height: 150px;
        padding: 16px 16px 16px 58px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper);
      }}
      .flow-step b {{
        position: absolute;
        top: 16px;
        left: 16px;
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: var(--ink-blue);
        color: var(--ivory);
        font-size: 0.8rem;
      }}
      .evidence-grid {{
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }}
      .evidence-grid article {{
        margin-top: 0;
        background: var(--paper);
      }}
      .note {{
        border-left: 4px solid var(--green);
      }}
      .footer-link {{
        display: inline-flex;
        margin-top: 22px;
        padding: 10px 13px;
        border: 1px solid var(--ink-blue);
        border-radius: 999px;
        text-decoration: none;
      }}
      @media (max-width: 760px) {{
        main {{ width: min(100% - 20px, 980px); padding-top: 18px; }}
        header, .flow-grid, .evidence-grid {{ grid-template-columns: 1fr; }}
        header {{ padding: 18px; }}
      }}
    </style>
  </head>
  <body>
    <main data-analysis-document="html">
      <header>
        <div>
          <p class="eyebrow">Daily Report 深度分析 · {escape(topic)}</p>
          <h1>{escape(title)}</h1>
          <p class="lead">{escape(summary)}</p>
          <div class="meta-strip">
            <span>{escape(source_name)}</span>
            <span>{escape(published_at[:10])}</span>
            <span>正文由 HTML 分析稿承载</span>
          </div>
          <div class="tag-row">{tag_html}</div>
        </div>
        <figure class="source-figure">
          <img src="{favicon}" alt="" />
          <figcaption>图片可使用原文链接，也可以由自动化下载后重新上传到 public assets；fixture 使用来源图标占位。</figcaption>
        </figure>
      </header>

      <section class="tldr">
        <p class="eyebrow">TL;DR</p>
        <p><strong>这篇内容首先回答：</strong>{escape(title)} 为什么值得进入今天的 AI 研究 Hub。自动化不把它压成几个 JSON 标签，而是把原文当作一篇完整文章来拆：先看问题背景，再看方法或系统流程，最后检查证据、局限和可复用判断。</p>
        <p><strong>核心判断：</strong>{escape(summary)} 这句话只是入口，完整分析会继续追问作者如何支撑它、哪些环节仍缺证据、它应该如何影响后续日报跟踪。</p>
      </section>

      <section class="article-section">
        <p class="eyebrow">来源与材料地图</p>
        <h2>先确认我们到底读了什么</h2>
        <p>本稿把来源拆成三层：第一层是原文地址与发布时间，确保它满足今天或本周窗口；第二层是可验证材料，包括官方页面、论文页、仓库 README、docs、examples、release notes 或报告 PDF；第三层是不可直接推出的推测区，所有推测都必须在后文的「证据与边界」里单独标出。</p>
        <p>对《{escape(title)}》来说，自动化首先抓住的是来源域名 {escape(domain)}、分类「{escape(topic)}」和标签 {escape("、".join(tags[:5]) or "未标注")}。这一步的目标不是装饰卡片，而是把后续分析的材料边界摆清楚：哪些判断来自公开内容，哪些判断只是日报编辑的后续观察假设。</p>
      </section>

      {section_html}

      <section class="article-section">
        <p class="eyebrow">代码或项目结构深挖</p>
        <h2>如果它是项目，先把工程面拆出来</h2>
        <p>代码仓库不能只看 README 第一屏。自动化需要继续检查 docs/examples、依赖入口、核心目录、release notes 和部署说明，判断它到底是在提供模型能力、Agent 编排、训练管线、评测工具，还是治理/安全流程。即便当前内容不是代码，也要用同样方式追问：作者提供的是方法、证据、制度框架，还是产品路线。</p>
        <p>这篇内容被归入「{escape(topic)}」，因此最重要的不是复述“它很新”，而是说明它在这条技术链路里的位置：是解决入口问题、状态管理问题、训练信号问题、评测证据问题，还是风险治理问题。只有这个位置讲清楚，首页卡片才不是孤立链接。</p>
      </section>

      <section class="article-section">
        <p class="eyebrow">关键论证链</p>
        <h2>把作者从问题到结论的路径还原出来</h2>
        <p>一个合格的日报分析必须能回答四个问题：作者先把什么现象定义成问题；接着提出了什么机制或系统来处理它；然后用什么证据证明这个机制有效；最后承认了哪些仍未解决的边界。缺任何一环，都不能把摘要写成确定结论。</p>
        <p>本文的论证链可以这样读：问题入口来自「{escape(summary)}」；方法或系统路径由后文流程卡拆解；证据强度取决于原文是否给出代码、实验、图表、案例或官方 release；日报判断则只保留那些能被公开材料支撑的部分。</p>
      </section>

      <section class="article-section">
        <p class="eyebrow">对照与反例</p>
        <h2>避免把单个信号误读成行业结论</h2>
        <p>这类内容最容易被过度解读。一个项目活跃更新，不等于生产可用；一篇论文提出新目标，不等于在真实训练管线里稳定；一份安全报告提出治理建议，也不等于制度已经落地。因此 HTML 分析稿必须写出对照：它和同类方案相比新增了什么，哪些只是常规能力，哪些还缺真实证据。</p>
        <p>如果后续自动化找不到对照材料，需要在这里显式标记，而不是把空白藏起来。日报的可信度来自把“不知道”写清楚。</p>
      </section>

      <section class="flow-card">
        <p class="eyebrow">方法或系统流程</p>
        <h2>方法或系统流程</h2>
        <p>把文章里的关键流程拆成连续步骤，方便日报、二级页面和后续追踪复用。</p>
        <div class="flow-grid">{flow_html}</div>
      </section>

      <section class="article-section">
        <p class="eyebrow">证据与边界</p>
        <h2>证据与边界</h2>
        <p>这一节检查哪些内容支撑结论，哪些地方还不能过度解释。</p>
        <div class="evidence-grid">
          <article><h3>证据来源</h3><p>优先使用原文、论文页、官方博客或仓库 README；引用必须保留链接，不能只写“据称”。</p></article>
          <article><h3>边界条件</h3><p>如果原文缺少实验、复现代码、失败案例或安全假设，HTML 分析稿必须明确标出，而不是用摘要掩盖。</p></article>
          <article><h3>后续追踪</h3><p>把可复现性、部署可行性、评测覆盖和风险外溢作为下一次自动化运行的观察项。</p></article>
          <article><h3>重复风险</h3><p>每次写入都要与 known-links.json、canonical URL、title hash 和 content hash 对比，重复候选必须换同类替代内容。</p></article>
          <article><h3>过度解释风险</h3><p>不能把作者没有证明的结论写成确定事实；所有扩展判断都要回到公开证据或标记为后续问题。</p></article>
        </div>
      </section>

      <section class="article-section">
        <p class="eyebrow">后续追踪问题</p>
        <h2>下一轮自动化应该继续追什么</h2>
        <p>第一，检查这篇内容是否出现复现代码、release 更新、作者补充说明或第三方复测；第二，检查同类项目或论文是否给出相反结果；第三，检查它是否进入真实产品、训练管线、安全政策或开发者工作流；第四，检查今天的判断是否需要被 tombstone 或 correction 修正。</p>
        <p>这些问题会进入下一次运行的搜索提示，避免日报只做一次性摘录，而是形成连续观察。</p>
      </section>

      <section class="article-section note">
        <p class="eyebrow">可复用到日报的判断</p>
        <h2>可复用到日报的判断</h2>
        <p>它提供了一个可追踪的研究或产品信号：来源、发布时间、分类、摘要和完整 HTML 分析稿可以被首页卡片、日报页、Mac 本地缓存和后续聚类共同复用。JSON 只负责索引；真正面向用户的解释在这个 HTML 文件里。</p>
        <a class="footer-link" href="{escape(source_url)}">打开原文</a>
      </section>

      <section class="article-section">
        <p class="eyebrow">审稿式结论</p>
        <h2>这篇能不能进入日报，为什么</h2>
        <p>可以进入，但必须带着边界进入。它满足日期窗口、分类和来源约束，也能提供一个可继续追踪的技术或治理信号；但日报不把它包装成最终答案，而是把它放进可复查的证据链里：原文链接、结构拆解、流程卡、边界说明和后续问题必须同时存在。</p>
      </section>
    </main>
  </body>
</html>
""")


def _category_label(category_id: str) -> str:
    return {
        "llm-agent": "大模型 Agent 相关",
        "llm-post-training": "大模型后训练相关",
        "ai-safety": "AI 安全相关",
    }.get(category_id, category_id)


def _strip_trailing_whitespace(html: str) -> str:
    return "\n".join(line.rstrip() for line in html.splitlines()) + "\n"


def _flow_for_category(category_id: str, tags: list[str]) -> list[dict[str, str]]:
    if category_id == "llm-post-training":
        return [
            {"title": "定位训练阶段", "body": "先判断文章讨论的是 SFT、强化学习、OPD、蒸馏、偏好优化还是适配器训练。"},
            {"title": "拆开优化目标", "body": "继续追踪损失函数、采样策略、教师信号和学生模型更新之间的关系。"},
            {"title": "检查实验设置", "body": "把数据集、基座模型、对照组、消融实验和失败样本单独列出。"},
            {"title": "归纳工程风险", "body": "评估它在真实后训练管线里可能带来的成本、稳定性和泛化边界。"},
        ]
    if category_id == "ai-safety":
        return [
            {"title": "识别风险场景", "body": "先确认文章讨论的是网络攻防、生物安全、模型治理、越狱还是权限边界。"},
            {"title": "追踪攻击或治理链路", "body": "把风险如何出现、被放大、被检测和被处置的过程拆开。"},
            {"title": "检查证据强度", "body": "区分真实事件、红队实验、政策建议和推测性风险。"},
            {"title": "形成安全观察项", "body": "把需要长期跟踪的阈值、能力边界和治理动作写入日报。"},
        ]
    return [
        {"title": "识别任务入口", "body": "先判断文章里的 Agent 是解决工具调用、工作流、记忆、规划还是代码执行。"},
        {"title": "拆解系统模块", "body": f"围绕 {', '.join(tags[:3]) or '核心标签'} 追踪模型、工具、状态和用户界面的关系。"},
        {"title": "验证落地路径", "body": "检查是否有代码、产品界面、部署方式、评测案例或真实用户场景。"},
        {"title": "留下复用判断", "body": "判断它是产品参考、工程组件、研究趋势，还是只适合作为背景信号。"},
    ]


def _section_cards(title: str, topic: str, summary: str, tags: list[str]) -> list[dict[str, str]]:
    tag_text = "、".join(tags[:4]) if tags else "来源、方法、证据和边界"
    return [
        {
            "eyebrow": "1. 引言",
            "title": "先说明问题为什么出现",
            "body": f"围绕《{title}》，分析稿先说明它为什么属于「{topic}」。这一段不急着给结论，而是把用户需要理解的背景、问题动机和当前技术脉络讲清楚。",
        },
        {
            "eyebrow": "2. 文章架构拆解",
            "title": "按原文结构重建作者论证",
            "body": f"自动化会把原文拆成问题、方法、证据和局限四层，并记录摘要入口：{summary}。如果原文有图、表或系统示意图，HTML 中应保留原始图片链接或镜像后的 public asset。",
        },
        {
            "eyebrow": "3. 逐部分细读",
            "title": "每一节都要解释它承担的作用",
            "body": f"不是只摘关键词，而是解释每一部分在整篇文章里的职责：哪些段落定义问题，哪些段落提出方法，哪些段落验证结果，哪些段落暴露限制。当前重点标签是：{tag_text}。",
        },
        {
            "eyebrow": "4. 讨论与局限",
            "title": "把不能直接下结论的地方讲出来",
            "body": "如果文章缺少公开代码、样本规模较小、评测条件与真实场景有差距，或者安全假设过窄，分析稿必须保留这些不确定性。",
        },
    ]
