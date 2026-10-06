import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** 二级页面的标题栏：左侧返回 */
export function PageHeader({ title, backHref = "/" }: { title: string; backHref?: string }) {
  return (
    <header className="mb-3 flex items-center lg:mb-6">
      <Link href={backHref} aria-label="返回" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-line">
        <ChevronLeft size={26} />
      </Link>
      <h1 className="flex-1 pr-9 text-center text-lg font-bold lg:text-2xl">{title}</h1>
    </header>
  );
}
