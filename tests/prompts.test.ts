import { describe, expect, it } from "vitest";
import { MEAL_ANALYSIS, MEAL_EDIT, withEstimateStyle } from "@/lib/ai/prompts";

describe("估算风格", () => {
  it("标准档不改动提示词", () => {
    expect(withEstimateStyle(MEAL_ANALYSIS, "standard")).toBe(MEAL_ANALYSIS);
  });
  it("偏高、偏低只在末尾附加一段说明，原有规则原样保留", () => {
    for (const base of [MEAL_ANALYSIS, MEAL_EDIT]) {
      const strict = withEstimateStyle(base, "strict");
      const lenient = withEstimateStyle(base, "lenient");
      expect(strict.startsWith(base)).toBe(true);
      expect(lenient.startsWith(base)).toBe(true);
      expect(strict).toContain("【估算风格：偏高】");
      expect(lenient).toContain("【估算风格：偏低】");
    }
  });
});
