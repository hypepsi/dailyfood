import { describe, expect, it } from "vitest";
import { normalizeEstimate } from "@/lib/ai/analyze-meal";
import { AppError } from "@/lib/errors";

const item = (name: string, kcal: number) => ({
  name,
  quantity: "1 份",
  weight_g: 100,
  kcal,
  protein_g: 10,
  carbs_g: 10,
  fat_g: 5,
  personal: false,
  confidence: "medium",
});

const base = { is_food: true, title: "早餐", kcal_low: 280, kcal_high: 360, people_hint: 1, people_stated: null, meal_type_stated: null, questions: [], note: "" };

describe("AI 识别结果校验", () => {
  it("总热量由程序相加，不采用模型的总数", () => {
    const est = normalizeEstimate({ ...base, items: [item("鸡蛋", 150), item("玉米", 165)] });
    expect(est.totalKcal).toBe(315);
    expect([est.kcalLow, est.kcalHigh]).toEqual([280, 360]);
  });

  it("模型给的范围不包含总数时退回 ±15%", () => {
    const est = normalizeEstimate({ ...base, kcal_low: 500, kcal_high: 600, items: [item("鸡蛋", 200)] });
    expect([est.kcalLow, est.kcalHigh]).toEqual([170, 230]);
  });

  it("最多保留 2 个追问，异常数值被限制", () => {
    const q = { question: "油多吗？", options: ["少", "正常", "多"] };
    const est = normalizeEstimate({ ...base, kcal_low: 1, kcal_high: 99999, items: [{ ...item("炒饭", -50), weight_g: 99999 }], questions: [q, q, q] });
    expect(est.questions).toHaveLength(2);
    expect(est.items[0].kcal).toBe(0);
    expect(est.items[0].weightG).toBe(5000);
  });

  it("三大营养素和热量自相矛盾的项目标成“不太确定”", () => {
    // item(): 10×4 + 10×4 + 5×9 = 125 kcal
    const est = normalizeEstimate({ ...base, kcal_low: 1, kcal_high: 9999, items: [{ ...item("合理", 130), confidence: "high" }, { ...item("矛盾", 600), confidence: "high" }] });
    expect(est.items.map((i) => i.confidence)).toEqual(["high", "low"]);
  });

  it("不是食物或结构不对时拒绝", () => {
    expect(() => normalizeEstimate({ ...base, is_food: false, items: [] })).toThrow(AppError);
    expect(() => normalizeEstimate({ title: "只有自然语言" })).toThrow();
  });
});
