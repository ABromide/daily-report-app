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
  await expect(page.getByText("核心问题").first()).toBeVisible();
  await expect(page.getByText("方法路径").first()).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-showcase-zh.png`, fullPage: true });

  await page.getByPlaceholder("搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码").fill("OPD");
  await expect(page.getByRole("heading", { name: "大模型后训练相关" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trust Region OPD：用可信区域稳定 On-Policy Distillation" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByPlaceholder("搜索 Agent、SFT、强化学习、OPD、AI 安全、论文或代码").fill("安全");
  await expect(page.getByRole("heading", { name: "AI 安全相关" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "一年 AI 网络威胁映射：攻击者正在把 AI 用到更深阶段" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("button", { name: "代码" }).click();
  await expect(page.getByRole("heading", { name: "Dify：生产级 Agentic Workflow 平台" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open WebUI：本地 Agent 入口的用户界面" }).first()).toBeVisible();

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
  await expect(page.getByText("Core question").first()).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-showcase-en.png`, fullPage: true });

  await page.getByPlaceholder("Search agents, SFT, RL, OPD, AI safety, papers, or code").fill("post-training");
  await expect(page.getByRole("heading", { name: "LLM Post-Training", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "FiRe-OPD: Filter, Then Reweight On-Policy Distillation" }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("Chinese visual card opens a second-level analysis page", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/");
  await page.getByRole("link", { name: "Dify：生产级 Agentic Workflow 平台" }).first().click();
  await expect(page).toHaveURL(/\/items\/dify-agent-platform$/);
  await expect(page.getByRole("heading", { name: "Dify：生产级 Agentic Workflow 平台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "HTML 深度分析稿" })).toBeVisible();
  const analysisFrame = page.frameLocator(".article-html-frame");
  await expect(analysisFrame.getByText("TL;DR")).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "先确认我们到底读了什么" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "按原文结构重建作者论证" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "每一节都要解释它承担的作用" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "把工程面或方法面拆到能复用" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "下一轮自动化应该继续追什么" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "这篇能不能进入日报，为什么" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "自动化审查记录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "分类位置" })).toBeVisible();
  await expect(page.getByLabel("分类位置").getByText("大模型 Agent 相关")).toBeVisible();
  await expect(page.getByRole("link", { name: "打开原文" })).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-detail-zh.png`, fullPage: true });

  expect(errors).toEqual([]);
});

test("English detail page shows post-training classification", async ({ page }) => {
  const errors = watchConsole(page);

  await page.goto("/en/items/trust-region-opd");
  await expect(page.getByRole("heading", { name: "Trust Region OPD: Stabilizing On-Policy Distillation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "HTML Analysis Document" })).toBeVisible();
  const analysisFrame = page.frameLocator(".article-html-frame");
  await expect(analysisFrame.getByText("TL;DR")).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "先确认我们到底读了什么" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "把工程面或方法面拆到能复用" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "证据与边界" })).toBeVisible();
  await expect(analysisFrame.getByRole("heading", { name: "下一轮自动化应该继续追什么" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Automation Audit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Category Fit" })).toBeVisible();
  await expect(page.getByLabel("Category Fit").getByText("LLM Post-Training")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source" })).toBeVisible();

  expect(errors).toEqual([]);
});
