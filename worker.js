const UPSTREAM = "https://metaforge.app/api/arc-raiders/events-schedule";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      const upstreamRes = await fetch(UPSTREAM, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ArcEventsProxy/1.0)"
        }
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
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=30"
  };
}
