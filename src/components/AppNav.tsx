"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, ChartNoAxesColumn, ClipboardCheck, House, UserRound, type LucideIcon } from "lucide-react";
import { useCapture } from "./CaptureProvider";

type Tab = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const LEFT: Tab[] = [
  { href: "/", label: "今天", icon: House, match: (p) => p === "/" || p.startsWith("/day") },
  { href: "/trends", label: "趋势", icon: ChartNoAxesColumn, match: (p) => p.startsWith("/trends") },
];
const RIGHT: Tab[] = [
  { href: "/review", label: "复盘", icon: ClipboardCheck, match: (p) => p.startsWith("/review") },
  { href: "/settings", label: "我的", icon: UserRound, match: (p) => p.startsWith("/settings") },
];

/** 底部导航（手机和电脑相同）；正中间是随时可点的「拍一顿」 */
export function AppNav() {
  const pathname = usePathname();
  const capture = useCapture();

  const tab = (t: Tab) => {
    const active = t.match(pathname);
    return (
      <li key={t.href} className="flex-1">
        <Link
          href={t.href}
          aria-current={active ? "page" : undefined}
          className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${active ? "font-bold text-accent" : "font-medium text-muted hover:text-ink"}`}
        >
          <t.icon size={22} strokeWidth={active ? 2.4 : 2} />
          {t.label}
        </Link>
      </li>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md items-center lg:max-w-lg">
        {LEFT.map(tab)}
        <li className="flex flex-1 justify-center">
          <button
            aria-label="拍一顿"
            onClick={() => capture.openCamera()}
            className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg ring-4 ring-bg transition duration-200 hover:brightness-110 active:scale-90"
          >
            <Camera size={25} />
          </button>
        </li>
        {RIGHT.map(tab)}
      </ul>
    </nav>
  );
}
