import { ChatView } from "@/components/ChatView";
import { requireUser } from "@/lib/session";
import { listChatMessages } from "@/services/assistant";

export default async function ChatPage() {
  const user = await requireUser();
  const messages = listChatMessages(user).map(({ id, role, content }) => ({ id, role, content }));
  return <ChatView initial={messages} />;
}
