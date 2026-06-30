// Admins embed private bot instructions inside answers between @@ ... @@.
// These tell the bot HOW to vary/adapt an answer; the visitor must never see
// them. This helper is dependency-free so both server and client can use it.

const INSTRUCTION_REGEX = /@@[\s\S]*?@@/g;

// Remove every @@ ... @@ instruction from text shown to a visitor and tidy the
// leftover whitespace.
export function stripBotInstructions(text: string | null | undefined) {
  if (!text) return "";
  return text
    .replace(INSTRUCTION_REGEX, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Pull out the instruction texts (without the @@ markers) — useful if the bot
// needs them listed separately.
export function extractBotInstructions(text: string | null | undefined) {
  if (!text) return [];
  return (text.match(INSTRUCTION_REGEX) || [])
    .map((match) => match.slice(2, -2).trim())
    .filter(Boolean);
}
