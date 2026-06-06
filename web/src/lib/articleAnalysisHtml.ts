import type { LocalizedCluster, LocalizedDocument } from "./showcaseContent";

export function renderShowcaseArticleHtml(item: LocalizedDocument, cluster?: LocalizedCluster): string {
  const category = cluster?.title ?? item.clusterId;
  const flow = flowForItem(item, category);
  const sections = sectionCards(item, category);
  const tagHtml = item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const flowHtml = flow
    .map(
      (step, index) => `
        <article class="flow-step">
          <b>${index + 1}</b>
          <h3>${escapeHtml(step.title)}</h3>
          <p>${escapeHtml(step.body)}</p>
        </article>`
    )
    .join("");
  const sectionHtml = sections
    .map(
      (section) => `
        <section class="article-section">
          <p class="eyebrow">${escapeHtml(section.eyebrow)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.body)}</p>
        </section>`
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(item.title)} · Daily Report 深度分析</title>
    <style>
      :root {
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
      }
      * { box-sizing: border-box; }
      html { background: var(--parchment); }
      body {
        margin: 0;
        color: var(--ink);
        background: var(--parchment);
        font-family: var(--font-sans);
      }
      a { color: var(--ink-blue); font-weight: 850; }
      main {
        width: min(980px, calc(100% - 28px));
        margin: 0 auto;
        padding: 36px 0 72px;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 150px;
        gap: 24px;
        align-items: end;
        padding: 28px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--ivory);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--warm);
        font-size: 0.72rem;
        font-weight: 900;
        text-transform: uppercase;
      }
      h1 {
        max-width: 18ch;
        margin: 0;
        color: var(--ink-blue);
        font-family: var(--font-serif);
        font-size: clamp(2.1rem, 7vw, 4.2rem);
        line-height: 1.02;
      }
      h2 {
        margin: 0 0 10px;
        color: var(--ink-blue);
        font-family: var(--font-serif);
        font-size: clamp(1.45rem, 3.6vw, 2rem);
        line-height: 1.14;
      }
      h3 {
        margin: 0 0 8px;
        color: var(--ink-blue);
        font-size: 1rem;
        line-height: 1.35;
      }
      p, li {
        margin: 0;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.78;
      }
      .lead {
        max-width: 72ch;
        margin-top: 16px;
        color: var(--ink);
        font-size: 1.05rem;
      }
      .source-figure {
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
      }
      .source-figure img {
        width: 56px;
        height: 56px;
        border-radius: 10px;
      }
      .source-figure figcaption {
        color: var(--muted);
        font-size: 0.84rem;
        line-height: 1.5;
      }
      .meta-strip, .tag-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 18px;
      }
      .meta-strip span, .tag-row span {
        padding: 6px 9px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: var(--paper);
        color: var(--ink-blue);
        font-size: 0.78rem;
        font-weight: 850;
      }
      .article-section, .tldr, .flow-card, .evidence-grid article {
        margin-top: 18px;
        padding: 22px;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--ivory);
      }
      .tldr {
        display: grid;
        gap: 14px;
        border-color: rgb(27 54 93 / 0.24);
      }
      .tldr strong { color: var(--ink-blue); }
      .flow-card {
        display: grid;
        gap: 12px;
      }
      .flow-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .flow-step {
        position: relative;
        min-width: 0;
        min-height: 150px;
        padding: 16px 16px 16px 58px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper);
      }
      .flow-step b {
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
      }
      .evidence-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .evidence-grid article {
        margin-top: 0;
        background: var(--paper);
      }
      .note {
        border-left: 4px solid var(--green);
      }
      .footer-link {
        display: inline-flex;
        margin-top: 22px;
        padding: 10px 13px;
        border: 1px solid var(--ink-blue);
        border-radius: 999px;
        text-decoration: none;
      }
      @media (max-width: 760px) {
        main { width: min(100% - 20px, 980px); padding-top: 18px; }
        header, .flow-grid, .evidence-grid { grid-template-columns: 1fr; }
        header { padding: 18px; }
      }
    </style>
  </head>
  <body>
    <main data-analysis-document="html">
      <header>
        <div>
          <p class="eyebrow">Daily Report 深度分析 · ${escapeHtml(category)}</p>
          <h1>${escapeHtml(item.title)}</h1>
          <p class="lead">${escapeHtml(item.summary)}</p>
          <div class="meta-strip">
            <span>${escapeHtml(item.sourceName)}</span>
            <span>${escapeHtml(item.publishedAt.slice(0, 10))}</span>
            <span>正文由 HTML 分析稿承载</span>
          </div>
          <div class="tag-row">${tagHtml}</div>
        </div>
        <figure class="source-figure">
          <img src="${escapeHtml(item.faviconUrl)}" alt="" />
          <figcaption>图片可以使用原文链接，也可以由自动化下载后重新上传到 public assets；这里展示来源图标。</figcaption>
        </figure>
      </header>

      <section class="tldr">
        <p class="eyebrow">TL;DR</p>
        <p><strong>这篇内容首先回答：</strong>${escapeHtml(item.visual.question)}。它不是一个孤立链接，而是进入「${escapeHtml(category)}」频道的一个可复用分析对象。</p>
        <p><strong>核心判断：</strong>${escapeHtml(item.visual.takeaway)} 这句话只是入口，完整 HTML 会继续追问作者如何支撑它、哪些环节仍缺证据、它应该如何影响后续日报跟踪。</p>
      </section>

      <section class="article-section">
        <p class="eyebrow">来源与材料地图</p>
        <h2>先确认我们到底读了什么</h2>
        <p>二级页不应该只给一个链接。本稿把材料拆成三层：原文入口、可验证证据、以及仍需要后续追踪的推断区。当前来源是 ${escapeHtml(item.sourceName)}，原文域名是 ${escapeHtml(item.domain)}，分类是「${escapeHtml(category)}」。如果自动化无法确认发布日期、原始来源或关键材料，它不能把内容写入日报。</p>
        <p>对于代码仓库，材料地图要覆盖 README、docs/examples、依赖入口、核心目录和 release notes；对于论文，要覆盖摘要、方法、实验、指标、消融和局限；对于博客或报告，要覆盖作者论证顺序、关键事实、政策或产品含义和未证明部分。</p>
      </section>

      ${sectionHtml}

      <section class="article-section">
        <p class="eyebrow">代码或项目结构深挖</p>
        <h2>把工程面或方法面拆到能复用</h2>
        <p>当前内容的核心路径是：${escapeHtml(item.visual.approach.join(" -> "))}。如果这是项目分析，自动化要继续解释模块边界、执行流程、状态管理、可观测性、部署入口和真实工程风险；如果这是论文或报告，则要把方法流程、实验设计、治理链条或安全假设拆成可检查的步骤。</p>
        <p>这里的重点不是把标签写得更多，而是回答「它到底改变了哪一段工作流」。一个 Agent 项目要说明模型、工具、状态、审批、观察和部署如何连接；一个后训练工作要说明数据、目标、采样、奖励、蒸馏或评测如何连接；一个安全内容要说明风险、评估、制度或防御动作如何连接。</p>
      </section>

      <section class="article-section">
        <p class="eyebrow">关键论证链</p>
        <h2>把作者从问题到结论的路径还原出来</h2>
        <p>深度分析必须能回答四个问题：作者先把什么现象定义成问题；接着提出什么机制、系统或实验；然后用什么证据证明它有效；最后哪些结论仍然不能直接推出。当前摘要是：${escapeHtml(item.summary)}。它只能作为入口，不能替代论证链。</p>
        <p>因此，自动化生成 HTML 时必须保留逻辑顺序：问题入口 -> 方法主体 -> 证据材料 -> 边界条件 -> 日报判断。任何跳过证据直接下结论的段落，都应该被 skeptical review 打回重写。</p>
      </section>

      <section class="article-section">
        <p class="eyebrow">对照与反例</p>
        <h2>避免把单个信号误读成行业结论</h2>
        <p>项目活跃不等于生产成熟，论文新目标不等于真实训练稳定，安全蓝图清晰也不等于制度已经落地。自动化必须写出同类对照、缺失证据和潜在失败模式：它和同类内容相比新增了什么，哪些只是常规能力，哪些仍停留在主张层。</p>
        <p>如果找不到充分对照，HTML 也要明说，而不是用漂亮卡片掩盖空白。日报的可信度来自把不知道的部分写清楚。</p>
      </section>

      <section class="flow-card">
        <p class="eyebrow">方法或系统流程</p>
        <h2>方法或系统流程</h2>
        <p>把文章里的关键流程拆成连续步骤，方便日报、二级页面和后续追踪复用。</p>
        <div class="flow-grid">${flowHtml}</div>
      </section>

      <section class="article-section">
        <p class="eyebrow">证据与边界</p>
        <h2>证据与边界</h2>
        <p>这一节检查哪些内容支撑结论，哪些地方还不能过度解释。</p>
        <div class="evidence-grid">
          <article><h3>证据来源</h3><p>优先使用原文、论文页、官方博客或仓库 README；引用必须保留链接，不能只写“据称”。</p></article>
          <article><h3>边界条件</h3><p>如果原文缺少实验、复现代码、失败案例或安全假设，HTML 分析稿必须明确标出，而不是用摘要掩盖。</p></article>
          <article><h3>后续追踪</h3><p>把可复现性、部署可行性、评测覆盖和风险外溢作为下一次自动化运行的观察项。</p></article>
          <article><h3>重复风险</h3><p>写入前必须检查 known-links、canonical URL、title hash 和 content hash；重复候选要替换，不要换个标题重复展示。</p></article>
          <article><h3>过度解释风险</h3><p>不能把作者没有证明的结论写成确定事实；所有扩展判断都要回到公开证据或标记为后续问题。</p></article>
        </div>
      </section>

      <section class="article-section">
        <p class="eyebrow">后续追踪问题</p>
        <h2>下一轮自动化应该继续追什么</h2>
        <p>第一，检查这篇内容是否出现复现代码、release 更新、作者补充说明或第三方复测；第二，检查同类项目或论文是否给出相反结果；第三，检查它是否进入真实产品、训练管线、安全政策或开发者工作流；第四，检查今天的判断是否需要被 tombstone 或 correction 修正。</p>
        <p>这些问题会进入下一轮搜索提示，避免日报只做一次性摘录，而是形成连续观察。</p>
      </section>

      <section class="article-section note">
        <p class="eyebrow">可复用到日报的判断</p>
        <h2>可复用到日报的判断</h2>
        <p>JSON 只负责索引和首页卡片；真正面向用户的解释在这个完整 HTML 文件里。后续 Mac App、网页详情页和日报归档都可以直接渲染或缓存它。</p>
        <a class="footer-link" href="${escapeHtml(item.url)}">打开原文</a>
      </section>

      <section class="article-section">
        <p class="eyebrow">审稿式结论</p>
        <h2>这篇能不能进入日报，为什么</h2>
        <p>可以进入，但必须带着边界进入。它满足分类、来源和可追踪性要求，也能提供一个后续观察信号；但日报不把它包装成最终答案，而是把它放进可复查的证据链里：原文链接、结构拆解、逐部分细读、流程复原、证据边界、后续问题和审稿式结论必须同时存在。</p>
      </section>
    </main>
  </body>
</html>`;
}

function sectionCards(item: LocalizedDocument, category: string) {
  return [
    {
      eyebrow: "1. 引言",
      title: "先说明问题为什么出现",
      body: `围绕《${item.title}》，分析稿先说明它为什么属于「${category}」。这一段不急着给结论，而是把用户需要理解的背景、问题动机和当前技术脉络讲清楚。`
    },
    {
      eyebrow: "2. 文章架构拆解",
      title: "按原文结构重建作者论证",
      body: `自动化会把原文拆成问题、方法、证据和局限四层。当前摘要是：${item.summary}。如果原文有图、表或系统示意图，HTML 中应保留原始图片链接或镜像后的 public asset。`
    },
    {
      eyebrow: "3. 逐部分细读",
      title: "每一节都要解释它承担的作用",
      body: `不是只摘关键词，而是解释每一部分在整篇文章里的职责：哪些段落定义问题，哪些段落提出方法，哪些段落验证结果，哪些段落暴露限制。`
    },
    {
      eyebrow: "4. 讨论与局限",
      title: "把不能直接下结论的地方讲出来",
      body: "如果文章缺少公开代码、样本规模较小、评测条件与真实场景有差距，或者安全假设过窄，分析稿必须保留这些不确定性。"
    }
  ];
}

function flowForItem(item: LocalizedDocument, category: string) {
  return item.visual.approach.map((step, index) => ({
    title: step,
    body: `这是《${item.title}》中第 ${index + 1} 个关键动作。分析稿需要说明它在「${category}」里的作用：是定义问题、推进方法、验证证据，还是暴露边界。`
  }));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
