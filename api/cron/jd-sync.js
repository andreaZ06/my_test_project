const { handleApiRequest } = require("../../backend/voc-core");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  if (expected && authHeader !== expected) {
    res.status(401).json({ ok: false, error: "Unauthorized cron request" });
    return;
  }

  const config = await handleApiRequest({
    method: "GET",
    pathname: "/api/crawl-config",
    body: {},
    query: {},
  });
  if (config.body?.crawlConfig?.autoSyncEnabled === false) {
    res.status(200).json({ ok: true, skipped: true, reason: "autoSyncEnabled is false" });
    return;
  }
  if (!shouldRunNow(config.body?.crawlConfig)) {
    res.status(200).json({ ok: true, skipped: true, reason: "frequency window not reached" });
    return;
  }

  const result = await handleApiRequest({
    method: "POST",
    pathname: "/api/reviews/realtime-sync",
    body: {},
    query: {},
  });

  res.status(result.status || 200).json(result.body);
};

function shouldRunNow(crawlConfig = {}) {
  const frequencyMinutes = Math.max(5, Number(crawlConfig.frequencyMinutes || 1440));
  if (!crawlConfig.lastRunAt) return true;
  const lastRunAt = new Date(crawlConfig.lastRunAt).getTime();
  if (!Number.isFinite(lastRunAt)) return true;
  return Date.now() - lastRunAt >= frequencyMinutes * 60 * 1000;
}
