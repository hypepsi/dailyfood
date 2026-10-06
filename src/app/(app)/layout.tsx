import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/login");
  return (
    <>
      <AppNav />
      {/* 手机：单列 + 底部导航；电脑：左侧边栏 + 宽内容区 */}
      <div className="lg:pl-60">
        <main className="mx-auto max-w-md px-3.5 pb-24 pt-[max(1rem,env(safe-area-inset-top))] lg:max-w-5xl lg:px-10 lg:pb-16 lg:pt-10">
          {children}
        </main>
      </div>
    </>
  );
}
