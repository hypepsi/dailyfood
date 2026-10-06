import { describe, expect, it } from "vitest";
import { normalizeAdjustment } from "@/lib/ai/adjust-meal";
import { AppError } from "@/lib/errors";

describe("修正结果校验", () => {
  it("只改提到的食物，其余为 null（保持原样）", () => {
    const r = normalizeAdjustment({ understood: true, all_fraction: null, adjustments: [{ index: 2, eaten_fraction: 0.5 }], summary: "米饭吃了一半" }, 3);
    expect(r.fractions).toEqual([null, 0.5, null]);
  });

  it("整体比例应用到每一样；个别项目可以再单独覆盖", () => {
    const r = normalizeAdjustment({ understood: true, all_fraction: 0.5, adjustments: [{ index: 3, eaten_fraction: 0 }], summary: "" }, 3);
    expect(r.fractions).toEqual([0.5, 0.5, 0]);
  });

  it("不存在的编号被忽略，比例限制在 0~3", () => {
    const r = normalizeAdjustment({ understood: true, all_fraction: null, adjustments: [{ index: 9, eaten_fraction: 0.5 }, { index: 1, eaten_fraction: -2 }, { index: 2, eaten_fraction: 99 }], summary: "" }, 2);
    expect(r.fractions).toEqual([0, 3]);
  });

  it("没听懂或什么都没改时报错，不改任何数据", () => {
    expect(() => normalizeAdjustment({ understood: false, all_fraction: null, adjustments: [], summary: "" }, 2)).toThrow(AppError);
    expect(() => normalizeAdjustment({ understood: true, all_fraction: null, adjustments: [{ index: 7, eaten_fraction: 0.5 }], summary: "" }, 2)).toThrow(AppError);
  });
});
