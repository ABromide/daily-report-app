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

> 研究者精读 · ${category}

**来源**：[${item.sourceName}](${item.url})
**发布时间**：${item.publishedAt.slice(0, 10)}
**分类**：${category}
**标签**：${item.tags.join("、")}

## TL;DR

${item.summary}

这份 Markdown 兜底稿只负责提供研究分析骨架。真正生成时，TL;DR 应该直接压缩说明：原文提出了什么问题，方法或系统由哪些模块组成，训练、实验或证据如何设置，关键数字和图表结论是什么，哪些局限仍然存在。读者只看这一节，也应该能复述整篇文章的主线。

## Markdown 排版要求

研究分享要让论证容易扫读：方法模块、实验设置、贡献、失败类型和局限应该分点；benchmark、baseline、模型规模、指标数字和消融项适合用表格；数学关系用行内公式或块级公式；系统架构、训练流程、数据流、Agent 决策链或多阶段 pipeline 可以用 Mermaid 图。

~~~mermaid
flowchart TD
  A["阅读原文问题定义"] --> B["提取方法、数据、公式和伪代码"]
  B --> C["复原作者论证顺序"]
  C --> D["解释证据意义和边界"]
~~~

## 读完原文后的主线

${item.summary}

更完整地说，这篇内容首先给出一个问题入口，然后用方法、工程结构、实验或制度设计来回答它。分析时不要把“为什么重要”写成主体，而要先讲清背景与问题，再讲方法、公式、实验设置、主结果、消融失败案例和最终结论。

## 论文与博客的两种读法

论文和博客不能套同一张表。论文要按 claim → mechanism → evidence → boundary 读：先判断研究问题，再拆方法机制、公式伪代码、实验设置、主结果、消融失败、Figure/Table、相关工作和证据边界。博客要按作者原文的论证顺序读：先判断作者真正关心的问题，再解释他如何铺垫、举例、转折、下判断，以及这些案例和段落如何改变读者理解。

| 类型 | 阅读重点 | 证据处理 | 最容易犯的错 |
|---|---|---|---|
| 论文 | 研究问题、方法机制、实验可信度 | baseline、benchmark、指标、消融、失败案例 | 只复述方法名或只说效果显著 |
| 博客/报告 | 问题意识、论证节奏、关键段落、案例作用 | 区分案例、观察、经验判断和进一步推论 | 硬套论文审稿或堆摘录 |

## 逐部分细读

第一部分先看作者如何定义问题。如果问题定义含糊，后面的技术路线就很容易变成泛泛叙述。第二部分看作者如何组织论证：论文里是 claim、机制和证据如何连接；博客里是段落、案例和转折如何服务观点。第三部分看证据边界：数据、指标、baseline、消融、案例和图表分别支撑什么，又不能证明什么。最后才写领域延伸和研究者判断。

## 方法或系统流程

${flowMarkdown}

如果内容涉及后训练目标、奖励建模、约束优化、Agent 状态转移或评测指标，Markdown 应尽可能保留公式。比如：

$$
J(\\theta)=\\mathbb{E}_{x,y\\sim\\pi_\\theta}[r(x,y)]-\\beta D_{KL}(\\pi_\\theta\\Vert\\pi_0)
$$

伪代码也要写得像算法，而不是口号：

~~~text
Algorithm AnalyzeClaim
Input: source document D, candidate claim c, evidence set E
State: assumptions A, missing evidence M, confidence score s
for each section p in D:
  extract mechanisms, metrics, figures, and stated limitations
  update E when p directly supports or weakens c
  add unresolved assumptions to M
if E contains direct measurements and M is acceptable:
  return supported claim with boundary notes
else:
  return open question with required follow-up evidence
~~~

## 代码或项目结构深挖

如果这是代码仓库，不能只看 README 第一屏。分析应继续检查 docs/examples、依赖入口、核心目录、release notes、部署说明和测试入口，判断它到底是在提供模型能力、Agent 编排、训练管线、评测工具，还是治理/安全流程。即便当前内容不是代码，也要用同样方式追问：作者提供的是方法、证据、制度框架，还是工程实现。

## 关键论证链

一个合格的研究者精读必须能回答四个问题：作者先把什么现象定义成问题；接着提出了什么机制或系统来处理它；然后用什么证据证明这个机制有效；最后承认了哪些仍未解决的边界。缺任何一环，都不能把摘要写成确定结论。摘要也不能只是导读，它必须压缩写出主要做法和关键证据。

## 对照与反例

项目活跃不等于生产成熟；论文提出新目标不等于真实训练稳定；安全蓝图清晰也不等于制度已经落地。分析稿需要写出对照：它和同类方案相比新增了什么，哪些只是常规能力，哪些仍缺真实证据。

## 证据与边界

- **证据来源**：优先使用原文、论文页、官方博客或仓库 README；引用必须保留链接。
- **边界条件**：如果原文缺少实验、复现代码、失败案例或安全假设，必须明确标出。
- **后续问题**：把可复现性、部署可行性、评测覆盖和风险外溢作为下一次研究观察项。
- **重复风险**：每次写入都要与 \`known-links.json\`、canonical URL、title hash 和 content hash 对比。

## 领域延伸思考

第一，检查这篇内容是否出现复现代码、作者补充说明或第三方复测；第二，检查同类项目或论文是否给出相反结果；第三，思考它对「${category}」背后的研究路线意味着什么：它是在改变问题定义、评测方式、训练信号、安全边界，还是只是在已有框架里补一个工程细节。

## 研究者结论

结论要回答：作者提出的问题是否重要，方法是否真正回应了这个问题，证据是否足够，哪些结论仍依赖特定数据、模型规模、评测协议或作者假设，以及它给「${category}」领域留下了哪些更难的问题。

[打开原文](${item.url})
`);
}

function flowForItem(item: LocalizedDocument, category: string) {
  const generic = [
    "确认问题入口",
    "拆解方法或系统",
    "检查证据材料",
    "写出边界和领域问题"
  ];
  const topicSteps =
    item.clusterId === "llm-post-training"
      ? ["定位训练阶段", "拆开优化目标", "检查实验设置", "归纳工程风险"]
      : item.clusterId === "ai-safety"
        ? ["识别风险场景", "追踪攻击或治理链路", "检查证据强度", "形成安全观察项"]
        : ["识别任务入口", "拆解系统模块", "验证落地路径", "提出后续问题"];

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
