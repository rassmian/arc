import { buildPushHTTPRequest } from "@pushforge/builder";

const UPSTREAM = "https://metaforge.app/api/arc-raiders/events-schedule";
const REMINDER_LEAD_MIN = 5;
const VAPID_SUBJECT = "https://rassmian.github.io/arc";
const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com"
];
const MAX_FUTURE_MS = 30 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }


    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/subscribe") {
      return handleSubscribe(request, env);
    }
    if (request.method === "POST" && url.pathname === "/unsubscribe") {
      return handleUnsubscribe(request, env);
    }

    try {
      const upstreamRes = await fetch(UPSTREAM, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ArcEventsProxy/1.0)" }
      });
      const body = await upstreamRes.text();
      return new Response(body, {
        status: upstreamRes.status,
        headers: {
          ...corsHeaders(),
          "Content-Type": upstreamRes.headers.get("Content-Type") || "application/json"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 502,
        headers: corsHeaders()
      });
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAndSendReminders(env));
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=30"
  };
}

function isValidPushEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:") return false;
    return ALLOWED_PUSH_HOSTS.some(host => u.hostname === host || u.hostname.endsWith("." + host));
  } catch (e) {
    return false;
  }
}

function isValidSubscribeBody(data) {
  const { subscription, eventKey, eventName, eventMap, startTimeMs } = data || {};
  if (!subscription || typeof subscription.endpoint !== "string") return false;
  if (!isValidPushEndpoint(subscription.endpoint)) return false;
  if (typeof eventKey !== "string" || eventKey.length === 0 || eventKey.length > 300) return false;
  if (typeof eventName !== "string" || eventName.length > 200) return false;
  if (typeof eventMap !== "string" || eventMap.length > 200) return false;
  if (typeof startTimeMs !== "number" || !isFinite(startTimeMs)) return false;
  const now = Date.now();
  if (startTimeMs <= now || startTimeMs > now + MAX_FUTURE_MS) return false;
  return true;
}

async function hashEndpoint(endpoint) {
  const enc = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}
async function handleSubscribe(request, env) {
  try {
    const data = await request.json();
    if (!isValidSubscribeBody(data)) {
      return new Response(JSON.stringify({ error: "Invalid subscription data" }), {
        status: 400, headers: corsHeaders()
      });
    }
    const { subscription, eventKey, eventName, eventMap, startTimeMs, endTimeMs } = data;
    const subId = await hashEndpoint(subscription.endpoint);
    const key = "reminder:" + eventKey + "::" + subId;
    const record = { subscription, eventName, eventMap, startTimeMs, endTimeMs, createdAt: Date.now() };
    await env.SUBSCRIPTIONS.put(key, JSON.stringify(record));
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders() });
  }
}

async function handleUnsubscribe(request, env) {
  try {
    const data = await request.json();
    const { subscription, eventKey } = data || {};
    if (!subscription || typeof subscription.endpoint !== "string" || typeof eventKey !== "string") {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: corsHeaders()
      });
    }
    const subId = await hashEndpoint(subscription.endpoint);
    const key = "reminder:" + eventKey + "::" + subId;
    await env.SUBSCRIPTIONS.delete(key);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders(), "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders() });
  }
}
async function checkAndSendReminders(env) {
  const now = Date.now();
  const list = await env.SUBSCRIPTIONS.list({ prefix: "reminder:" });

  for (const item of list.keys) {
    const raw = await env.SUBSCRIPTIONS.get(item.name);
    if (!raw) continue;

    let rec;
    try { rec = JSON.parse(raw); } catch (e) {
      await env.SUBSCRIPTIONS.delete(item.name);
      continue;
    }

    if (now >= rec.startTimeMs) {
      await env.SUBSCRIPTIONS.delete(item.name);
      continue;
    }

    const dueAt = rec.startTimeMs - REMINDER_LEAD_MIN * 60000;
    if (now >= dueAt) {
      try {
        await sendPush(rec, env);
      } catch (err) {
        console.log("Push send failed: " + String(err));
      }
      await env.SUBSCRIPTIONS.delete(item.name);
    }
  }
}

async function sendPush(rec, env) {
  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK: JSON.parse(env.VAPID_PRIVATE_KEY),
    subscription: rec.subscription,
    message: {
      payload: {
        title: "ARC Raiders",
        body: rec.eventName + " starting soon — " + rec.eventMap + " · starts in " + REMINDER_LEAD_MIN + " minutes"
      },
      adminContact: VAPID_SUBJECT,
      options: { ttl: 600, urgency: "high" }
    }
  });

  const res = await fetch(endpoint, { method: "POST", headers, body });
  if (res.status === 404 || res.status === 410) {
    return;
  }
  if (!res.ok) {
    throw new Error("Push send failed with status " + res.status);
  }
}
