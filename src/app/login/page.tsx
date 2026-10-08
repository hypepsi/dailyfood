import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png?v=2" alt="" className="mx-auto mb-5 h-20 w-20 rounded-[22px] shadow-card" />
      <h1 className="text-center text-3xl font-extrabold tracking-tight text-accent-deep">食刻</h1>
      <p className="mb-10 mt-2 text-center text-muted">拍一顿，记一顿</p>
      <LoginForm />
    </main>
  );
}
