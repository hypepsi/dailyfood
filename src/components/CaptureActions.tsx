"use client";

import Link from "next/link";
import { Camera, ClipboardCheck, Images, Mic, PencilLine, Scale } from "lucide-react";
import { useCapture } from "./CaptureProvider";

type Props = {
  /** 当前查看的日期 */
  date: string;
  isToday: boolean;
};

/** 页面底部的操作区：拍一顿、语音、相册、身体数据、手动记录、7 天复盘 */
export function CaptureActions({ date, isToday }: Props) {
  const capture = useCapture();
  const target = isToday ? undefined : date;

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2.5">
        <button className="btn-primary flex-1 py-4 text-[17px]" onClick={() => capture.openCamera(target)}>
          <Camera size={21} />
          {isToday ? "拍一顿" : "补拍一顿"}
        </button>
        <button className="btn-secondary w-16 flex-col gap-0.5 px-0 py-2 text-xs text-muted" onClick={() => capture.openVoice(target)}>
          <Mic size={19} className="text-accent" />
          语音
        </button>
        <button className="btn-secondary w-16 flex-col gap-0.5 px-0 py-2 text-xs text-muted" onClick={() => capture.openAlbum(target)}>
          <Images size={19} />
          相册
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <Link href="/weight" className="btn-secondary">
          <Scale size={16} className="text-accent" />
          身体数据
        </Link>
        <Link href={`/meal/new?date=${date}`} className="btn-secondary">
          <PencilLine size={16} className="text-accent" />
          手动记录
        </Link>
        <Link href="/review" className="btn-secondary">
          <ClipboardCheck size={16} className="text-accent" />
          AI 分析
        </Link>
      </div>
    </div>
  );
}
