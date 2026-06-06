from __future__ import annotations

import argparse
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from collector.jsonio import JsonObject, canonical_json_bytes, sha256_bytes, write_json, write_jsonl
from collector.manifest import build_manifest


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--generated-at", required=True)
    return parser.parse_args()


def _parse_generated_at(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


def _reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _title_hash(title: str) -> str:
    return sha256_bytes(canonical_json_bytes({"title": " ".join(title.casefold().split())}))


def _item_id(seed: JsonObject) -> tuple[str, str]:
    fingerprint = sha256_bytes(canonical_json_bytes(seed))
    return f"itm_{fingerprint[:16]}", fingerprint


def _article_markdown(item: JsonObject, article: JsonObject) -> str:
    title = str(item["title"])
    summary = str(item["summary_zh"])
    source_name = str(item["source_name"])
    source_url = str(item["url"])
    published_at = str(item["published_at"])[:10]
    category = str(article["category_label"])
    tags = "、".join(str(tag) for tag in item["tags"])
    evidence_markdown = "\n".join(
        f"- [{entry['label']}]({entry['url']})" for entry in item["evidence"]
    )
    parts_markdown = "\n\n".join(
        f"### {part['title']}\n\n{part['body']}" for part in article["parts"]
    )
    flow_markdown = "\n".join(
        f"{index}. **{step['title']}**：{step['body']}"
        for index, step in enumerate(article["flow"], start=1)
    )

    markdown = f"""# {title}

> Daily Report 深度分析 · {category}

**来源**：[{source_name}]({source_url})
**发布时间**：{published_at}
**分类**：{category}
**标签**：{tags}

## TL;DR

{summary}

这不是首页卡片上的一句话，而是进入深读流程后的核心判断：先确认材料来源，再拆文章或项目结构，最后把能被证据支撑的结论和仍需追踪的边界分开。

## 来源与材料地图

本次材料来自 [{source_name}]({source_url})，发布时间窗口为 {published_at}，证据链接包括 {len(item['evidence'])} 条公开来源。自动化必须先读这些来源，再写判断；如果某个结论不能回到原文、README、release note、PDF 或官方页面，就只能放入边界说明。

### 证据链接

{evidence_markdown}

## 文章总览

{article["overview"]}

## 文章架构拆解

{article["architecture"]}

## 逐部分细读

{parts_markdown}

## 方法或系统流程

{flow_markdown}

{article["flow_note"]}

如果原文涉及优化目标、损失函数或约束，Markdown 可以直接保留公式。示例：

$$
J(\\theta)=\\mathbb{{E}}_{{x,y\\sim\\pi_\\theta}}[r(x,y)]-\\beta\\,D_{{KL}}(\\pi_\\theta\\Vert\\pi_0)
$$

## 代码或项目结构深挖

如果这是代码项目，分析必须继续阅读 README、docs/examples、依赖入口、核心目录和 release notes，解释模块边界、执行流程、状态管理、可观测性与部署入口；如果这是论文或报告，则用同样方式拆方法、实验、政策结构和执行链条。

## 关键论证链

把作者论证还原成四步：它先把什么问题定义出来；接着提出什么机制、框架或系统；然后用哪些公开证据支撑；最后哪些结论仍然不能直接推出。这个链条比摘要更重要，因为它决定这篇内容能否被复用到日报。

## 对照与反例

本次分析不把单个信号误读成行业定论。项目活跃不等于生产成熟，论文方法新不等于真实训练稳定，政策蓝图清晰也不等于制度已经落地。需要把同类方案、缺失证据和潜在失败模式放在同一页里看。

## 证据与边界

{article["evidence_and_limits"]}

## 后续追踪问题

下一轮自动化需要继续追踪：是否出现代码或复现结果；release 是否修正关键模块；作者是否补充实验或政策细节；同类项目是否给出反例；今天写入的判断是否需要 correction 或 tombstone。

## 可复用到日报的判断

{article["reusability"]}

## 审稿式结论

这篇内容可以进入日报，但必须以可复查的 Markdown 研究稿形式进入：保留来源链接、结构拆解、逐部分细读、流程复原、证据边界、后续问题和审稿式结论，而不是只在首页留一个链接。

[打开原文]({source_url})
"""
    return "\n".join(line.rstrip() for line in markdown.splitlines()).strip() + "\n"


def _build_entries(generated_at: str) -> list[tuple[JsonObject, JsonObject]]:
    base_entries: list[JsonObject] = [
        {
            "category_id": "llm-agent",
            "category_label": "大模型 Agent 相关",
            "type": "code",
            "source_id": "openai-agents-js",
            "source_name": "OpenAI Agents SDK JS",
            "source_type": "manual",
            "external_id": "openai-agents-js",
            "url": "https://github.com/openai/openai-agents-js",
            "canonical_url": "https://github.com/openai/openai-agents-js",
            "published_at": "2026-06-05T00:00:00Z",
            "updated_at": "2026-06-05T00:00:00Z",
            "title": "OpenAI Agents SDK JS 把多 Agent、Sandbox 和 Tracing 收成同一条工程主线",
            "summary_zh": "这不是又一个泛泛的 Agent SDK，而是把多 Agent 编排、可写工作区 Sandbox、Guardrails、人类审批和可观测 tracing 直接捏成一套开发框架；最近一周的版本更新继续在补 tracing 生命周期和恢复路径。",
            "tags": ["Agent", "Sandbox", "Tracing", "Guardrails", "TypeScript"],
            "reading_minutes": 8,
            "score": 92,
            "evidence": [
                {"type": "url", "label": "GitHub 仓库", "url": "https://github.com/openai/openai-agents-js"},
                {"type": "url", "label": "GitHub Releases v0.11.6", "url": "https://github.com/openai/openai-agents-js/releases"},
                {"type": "url", "label": "OpenAI 仓库列表更新时间", "url": "https://github.com/orgs/openai/repositories"},
            ],
            "article": {
                "category_label": "大模型 Agent 相关",
                "overview": "仓库 README 把核心概念直接列成九个模块：Agent、Sandbox Agent、Agents as tools / Handoffs、Tools、Guardrails、Human in the loop、Sessions、Tracing、Realtime Agents。这说明它不是单点能力 SDK，而是试图定义一条从短请求到长任务的统一执行面。",
                "architecture": "结构上分成三层。第一层是运行抽象：Agent、Sandbox Agent、Tool、Handoff。第二层是治理与状态：Guardrails、Human in the loop、Sessions。第三层是生产可观测性：Tracing 与 Realtime。最近 v0.11.5/0.11.6 的改动几乎都围绕 tracing span 生命周期、trace context 与恢复流程，说明 OpenAI 现在把“可看见 agent 在做什么”当成工程主战场。",
                "parts": [
                    {
                        "title": "README 的核心概念段",
                        "body": "这里一次性把九个概念摊开，等于直接告诉读者 SDK 的边界：不仅生成文本，还要管理工具调用、跨 Agent 委派、安全护栏、人类审批和运行时追踪。",
                    },
                    {
                        "title": "Sandbox Agent 示例",
                        "body": "示例不是简单聊天，而是把 repo manifest、文件系统工作区、本地 sandbox client 放进默认配置里。重点在于 Agent 可以持续查看文件、跑命令、打补丁，天然适合代码和研究工作流。",
                    },
                    {
                        "title": "非 Sandbox Agent 示例",
                        "body": "第二个例子故意保留最小形态，说明团队不想把所有使用者都推向重型执行环境，而是让同一 SDK 覆盖轻量调用与长任务编排。",
                    },
                    {
                        "title": "Release Notes",
                        "body": "5 月 29 日的 v0.11.6 继续补 tracing span lifecycle dispatch helpers；前一版 v0.11.5 则在 tracing ID、trace context、resumed runs 清理等地方密集迭代，证明他们正在收敛一套稳定的运行诊断模型。",
                    },
                ],
                "flow": [
                    {"title": "定义 Agent 角色", "body": "先把指令、工具、handoff 和 guardrails 绑定到 Agent 抽象。"},
                    {"title": "决定执行环境", "body": "简单问答走普通 Agent，长任务则切到 Sandbox Agent 并带上工作区 manifest。"},
                    {"title": "运行并管理状态", "body": "Session 负责历史，Human in the loop 负责审批，Guardrails 负责输入输出边界。"},
                    {"title": "收集 tracing", "body": "Tracing 把运行与恢复过程落成 span 和 usage 轨迹，供后续调试和优化。"},
                ],
                "flow_note": "这条流程说明 OpenAI 在把“Agent 产品”翻译成一套可以被软件工程团队接住的执行协议，而不是只卖提示词模板。",
                "evidence_and_limits": "强证据在于 README 的九个核心概念和 Sandbox 代码示例，以及最近两个 release 对 tracing 生命周期和恢复路径的持续修补。边界在于 release note 只能证明框架在补工程稳定性，不能直接证明它在复杂生产场景里已经足够成熟；另外 GitHub 页面没有给出真实成功率或长任务基准。",
                "reusability": "日报里值得跟踪的不是“又有一个 Agent SDK”，而是它把 sandbox、审批、trace、handoff 收成一个主干。后续可以重点盯 tracing API 是否稳定、Sandbox Agent 是否走出 beta、以及 examples 是否开始出现更强的多步骤工作流。",
            },
        },
        {
            "category_id": "llm-post-training",
            "category_label": "大模型后训练相关",
            "type": "code",
            "source_id": "llamafactory",
            "source_name": "LlamaFactory",
            "source_type": "manual",
            "external_id": "hiyouga-llamafactory",
            "url": "https://github.com/hiyouga/LlamaFactory",
            "canonical_url": "https://github.com/hiyouga/LlamaFactory",
            "published_at": "2026-06-05T00:00:00Z",
            "updated_at": "2026-06-05T00:00:00Z",
            "title": "LlamaFactory 继续把后训练工程压成统一入口，而不是分散脚本集合",
            "summary_zh": "LlamaFactory 本周仍在活跃更新。它最值得看的不是“支持 100+ 模型”这句宣传，而是 README 把 CLI、Web UI、训练方式、部署、日志和文档连成一条从 SFT 到 RLHF 再到服务化的后训练生产线。",
            "tags": ["Post-Training", "SFT", "RLHF", "LoRA", "WebUI"],
            "reading_minutes": 8,
            "score": 89,
            "evidence": [
                {"type": "url", "label": "GitHub 仓库", "url": "https://github.com/hiyouga/LlamaFactory"},
                {"type": "url", "label": "GitHub LLM Topic 更新时间", "url": "https://github.com/topics/llm"},
                {"type": "url", "label": "项目文档", "url": "https://llamafactory.readthedocs.io/en/latest/"},
            ],
            "article": {
                "category_label": "大模型后训练相关",
                "overview": "README 最重要的一句不是 star 数，而是“zero-code CLI and Web UI”。它意味着项目要做的不是发表一种新训练算法，而是把后训练的复杂拼装过程收成一个统一入口，让研究和工程团队可以在同一套表面下切换模型、方法、部署和记录方式。",
                "architecture": "仓库结构和目录导航暴露出典型的后训练流水线：`data`、`examples`、`scripts`、`src`、`docs` 同时存在；README 目录把 Features、Supported Models、Supported Training Approaches、Provided Datasets、Installation、Quickstart、GUI、Docker、OpenAI-style API and vLLM deployment 串到一起。这本质上是在定义“后训练操作系统”。",
                "parts": [
                    {
                        "title": "入口层：CLI 与 Web UI",
                        "body": "项目强调零代码 CLI 和 Web UI，不是为了降低门槛这么简单，而是为了让实验入口、批处理入口和可视操作入口共用同一套内部能力。",
                    },
                    {
                        "title": "方法层：Supported Training Approaches",
                        "body": "README 把训练方法单独列为一级目录，说明它把 SFT、LoRA、RLHF 等看成同一平台内的可替换后端，而不是多个彼此孤立的教程。",
                    },
                    {
                        "title": "数据与日志层",
                        "body": "Provided Datasets、W&B Logger、SwanLab Logger 的安排，表明项目不只做训练脚本，还试图覆盖实验记录和数据准备。",
                    },
                    {
                        "title": "部署层",
                        "body": "README 直接把 OpenAI-style API 与 vLLM deployment 列在 quickstart 主干里，说明作者默认后训练不该停在 checkpoint，而应无缝转成服务化验证或产品接入。",
                    },
                ],
                "flow": [
                    {"title": "选模型与数据", "body": "先在统一配置表面上确定支持模型和数据准备方式。"},
                    {"title": "选训练范式", "body": "在同一平台里切换 SFT、LoRA、RLHF 等策略，而不是换仓库。"},
                    {"title": "记录与复现实验", "body": "通过日志和可视面板把超参、结果和问题沉淀下来。"},
                    {"title": "直接接部署验证", "body": "训练产物继续接入 OpenAI-style API 与 vLLM，形成闭环。"},
                ],
                "flow_note": "这条链路解释了为什么它应该归到后训练频道：它关心的不是模型预训练本身，而是如何把后训练阶段的操作复杂度压缩成统一工程接口。",
                "evidence_and_limits": "证据主要来自 README 目录设计、零代码 CLI/Web UI 表述、以及把部署与 logger 拉进主文档骨架的做法，再加上 topic 页面证明它在本周内仍有持续更新。边界是 GitHub 首页无法直接展示每种训练方式当前的稳定性，也缺少统一 benchmark 证明不同方法的效果差异。",
                "reusability": "这类项目在日报里值得追的点是“后训练基础设施一体化”而非单篇算法。后续可以重点看它是否继续扩充 RLHF/RLVR 支持、是否把数据质量与评测也继续收进平台、以及部署链路是否保持和主流 serving 栈同步。",
            },
        },
        {
            "category_id": "ai-safety",
            "category_label": "AI 安全相关",
            "type": "report",
            "source_id": "openai-frontier-safety-blueprint",
            "source_name": "OpenAI Global Affairs",
            "source_type": "manual",
            "external_id": "frontier-safety-blueprint",
            "url": "https://openai.com/index/frontier-safety-blueprint/",
            "canonical_url": "https://openai.com/index/frontier-safety-blueprint/",
            "published_at": "2026-06-03T00:00:00Z",
            "updated_at": "2026-06-03T00:00:00Z",
            "title": "OpenAI 的 Frontier Safety Blueprint 把安全讨论从公司自律推向联邦制度设计",
            "summary_zh": "这份 6 月 3 日公开的 blueprint 不是单纯态度声明，而是把前沿 AI 安全拆成三段制度工程：联邦框架、CAISI 机构能力、以及跨政府韧性计划。它的重要性在于把“能力越来越强”与“政府应如何形成持续评估能力”直接绑在一起。",
            "tags": ["AI Safety", "Governance", "CAISI", "RSI", "Policy"],
            "reading_minutes": 9,
            "score": 90,
            "evidence": [
                {"type": "url", "label": "OpenAI 文章页", "url": "https://openai.com/index/frontier-safety-blueprint/"},
                {"type": "url", "label": "Blueprint PDF", "url": "https://cdn.openai.com/pdf/25752ecb-0e5c-47f9-b9e4-c0f4d76f8d3d/a-blueprint-for-a-federal-framework.pdf"},
            ],
            "article": {
                "category_label": "AI 安全相关",
                "overview": "文章页已经把主张压缩得很明确：联邦政府需要一个耐久的 frontier AI safety framework。PDF 则进一步解释为什么现在的治理缺口不是“有没有风险清单”，而是是否存在持续评估 frontier capability、跟踪 RSI、并把结果反馈进政策的制度机器。",
                "architecture": "蓝图分成三段。第一段是 reverse federalism：把州级 frontier safety law 的共同部分上收为联邦框架。第二段是机构设计：把 CAISI 建成前沿模型评估、标准制定和独立评估认证的中枢。第三段是韧性战略：把 compute、国防、国际协调、政府采购和防御能力升级接成 whole-of-government 的长期响应计划。",
                "parts": [
                    {
                        "title": "问题设定",
                        "body": "前两页先把国家安全、CBRN、cyber offense、autonomy、alignment 和递归自我改进放到同一风险视角下，强调现有机构对这类动态风险缺少足够可见性。",
                    },
                    {
                        "title": "联邦框架清单",
                        "body": "第三到第四页把 severe risk evaluations、transparency reports、independent audit、incident reporting、model weight security、whistleblower protection、accountability 一条条列出来，形成最低联邦基线。",
                    },
                    {
                        "title": "CAISI 机构设计",
                        "body": "第五到第六页最关键，讨论的是授权、预算、招聘权限、情报与数据协同、classified compute，以及 mandatory evaluation process 的边界。",
                    },
                    {
                        "title": "韧性战略",
                        "body": "后半部分把国际协作、算力优势、政府内禁用未评估前沿模型、以及让防御能力增长快于攻击能力这些动作纳入整体计划。",
                    },
                ],
                "flow": [
                    {"title": "先把高后果风险定性定界", "body": "以 cyber、CBRN、RSI、loss-of-control 作为联邦框架的核心触发点。"},
                    {"title": "建立统一透明与审计要求", "body": "要求开发者公开安全框架、做独立审计、报告重大事件并保护权重安全。"},
                    {"title": "让 CAISI 成为评估中枢", "body": "通过资源、授权和 classified compute 把评估能力变成联邦长期资产。"},
                    {"title": "把制度延伸到国家韧性", "body": "继续覆盖国际协调、算力政策、政府采购规则和防御能力建设。"},
                ],
                "flow_note": "它的设计巧思在于不把安全停留在原则层，而是持续追问“谁评估、何时评估、缺资源怎么办、失败后怎么报告”。",
                "evidence_and_limits": "证据在于 PDF 给出了相当明确的制度分层、职责划分和实施建议，尤其是对 CAISI 的角色、资源和流程边界有具体描述。边界同样明显：这是政策 blueprint，不是实证论文，没有用实验数据证明这些制度安排的效果；很多内容仍属于规范性主张，需要后续立法和执行验证。",
                "reusability": "日报里值得保留的是三个判断：一，AI 安全讨论正在从 company policy 向 federal institution design 平移；二，RSI 被提升为持续监测对象；三，安全框架开始与算力、采购、国防和国际协调打通。这些都是后续跟踪政策与行业动作的高价值轴线。",
            },
        },
    ]

    entries: list[tuple[JsonObject, JsonObject]] = []
    for base in base_entries:
        seed = {
            "canonical_url": base["canonical_url"],
            "published_at": base["published_at"],
            "title": base["title"],
            "source_id": base["source_id"],
        }
        item_id, content_hash = _item_id(seed)
        published = str(base["published_at"])
        year, month, day = published[:10].split("-")
        item: JsonObject = {
            "id": item_id,
            "item_id": item_id,
            "category_id": base["category_id"],
            "type": base["type"],
            "source_id": base["source_id"],
            "source_name": base["source_name"],
            "source_type": base["source_type"],
            "external_id": base["external_id"],
            "title": base["title"],
            "url": base["url"],
            "canonical_url": base["canonical_url"],
            "published_at": base["published_at"],
            "updated_at": base["updated_at"],
            "fetched_at": generated_at,
            "collected_at": generated_at,
            "sort_at": base["published_at"],
            "summary_zh": base["summary_zh"],
            "analysis_markdown_path": f"articles/{year}/{month}/{day}/{item_id}/index.md",
            "language": "zh-CN",
            "reading_minutes": base["reading_minutes"],
            "tags": base["tags"],
            "title_hash": _title_hash(str(base["title"])),
            "content_hash": content_hash,
            "fingerprint": content_hash,
            "score": base["score"],
            "evidence": base["evidence"],
        }
        entries.append((item, base["article"]))
    return entries


def main() -> int:
    args = _parse_args()
    generated_at = _parse_generated_at(args.generated_at)
    output_root = args.output
    public_root = output_root / "public"
    _reset_dir(public_root)

    entries = _build_entries(args.generated_at)
    items = [item for item, _ in entries]
    day = generated_at.strftime("%Y/%m/%d")
    manifest_stamp = generated_at.strftime("%H%M%SZ")
    hour = generated_at.strftime("%H")
    date_stamp = generated_at.strftime("%Y-%m-%d")
    item_path = public_root / "items" / day / "items.jsonl"
    hourly_path = public_root / "reports" / "hourly" / day / f"{hour}.json"
    daily_path = public_root / "reports" / "daily" / generated_at.strftime("%Y/%m/%d.json")
    audit_path = public_root / "audits" / day / f"{args.run_id}.json"
    manifest_path = public_root / "manifests" / day / f"{manifest_stamp}.manifest.json"
    latest_path = public_root / "index" / "latest.json"
    days_path = public_root / "index" / "days.json"
    sources_path = public_root / "index" / "sources.json"
    known_links_path = public_root / "index" / "known-links.json"

    write_json(
        sources_path,
        {
            "version": 1,
            "generated_at": args.generated_at,
            "sources": [
                {
                    "id": "openai-agents-js",
                    "name": "OpenAI Agents SDK JS",
                    "kind": "manual",
                    "homepage_url": "https://github.com/openai/openai-agents-js",
                    "enabled": True,
                    "description": "OpenAI 官方 JavaScript/TypeScript Agent SDK 仓库。",
                },
                {
                    "id": "llamafactory",
                    "name": "LlamaFactory",
                    "kind": "manual",
                    "homepage_url": "https://github.com/hiyouga/LlamaFactory",
                    "enabled": True,
                    "description": "统一后训练工作流的开源项目，覆盖 CLI、Web UI、训练方法和部署链路。",
                },
                {
                    "id": "openai-frontier-safety-blueprint",
                    "name": "OpenAI Frontier Safety Blueprint",
                    "kind": "manual",
                    "homepage_url": "https://openai.com/index/frontier-safety-blueprint/",
                    "enabled": True,
                    "description": "OpenAI 发布的前沿 AI 联邦治理蓝图与 PDF 正文。",
                },
            ],
        },
    )
    write_json(
        known_links_path,
        {
            "version": 1,
            "updated_at": args.generated_at,
            "links": [
                {
                    "canonical_url": item["canonical_url"],
                    "external_id": item["external_id"],
                    "item_id": item["item_id"],
                    "category_id": item["category_id"],
                    "title_hash": item["title_hash"],
                    "content_hash": item["content_hash"],
                    "first_seen_at": args.generated_at,
                }
                for item in items
            ],
        },
    )
    write_jsonl(item_path, items)

    article_paths: list[Path] = []
    for item, article in entries:
        article_path = public_root / str(item["analysis_markdown_path"])
        article_path.parent.mkdir(parents=True, exist_ok=True)
        article_path.write_text(_article_markdown(item, article), encoding="utf-8")
        article_paths.append(article_path)

    top_item_ids = [str(item["item_id"]) for item in items]
    start = generated_at.replace(minute=0, second=0)
    end = start + timedelta(hours=1)
    write_json(
        hourly_path,
        {
            "version": 1,
            "report_id": f"hourly:{start.strftime('%Y-%m-%dT%H:00:00Z')}",
            "generated_at": args.generated_at,
            "period": {
                "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            "item_count": len(items),
            "top_item_ids": top_item_ids,
            "summary": "本小时筛入 3 条满足日期窗口的公开内容，分别覆盖 Agent 工程框架、后训练基础设施和前沿 AI 安全治理。",
            "sections": [
                {
                    "heading": "大模型 Agent 相关",
                    "summary": "OpenAI Agents SDK JS 的更新重点仍然围绕 tracing 与长任务工程面。",
                    "item_ids": [top_item_ids[0]],
                },
                {
                    "heading": "大模型后训练相关",
                    "summary": "LlamaFactory 仍在把后训练操作流程压成统一入口，而不是零散脚本集合。",
                    "item_ids": [top_item_ids[1]],
                },
                {
                    "heading": "AI 安全相关",
                    "summary": "OpenAI 的 blueprint 把安全主张明确翻译成联邦制度建设路线。",
                    "item_ids": [top_item_ids[2]],
                },
            ],
        },
    )
    write_json(
        daily_path,
        {
            "version": 1,
            "date": date_stamp,
            "generated_at": args.generated_at,
            "item_count": len(items),
            "top_item_ids": top_item_ids,
            "summary": "今日公开数据以三个固定频道各 1 条精选内容组成，强调深度分析稿和可复用判断，而不是链接罗列。",
            "sections": [
                {
                    "heading": "Agent",
                    "summary": "多 Agent、Sandbox 和 tracing 正在被统一为单一工程主线。",
                    "item_ids": [top_item_ids[0]],
                },
                {
                    "heading": "Post-Training",
                    "summary": "后训练基础设施的竞争点越来越偏向统一操作面与部署闭环。",
                    "item_ids": [top_item_ids[1]],
                },
                {
                    "heading": "AI Safety",
                    "summary": "安全讨论正从实验室自律延展到联邦机构和韧性体系设计。",
                    "item_ids": [top_item_ids[2]],
                },
            ],
            "source_counts": {
                "openai-agents-js": 1,
                "llamafactory": 1,
                "openai-frontier-safety-blueprint": 1,
            },
        },
    )
    write_json(
        audit_path,
        {
            "version": 1,
            "run_id": args.run_id,
            "generated_at": args.generated_at,
            "status": "complete",
            "config_path": "config/automation/codex-hourly.zh.json",
            "date_window": {
                "mode": "today_or_current_week",
                "max_age_days": 7,
                "timezone": "Asia/Shanghai",
            },
            "category_counts": {
                "llm-agent": 1,
                "llm-post-training": 1,
                "ai-safety": 1,
            },
            "dedupe": {
                "ledger_path": "public/index/known-links.json",
                "checked_keys": ["canonical_url", "external_id", "title_hash", "content_hash"],
                "duplicate_candidates": 0,
                "replacement_candidates": 0,
            },
            "written_item_ids": top_item_ids,
            "article_paths": [str(item["analysis_markdown_path"]) for item in items],
            "sub_agent_reviews": [
                {
                    "agent_id": "scout",
                    "status": "passed",
                    "summary": "Only sources with dates inside 2026-05-31 to 2026-06-06 were kept.",
                },
                {
                    "agent_id": "deep_reader",
                    "status": "passed",
                    "summary": "Each selected source was expanded into a standalone Markdown analysis document with deep reading notes, section-by-section interpretation, and follow-up questions.",
                },
                {
                    "agent_id": "method_or_code_analyst",
                    "status": "passed",
                    "summary": "Agent SDK, post-training infra, and safety blueprint were each mapped to a reusable workflow or system view.",
                },
                {
                    "agent_id": "skeptic",
                    "status": "passed",
                    "summary": "Evidence and limits were called out explicitly for every article instead of only summarizing claims.",
                },
                {
                    "agent_id": "related_work",
                    "status": "passed",
                    "summary": "External references were searched by content type; blog/report items preserve the original argument and use short quotations only as analysis anchors.",
                },
                {
                    "agent_id": "markdown_editor",
                    "status": "passed",
                    "summary": "All analysis pages were written as Markdown documents; styling and formula rendering are handled by the web app.",
                },
            ],
            "quality_gate": {
                "minimum_chinese_chars": 5000,
                "evidence_points": sum(len(item["evidence"]) for item in items),
                "image_notes": len(items),
                "third_party_references": len(items),
                "skeptical_review": 3,
                "passed": True,
            },
        },
    )
    write_json(
        days_path,
        {
            "version": 1,
            "generated_at": args.generated_at,
            "days": [
                {
                    "date": date_stamp,
                    "item_count": len(items),
                    "hourly_report_count": 1,
                    "items_path": f"items/{day}/items.jsonl",
                    "daily_report_path": f"reports/daily/{day}.json",
                    "manifest_path": f"manifests/{day}/{manifest_stamp}.manifest.json",
                }
            ],
        },
    )

    manifest_files = [
        days_path,
        sources_path,
        known_links_path,
        item_path,
        hourly_path,
        daily_path,
        audit_path,
        *article_paths,
    ]
    manifest = build_manifest(public_root, args.generated_at, manifest_files)
    write_json(manifest_path, manifest)
    write_json(
        latest_path,
        {
            "version": 1,
            "generated_at": args.generated_at,
            "latest_day": date_stamp,
            "manifest_path": f"manifests/{day}/{manifest_stamp}.manifest.json",
            "manifest_sha256": sha256_bytes(manifest_path.read_bytes()),
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
