import MarkdownIt from "markdown-it";
import katex, { type KatexOptions } from "katex";

import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Token from "markdown-it/lib/token.mjs";

import type { LocalizedCluster, LocalizedDocument } from "./showcaseContent";

export interface MarkdownHeading {
  id: string;
  level: 2 | 3;
  text: string;
}

interface MarkdownRenderEnv {
  headingSlugCounts?: Record<string, number>;
}

const mathOptions: KatexOptions = {
  throwOnError: false,
  errorColor: "#9a493e",
  strict: "ignore"
};

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

const defaultHeadingOpenRenderer = markdownRenderer.renderer.rules.heading_open;
const defaultFenceRenderer = markdownRenderer.renderer.rules.fence;
const defaultImageRenderer = markdownRenderer.renderer.rules.image;

const siteBasePath = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

function localHref(path: string): string {
  if (path === "/") return siteBasePath;
  return `${siteBasePath}${path.replace(/^\/+/, "")}`;
}

function isExternalOrSpecialUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") || value.startsWith("#");
}

function normalizeMarkdownImageSrc(value: string): string {
  const src = value.trim();
  if (!src || isExternalOrSpecialUrl(src)) return value;
  if (siteBasePath !== "/" && src.startsWith(siteBasePath)) return src;
  if (src.startsWith("/assets/")) return localHref(`/data${src}`);
  if (src.startsWith("/")) return localHref(src);
  if (src.startsWith("assets/")) return localHref(`/data/${src}`);
  if (src.startsWith("public/assets/")) return localHref(`/data/${src.slice("public/".length)}`);
  return value;
}

function plainHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugBaseForHeading(text: string): string {
  const slug = plainHeadingText(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}

function nextHeadingId(text: string, counts: Record<string, number>): string {
  const base = slugBaseForHeading(text);
  const count = counts[base] ?? 0;
  counts[base] = count + 1;
  return count === 0 ? base : `${base}-${count + 1}`;
}

markdownRenderer.renderer.rules.heading_open = (tokens, index, options, env, self) => {
  const level = Number(tokens[index].tag.slice(1));
  if (level >= 2 && level <= 3) {
    const renderEnv = env as MarkdownRenderEnv;
    renderEnv.headingSlugCounts ??= {};
    const headingText = tokens[index + 1]?.content ?? "";
    tokens[index].attrSet("id", nextHeadingId(headingText, renderEnv.headingSlugCounts));
  }
  return defaultHeadingOpenRenderer
    ? defaultHeadingOpenRenderer(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

markdownRenderer.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
  if (language === "mermaid") {
    return `<pre class="mermaid">${markdownRenderer.utils.escapeHtml(token.content)}</pre>`;
  }
  return defaultFenceRenderer
    ? defaultFenceRenderer(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

markdownRenderer.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const src = token.attrGet("src");
  if (src !== null) {
    token.attrSet("src", normalizeMarkdownImageSrc(src));
  }
  return defaultImageRenderer
    ? defaultImageRenderer(tokens, index, options, env, self)
    : self.renderToken(tokens, index, options);
};

function renderMath(content: string, displayMode: boolean): string {
  return katex.renderToString(content.trim(), {
    ...mathOptions,
    displayMode
  });
}

function findInlineMathEnd(source: string, start: number, max: number): number {
  for (let position = start + 1; position < max; position += 1) {
    if (source.charCodeAt(position) !== 0x24 /* $ */) continue;
    if (source.charCodeAt(position - 1) === 0x5C /* \ */) continue;
    if (source.charCodeAt(position + 1) === 0x24 /* $ */) continue;
    return position;
  }
  return -1;
}

function inlineMathRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (state.src.charCodeAt(start + 1) === 0x24 /* $ */) return false;
  if (start > 0 && state.src.charCodeAt(start - 1) === 0x5C /* \ */) return false;

  const end = findInlineMathEnd(state.src, start, state.posMax);
  if (end < 0) return false;

  const content = state.src.slice(start + 1, end).trim();
  if (!content) return false;
  if (silent) return true;

  const token = state.push("math_inline", "math", 0);
  token.markup = "$";
  token.content = content;
  state.pos = end + 1;
  return true;
}

function blockMathRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  let position = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];

  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (position + 2 > max) return false;
  if (state.src.slice(position, position + 2) !== "$$") return false;

  const firstLine = state.src.slice(position + 2, max);
  const trimmedFirstLine = firstLine.trim();
  if (trimmedFirstLine.length > 0 && trimmedFirstLine.endsWith("$$")) {
    const content = trimmedFirstLine.slice(0, -2).trim();
    if (!content) return false;
    if (silent) return true;
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.markup = "$$";
    token.content = content;
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }

  let nextLine = startLine;
  let foundEndMarker = false;
  for (;;) {
    nextLine += 1;
    if (nextLine >= endLine) break;
    position = state.bMarks[nextLine] + state.tShift[nextLine];
    const lineMax = state.eMarks[nextLine];
    const line = state.src.slice(position, lineMax).trim();
    if (line === "$$") {
      foundEndMarker = true;
      break;
    }
  }

  if (!foundEndMarker) return false;
  if (silent) return true;

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.markup = "$$";
  token.content = state.getLines(startLine + 1, nextLine, 0, false);
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

function useKatexRenderer(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math_inline", inlineMathRule);
  md.block.ruler.before("fence", "math_block", blockMathRule);

  md.renderer.rules.math_inline = (tokens: Token[], index: number) => renderMath(tokens[index].content, false);
  md.renderer.rules.math_block = (tokens: Token[], index: number) =>
    `<div class="math-display">${renderMath(tokens[index].content, true)}</div>\n`;
}

useKatexRenderer(markdownRenderer);

export function renderMarkdownToHtml(markdown: string): string {
  return markdownRenderer.render(markdown, { headingSlugCounts: {} } satisfies MarkdownRenderEnv);
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  const counts: Record<string, number> = {};
  let fenceMarker: "```" | "~~~" | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const marker = trimmed.startsWith("```") ? "```" : "~~~";
      fenceMarker = fenceMarker === marker ? null : marker;
      continue;
    }
    if (fenceMarker !== null) continue;

    const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (!match) continue;

    const level = match[1].length as 2 | 3;
    const text = plainHeadingText(match[2]);
    if (!text) continue;
    headings.push({
      id: nextHeadingId(text, counts),
      level,
      text
    });
  }

  return headings;
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

这篇内容被放入「${category}」不是因为它有一个响亮标题，而是因为它提供了一个可以继续追踪的技术或治理信号。真实自动化里的摘要和 TL;DR 应该自包含：直接说明文章在做什么、具体怎么做、实验和证据怎么组织、关键数字是什么、局限在哪里。首页卡片只保留入口判断，下面的 Markdown 正文负责把原文结构、方法证据、实验结果、图表公式和边界条件讲完整。论文类应按背景、方法、实验、结果、消融、图表、相关工作和局限推进。

## 来源与材料地图

本次材料来自 [${item.sourceName}](${item.url})，来源域名是 \`${item.domain}\`。自动化写入时应该优先阅读原文、论文页、官方博客、README、docs、examples、release notes 或报告 PDF，而不是只根据标题和标签生成摘要。写作时要尽可能挖掘模块名、数据规模、训练阶段、benchmark、baseline、指标数字、消融项、失败类型、figure/table 编号和图片 URL。

如果原文、论文 PDF、项目页、Hugging Face 页面或 GitHub README 包含关键图表、系统图、轨迹图、截图或表格图片，可以直接写成 Markdown 图片：

![来源示意图](https://www.google.com/s2/favicons?domain=${item.domain}&sz=128)

这类图片不承担装饰作用，只用于保留原文证据或帮助读者定位材料来源。真实自动化应尽可能多引用论文 figure/table、项目页图片和作者补充图，并逐图解释。

## Markdown 排版要求

真实自动化写稿时要让正文容易扫读：方法模块、实验设置、贡献、失败类型和局限应该分点；benchmark、baseline、模型规模、指标数字和消融项适合用表格；数学关系用行内公式或块级公式；系统架构、训练流程、数据流、Agent 决策链或多阶段 pipeline 可以用 Mermaid 图。

~~~mermaid
flowchart TD
  A["读取原文材料"] --> B["提取方法、数据、公式、图表"]
  B --> C["按论文或原文结构写作"]
  C --> D["用列表、表格、公式和 Mermaid 排版"]
~~~

## 文章总览

${item.summary}

更完整地说，这篇内容首先给出一个问题入口，然后用方法、工程结构、实验或制度设计来回答它。论文类不要把“为什么重要”写成主体，而要先讲清背景与问题，再讲方法、公式、实验设置、主结果、消融失败案例和最终结论。

## 论文或文章架构拆解

1. **背景与研究问题**：作者试图解决什么现象，或者把哪个工程/治理空白摆到了台面上。
2. **方法与模型机制**：它提出的是算法、系统、平台、评测、政策框架，还是代码实现。
3. **训练与实验设置**：数据集、基座模型、训练策略、指标、评测协议和对照组分别是什么。
4. **主结果与消融**：最终结果证明了什么，哪些模块确实必要，失败案例暴露了什么。
5. **图表、公式与局限**：哪些 figure/table/公式支撑结论，哪些结论仍然不能直接推出。

## 逐部分细读

第一部分先看作者如何定义问题。如果问题定义含糊，后面的技术路线就很容易变成泛泛叙述。第二部分看方法或系统如何组织：输入、状态、模型、目标函数和输出如何连接，并尽量写出每个模块的做法。第三部分看实验设置和主结果：数据、指标、baseline、消融和失败案例是否支撑主张，凡是原文给了数字都要尽量写进来。第四部分逐图逐表看证据：图片、表格和公式分别证明什么，又不能证明什么。最后才写日报判断和后续追踪。

## 方法或系统流程

${flowMarkdown}

如果内容涉及后训练目标、奖励建模、约束优化、Agent 状态转移或评测指标，Markdown 应尽可能保留公式。比如：

$$
J(\\theta)=\\mathbb{E}_{x,y\\sim\\pi_\\theta}[r(x,y)]-\\beta D_{KL}(\\pi_\\theta\\Vert\\pi_0)
$$

行内公式也可以保留，例如 $\\pi_\\theta(y|x)$、$D_{KL}$、$L_{SFT}$、$s_{t+1}=T(s_t,a_t)$ 或 $\\text{Success Rate}$。前端只负责渲染 Markdown，不再要求自动化输出完整 HTML。

## 代码或项目结构深挖

如果这是代码仓库，不能只看 README 第一屏。自动化应该继续检查 docs/examples、依赖入口、核心目录、release notes、部署说明和测试入口，判断它到底是在提供模型能力、Agent 编排、训练管线、评测工具，还是治理/安全流程。即便当前内容不是代码，也要用同样方式追问：作者提供的是方法、证据、制度框架，还是产品路线。

## 关键论证链

一个合格的日报分析必须能回答四个问题：作者先把什么现象定义成问题；接着提出了什么机制或系统来处理它；然后用什么证据证明这个机制有效；最后承认了哪些仍未解决的边界。缺任何一环，都不能把摘要写成确定结论。摘要也不能只是导读，它必须压缩写出主要做法和关键证据。

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
