"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";

const MAX_SECONDS = 60;

type Phase = "starting" | "recording" | "processing" | "error";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
}

type Props = {
  /** 录音时显示的标题和示例 */
  title: string;
  example: string;
  /** 录完后怎么处理这段录音；抛出的错误会显示给用户并允许重录。成功后由调用方负责关闭 */
  onRecorded: (audio: Blob) => Promise<void>;
  onClose: () => void;
};

/**
 * 通用的录音浮层：打开即开始录音，点「说完了」后把录音交给 onRecorded。
 * 最长录 60 秒，到时自动结束。
 */
export function VoiceOverlay({ title, example, onRecorded, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let disposed = false;
    cancelled.current = false;
    setSeconds(0);
    setPhase("starting");

    async function upload(blob: Blob) {
      setPhase("processing");
      try {
        await onRecorded(blob);
      } catch (err) {
        setError((err as Error).message);
        setPhase("error");
      }
    }

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setError((err as Error).message === "unsupported" ? "这个浏览器不支持录音，请改用文字描述" : "没有麦克风权限。请在浏览器里允许使用麦克风后再试");
        setPhase("error");
        return;
      }
      if (disposed) return stream.getTracks().forEach((t) => t.stop());

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(timer);
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelled.current) return;
        const blob = new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" });
        if (blob.size < 1000) {
          setError("没有录到声音，请再说一次");
          setPhase("error");
          return;
        }
        void upload(blob);
      };
      recorder.current = rec;
      rec.start();
      setPhase("recording");
      timer = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS && rec.state === "recording") rec.stop();
          return s + 1;
        });
      }, 1000);
    }

    void start();
    return () => {
      disposed = true;
      cancelled.current = true;
      clearInterval(timer);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // attempt 变化时重新录一次
  }, [attempt, onRecorded]);

  const finish = () => recorder.current?.state === "recording" && recorder.current.stop();

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/95 p-8 text-center text-white">
      {(phase === "starting" || phase === "recording") && (
        <>
          <span className={`flex h-24 w-24 items-center justify-center rounded-full bg-accent ${phase === "recording" ? "animate-pulse" : "opacity-50"}`}>
            <Mic size={40} />
          </span>
          <div>
            <p className="text-xl font-semibold">{phase === "recording" ? title : "正在打开麦克风…"}</p>
            <p className="mt-2 text-sm text-white/70">例如：{example}</p>
            {phase === "recording" && <p className="num mt-3 text-white/70">{seconds} 秒</p>}
          </div>
          <div className="flex gap-3">
            <button className="rounded-2xl bg-white/15 px-6 py-3" onClick={onClose}>
              取消
            </button>
            <button className="rounded-2xl bg-white px-8 py-3 font-semibold text-black disabled:opacity-40" disabled={phase !== "recording" || seconds < 1} onClick={finish}>
              说完了
            </button>
          </div>
        </>
      )}
      {phase === "processing" && <p className="animate-pulse text-lg">正在识别你说的内容…</p>}
      {phase === "error" && (
        <>
          <p className="text-lg">{error}</p>
          <div className="flex gap-3">
            <button className="rounded-2xl bg-white/15 px-6 py-3" onClick={onClose}>
              关闭
            </button>
            <button className="rounded-2xl bg-white px-6 py-3 font-semibold text-black" onClick={() => setAttempt((a) => a + 1)}>
              再说一次
            </button>
          </div>
        </>
      )}
    </div>
  );
}
