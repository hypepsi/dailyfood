import { redirect } from "next/navigation";
import type { User } from "@/db/schema";
import { getCurrentUser } from "./auth";

/** 页面里取当前用户；未登录跳到登录页 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
