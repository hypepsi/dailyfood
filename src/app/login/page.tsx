import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-center text-3xl font-bold text-accent-deep">LoseWeight</h1>
      <p className="mb-10 mt-2 text-center text-muted">拍一顿，记一顿</p>
      <LoginForm />
    </main>
  );
}
