import type { Message } from "@langchain/langgraph-sdk";

/**
 * Extracts a string summary from a message's content, supporting multimodal (text, image, file, etc.).
 * - If text is present, returns the joined text.
 * - If not, returns a label for the first non-text modality (e.g., 'Image', 'Other').
 * - If unknown, returns 'Multimodal message'.
 */
export function getContentString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  const texts = content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text);
  return texts.join(" ");
}

type ReasoningBlock = {
  type: "reasoning";
  reasoning?: string;
  text?: string;
};

type ReasoningContentBlock = {
  type: "reasoning_content";
  reasoning_content?: {
    text?: string;
  };
};

const isReasoningBlock = (block: unknown): block is ReasoningBlock => {
  if (!block || typeof block !== "object") return false;
  const record = block as Record<string, unknown>;
  return record.type === "reasoning";
};

const isReasoningContentBlock = (
  block: unknown,
): block is ReasoningContentBlock => {
  if (!block || typeof block !== "object") return false;
  const record = block as Record<string, unknown>;
  return record.type === "reasoning_content";
};

const extractReasoningText = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const nestedText = record.reasoningText;
  if (typeof nestedText === "string" && nestedText.trim().length > 0) {
    return nestedText;
  }

  const summary = record.summary;
  if (Array.isArray(summary)) {
    const summaryText = summary
      .map((item) => {
        if (item && typeof item === "object") {
          const itemRecord = item as Record<string, unknown>;
          return typeof itemRecord.text === "string" ? itemRecord.text : "";
        }
        return "";
      })
      .join("")
      .trim();
    if (summaryText.length > 0) return summaryText;
  }

  return undefined;
};

export function getReasoningString(message?: Message): string {
  if (!message) return "";

  const additional = message.additional_kwargs as Record<string, unknown> | undefined;
  const responseMeta = message.response_metadata as Record<string, unknown> | undefined;

  const directAdditional =
    extractReasoningText(additional?.reasoningContent) ??
    extractReasoningText(additional?.reasoning_content) ??
    extractReasoningText(additional?.reasoning);

  if (directAdditional) return directAdditional;

  const directResponse =
    extractReasoningText(responseMeta?.reasoningContent) ??
    extractReasoningText(responseMeta?.reasoning_content) ??
    extractReasoningText(responseMeta?.reasoning);

  if (directResponse) return directResponse;

  const content = message.content;
  if (Array.isArray(content)) {
    const reasoningBlocks = content
      .filter(isReasoningBlock)
      .map((block) => (block.reasoning ?? block.text ?? "").trim())
      .filter((text) => text.length > 0);
    const reasoningContentBlocks = content
      .filter(isReasoningContentBlock)
      .map((block) => (block.reasoning_content?.text ?? "").trim())
      .filter((text) => text.length > 0);
    return [...reasoningBlocks, ...reasoningContentBlocks].join("\n\n");
  }

  return "";
}
