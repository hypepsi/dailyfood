import { describe, expect, it } from "vitest";
import { shortName, shortQuantity } from "@/lib/food-text";

describe("名称和数量收短", () => {
  it("数量只留第一句", () => {
    expect(shortQuantity("2个，每个连馅料约240克，合计约480克，其中两张饼皮合计")).toBe("2个");
    expect(shortQuantity("本人约225–260克，按242.5克估算")).toBe("约225–260克");
    expect(shortQuantity("1 个（约250克，薄饼皮约5克）")).toBe("1 个");
    expect(shortQuantity("1 碗")).toBe("1 碗");
  });
  it("名称太长时去掉补充说明，保留“疑似”", () => {
    expect(shortName("菜煎饼（胡萝卜、莴笋、豆芽、鸡蛋、粉条馅）")).toBe("菜煎饼");
    expect(shortName("去皮梨块（疑似）")).toBe("去皮梨块（疑似）");
    expect(shortName("乌冬面寿喜锅（含块状配菜）")).toBe("乌冬面寿喜锅（含块状配菜）"); // 不算太长，不动
  });
});
