"use client";

import { useState } from "react";
import { request } from "@/lib/client-api";

/** 修改密码与退出登录 */
export function AccountActions({ username }: { username: string }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return setMessage({ ok: false, text: "新密码至少 8 位" });
    setBusy(true);
    try {
      await request("POST", "/api/profile/password", { currentPassword, newPassword });
      setMessage({ ok: true, text: "密码已修改，其他设备已退出登录" });
      setCurrent("");
      setNew("");
      setOpen(false);
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await request("POST", "/api/auth/logout").catch(() => null);
    window.location.href = "/login";
  }

  return (
    <section className="card">
      <h2 className="text-sm font-semibold text-accent">账号</h2>
      <p className="mt-2 text-muted">登录名：{username}</p>
      {message && <p className={`mt-2 text-sm ${message.ok ? "text-accent" : "text-warn"}`}>{message.text}</p>}
      {open ? (
        <form onSubmit={changePassword} className="mt-3 space-y-2">
          <input type="password" className="field" placeholder="当前密码" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
          <input type="password" className="field" placeholder="新密码（至少 8 位）" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
              取消
            </button>
            <button className="btn-secondary flex-1 border-accent text-accent" disabled={busy || !currentPassword || !newPassword}>
              确认修改
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex gap-2">
          <button className="btn-secondary flex-1" onClick={() => setOpen(true)}>
            修改密码
          </button>
          <button className="btn-secondary flex-1" onClick={logout}>
            退出登录
          </button>
        </div>
      )}
    </section>
  );
}
