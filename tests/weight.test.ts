import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/time";
import { defaultProteinTarget, estimateBmr, guessMealType, sumNutrients } from "@/lib/nutrition";
import { rollingAverage, trendPerWeek, windowAverage } from "@/lib/weight";

const series = (start: string, values: (number | null)[]) =>
  values.flatMap((value, i) => (value === null ? [] : [{ date: addDays(start, i), value }]));

describe("体重趋势", () => {
  it("7 日平均只统计窗口内有记录的日子", () => {
    const s = series("2026-10-01", [90, null, 89, null, null, null, 88, 80]);
    expect(windowAverage(s, "2026-10-07", 7)).toBe(89);
    expect(windowAverage(s, "2026-09-30", 7)).toBeNull();
    expect(rollingAverage(s).at(-1)!.value).toBe(85.67); // (89+88+80)/3，10-01 已滑出窗口
  });

  it("每天稳定下降 0.1kg ≈ 每周 -0.7kg", () => {
    const s = series("2026-09-07", Array.from({ length: 30 }, (_, i) => 90 - i * 0.1));
    expect(trendPerWeek(s, "2026-10-06", 30)).toBe(-0.7);
  });

  it("数据太少或跨度太短时不下结论", () => {
    expect(trendPerWeek(series("2026-10-04", [90, 89.5, 89]), "2026-10-06", 30)).toBeNull();
    expect(trendPerWeek(series("2026-10-01", [90, 89.8, 89.9, 89.5, 89.4]), "2026-10-06", 30)).toBeNull();
  });
});

describe("营养计算", () => {
  it("合计并取整", () => {
    expect(
      sumNutrients([
        { kcal: 150.4, proteinG: 12.55, carbsG: 1, fatG: 10 },
        { kcal: 165.3, proteinG: 5, carbsG: 30.26, fatG: 2 },
      ]),
    ).toEqual({ kcal: 316, proteinG: 17.6, carbsG: 31.3, fatG: 12 });
  });

  it("按时间猜餐次", () => {
    expect(guessMealType(7, 30)).toBe("breakfast");
    expect(guessMealType(12)).toBe("lunch");
    expect(guessMealType(15, 30)).toBe("snack");
    expect(guessMealType(19)).toBe("dinner");
    expect(guessMealType(23)).toBe("snack");
  });

  it("默认值", () => {
    expect(defaultProteinTarget(85)).toBe(135);
    expect(estimateBmr("male", 89.55, 182.5, 39)).toBe(1846);
  });
});
