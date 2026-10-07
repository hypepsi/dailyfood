"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { MAX_MEAL_PHOTOS } from "@/db/schema";
import { request } from "@/lib/client-api";
import { compressImage } from "@/lib/compress-image";
import type { AdjustItem, AdjustResult } from "./MealAdjust";

type Props = {
  mealId: number;
  /** 进入页面时这顿饭已有几张照片 */
  initialCount: number;
  /** 当前清单；补拍时交给 AI 对照，避免重复添加 */
  items: AdjustItem[];
  /** AI 对照新照片后给出的补充或修正；rowIndexes 把方案里的下标对回编辑页的行 */
  onResult: (result: AdjustResult, rowIndexes: number[]) => void;
};

/**
 * 一顿饭的照片：一张时大图展示，多张时并排成小图；还可以再补拍。
 * 补拍的照片会立刻保存；AI 只把清单里还没有的食物加进来，已有的不会重复计算。
 */
export function MealPhotos({ mealId, initialCount, items, onResult }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const rowIndexes = items.map((i, n) => (i.name.trim() ? n : -1)).filter((n) => n >= 0);
      const form = new FormData();
      form.append("image", await compressImage(file), "meal.jpg");
      form.append("items", JSON.stringify(rowIndexes.map((n) => items[n])));
      const result = await request<{ photoCount: number; edit: Omit<AdjustResult, "heard"> | null; note: string }>("POST", `/api/meals/${mealId}/photos`, form);
      setCount(result.photoCount);
      if (result.edit) {
        onResult({ ...result.edit, heard: "" }, rowIndexes);
        setMessage({ ok: true, text: `照片已添加：${result.edit.summary}` });
      } else {
        setMessage({ ok: true, text: result.note });
      }
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const photos = Array.from({ length: count }, (_, n) => n);
  const canAdd = count < MAX_MEAL_PHOTOS;

  return (
    <section>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void add(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {count === 1 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/meals/${mealId}/image`} alt="食物照片" className="max-h-48 w-full rounded-3xl object-cover" />
      )}
      {count > 1 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={n} src={`/api/meals/${mealId}/image?n=${n}`} alt={`食物照片 ${n + 1}`} className="aspect-[4/3] w-full rounded-2xl object-cover" />
          ))}
        </div>
      )}

      {canAdd && (
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className={`btn-secondary w-full border-dashed py-3 text-muted ${count > 0 ? "mt-2" : ""}`}
        >
          <ImagePlus size={18} className={busy ? "animate-pulse text-accent" : "text-accent"} />
          {busy ? "正在识别新照片…" : count === 0 ? "加一张照片" : `一张不够？再加一张（${count}/${MAX_MEAL_PHOTOS}）`}
        </button>
      )}
      {message && <p className={`mt-2 text-sm leading-relaxed ${message.ok ? "text-accent-deep" : "text-warn"}`}>{message.text}</p>}
    </section>
  );
}
