import { expect, test } from "vitest";
import { buildDemoReport } from "../../../ledger.js";

test("the page report is the library demo", () => {
  const report = buildDemoReport();
  expect(report.debitTotalCents).toBe(report.creditTotalCents);
  expect(report.obligations.some((row) => row.vendor === "Cabinet Maker")).toBe(true);
  expect(report.referenceRoute.routes[0]?.hops.map((hop) => hop.rail)).toEqual([
    "ACH_SAME_DAY",
    "INTERNAL_BOOK",
  ]);
});
