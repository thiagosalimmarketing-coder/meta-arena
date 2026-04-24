export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  try {
    const target = decodeURIComponent(url);
    if (!target.startsWith("http")) return res.status(400).json({ error: "Invalid URL" });

    const r = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrackingAuditor/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(10000)
    });

    const html = await r.text();
    return res.status(200).json({ html, status: r.status, url: target });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
