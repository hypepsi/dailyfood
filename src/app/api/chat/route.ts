import { z } from "zod";
import { api } from "@/lib/http";
import { clearChat, sendChatMessage } from "@/services/assistant";

export const maxDuration = 90;

const body = z.object({ message: z.string().trim().min(1).max(1000) });

export const POST = api({ body }, async ({ user, body }) => ({ reply: await sendChatMessage(user, body.message) }));

export const DELETE = api({}, ({ user }) => {
  clearChat(user);
});
