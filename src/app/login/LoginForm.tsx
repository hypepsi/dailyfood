"use client";

import { useState } from "react";
import { request } from "@/lib/client-api";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("POST", "/api/auth/login", { username, password });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="field"
        placeholder="用户名"
        autoCapitalize="none"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        className="field"
        type="password"
        placeholder="密码"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-sm text-warn">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || !username || !password}>
        {busy ? "登录中…" : "登录"}
      </button>
    </form>
  );
}
