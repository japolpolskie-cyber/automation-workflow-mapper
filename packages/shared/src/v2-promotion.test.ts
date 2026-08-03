import { describe, expect, it } from "vitest";
import { resolvePackagedDesktopPlannerV2PromotionMode, resolvePlannerV2PromotionMode } from "./v2-promotion.js";

describe("Planner V2 promotion mode resolution", () => {
  it("keeps the repository-safe default disabled", () => {
    expect(resolvePlannerV2PromotionMode(undefined)).toBe("disabled");
  });

  it("uses guarded as the packaged desktop runtime default", () => {
    expect(resolvePlannerV2PromotionMode(undefined, "guarded")).toBe("guarded");
    expect(resolvePlannerV2PromotionMode(undefined, "guarded")).not.toBe("enabled");
  });

  it("preserves the explicit disabled kill switch over a guarded runtime default", () => {
    expect(resolvePlannerV2PromotionMode("disabled", "guarded")).toBe("disabled");
  });

  it("never permits packaged desktop startup to default or drift to enabled", () => {
    expect(resolvePackagedDesktopPlannerV2PromotionMode(undefined)).toBe("guarded");
    expect(resolvePackagedDesktopPlannerV2PromotionMode("enabled")).toBe("guarded");
    expect(resolvePackagedDesktopPlannerV2PromotionMode("compare")).toBe("guarded");
    expect(resolvePackagedDesktopPlannerV2PromotionMode("disabled")).toBe("disabled");
  });
});
