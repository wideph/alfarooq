import type { SiteSettings } from "@prisma/client";

export type BotChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OpenAiLikeResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type ClaudeResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

async function readError(response: Response) {
  const text = await response.text().catch(() => "");
  return text || `${response.status} ${response.statusText}`;
}

async function callOpenAiLike(
  settings: SiteSettings,
  messages: BotChatMessage[],
  baseUrl: string
) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.botApiKey}`,
    },
    body: JSON.stringify({
      model: settings.botModel,
      messages,
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = (await response.json()) as OpenAiLikeResponse;
  const providerError = data.error?.message;
  if (providerError) throw new Error(providerError);

  return data.choices?.[0]?.message?.content || "";
}

async function callClaude(settings: SiteSettings, messages: BotChatMessage[]) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const conversation = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.botApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.botModel,
      system,
      messages: conversation,
      temperature: 0.1,
      max_tokens: 900,
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = (await response.json()) as ClaudeResponse;
  const providerError = data.error?.message;
  if (providerError) throw new Error(providerError);

  return data.content?.find((item) => item.type === "text")?.text || "";
}

export async function callBotModel(settings: SiteSettings, messages: BotChatMessage[]) {
  if (settings.botProvider === "claude") {
    return callClaude(settings, messages);
  }

  if (settings.botProvider === "deepseek") {
    return callOpenAiLike(settings, messages, "https://api.deepseek.com");
  }

  return callOpenAiLike(settings, messages, "https://api.openai.com/v1");
}
