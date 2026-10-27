"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Images, Sparkles, X } from "lucide-react";
import { MAX_MEAL_PHOTOS, type MealType } from "@/db/schema";
import { request } from "@/lib/client-api";
import { clientLog } from "@/lib/client-log";
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
 * 拍照和语音记录的唯一实现。
 * 拍照：拍完先停在预览，可以接着再拍或从相册加（最多 4 张），点「开始识别」后一起上传 → 跳到确认页。
 * 底部导航的相机按钮和首页的按钮都通过它触发。
 */
export function CaptureProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const targetDate = useRef<string | undefined>(undefined);
  // 已经拍好、还没发出去的照片。拍完先停在这里，可以接着再拍，最后一起识别
  const [staged, setStaged] = useState<{ file: File; url: string }[]>([]);
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

  function close() {
    staged.forEach((p) => URL.revokeObjectURL(p.url));
    setStaged([]);
    setError("");
    setBusy(false);
  }

  /** 新拍的或从相册选的照片先放进待发列表，不马上识别 */
  function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setError("");
    setStaged((current) => [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_MEAL_PHOTOS));
  }

  function removeStaged(url: string) {
    URL.revokeObjectURL(url);
    setStaged((current) => current.filter((p) => p.url !== url));
  }

  /** 把待发的照片一起交给 AI，合在一起识别 */
  async function analyze() {
    setError("");
    setBusy(true);
    const started = Date.now();
    let hidden = 0;
    const onVisibility = () => document.hidden && hidden++;
    document.addEventListener("visibilitychange", onVisibility);
    const controller = new AbortController();
    let polling: ReturnType<typeof setInterval> | undefined;
    let pollStart: ReturnType<typeof setTimeout> | undefined;
    try {
      const form = new FormData();
      let bytes = 0;
      for (const p of staged) {
        const blob = await compressImage(p.file);
        bytes += blob.size;
        form.append("image", blob, "meal.jpg");
      }
      if (targetDate.current) form.append("date", targetDate.current);
      clientLog("analyze_start", { photos: staged.length, kb: Math.round(bytes / 1024) });

      // 有时服务器已经识别好了，结果却没传回手机。15 秒后开始顺便查一下有没有新草稿，有就直接跳过去
      const viaPoll = new Promise<number>((resolve) => {
        const check = () =>
          fetch(`/api/meals/latest-draft?since=${started - 5000}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d?.id && resolve(d.id))
            .catch(() => {});
        pollStart = setTimeout(() => {
          check();
          polling = setInterval(check, 4000);
        }, 15_000);
      });
      const viaResponse = fetch("/api/meals/analyze", { method: "POST", body: form, signal: controller.signal }).then(async (res) => {
        const data = await res.json().catch(() => null);
        clientLog("analyze_response", { status: res.status, ms: Date.now() - started, hidden });
        if (!res.ok) throw new Error(data?.error?.message || "识别失败，请稍后再试");
        return data.id as number;
      });
      viaResponse.catch(() => {}); // 被上面的查草稿抢先时，这边会被取消，不算错误
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 130_000));
      const id = await Promise.race([viaResponse, viaPoll.then((id) => (clientLog("analyze_found_by_poll", { ms: Date.now() - started, hidden }), id)), timeout]);
      controller.abort();
      router.push(`/meal/${id}`);
      close();
    } catch (err) {
      const timedOut = (err as Error).message === "timeout";
      clientLog(timedOut ? "analyze_timeout" : "analyze_error", { ms: Date.now() - started, hidden, message: (err as Error).message.slice(0, 100) });
      controller.abort();
      setError(timedOut ? "等太久没有回应，请再试一次" : err instanceof TypeError ? "网络连接失败，请检查网络后重试" : (err as Error).message);
      setBusy(false);
    } finally {
      clearTimeout(pollStart);
      clearInterval(polling);
      document.removeEventListener("visibilitychange", onVisibility);
    }
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
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
      <input ref={albumInput} type="file" accept="image/*" multiple hidden onChange={onChange} data-capture="album" />

      {voice && <VoiceOverlay
          title={`正在听，说说${voice.mealType ? MEAL_LABELS[voice.mealType] : ""}吃了什么`}
          onRecorded={analyzeVoice}
          onClose={closeVoice}
        />}

      {staged.length > 0 && (
        <div data-no-pull className="fixed inset-0 z-50 flex flex-col bg-black/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {staged.length === 1 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={staged[0].url} alt="" className={`max-h-full max-w-full rounded-3xl object-contain ${busy ? "animate-pulse" : ""}`} />
            ) : (
              <div className={`grid w-full max-w-md grid-cols-2 gap-2 ${busy ? "animate-pulse" : ""}`}>
                {staged.map((p, n) => (
                  <div key={p.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`第 ${n + 1} 张`} className="aspect-[4/3] w-full rounded-2xl object-cover" />
                    {!busy && (
                      <button aria-label={`去掉第 ${n + 1} 张`} onClick={() => removeStaged(p.url)} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mx-auto mt-5 w-full max-w-md">
            {busy ? (
              <p className="py-4 text-center text-lg">{staged.length > 1 ? `正在一起识别 ${staged.length} 张照片…` : "正在识别食物…"}</p>
            ) : (
              <>
                {error && <p className="mb-3 text-center text-warn">{error}</p>}
                <button className="btn-primary w-full py-4 text-[17px]" onClick={analyze}>
                  <Sparkles size={20} />
                  {staged.length > 1 ? `开始识别（${staged.length} 张）` : "开始识别"}
                </button>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <button className="rounded-2xl bg-white/15 py-3 disabled:opacity-40" disabled={staged.length >= MAX_MEAL_PHOTOS} onClick={() => cameraInput.current?.click()}>
                    <Camera size={17} className="mx-auto mb-1" />
                    再拍一张
                  </button>
                  <button className="rounded-2xl bg-white/15 py-3 disabled:opacity-40" disabled={staged.length >= MAX_MEAL_PHOTOS} onClick={() => albumInput.current?.click()}>
                    <Images size={17} className="mx-auto mb-1" />
                    从相册加
                  </button>
                  <button className="rounded-2xl bg-white/15 py-3" onClick={close}>
                    <X size={17} className="mx-auto mb-1" />
                    不记了
                  </button>
                </div>
                <p className="mt-3 text-center text-xs text-white/60">
                  {staged.length >= MAX_MEAL_PHOTOS ? `最多 ${MAX_MEAL_PHOTOS} 张` : "一张拍不全就再拍，会合在一起识别，同一样菜不会算两次"}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </CaptureContext.Provider>
  );
}
