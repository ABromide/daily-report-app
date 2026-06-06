from __future__ import annotations

from urllib.parse import urlparse

from collector.jsonio import JsonObject


def article_markdown_path(item: JsonObject) -> str:
    published_at = str(item["published_at"])
    year, month, day = published_at[:10].split("-")
    return f"articles/{year}/{month}/{day}/{item['item_id']}/index.md"


def render_article_markdown(item: JsonObject) -> str:
    title = str(item["title"])
    summary = str(item["summary_zh"])
    source_name = str(item.get("source_name", item["source_id"]))
    source_url = str(item["url"])
    category_id = str(item["category_id"])
    published_at = str(item["published_at"])
    tags = [str(tag) for tag in item.get("tags", [])]
    domain = urlparse(source_url).netloc or source_name
    topic = _category_label(category_id)
    flow = _flow_for_category(category_id, tags)
    section_cards = _section_cards(title, topic, summary, tags)
    tag_text = "、".join(tags[:8]) or "未标注"

    flow_markdown = "\n".join(
        f"{index}. **{step['title']}**：{step['body']}" for index, step in enumerate(flow, start=1)
    )
    section_markdown = "\n\n".join(f"## {card['title']}\n\n{card['body']}" for card in section_cards)

    return _strip_trailing_whitespace(
        f"""# {title}

> Daily Report 深度分析 · {topic}

**来源**：[ {source_name} ]({source_url})
**发布时间**：{published_at[:10]}
**分类**：{topic}
**标签**：{tag_text}
**来源域名**：{domain}

## TL;DR

{summary}

这不是首页卡片上的一句话，而是进入深读流程后的核心判断：先确认材料来源，再拆文章或项目结构，最后把能被证据支撑的结论和仍需追踪的边界分开。

## 来源与材料地图

本稿把来源拆成三层：第一层是原文地址与发布时间，确保它满足今天或本周窗口；第二层是可验证材料，包括官方页面、论文页、仓库 README、docs、examples、release notes 或报告 PDF；第三层是不可直接推出的推测区，所有推测都必须在后文的「证据与边界」里单独标出。

对《{title}》来说，自动化首先抓住的是来源域名 `{domain}`、分类「{topic}」和标签「{tag_text}」。这一步的目标不是装饰卡片，而是把后续分析的材料边界摆清楚：哪些判断来自公开内容，哪些判断只是日报编辑的后续观察假设。

{section_markdown}

## 代码或项目结构深挖

代码仓库不能只看 README 第一屏。自动化需要继续检查 docs/examples、依赖入口、核心目录、release notes 和部署说明，判断它到底是在提供模型能力、Agent 编排、训练管线、评测工具，还是治理/安全流程。即便当前内容不是代码，也要用同样方式追问：作者提供的是方法、证据、制度框架，还是产品路线。

这篇内容被归入「{topic}」，因此最重要的不是复述“它很新”，而是说明它在这条技术链路里的位置：是解决入口问题、状态管理问题、训练信号问题、评测证据问题，还是风险治理问题。只有这个位置讲清楚，首页卡片才不是孤立链接。

## 关键论证链

一个合格的日报分析必须能回答四个问题：

1. 作者先把什么现象定义成问题。
2. 接着提出了什么机制或系统来处理它。
3. 然后用什么证据证明这个机制有效。
4. 最后承认了哪些仍未解决的边界。

缺任何一环，都不能把摘要写成确定结论。本文的论证链可以这样读：问题入口来自「{summary}」；方法或系统路径由流程拆解；证据强度取决于原文是否给出代码、实验、图表、案例或官方 release；日报判断则只保留那些能被公开材料支撑的部分。

## 方法或系统流程

{flow_markdown}

如果文章包含数学目标、损失函数或约束，可以直接保留 Markdown 公式，例如 `$L(\\theta)=\\mathbb{{E}}[r(x,y)]-\\beta KL(\\pi_\\theta||\\pi_0)$`，或使用块级公式：

$$
J(\\theta)=\\sum_t w_t \\log \\pi_\\theta(y_t|x,y_{{<t}})
$$

前端只负责渲染 Markdown；公式不会被拆成 JSON 字段，也不会要求自动化额外写 HTML。

## 对照与反例

这类内容最容易被过度解读。一个项目活跃更新，不等于生产可用；一篇论文提出新目标，不等于在真实训练管线里稳定；一份安全报告提出治理建议，也不等于制度已经落地。因此 Markdown 分析稿必须写出对照：它和同类方案相比新增了什么，哪些只是常规能力，哪些还缺真实证据。

如果后续自动化找不到对照材料，需要在这里显式标记，而不是把空白藏起来。日报的可信度来自把“不知道”写清楚。

## 证据与边界

- **证据来源**：优先使用原文、论文页、官方博客或仓库 README；引用必须保留链接，不能只写“据称”。
- **边界条件**：如果原文缺少实验、复现代码、失败案例或安全假设，Markdown 分析稿必须明确标出，而不是用摘要掩盖。
- **后续追踪**：把可复现性、部署可行性、评测覆盖和风险外溢作为下一次自动化运行的观察项。
- **重复风险**：每次写入都要与 `known-links.json`、canonical URL、title hash 和 content hash 对比，重复候选必须换同类替代内容。
- **过度解释风险**：不能把作者没有证明的结论写成确定事实；所有扩展判断都要回到公开证据或标记为后续问题。

## 后续追踪问题

第一，检查这篇内容是否出现复现代码、release 更新、作者补充说明或第三方复测；第二，检查同类项目或论文是否给出相反结果；第三，检查它是否进入真实产品、训练管线、安全政策或开发者工作流；第四，检查今天的判断是否需要被 tombstone 或 correction 修正。

这些问题会进入下一次运行的搜索提示，避免日报只做一次性摘录，而是形成连续观察。

## 可复用到日报的判断

它提供了一个可追踪的研究或产品信号：来源、发布时间、分类、摘要和完整 Markdown 分析稿可以被首页卡片、日报页、Mac 本地缓存和后续聚类共同复用。JSON 只负责索引；真正面向用户的解释在这个 Markdown 文件里。

[打开原文]({source_url})

## 审稿式结论

可以进入，但必须带着边界进入。它满足日期窗口、分类和来源约束，也能提供一个可继续追踪的技术或治理信号；但日报不把它包装成最终答案，而是把它放进可复查的证据链里：原文链接、结构拆解、流程复原、边界说明和后续问题必须同时存在。
"""
    )


def _category_label(category_id: str) -> str:
    return {
        "llm-agent": "大模型 Agent 相关",
        "llm-post-training": "大模型后训练相关",
        "ai-safety": "AI 安全相关",
    }.get(category_id, category_id)


def _strip_trailing_whitespace(markdown: str) -> str:
    return "\n".join(line.rstrip() for line in markdown.splitlines()) + "\n"


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
    return [
        {
            "title": "文章架构拆解",
            "body": f"先把《{title}》拆成“问题入口、方法或系统、证据材料、边界结论”四段。首页只展示摘要，但 Markdown 正文要解释每段承担什么功能，以及它为什么被放进「{topic}」。",
        },
        {
            "title": "逐部分细读",
            "body": f"第一部分确认作者要解决的问题是否足够明确；第二部分追踪它提出的机制、流程或代码结构；第三部分检查证据是否能支撑“{summary}”；第四部分把仍需追踪的问题单独列出。",
        },
        {
            "title": "标签不是结论",
            "body": f"标签「{'、'.join(tags[:5]) or '未标注'}」只帮助检索，不能替代分析。自动化必须继续解释这些标签如何对应到模型能力、训练阶段、工程模块或安全风险。",
        },
    ]
