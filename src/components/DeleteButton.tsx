"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { request } from "@/lib/client-api";

/** 列表里的删除按钮：确认后调用接口并刷新页面数据 */
export function DeleteButton({ url, confirmText }: { url: string; confirmText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await request("DELETE", url);
      router.refresh();
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button aria-label="删除" disabled={busy} onClick={remove} className="-mr-2 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint active:bg-line disabled:opacity-40">
      <Trash2 size={17} />
    </button>
  );
}
