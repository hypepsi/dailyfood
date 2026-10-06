import { redirect } from "next/navigation";

/** 旧的「问 AI」入口：已由 7 天复盘取代，保留这个地址是为了不让旧书签失效 */
export default function ChatPage() {
  redirect("/review");
}
