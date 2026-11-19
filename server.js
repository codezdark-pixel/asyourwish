"use strict";

const http = require("node:http");
const { URL } = require("node:url");

const host = "127.0.0.1";
const port = Number(process.env.PORT || 3000);
const webhookValue = process.env.DISCORD_WEBHOOK_URL;
const bodyLimit = 4096;
const rateLimitWindow = 15 * 60 * 1000;
const rateLimitMax = 5;
const submissionsByIp = new Map();

function getWebhookUrl() {
  if (!webhookValue) return null;

  try {
    const url = new URL(webhookValue);
    if (
      url.protocol !== "https:" ||
      !["discord.com", "discordapp.com"].includes(url.hostname) ||
      !url.pathname.startsWith("/api/webhooks/") ||
      url.username ||
      url.password
    ) {
      return null;
    }

    url.searchParams.set("wait", "true");
    return url;
  } catch {
    return null;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function getClientIp(request) {
  return request.headers["x-forwarded-for"] || request.socket.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  const current = submissionsByIp.get(ip);
  if (!current || now - current.startedAt >= rateLimitWindow) {
    submissionsByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  current.count += 1;
  return current.count > rateLimitMax;
}

setInterval(() => {
  const cutoff = Date.now() - rateLimitWindow;
  for (const [ip, entry] of submissionsByIp) {
    if (entry.startedAt < cutoff) submissionsByIp.delete(ip);
  }
}, rateLimitWindow).unref();

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/api/notify") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(response, 415, { error: "Please submit the form using the website." });
    return;
  }

  const declaredLength = Number(request.headers["content-length"] || 0);
  if (declaredLength > bodyLimit) {
    sendJson(response, 413, { error: "Submission is too large." });
    request.resume();
    return;
  }

  const clientIp = getClientIp(request);
  if (!submissionsByIp.has(clientIp) && submissionsByIp.size >= 10000) {
    sendJson(response, 503, { error: "Notifications are temporarily busy. Please try again later." });
    return;
  }
  if (isRateLimited(clientIp)) {
    sendJson(response, 429, { error: "Too many attempts. Please try again later." });
    return;
  }

  let rawBody = "";
  try {
    for await (const chunk of request) {
      rawBody += chunk;
      if (Buffer.byteLength(rawBody) > bodyLimit) {
        sendJson(response, 413, { error: "Submission is too large." });
        return;
      }
    }
  } catch {
    sendJson(response, 400, { error: "Couldn't read the submission. Please try again." });
    return;
  }

  let submission;
  try {
    submission = JSON.parse(rawBody);
  } catch {
    sendJson(response, 400, { error: "Please enter a valid email address." });
    return;
  }

  if (!submission || typeof submission !== "object" || Array.isArray(submission)) {
    sendJson(response, 400, { error: "Please enter a valid email address." });
    return;
  }

  if (typeof submission.website === "string" && submission.website.trim()) {
    sendJson(response, 400, { error: "Please leave the extra field empty." });
    return;
  }

  if (
    typeof submission.email !== "string" ||
    submission.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email.trim())
  ) {
    sendJson(response, 400, { error: "Please enter a valid email address." });
    return;
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    sendJson(response, 503, { error: "Email notifications are temporarily unavailable. Please try again later." });
    return;
  }

  const email = submission.email.trim();
  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "Universal launch notification request",
          color: 0x9b87f5,
          fields: [{ name: "Email address", value: email }],
          footer: { text: "Sent from the Notify me form on universalbot.in" },
          timestamp: new Date().toISOString()
        }]
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!webhookResponse.ok) {
      sendJson(response, 502, { error: "Couldn't send your notification request. Please try again later." });
      return;
    }
  } catch {
    sendJson(response, 502, { error: "Couldn't send your notification request. Please try again later." });
    return;
  }

  sendJson(response, 200, { ok: true });
});

server.requestTimeout = 10000;
server.headersTimeout = 10000;

server.listen(port, host, () => {
  console.log(`Notification endpoint listening on ${host}:${port}`);
});

server.on("error", (error) => {
  console.error("Signup endpoint failed to start:", error.message);
  process.exitCode = 1;
});
