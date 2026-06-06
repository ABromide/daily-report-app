import { mkdir } from "node:fs/promises";

import { expect, type Page, test } from "@playwright/test";

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("Chinese content hub renders clusters, search, filters, and GitHub entry", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "三类 AI 前沿内容：Agent、后训练、安全" })).toBeVisible();
  await expect(page.getByPlaceholder("搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码")).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日精选" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "三类频道" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最新更新" })).toBeVisible();
  await expect(page.getByLabel("查看 GitHub 仓库")).toBeVisible();
  await expect(page.getByRole("button", { name: "大模型后训练相关" })).toBeVisible();
  await expect(page.getByText("Markdown 深度稿").first()).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-showcase-zh.png`, fullPage: true });

  await page.getByPlaceholder("搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码").fill("SFT");
  await expect(page.getByRole("heading", { name: "大模型后训练相关" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LlamaFactory 继续把后训练工程压成统一入口，而不是分散脚本集合" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByPlaceholder("搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码").fill("安全");
  await expect(page.getByRole("heading", { name: "AI 安全相关" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenAI 的 Frontier Safety Blueprint 把安全讨论从公司自律推向联邦制度设计" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("button", { name: "代码" }).click();
  await expect(page.getByRole("heading", { name: "OpenAI Agents SDK JS 把多 Agent、Sandbox 和 Tracing 收成同一条工程主线" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "LlamaFactory 继续把后训练工程压成统一入口，而不是分散脚本集合" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("button", { name: "AI 安全相关" }).click();
  await expect(page.locator("#ai-safety")).toBeVisible();

  expect(errors).toEqual([]);
});

test("English content hub remains available under /en", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Three Frontiers: Agents, Post-Training, Safety" })).toBeVisible();
  await expect(page.getByPlaceholder("Search agents, SFT, RL, OPD, AI safety, papers, or code")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Three channels" })).toBeVisible();
  await expect(page.getByLabel("Open GitHub repository")).toBeVisible();
  await expect(page.getByRole("button", { name: "LLM Post-Training" })).toBeVisible();
  await expect(page.getByText("Markdown briefs").first()).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-showcase-en.png`, fullPage: true });

  await page.getByPlaceholder("Search agents, SFT, RL, OPD, AI safety, papers, or code").fill("post-training");
  await expect(page.getByRole("heading", { name: "LLM Post-Training", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LlamaFactory 继续把后训练工程压成统一入口，而不是分散脚本集合" }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("Chinese card opens a second-level Markdown analysis page", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/");
  await page.getByRole("link", { name: "OpenAI Agents SDK JS 把多 Agent、Sandbox 和 Tracing 收成同一条工程主线" }).first().click();
  await expect(page).toHaveURL(/\/items\/itm_fe01906c4ef44106$/);
  await expect(page.locator(".detail-hero").getByRole("heading", { name: "OpenAI Agents SDK JS 把多 Agent、Sandbox 和 Tracing 收成同一条工程主线" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Markdown 深度分析稿" })).toBeVisible();
  await expect(page.getByText("TL;DR")).toBeVisible();
  await expect(page.getByRole("heading", { name: "来源与材料地图" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "读完原文后的主线" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "结构拆解" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "逐部分细读" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "方法或系统流程" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "证据与边界" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日报判断" })).toBeVisible();
  await expect(page.locator(".markdown-body").getByText("6 月 5 日最新 commit 是文档翻译").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "单独打开 Markdown" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "自动化审查记录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "分类位置" })).toBeVisible();
  await expect(page.getByLabel("分类位置").getByText("大模型 Agent 相关")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "来源信息" }).getByRole("link", { name: "打开原文" })).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-detail-zh.png`, fullPage: true });

  expect(errors).toEqual([]);
});

test("English detail page shows post-training classification", async ({ page }) => {
  const errors = watchConsole(page);

  await page.goto("/en/items/itm_d0ccf7dfcec35db8");
  await expect(page.locator(".detail-hero").getByRole("heading", { name: "LlamaFactory 继续把后训练工程压成统一入口，而不是分散脚本集合" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Markdown Analysis Document" })).toBeVisible();
  await expect(page.getByText("TL;DR")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source Map" }).or(page.getByRole("heading", { name: "来源与材料地图" }))).toBeVisible();
  await expect(page.getByRole("heading", { name: "Method or System Flow" }).or(page.getByRole("heading", { name: "方法或系统流程" }))).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence and Boundaries" }).or(page.getByRole("heading", { name: "证据与边界" }))).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automation Audit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Category Fit" })).toBeVisible();
  await expect(page.getByLabel("Category Fit").getByText("LLM Post-Training")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source" })).toBeVisible();

  expect(errors).toEqual([]);
});
