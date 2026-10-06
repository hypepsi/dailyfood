"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Images, MessageCircle, PencilLine, Scale } from "lucide-react";
import { request } from "@/lib/client-api";
import { compressImage } from "@/lib/compress-image";

type Props = {
  /** 当前查看的日期；补记过去某天时带上 */
  date: string;
  isToday: boolean;
};

/** 首页最重要的操作区：拍一顿（直接开相机）、相册、记体重、手动记录、问 AI */
export function CaptureActions({ date, isToday }: Props) {
  const router = useRouter();
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const form = new FormData();
      form.append("image", await compressImage(file), "meal.jpg");
      if (!isToday) form.append("date", date);
      const { id } = await request<{ id: number }>("POST", "/api/meals/analyze", form);
      router.push(`/meal/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function closeOverlay() {
    setPreview(null);
    setError("");
    setBusy(false);
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFile(e.target.files?.[0]);
    e.target.value = "";
  };

  return (
    <div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onChange} />
      <input ref={albumInput} type="file" accept="image/*" hidden onChange={onChange} />

      <div className="flex gap-3">
        <button className="btn-primary flex-1 py-5 text-lg shadow-card" onClick={() => cameraInput.current?.click()}>
          <Camera size={24} />
          {isToday ? "拍一顿" : "补拍一顿"}
        </button>
        <button
          className="btn-secondary w-[68px] flex-col gap-1 px-0 text-xs text-muted"
          onClick={() => albumInput.current?.click()}
        >
          <Images size={22} />
          相册
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Link href="/weight" className="btn-secondary">
          <Scale size={18} className="text-accent" />
          记体重
        </Link>
        <Link href={`/meal/new?date=${date}`} className="btn-secondary">
          <PencilLine size={18} className="text-accent" />
          手动记录
        </Link>
        <Link href="/chat" className="btn-secondary">
          <MessageCircle size={18} className="text-accent" />
          问 AI
        </Link>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/85 p-8 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="" className={`max-h-[50dvh] rounded-3xl object-contain ${busy ? "animate-pulse" : ""}`} />
          {busy ? (
            <p className="text-lg">正在识别食物…</p>
          ) : (
            <>
              <p className="text-center text-lg">{error}</p>
              <div className="flex gap-3">
                <button className="rounded-2xl bg-white/15 px-6 py-3" onClick={closeOverlay}>
                  关闭
                </button>
                <button
                  className="rounded-2xl bg-white px-6 py-3 font-semibold text-black"
                  onClick={() => {
                    closeOverlay();
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
    </div>
  );
}
