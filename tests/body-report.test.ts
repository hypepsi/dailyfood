import { beforeEach, describe, expect, it } from "vitest";
import { openDb, schema, setDbForTests, type Db } from "@/db";
import type { User } from "@/db/schema";
import { normalizeBodyReport } from "@/lib/ai/read-body-report";
import { AppError } from "@/lib/errors";
import { getDailySeries, listMetrics, recordReport } from "@/services/metrics";

/** 模型对样例报告（米家体脂秤 2026-09-06）应给出的输出 */
const sample = {
  is_report: true,
  measured_date: "2026-09-06",
  weight_kg: 89.55,
  body_fat_pct: 26.6,
  waist_cm: null,
  muscle_kg: 62.3,
  skeletal_muscle_kg: 34.7,
  visceral_fat: 10,
  bmr_kcal: 1789,
  fat_mass_kg: 23.8,
  lean_mass_kg: 65.7,
  protein_kg: 13.1,
  water_kg: 48.5,
  bone_mineral_kg: 3.4,
  bmi: 26.7,
  body_age: 38,
  waist_hip_ratio: 0.9,
  score: 76,
};

describe("体脂秤报告校验", () => {
  it("正常报告：核心指标和其他指标分开，内部数值互相吻合", () => {
    const r = normalizeBodyReport(sample);
    expect(r.date).toBe("2026-09-06");
    expect(r.core).toEqual({ weightKg: 89.55, bodyFatPct: 26.6, waistCm: null, muscleKg: 62.3, skeletalMuscleKg: 34.7, visceralFat: 10, bmrKcal: 1789 });
    expect(r.extra).toMatchObject({ fatMassKg: 23.8, leanMassKg: 65.7, bodyAge: 38, score: 76 });
    expect(r.warnings).toEqual([]);
  });

  it("读错的数字会被发现：超范围丢弃，对不上给出提醒", () => {
    const r = normalizeBodyReport({ ...sample, body_fat_pct: 266, bmr_kcal: 17890, fat_mass_kg: 32.8 });
    expect(r.core.bodyFatPct).toBeNull();
    expect(r.core.bmrKcal).toBeNull();
    expect(r.warnings).toHaveLength(1);
    expect(normalizeBodyReport({ ...sample, body_fat_pct: 36.6 }).warnings).toHaveLength(1);
  });

  it("不是报告或没有体重时拒绝", () => {
    expect(() => normalizeBodyReport({ ...sample, is_report: false })).toThrow(AppError);
    expect(() => normalizeBodyReport({ ...sample, weight_kg: null })).toThrow(AppError);
  });
});

describe("报告入库", () => {
  let db: Db;
  let user: User;
  beforeEach(() => {
    db = openDb(":memory:");
    setDbForTests(db);
    user = db
      .insert(schema.users)
      .values({ username: "me", passwordHash: "x", displayName: "me", calorieTarget: 2000, proteinTargetG: 130, createdAt: 0, updatedAt: 0 })
      .returning()
      .get();
  });

  it("按报告日期记录；重复上传覆盖而不是重复", () => {
    const first = recordReport(user, normalizeBodyReport(sample));
    expect(first).toMatchObject({ date: "2026-09-06", replaced: false });
    const again = recordReport(user, normalizeBodyReport({ ...sample, weight_kg: 89.6 }));
    expect(again.replaced).toBe(true);
    expect(getDailySeries(user, "weightKg")).toEqual([{ date: "2026-09-06", value: 89.6 }]);
    const rows = listMetrics(user);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("report");
    expect(JSON.parse(rows[0].extra!).fatMassKg).toBe(23.8);
  });

  it("报告没有日期或日期在未来时记到今天", () => {
    const saved = recordReport(user, normalizeBodyReport({ ...sample, measured_date: "2999-01-01" }));
    expect(saved.date < "2999-01-01").toBe(true);
  });
});
