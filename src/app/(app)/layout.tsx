import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/login");
  return (
    <>
      <main className="mx-auto max-w-md px-3.5 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">{children}</main>
      <BottomNav />
    </>
  );
}
