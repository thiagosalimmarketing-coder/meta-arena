export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const { path, token, ...rest } = req.query;
    if (!path || !token) return res.status(400).json({ error: "Missing path or token" });
    const params = new URLSearchParams({ access_token: token, ...rest });
    const url = `https://graph.facebook.com/v19.0/${path}?${params}`;
    try {
      const r = await fetch(url);
      const data = await r.json();
      if (data.error) return res.status(400).json(data);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const { path, token, ...fields } = body;
    if (!path || !token) return res.status(400).json({ error: "Missing path or token" });
    const params = new URLSearchParams({ access_token: token, ...fields });
    const url = `https://graph.facebook.com/v19.0/${path}`;
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = await r.json();
      if (data.error) return res.status(400).json(data);
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
