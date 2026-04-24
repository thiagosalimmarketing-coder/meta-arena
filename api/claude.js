export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { system, user, max_tokens = 1000 } = req.body || {};
  if (!user) return res.status(400).json({ error: "Missing user message" });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: user }]
      })
    });
    const data = await r.json();
    if (data.error) return res.status(400).json(data);
    return res.status(200).json({ text: data.content?.[0]?.text || "" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
