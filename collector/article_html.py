from __future__ import annotations

from html import escape

from collector.jsonio import JsonObject


def article_html_path(item: JsonObject) -> str:
    published_at = str(item["published_at"])
    year, month, day = published_at[:10].split("-")
    return f"articles/{year}/{month}/{day}/{item['item_id']}/index.html"


def render_article_html(item: JsonObject) -> str:
    visual = item["visual"]
    approach = [str(step) for step in visual["approach"]]
    metrics = list(visual["metrics"])
    title = str(item["title"])
    summary = str(item["summary_zh"])
    analysis = str(item["analysis_zh"])
    source_name = str(item.get("source_name", item["source_id"]))
    source_url = str(item["url"])
    category_id = str(item["category_id"])

    flow_html = "\n".join(
        f"""
        <article class="flow-step">
          <b>{index}</b>
          <h3>{escape(step)}</h3>
          <p>自动化会检查这一环节在原文里承担的是问题设定、方法推进、证据验证，还是风险边界说明。</p>
        </article>
        """
        for index, step in enumerate(approach, start=1)
    )
    metric_html = "\n".join(
        f"""
        <div class="metric" style="--score:{int(metric["score"])}%">
          <span>{escape(str(metric["label"]))}</span>
          <strong>{escape(str(metric["value"]))}</strong>
        </div>
        """
        for metric in metrics
    )

    return f"""<!doctype html>
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
        --font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        --font-serif: Charter, "Songti SC", "STSong", Georgia, serif;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        color: var(--ink);
        background: var(--parchment);
        font-family: var(--font-sans);
      }}
      main {{
        width: min(980px, calc(100% - 28px));
        margin: 0 auto;
        padding: 36px 0 64px;
      }}
      header {{
        display: grid;
        gap: 16px;
        padding-bottom: 26px;
        border-bottom: 1px solid var(--line);
      }}
      .eyebrow {{
        margin: 0;
        color: var(--warm);
        font-size: 0.72rem;
        font-weight: 900;
        text-transform: uppercase;
      }}
      h1 {{
        max-width: 16ch;
        margin: 0;
        color: var(--ink-blue);
        font-family: var(--font-serif);
        font-size: clamp(2.2rem, 7vw, 4.1rem);
        line-height: 1.02;
      }}
      p {{
        margin: 0;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.72;
      }}
      section {{
        display: grid;
        gap: 14px;
        margin-top: 18px;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--ivory);
      }}
      h2, h3 {{
        margin: 0;
        color: var(--ink-blue);
      }}
      h2 {{
        font-family: var(--font-serif);
        font-size: 1.55rem;
      }}
      .grid {{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }}
      .card, .flow-step {{
        min-width: 0;
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper);
      }}
      .flow-step {{
        position: relative;
        padding-left: 54px;
      }}
      .flow-step b {{
        position: absolute;
        top: 14px;
        left: 14px;
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 999px;
        background: var(--ink-blue);
        color: var(--ivory);
      }}
      .metric {{
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        padding: 10px;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--paper);
      }}
      .metric::before {{
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--score);
        background: rgb(27 54 93 / 0.1);
        content: "";
      }}
      .metric span, .metric strong {{ position: relative; }}
      a {{ color: var(--ink-blue); font-weight: 850; }}
      @media (max-width: 720px) {{
        .grid {{ grid-template-columns: 1fr; }}
      }}
    </style>
  </head>
  <body>
    <main>
      <header>
        <p class="eyebrow">Daily Report 深度分析 · {escape(category_id)}</p>
        <h1>{escape(title)}</h1>
        <p>{escape(summary)}</p>
        <p>来源：<a href="{escape(source_url)}">{escape(source_name)}</a></p>
      </header>

      <section>
        <p class="eyebrow">总览</p>
        <h2>这篇文章真正讨论什么</h2>
        <p>{escape(analysis)}</p>
        <p>自动化审查会把原文拆成问题入口、方法主体、证据指标和边界问题，而不是只提取标签。</p>
      </section>

      <section>
        <p class="eyebrow">文章架构</p>
        <h2>从问题到证据的结构</h2>
        <div class="grid">
          <article class="card"><h3>问题入口</h3><p>{escape(str(visual["question"]))}</p></article>
          <article class="card"><h3>核心判断</h3><p>{escape(str(visual["takeaway"]))}</p></article>
          <article class="card"><h3>分类理由</h3><p>这条内容被归入 {escape(category_id)}，用于后续报告聚类和同类追踪。</p></article>
          <article class="card"><h3>开放边界</h3><p>需要继续检查复现性、证据强度、真实落地条件和风险假设。</p></article>
        </div>
      </section>

      <section>
        <p class="eyebrow">流程拆解</p>
        <h2>自动化读到的关键流程</h2>
        <div class="grid">{flow_html}</div>
      </section>

      <section>
        <p class="eyebrow">信号指标</p>
        <h2>为什么值得进入日报</h2>
        <div class="grid">{metric_html}</div>
      </section>
    </main>
  </body>
</html>
"""
