import { ChatMessage } from "@/providers/Stream";
import { MarkdownText } from "../markdown-text";

export function AssistantMessage({ message }: { message: ChatMessage }) {
  if (!message.content) return null;

  return (
    <div className="mr-auto flex w-full items-start gap-2">
      <div className="flex w-full flex-col gap-2">
        <div className="py-1">
          <MarkdownText>{message.content}</MarkdownText>
        </div>
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="mr-auto flex items-start gap-2">
      <div className="bg-muted flex h-8 items-center gap-1 rounded-2xl px-4 py-2">
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_0.5s_infinite] rounded-full"></div>
        <div className="bg-foreground/50 h-1.5 w-1.5 animate-[pulse_1.5s_ease-in-out_1s_infinite] rounded-full"></div>
      </div>
    </div>
  );
}
