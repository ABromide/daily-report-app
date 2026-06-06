import MarkdownIt from "markdown-it";
import markdownItKatex from "markdown-it-katex";

import type { LocalizedCluster, LocalizedDocument } from "./showcaseContent";

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
}).use(markdownItKatex, {
  throwOnError: false,
  errorColor: "#9a493e"
});

export function renderMarkdownToHtml(markdown: string): string {
  return markdownRenderer.render(markdown);
}

export function renderShowcaseArticleMarkdown(item: LocalizedDocument, cluster?: LocalizedCluster): string {
  const category = cluster?.title ?? item.clusterId;
  const flow = flowForItem(item, category);
  const flowMarkdown = flow.map((step, index) => `${index + 1}. **${step.title}**：${step.body}`).join("\n");

  return stripTrailingWhitespace(`# ${item.title}

> Daily Report 深度分析 · ${category}

**来源**：[${item.sourceName}](${item.url})
**发布时间**：${item.publishedAt.slice(0, 10)}
**分类**：${category}
**标签**：${item.tags.join("、")}

## TL;DR

${item.summary}

这篇内容被放入「${category}」不是因为它有一个响亮标题，而是因为它提供了一个可以继续追踪的技术或治理信号。首页卡片只保留入口判断，下面的 Markdown 正文负责把文章结构、证据链和边界条件讲完整。

## 来源与材料地图

本次材料来自 [${item.sourceName}](${item.url})，来源域名是 \`${item.domain}\`。自动化写入时应该优先阅读原文、论文页、官方博客、README、docs、examples、release notes 或报告 PDF，而不是只根据标题和标签生成摘要。

如果原文包含关键图表，可以直接写成 Markdown 图片：

![来源示意图](https://www.google.com/s2/favicons?domain=${item.domain}&sz=128)

这类图片不承担装饰作用，只用于保留原文证据或帮助读者定位材料来源。

## 文章总览

${item.analysis}

更完整地说，这篇内容首先给出一个问题入口，然后用方法、工程结构、实验或制度设计来回答它。阅读时不要只看“它是不是新”，而要看它改变了哪一段真实工作流：Agent 的任务执行、后训练的优化信号，还是 AI 安全里的治理与评估能力。

## 文章架构拆解

1. **问题入口**：作者试图解决什么现象，或者把哪个工程/治理空白摆到了台面上。
2. **方法主体**：它提出的是算法、系统、平台、评测、政策框架，还是代码实现。
3. **证据材料**：有没有论文实验、仓库代码、release note、产品文档、案例或政策文件。
4. **边界条件**：哪些结论仍然不能直接推出，哪些地方需要下一轮自动化继续跟踪。

## 逐部分细读

第一部分先看作者如何定义问题。如果问题定义含糊，后面的技术路线就很容易变成泛泛叙述。第二部分看方法或系统如何组织：它是把多个模块接成生产流程，还是只提出单点技巧。第三部分看证据是否支撑主张：实验、代码、用户场景、政策文本和失败案例的权重不同。第四部分看作者有没有承认限制；没有限制的文章反而更需要谨慎。

## 方法或系统流程

${flowMarkdown}

如果内容涉及后训练目标、奖励建模或约束优化，Markdown 可以直接保留公式。比如：

$$
J(\\theta)=\\mathbb{E}_{x,y\\sim\\pi_\\theta}[r(x,y)]-\\beta D_{KL}(\\pi_\\theta\\Vert\\pi_0)
$$

行内公式也可以保留，例如 $\\pi_\\theta(y|x)$、$D_{KL}$ 或 $L_{SFT}$。前端只负责渲染 Markdown，不再要求自动化输出完整 HTML。

## 代码或项目结构深挖

如果这是代码仓库，不能只看 README 第一屏。自动化应该继续检查 docs/examples、依赖入口、核心目录、release notes、部署说明和测试入口，判断它到底是在提供模型能力、Agent 编排、训练管线、评测工具，还是治理/安全流程。即便当前内容不是代码，也要用同样方式追问：作者提供的是方法、证据、制度框架，还是产品路线。

## 关键论证链

一个合格的日报分析必须能回答四个问题：作者先把什么现象定义成问题；接着提出了什么机制或系统来处理它；然后用什么证据证明这个机制有效；最后承认了哪些仍未解决的边界。缺任何一环，都不能把摘要写成确定结论。

## 对照与反例

项目活跃不等于生产成熟；论文提出新目标不等于真实训练稳定；安全蓝图清晰也不等于制度已经落地。分析稿需要写出对照：它和同类方案相比新增了什么，哪些只是常规能力，哪些仍缺真实证据。

## 证据与边界

- **证据来源**：优先使用原文、论文页、官方博客或仓库 README；引用必须保留链接。
- **边界条件**：如果原文缺少实验、复现代码、失败案例或安全假设，必须明确标出。
- **后续追踪**：把可复现性、部署可行性、评测覆盖和风险外溢作为下一次自动化运行的观察项。
- **重复风险**：每次写入都要与 \`known-links.json\`、canonical URL、title hash 和 content hash 对比。

## 后续追踪问题

第一，检查这篇内容是否出现复现代码、release 更新、作者补充说明或第三方复测。第二，检查同类项目或论文是否给出相反结果。第三，检查它是否进入真实产品、训练管线、安全政策或开发者工作流。第四，检查今天的判断是否需要被 tombstone 或 correction 修正。

## 可复用到日报的判断

它提供了一个可追踪的研究或产品信号：来源、发布时间、分类、摘要和完整 Markdown 分析稿可以被首页卡片、日报页、Mac 本地缓存和后续聚类共同复用。JSON 只负责索引；真正面向用户的解释在这个 Markdown 文件里。

## 审稿式结论

可以进入，但必须带着边界进入。它满足日期窗口、分类和来源约束，也能提供一个可继续追踪的技术或治理信号；但日报不把它包装成最终答案，而是把它放进可复查的证据链里。

[打开原文](${item.url})
`);
}

function flowForItem(item: LocalizedDocument, category: string) {
  const generic = [
    "确认问题入口",
    "拆解方法或系统",
    "检查证据材料",
    "写出边界和后续追踪"
  ];
  const topicSteps =
    item.clusterId === "llm-post-training"
      ? ["定位训练阶段", "拆开优化目标", "检查实验设置", "归纳工程风险"]
      : item.clusterId === "ai-safety"
        ? ["识别风险场景", "追踪攻击或治理链路", "检查证据强度", "形成安全观察项"]
        : ["识别任务入口", "拆解系统模块", "验证落地路径", "留下复用判断"];

  return topicSteps.map((title, index) => ({
    title,
    body: `${generic[index]}，并说明它在「${category}」里的作用。当前文章标题是《${item.title}》。`
  }));
}

function stripTrailingWhitespace(markdown: string): string {
  return `${markdown
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()}\n`;
}
