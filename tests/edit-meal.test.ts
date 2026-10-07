import { describe, expect, it } from "vitest";
import { normalizeEdit } from "@/lib/ai/edit-meal";
import { AppError } from "@/lib/errors";

const item = (name: string, kcal = 300) => ({ name, quantity: "1 碗", weight_g: 300, kcal, protein_g: 10, carbs_g: 50, fat_g: 5 });
const op = (action: string, index: number | null, extra: object = {}) => ({ action, index, eaten_fraction: null, item: null, ...extra });
const base = { understood: true, summary: "改了", title: null, people: null, operations: [] as object[] };

describe("“说一句”修改方案的校验", () => {
  it("只改提到的那一项：面条改成乌冬面，其余不出现在方案里", () => {
    const e = normalizeEdit({ ...base, title: "牛肉乌冬面", operations: [op("update", 1, { item: item("乌冬面", 330) })] }, 3);
    expect(e.updates).toEqual([{ index: 0, item: { name: "乌冬面", quantity: "1 碗", weightG: 300, kcal: 330, proteinG: 10, carbsG: 50, fatG: 5 } }]);
    expect([e.adds, e.removes, e.portions]).toEqual([[], [], []]);
    expect(e.title).toBe("牛肉乌冬面");
  });

  it("增、删、没吃完可以同时出现；删除的项目不再被修改", () => {
    const e = normalizeEdit(
      { ...base, operations: [op("add", null, { item: item("卤蛋", 75) }), op("remove", 2), op("portion", 2, { eaten_fraction: 0.5 }), op("portion", 3, { eaten_fraction: 0.5 })] },
      3,
    );
    expect(e.adds.map((a) => a.name)).toEqual(["卤蛋"]);
    expect(e.removes).toEqual([1]);
    expect(e.portions).toEqual([{ index: 2, fraction: 0.5 }]);
  });

  it("只是份量变化时不换名称；不存在的编号被忽略；数值被限制在合理范围", () => {
    const e = normalizeEdit({ ...base, title: "新名字", operations: [op("portion", 1, { eaten_fraction: 9 }), op("update", 8, { item: item("x") })] }, 2);
    expect(e.title).toBeNull();
    expect(e.portions).toEqual([{ index: 0, fraction: 3 }]);
    expect(e.updates).toEqual([]);
  });

  it("只说了几个人吃也算有效修改", () => {
    expect(normalizeEdit({ ...base, people: 3 }, 2).people).toBe(3);
  });

  it("没听懂、什么都没改、或想删光所有食物时报错，不动任何数据", () => {
    expect(() => normalizeEdit({ ...base, understood: false }, 2)).toThrow(AppError);
    expect(() => normalizeEdit(base, 2)).toThrow(AppError);
    expect(() => normalizeEdit({ ...base, operations: [op("update", 9, { item: item("x") })] }, 2)).toThrow(AppError);
    expect(() => normalizeEdit({ ...base, operations: [op("remove", 1), op("remove", 2)] }, 2)).toThrow(AppError);
  });
});
