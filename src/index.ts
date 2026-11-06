// phase 1 stub. real routes land in phase 2.
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/api/health") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM chores").first<{ n: number }>();
      return Response.json({ ok: true, chores: row?.n ?? 0 });
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
