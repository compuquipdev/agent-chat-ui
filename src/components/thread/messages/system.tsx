import { cn } from "@/lib/utils";
import { ChatMessage } from "@/providers/Stream";

export function SystemMessage({ message }: { message: ChatMessage }) {
  if (!message.content) return null;

  return (
    <div className="flex justify-center">
      <div
        className={cn(
          "max-w-2xl text-xs uppercase tracking-wider",
          "px-3 py-2 rounded-full border",
          "bg-amber-50 text-amber-900 border-amber-200",
          "shadow-[0_1px_0_rgba(0,0,0,0.04)]",
        )}
      >
        System: {message.content}
      </div>
    </div>
  );
}
