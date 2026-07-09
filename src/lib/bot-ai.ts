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

// Abort the provider call before the serverless function itself times out, so
// the route can still reply with the graceful fallback (and queue the question
// for the admin) instead of the visitor seeing a dead request.
const PROVIDER_TIMEOUT_MS = 50_000;

async function callOpenAiLike(
  settings: SiteSettings,
  messages: BotChatMessage[],
  baseUrl: string
) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.botApiKey}`,
    },
    body: JSON.stringify({
      model: settings.botModel,
      messages,
      temperature: 0.2,
      max_tokens: 4000,
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

  // Prefill the response with "{" so Claude is forced to continue as JSON
  // (Claude has no json_object response_format). We re-add the "{" below.
  const jsonPrefill = '{"canAnswer"';
  conversation.push({ role: "assistant", content: jsonPrefill });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.botApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.botModel,
      system,
      messages: conversation,
      temperature: 0.2,
      max_tokens: 4000,
      stop_sequences: ["```"],
    }),
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data = (await response.json()) as ClaudeResponse;
  const providerError = data.error?.message;
  if (providerError) throw new Error(providerError);

  const text = data.content?.find((item) => item.type === "text")?.text || "";
  return text ? `${jsonPrefill}${text}` : "";
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

// Generic JSON-object generation call, used by the offline bot self-learning
// pass. `prefillKey` (e.g. '{"pairs"') forces Claude to start a JSON object.
export async function callBotJson(
  settings: SiteSettings,
  system: string,
  user: string,
  prefillKey: string,
  maxTokens = 2500
) {
  if (settings.botProvider === "claude") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.botApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: settings.botModel,
        system,
        messages: [
          { role: "user", content: user },
          { role: "assistant", content: prefillKey },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        stop_sequences: ["```"],
      }),
    });

    if (!response.ok) throw new Error(await readError(response));
    const data = (await response.json()) as ClaudeResponse;
    if (data.error?.message) throw new Error(data.error.message);
    const text = data.content?.find((item) => item.type === "text")?.text || "";
    return text ? `${prefillKey}${text}` : "";
  }

  const baseUrl =
    settings.botProvider === "deepseek"
      ? "https://api.deepseek.com"
      : "https://api.openai.com/v1";

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.botApiKey}`,
    },
    body: JSON.stringify({
      model: settings.botModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as OpenAiLikeResponse;
  if (data.error?.message) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || "";
}
