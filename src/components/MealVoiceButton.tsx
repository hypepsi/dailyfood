"use client";

import { Mic } from "lucide-react";
import type { MealType } from "@/db/schema";
import { MEAL_LABELS } from "@/lib/nutrition";
import { useCapture } from "./CaptureProvider";

/** 早/午/晚/加餐每一栏上的语音按钮：说完直接记到这一餐 */
export function MealVoiceButton({ mealType, date }: { mealType: MealType; date?: string }) {
  const capture = useCapture();
  return (
    <button
      aria-label={`语音记录${MEAL_LABELS[mealType]}`}
      onClick={() => capture.openVoice(date, mealType)}
      className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-accent active:bg-line"
    >
      <Mic size={16} />
    </button>
  );
}
