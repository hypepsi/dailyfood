import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CaptureProvider } from "@/components/CaptureProvider";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentUser())) redirect("/login");
  return (
    <CaptureProvider>
      {/* 手机和电脑都是同一列从上到下的卡片；电脑上只是略宽、字略大 */}
      <main className="mx-auto max-w-md px-3.5 pb-28 pt-[max(1rem,env(safe-area-inset-top))] lg:max-w-lg lg:pt-8">{children}</main>
      <AppNav />
    </CaptureProvider>
  );
}
