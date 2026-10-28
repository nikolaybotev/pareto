import { expect, test } from "@playwright/test";

test("demo books, cabinet obligation, and the full-amount route", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("spoken for");
  await expect(page.getByText("Books balance.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Cabinet Maker" }).first()).toBeVisible();
  await expect(page.locator(".routes li").first()).toContainText("ACH_SAME_DAY SAVINGS → CHK_OPS");
  await expect(page.locator(".routes li").first()).toContainText("On time");
  await page.getByRole("textbox", { name: "Amount" }).fill("4000");
  await expect(page.locator(".routes li").first()).toContainText("ACH_P2P SAVINGS → CHK_PROJ");
});
