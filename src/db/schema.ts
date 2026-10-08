import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () => integer("created_at").notNull(); // unix ms
const userId = () =>
  integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** 用户想要的节奏：增重 / 保持 / 慢慢减 / 稳稳减 / 快速减 */
export const GOAL_PACES = ["gain", "maintain", "slow", "steady", "fast"] as const;
export type GoalPace = (typeof GOAL_PACES)[number];

/** AI 估算食物时，遇到看不清的地方往哪边取 */
export const ESTIMATE_STYLES = ["lenient", "standard", "strict"] as const;
export type EstimateStyle = (typeof ESTIMATE_STYLES)[number];

export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  sex: text("sex", { enum: ["male", "female"] }),
  birthDate: text("birth_date"), // YYYY-MM-DD
  heightCm: real("height_cm"),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  activityLevel: text("activity_level", { enum: ACTIVITY_LEVELS }).notNull().default("light"),
  estimateStyle: text("estimate_style", { enum: ESTIMATE_STYLES }).notNull().default("standard"),
  goalPace: text("goal_pace", { enum: GOAL_PACES }).notNull().default("steady"),
  calorieTarget: integer("calorie_target").notNull(),
  proteinTargetG: integer("protein_target_g").notNull(),
  targetWeightKg: real("target_weight_kg"),
  createdAt: createdAt(),
  updatedAt: integer("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: userId(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** 目标变更历史：某天的目标 = effective_date <= 当天的最新一条 */
export const goalHistory = sqliteTable(
  "goal_history",
  {
    id: id(),
    userId: userId(),
    effectiveDate: text("effective_date").notNull(),
    calorieTarget: integer("calorie_target").notNull(),
    proteinTargetG: integer("protein_target_g").notNull(),
    targetWeightKg: real("target_weight_kg"),
    createdAt: createdAt(),
  },
  (t) => [index("goal_history_user_date_idx").on(t.userId, t.effectiveDate)],
);

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const meals = sqliteTable(
  "meals",
  {
    id: id(),
    userId: userId(),
    localDate: text("local_date").notNull(), // 用户时区下的 YYYY-MM-DD
    eatenAt: integer("eaten_at").notNull(),
    mealType: text("meal_type", { enum: MEAL_TYPES }).notNull(),
    /** draft 不计入任何统计；用户确认后变为 confirmed */
    status: text("status", { enum: ["draft", "confirmed"] }).notNull(),
    source: text("source", { enum: ["photo", "text", "voice", "manual"] }).notNull(),
    title: text("title").notNull().default(""),
    /** 几个人一起吃。明细按整桌保存，计入统计时除以人数 */
    sharePeople: integer("share_people").notNull().default(1),
    /** AI 原始估算（JSON），只留档追溯，统计不读它 */
    aiEstimate: text("ai_estimate"),
    aiModel: text("ai_model"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull(),
    confirmedAt: integer("confirmed_at"),
  },
  (t) => [index("meals_user_date_idx").on(t.userId, t.localDate, t.status)],
);

/** 一顿饭可以有多张照片（不同角度、分开摆的几样菜），最多 MAX_MEAL_PHOTOS 张 */
export const MAX_MEAL_PHOTOS = 4;

export const mealImages = sqliteTable(
  "meal_images",
  {
    id: id(),
    mealId: integer("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** 原图；超过保留期后会被清掉，只留缩略图 */
    imagePath: text("image_path"),
    thumbPath: text("thumb_path").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("meal_images_meal_idx").on(t.mealId, t.position)],
);

/** 用户最终确认的食物明细，所有统计只读这张表 */
export const mealItems = sqliteTable(
  "meal_items",
  {
    id: id(),
    mealId: integer("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    quantity: text("quantity").notNull().default(""),
    weightG: real("weight_g"),
    kcal: real("kcal").notNull(),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),
    /** 多人分食时，这一项是否只有用户自己吃（如自己的一碗饭），是则不按人数分摊 */
    personal: integer("personal", { mode: "boolean" }).notNull().default(false),
    /** 实际吃掉的比例：1=全吃了，0.5=吃了一半。明细保留原始份量，计入统计时乘以它 */
    eatenFraction: real("eaten_fraction").notNull().default(1),
  },
  (t) => [index("meal_items_meal_idx").on(t.mealId)],
);

export const bodyMetrics = sqliteTable(
  "body_metrics",
  {
    id: id(),
    userId: userId(),
    localDate: text("local_date").notNull(),
    measuredAt: integer("measured_at").notNull(),
    weightKg: real("weight_kg"),
    bodyFatPct: real("body_fat_pct"),
    waistCm: real("waist_cm"),
    muscleKg: real("muscle_kg"),
    skeletalMuscleKg: real("skeletal_muscle_kg"),
    visceralFat: real("visceral_fat"),
    bmrKcal: real("bmr_kcal"),
    note: text("note"),
    /** manual=手动输入；report=从体脂秤报告图片识别 */
    source: text("source", { enum: ["manual", "report"] }).notNull().default("manual"),
    /** 报告里的其他指标（JSON：蛋白质量、体水分、骨盐量等），只展示不参与计算 */
    extra: text("extra"),
    createdAt: createdAt(),
  },
  (t) => [index("body_metrics_user_date_idx").on(t.userId, t.localDate)],
);

/**
 * 用户从手表抄来的当天运动消耗（不含基础代谢），每人每天一条。
 * 没有记录的日子按活动水平估算。
 */
export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: id(),
    userId: userId(),
    localDate: text("local_date").notNull(),
    kcal: integer("kcal").notNull(),
    createdAt: createdAt(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("activity_logs_user_date_idx").on(t.userId, t.localDate)],
);

/** 7 天复盘：每个时间窗口保留最后一次生成的结果 */
export const weeklyReviews = sqliteTable(
  "weekly_reviews",
  {
    id: id(),
    userId: userId(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    /** 生成时所用数据的哈希；数据没变就不重复调用模型 */
    dataHash: text("data_hash").notNull(),
    /** 模型输出（JSON，已经过程序校验） */
    content: text("content").notNull(),
    model: text("model").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("weekly_reviews_user_end_idx").on(t.userId, t.endDate)],
);

/** 旧的聊天功能已由 7 天复盘取代；表保留是为了不删除历史数据 */
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    userId: userId(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("chat_messages_user_idx").on(t.userId, t.id)],
);

/** 每日简短建议的缓存；dataHash 变了才重新生成 */
export const dailyAdvice = sqliteTable(
  "daily_advice",
  {
    id: id(),
    userId: userId(),
    localDate: text("local_date").notNull(),
    dataHash: text("data_hash").notNull(),
    content: text("content").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("daily_advice_user_date_idx").on(t.userId, t.localDate)],
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: id(),
    userId: userId(),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_time_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Meal = typeof meals.$inferSelect;
export type MealItem = typeof mealItems.$inferSelect;
export type BodyMetric = typeof bodyMetrics.$inferSelect;
