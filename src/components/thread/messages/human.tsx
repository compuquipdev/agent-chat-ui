import { ChatMessage } from "@/providers/Stream";

export function HumanMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="ml-auto flex max-w-xl items-center justify-end">
      <p className="bg-muted ml-auto w-fit rounded-3xl px-4 py-2 text-right whitespace-pre-wrap">
        {message.content}
      </p>
    </div>
  );
}
