"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { request } from "@/lib/client-api";

export type ChatMessage = { id: number; role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["我今天还剩多少热量？", "今天晚上吃什么？", "今天蛋白质够不够？", "最近减脂效果怎么样？"];

export function ChatView({ initial }: { initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  async function send(message: string) {
    const content = message.trim();
    if (!content || busy) return;
    setError("");
    setText("");
    setBusy(true);
    const tempId = -Date.now();
    setMessages((m) => [...m, { id: tempId, role: "user", content }]);
    try {
      const { reply } = await request<{ reply: ChatMessage }>("POST", "/api/chat", { message: content });
      setMessages((m) => [...m, reply]);
    } catch (err) {
      // 发送失败：撤回这条消息并把文字放回输入框
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setText(content);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm("清空聊天记录？饮食和体重数据不受影响。")) return;
    await request("DELETE", "/api/chat").catch(() => null);
    setMessages([]);
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col lg:mx-auto lg:max-w-xl">
      <header className="mb-4 flex items-center">
        <span className="w-12" />
        <h1 className="flex-1 text-center text-xl font-bold">问 AI</h1>
        <button className="w-12 text-right text-sm text-faint" onClick={clear} hidden={messages.length === 0}>
          清空
        </button>
      </header>

      <div className="flex-1 space-y-3 pb-24">
        {messages.length === 0 && (
          <div className="pt-6">
            <p className="mb-4 text-center text-muted">回答会基于你记录的真实数据</p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn-secondary w-full justify-start px-4 py-3 text-[15px]" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-3xl px-3.5 py-2.5 leading-relaxed ${
                m.role === "user" ? "rounded-br-lg bg-accent text-white" : "rounded-bl-lg border border-line bg-card shadow-card"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-3xl rounded-bl-lg border border-line bg-card px-4 py-3 text-faint">正在查看你的记录…</div>
          </div>
        )}
        {error && <p className="text-center text-sm text-warn">{error}</p>}
        <div ref={bottom} />
      </div>

      <form
        className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-20 bg-bg/95 backdrop-blur lg:bottom-0 lg:left-60 lg:pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5 lg:max-w-xl lg:px-0">
          <input className="field flex-1 rounded-full bg-card" placeholder="问点什么…" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          <button aria-label="发送" disabled={busy || !text.trim()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40">
            <ArrowUp size={22} />
          </button>
        </div>
      </form>
    </div>
  );
}
