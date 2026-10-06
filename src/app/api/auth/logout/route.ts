import { destroySession } from "@/lib/auth";
import { api } from "@/lib/http";

export const POST = api({ auth: false }, async () => {
  await destroySession();
});
