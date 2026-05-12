// Single state function — handles GET, POST (full replace), and POST with _join action
// Using Upstash Redis REST API

const KEY = "pga26_state";

async function redisGet(url, token) {
  const r = await fetch(`${url}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) throw new Error(`Redis GET failed: ${r.status}`);
  const j = await r.json();
  return j.result ? JSON.parse(j.result) : {};
}

async function redisSet(url, token, data) {
  const r = await fetch(`${url}/set/${KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(data))
  });
  if (!r.ok) throw new Error(`Redis SET failed: ${r.status}`);
  return true;
}

const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });

  const url  = process.env.UPSTASH_URL;
  const token = process.env.UPSTASH_TOKEN;
  if (!url || !token) {
    return new Response(JSON.stringify({ error: "Missing UPSTASH_URL or UPSTASH_TOKEN" }), { status: 500, headers: cors });
  }

  // GET — return full state
  if (req.method === "GET") {
    try {
      const data = await redisGet(url, token);
      return new Response(JSON.stringify(data), { status: 200, headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
    }
  }

  // POST — two modes:
  //   { _join: "PlayerName" }  → atomically add a player
  //   { _reset: true }         → wipe state
  //   { ...patch }             → merge patch into state
  if (req.method === "POST") {
    try {
      const body = await req.json();

      if (body._reset) {
        await redisSet(url, token, {});
        return new Response("{}", { status: 200, headers: cors });
      }

      // Atomic join — read current state, add player if not already there
      if (body._join) {
        const name = body._join;
        const current = await redisGet(url, token);
        const players = current.players || [];
        const nrm = s => (s||'').toLowerCase().replace(/[^a-z]/g,'');

        if (!players.map(nrm).includes(nrm(name))) {
          players.push(name);
        }

        // First player is always organizer
        const organizer = current.organizer || players[0];
        const updated = {
          ...current,
          players,
          organizer,
          picks: current.picks || [],
          started: current.started || false,
          order: current.order || null,
        };
        await redisSet(url, token, updated);
        return new Response(JSON.stringify(updated), { status: 200, headers: cors });
      }

      // Regular patch merge
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
