import { createSession } from "@/lib/auth";
import { api } from "@/lib/http";
import { changePassword, passwordInput } from "@/services/profile";

export const POST = api({ body: passwordInput }, async ({ user, body }) => {
  changePassword(user, body);
  // 其他设备全部下线，当前设备重新签发
  await createSession(user.id);
});
