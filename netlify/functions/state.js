// State function using Upstash Redis (free tier, simple HTTP API)
// Set these env vars in Netlify: UPSTASH_URL and UPSTASH_TOKEN

const KEY = "pga26_state";

async function redisGet(url, token) {
  const r = await fetch(`${url}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : {};
}

async function redisSet(url, token, data) {
  const r = await fetch(`${url}/set/${KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(data))
  });
  return r.ok;
}

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });

  const url = process.env.UPSTASH_URL;
  const token = process.env.UPSTASH_TOKEN;

  if (!url || !token) {
    return new Response(JSON.stringify({ error: "Missing UPSTASH_URL or UPSTASH_TOKEN env vars" }), { status: 500, headers: cors });
  }

  if (req.method === "GET") {
    try {
      const data = await redisGet(url, token);
      return new Response(JSON.stringify(data), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body._reset) {
        await redisSet(url, token, {});
        return new Response("{}", { status: 200, headers: cors });
      }
      const current = await redisGet(url, token);
      const updated = { ...current, ...body };
      await redisSet(url, token, updated);
      return new Response(JSON.stringify(updated), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
};

export const config = { path: "/api/state" };
