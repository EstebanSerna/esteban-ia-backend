// Proxy de chat con Claude: recibe el mensaje del simulador de la web y
// responde con Claude real, sin exponer nunca la API key al navegador.
export async function callClaude({ userText, systemPrompt, history }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const rawHistory = Array.isArray(history) ? history.slice(-16) : [];
  const messages = rawHistory
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1000) }))
    .concat([{ role: "user", content: String(userText).slice(0, 1000) }]);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: String(systemPrompt).slice(0, 4000),
      messages
    })
  });

  const result = await response.json();
  if (result.content && result.content[0] && result.content[0].text) {
    return result.content[0].text;
  }
  throw new Error((result.error && result.error.message) || "Respuesta inesperada de Claude");
}
