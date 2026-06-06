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

test("Chinese workstation renders key UI, view entrances, and screenshots", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "情报工作台" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "关键指标" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "优先级信息流" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "详情检查器" })).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-zh-workstation.png`, fullPage: true });

  if (testInfo.project.name === "mobile") {
    const mobileTabs = page.getByRole("navigation", { name: "移动端视图" });
    await expect(mobileTabs).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "信息流" })).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "来源" })).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "运行" })).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "报告" })).toBeVisible();

    await mobileTabs.getByRole("link", { name: "来源" }).click();
    await expect(page.getByRole("heading", { name: "来源登记表" })).toBeVisible();
  } else {
    const workspaceNav = page.getByRole("navigation", { name: "工作台视图" });
    await expect(workspaceNav.getByRole("link", { name: /来源/ })).toBeVisible();
    await expect(workspaceNav.getByRole("link", { name: /运行/ })).toBeVisible();
    await expect(workspaceNav.getByRole("link", { name: /报告/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /English/ })).toBeVisible();

    await workspaceNav.getByRole("link", { name: /来源/ }).click();
    await expect(page.getByRole("heading", { name: "来源登记表" })).toBeVisible();

    await page.getByRole("navigation", { name: "工作台视图" }).getByRole("link", { name: /运行/ }).click();
    await expect(page.getByRole("heading", { name: "运行账本" })).toBeVisible();

    await page.getByRole("navigation", { name: "工作台视图" }).getByRole("link", { name: /报告/ }).click();
    await expect(page.getByRole("heading", { name: "报告归档" })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test("English workstation remains available under /en", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/en");
  await expect(page.getByRole("heading", { name: "Research Workstation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "KPI Strip" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priority Feed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detail Inspector" })).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-en-workstation.png`, fullPage: true });

  if (testInfo.project.name === "mobile") {
    const mobileTabs = page.getByRole("navigation", { name: "Mobile views" });
    await expect(mobileTabs.getByRole("link", { name: "Sources" })).toBeVisible();
  } else {
    const workspaceNav = page.getByRole("navigation", { name: "Workspace views" });
    await expect(workspaceNav.getByRole("link", { name: /Sources/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /中文/ })).toBeVisible();
  }

  expect(errors).toEqual([]);
});
