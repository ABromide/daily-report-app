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
  await expect(page.getByRole("heading", { name: "今天值得打开的 AI 论文、博客与代码" })).toBeVisible();
  await expect(page.getByPlaceholder("搜索论文、博客、代码、模型、作者或关键词")).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日精选" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "主题聚类" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最新更新" })).toBeVisible();
  await expect(page.getByLabel("查看 GitHub 仓库")).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-showcase-zh.png`, fullPage: true });

  await page.getByPlaceholder("搜索论文、博客、代码、模型、作者或关键词").fill("安全");
  await expect(page.getByRole("heading", { name: "AI 安全从模型问答扩展到操作风险" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "一年 AI 网络威胁映射：攻击者正在把 AI 用到更深阶段" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("button", { name: "代码" }).click();
  await expect(page.getByRole("heading", { name: "Dify：生产级 Agentic Workflow 平台" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open WebUI：用户友好的 AI 本地界面" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.getByRole("heading", { name: "Agent 工程正在进入真实开发流程" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("English content hub remains available under /en", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "AI Papers, Blogs, and Code Worth Opening Today" })).toBeVisible();
  await expect(page.getByPlaceholder("Search papers, blogs, code, models, authors, or keywords")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured today" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Topic clusters" })).toBeVisible();
  await expect(page.getByLabel("Open GitHub repository")).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-showcase-en.png`, fullPage: true });

  await page.getByPlaceholder("Search papers, blogs, code, models, authors, or keywords").fill("memory");
  await expect(page.getByRole("heading", { name: "OpenAI: Better Memory for a More Helpful ChatGPT" }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
