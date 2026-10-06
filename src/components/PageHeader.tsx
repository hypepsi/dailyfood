import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** 二级页面的标题栏：左侧返回 */
export function PageHeader({ title, backHref = "/" }: { title: string; backHref?: string }) {
  return (
    <header className="mb-5 flex items-center">
      <Link href={backHref} aria-label="返回" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-line">
        <ChevronLeft size={26} />
      </Link>
      <h1 className="flex-1 pr-9 text-center text-xl font-bold">{title}</h1>
    </header>
  );
}
