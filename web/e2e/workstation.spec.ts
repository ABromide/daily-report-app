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

test("workstation renders key UI, view entrances, and screenshots", async ({ page }, testInfo) => {
  const errors = watchConsole(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Research Workstation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "KPI Strip" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Priority Feed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Detail Inspector" })).toBeVisible();

  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-workstation.png`, fullPage: true });

  if (testInfo.project.name === "mobile") {
    const mobileTabs = page.getByRole("navigation", { name: "Mobile views" });
    await expect(mobileTabs).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "Feed" })).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "Sources" })).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "Runs" })).toBeVisible();
    await expect(mobileTabs.getByRole("link", { name: "Reports" })).toBeVisible();

    await mobileTabs.getByRole("link", { name: "Sources" }).click();
    await expect(page.getByRole("heading", { name: "Source Registry" })).toBeVisible();
  } else {
    const workspaceNav = page.getByRole("navigation", { name: "Workspace views" });
    await expect(workspaceNav.getByRole("link", { name: /Sources/ })).toBeVisible();
    await expect(workspaceNav.getByRole("link", { name: /Runs/ })).toBeVisible();
    await expect(workspaceNav.getByRole("link", { name: /Reports/ })).toBeVisible();

    await workspaceNav.getByRole("link", { name: /Sources/ }).click();
    await expect(page.getByRole("heading", { name: "Source Registry" })).toBeVisible();

    await page.getByRole("navigation", { name: "Workspace views" }).getByRole("link", { name: /Runs/ }).click();
    await expect(page.getByRole("heading", { name: "Run Ledger" })).toBeVisible();

    await page.getByRole("navigation", { name: "Workspace views" }).getByRole("link", { name: /Reports/ }).click();
    await expect(page.getByRole("heading", { name: "Report Archive" })).toBeVisible();
  }

  expect(errors).toEqual([]);
});
