"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MealType } from "@/db/schema";
import { request } from "@/lib/client-api";
import { compressImage } from "@/lib/compress-image";
import { MEAL_LABELS } from "@/lib/nutrition";
import { VoiceOverlay } from "./VoiceOverlay";

type Capture = {
  /** 直接打开相机；date 只在补记过去某天时传 */
  openCamera: (date?: string) => void;
  openAlbum: (date?: string) => void;
  /** 语音描述吃了什么 */
  openVoice: (date?: string, mealType?: MealType) => void;
};

const CaptureContext = createContext<Capture | null>(null);

export function useCapture(): Capture {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used inside CaptureProvider");
  return ctx;
}

/**
 * 拍照和语音记录的唯一实现：选图/录音 → 上传识别 → 跳到确认页。
 * 底部导航的相机按钮和首页的按钮都通过它触发。
 */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const targetDate = useRef<string | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<{ date?: string; mealType?: MealType } | null>(null);
  const closeVoice = useCallback(() => setVoice(null), []);
  const analyzeVoice = useCallback(
    async (audio: Blob) => {
      const form = new FormData();
      form.append("audio", audio, "speech");
      if (voice?.date) form.append("date", voice.date);
      if (voice?.mealType) form.append("mealType", voice.mealType);
      const { id } = await request<{ id: number }>("POST", "/api/meals/analyze", form);
      router.push(`/meal/${id}`);
      setVoice(null);
    },
    [voice, router],
  );

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function close() {
    setPreview(null);
    setError("");
    setBusy(false);
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("image", await compressImage(file), "meal.jpg");
      if (targetDate.current) form.append("date", targetDate.current);
      const { id } = await request<{ id: number }>("POST", "/api/meals/analyze", form);
      router.push(`/meal/${id}`);
      close();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFile(e.target.files?.[0]);
    e.target.value = "";
  };

  const open = (input: React.RefObject<HTMLInputElement | null>) => (date?: string) => {
    targetDate.current = date;
    input.current?.click();
  };
  const capture: Capture = { openCamera: open(cameraInput), openAlbum: open(albumInput), openVoice: (date, mealType) => setVoice({ date, mealType }) };

  return (
    <CaptureContext.Provider value={capture}>
      {children}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onChange} data-capture="camera" />
      <input ref={albumInput} type="file" accept="image/*" hidden onChange={onChange} data-capture="album" />

      {voice && <VoiceOverlay
          title={`正在听，说说${voice.mealType ? MEAL_LABELS[voice.mealType] : ""}吃了什么`}
          onRecorded={analyzeVoice}
          onClose={closeVoice}
        />}

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 p-8 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className={`max-h-[50dvh] rounded-3xl object-contain ${busy ? "animate-pulse" : ""}`} />
          {busy ? (
            <p className="text-lg">正在识别食物…</p>
          ) : (
            <>
              <p className="text-center text-lg">{error}</p>
              <div className="flex gap-3">
                <button className="rounded-2xl bg-white/15 px-6 py-3" onClick={close}>
                  关闭
                </button>
                <button
                  className="rounded-2xl bg-white px-6 py-3 font-semibold text-black"
                  onClick={() => {
                    close();
                    cameraInput.current?.click();
                  }}
                >
                  重新拍
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </CaptureContext.Provider>
  );
}
