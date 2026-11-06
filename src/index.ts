// router + the glue between rotation, claude, sms and d1.
import { assign, swap, pointsByKid, bidParties, bidProblem, earnings, type Assignment, type Bid, type Chore, type Kid } from "./rotation";
import { interpret, cleanReply, findChore, money, parsePrice, T, type Ctx } from "./claude";
import * as db from "./db";
import { kidPhone, samePhone, sendSms, smsConfigured, twiml, validTwilioSignature } from "./sms";
import type { AppEnv } from "./env";

// illustrative "before super mom" week (see README)
const BASELINE = { points: { Maya: 11, Jake: 5 }, reminders: 14, done: 9, total: 16 };

const json = (data: unknown, status = 200) => Response.json(data, { status });

export default {
  async fetch(req: Request, env: AppEnv): Promise<Response> {
    const { pathname: p } = new URL(req.url);
    const m = req.method;
    try {
      if (p === "/api/state" && m === "GET") return json(await state(env));
      if (p === "/api/assign" && m === "POST") return json(await doAssign(env));
      if (p === "/api/reset" && m === "POST") {
        await db.reset(env.DB);
        return json({ ok: true });
      }
      if (p === "/api/message" && m === "POST") {
        const body = (await req.json().catch(() => ({}))) as { kid?: string | number; text?: string };
        if (!body.kid || !body.text?.trim()) return json({ error: "kid and text are required" }, 400);
        const out = await handleInbound(env, (k) => String(k.id) === String(body.kid) || k.name.toLowerCase() === String(body.kid).toLowerCase(), body.text.trim(), "sim");
        return out ? json(out) : json({ error: "unknown kid" }, 404);
      }
      if (p === "/sms" && m === "POST") return inboundSms(req, env);
      if (p.startsWith("/api/")) return json({ error: "not found" }, 404);
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: String(e) }, 500);
    }
  },
} satisfies ExportedHandler<AppEnv>;

// ---------- helpers ----------

const toKids = (s: db.Snapshot): Kid[] => s.kids.map((k) => ({ id: k.id, name: k.name, lastWeekPoints: k.last_week_points }));
const toChores = (s: db.Snapshot): Chore[] => s.chores.map((c) => ({ id: c.id, name: c.name, points: c.points, sort: c.sort }));
const toBids = (s: db.Snapshot): Bid[] => s.bids.map((b) => ({ choreId: b.chore_id, fromKid: b.from_kid, toKid: b.to_kid, kind: b.kind, cents: b.cents, status: b.status }));
const toAssignments = (s: db.Snapshot): Assignment[] => s.assignments.map((a) => ({ choreId: a.chore_id, kidId: a.kid_id, done: !!a.done }));

/** record an outgoing text, and send it for real when twilio is live. */
async function deliver(env: AppEnv, kid: db.KidRow, body: string, intent: string | null) {
  const phone = kidPhone(env, kid);
  const live = smsConfigured(env) && !!phone && (await sendSms(env, phone!, body));
  await db.addMessage(env.DB, kid.id, "out", body, intent, live ? "sms" : "sim");
}

// ---------- state ----------

async function state(env: AppEnv) {
  const s = await db.load(env.DB);
  const chores = toChores(s);
  const as = toAssignments(s);
  const pts = pointsByKid(as, chores);
  const choreById = new Map(s.chores.map((c) => [c.id, c]));
  const total = chores.reduce((n, c) => n + c.points, 0);

  const kids = s.kids.map((k) => {
    const mine = s.assignments.filter((a) => a.kid_id === k.id);
    return {
      id: k.id,
      name: k.name,
      points: pts.get(k.id) ?? 0,
      donePoints: mine.filter((a) => a.done).reduce((n, a) => n + (choreById.get(a.chore_id)?.points ?? 0), 0),
      done: mine.filter((a) => a.done).length,
      count: mine.length,
    };
  });
  const money = earnings(toBids(s));
  for (const k of kids) Object.assign(k, { earnedCents: money.get(k.id)?.earned ?? 0, paidCents: money.get(k.id)?.paid ?? 0 });
  const kidName = new Map(s.kids.map((k) => [k.id, k.name]));
  const bids = s.bids.map((b) => ({
    id: b.id,
    chore: choreById.get(b.chore_id)?.name ?? "",
    from: kidName.get(b.from_kid) ?? "",
    to: kidName.get(b.to_kid) ?? "",
    toKid: b.to_kid,
    kind: b.kind,
    price: b.cents / 100,
    status: b.status,
  }));
  const vals = kids.map((k) => k.points);
  const assigned = s.assignments.length > 0;

  return {
    mode: { claude: !!env.ANTHROPIC_API_KEY, sms: smsConfigured(env) },
    assigned,
    kids,
    chores: s.chores.map((c) => {
      const a = s.assignments.find((x) => x.chore_id === c.id);
      return { id: c.id, name: c.name, points: c.points, icon: c.icon, kidId: a?.kid_id ?? null, done: !!a?.done, swappedFrom: a?.swapped_from ?? null };
    }),
    bids,
    messages: s.messages,
    activity: s.activity,
    stats: {
      total,
      gapPct: assigned && vals.length > 1 ? Math.round(((Math.max(...vals) - Math.min(...vals)) / total) * 100) : 0,
      done: s.assignments.filter((a) => a.done).length,
      count: s.assignments.length,
      reminders: s.reminders,
    },
    baseline: BASELINE,
  };
}

// ---------- assign ----------

async function doAssign(env: AppEnv) {
  const s = await db.load(env.DB);
  const chores = toChores(s);
  const result = assign(chores, toKids(s));
  await db.replaceAssignments(env.DB, result);
  const pts = pointsByKid(result, chores);
  const nameOf = new Map(chores.map((c) => [c.id, c.name]));

  for (const kid of s.kids) {
    const mine = result.filter((a) => a.kidId === kid.id).map((a) => nameOf.get(a.choreId)!);
    if (mine.length) await deliver(env, kid, T.assign(kid.name, mine, pts.get(kid.id) ?? 0), "assign");
  }
  await db.addActivity(env.DB, "assign", `chores sent: ${s.kids.map((k) => `${k.name.toLowerCase()} ${pts.get(k.id) ?? 0} pts`).join(", ")}`);
  return { ok: true };
}

// ---------- twilio webhook ----------

async function inboundSms(req: Request, env: AppEnv): Promise<Response> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  // check twilio's signature whenever we have the auth token to check it with
  if (env.TWILIO_AUTH_TOKEN && !(await validTwilioSignature(env.TWILIO_AUTH_TOKEN, req.url, params, req.headers.get("x-twilio-signature")))) {
    return new Response("bad signature", { status: 403 });
  }
  const from = params.From;
  const text = (params.Body ?? "").trim();
  if (!from || !text) return twiml(null);
  const out = await handleInbound(env, (k) => samePhone(kidPhone(env, k), from), text, "sms");
  return twiml(out ? out.reply : "hi! this number isn't on a super mom family yet.");
}

// ---------- inbound text (simulated phone or twilio) ----------

export async function handleInbound(env: AppEnv, match: (k: db.KidRow) => boolean, text: string, via: "sim" | "sms") {
  const s = await db.load(env.DB);
  const kid = s.kids.find(match);
  if (!kid) return null;
  await db.addMessage(env.DB, kid.id, "in", text, null, via);

  const chores = toChores(s);
  const as = toAssignments(s);
  const byId = new Map(s.chores.map((c) => [c.id, c]));
  const kidName = new Map(s.kids.map((k) => [k.id, k.name]));
  const siblings = s.kids.filter((k) => k.id !== kid.id);
  const mine = as.filter((a) => a.kidId === kid.id);
  const left = () => mine.filter((a) => !a.done).map((a) => byId.get(a.choreId)!.name);

  const openBidRow = [...s.bids].reverse().find((b) => b.status === "open" && b.to_kid === kid.id) ?? null;
  const ctx: Ctx = {
    kid: kid.name,
    siblings: siblings.map((k) => k.name),
    chores: as.map((a) => ({ name: byId.get(a.choreId)!.name, points: byId.get(a.choreId)!.points, done: a.done, owner: kidName.get(a.kidId)! })),
    swapPreview: mine
      .filter((a) => !a.done)
      .flatMap((a) =>
        siblings.map((sib) => {
          const r = swap(as, chores, kid.id, sib.id, a.choreId);
          return { chore: byId.get(a.choreId)!.name, to: sib.name, giveBack: r.ok && r.givenBackChoreId ? byId.get(r.givenBackChoreId)!.name : null };
        }),
      ),
    openBid: openBidRow
      ? { from: kidName.get(openBidRow.from_kid)!, chore: byId.get(openBidRow.chore_id)!.name, kind: openBidRow.kind, price: openBidRow.cents / 100 }
      : null,
    text,
  };

  const { result, source } = await interpret(env, ctx);
  let reply = result.reply;
  // resolve the chore claude/keywords named against real chores
  const choreName = result.chore ? findChore(result.chore, s.chores.map((c) => c.name)) ?? findChore(text, s.chores.map((c) => c.name)) : findChore(text, s.chores.map((c) => c.name));
  const chore = s.chores.find((c) => c.name === choreName);

  if (!as.length) {
    reply = T.notAssigned();
  } else if (result.intent === "done") {
    const a = chore && mine.find((x) => x.choreId === chore.id);
    if (a && !a.done) {
      await db.markDone(env.DB, chore!.id);
      a.done = true;
      await db.addActivity(env.DB, "done", `${kid.name.toLowerCase()} finished ${chore!.name.toLowerCase()}`);
      if (source !== "claude") reply = T.done(kid.name, chore!.name, left());
    } else if (a?.done) {
      reply = T.already(chore!.name);
    } else {
      reply = T.which(kid.name, left());
    }
  } else if (result.intent === "swap") {
    const to = siblings.find((k) => k.name.toLowerCase() === result.to?.toLowerCase()) ?? (siblings.length === 1 ? siblings[0] : undefined);
    const r = chore && to ? swap(as, chores, kid.id, to.id, chore.id) : null;
    if (r?.ok && to && chore) {
      const back = r.givenBackChoreId ? byId.get(r.givenBackChoreId)!.name : null;
      await db.moveChores(env.DB, [
        { choreId: chore.id, kidId: to.id, swappedFrom: kid.id },
        ...(r.givenBackChoreId ? [{ choreId: r.givenBackChoreId, kidId: kid.id, swappedFrom: to.id }] : []),
      ]);
      await db.addActivity(env.DB, "swap", `${kid.name.toLowerCase()} swapped ${chore.name.toLowerCase()} with ${to.name.toLowerCase()}${back ? ` for ${back.toLowerCase()}` : ""}`);
      if (source !== "claude" || (back && !reply.toLowerCase().includes(back.toLowerCase().split(" ").pop()!))) reply = T.swap(to.name, chore.name, back);
      await deliver(env, to, cleanReply(T.headsUp(to.name, kid.name, chore.name, back)), "heads-up");
    } else {
      reply = T.swapFail(to?.name ?? siblings[0]?.name ?? "your sibling", left());
    }
  } else if (result.intent === "offer") {
    const to = siblings.find((k) => k.name.toLowerCase() === result.to?.toLowerCase()) ?? (siblings.length === 1 ? siblings[0] : undefined);
    const kind = result.offer ?? (/\b(pay|give)\b/i.test(text) ? "pay" : "do");
    const price = result.price ?? parsePrice(text);
    const bid = to && chore ? { choreId: chore.id, fromKid: kid.id, toKid: to.id, kind } : null;
    if (to && chore && price && bid && !bidProblem(as, bid)) {
      await db.addBid(env.DB, { ...bid, cents: Math.round(price * 100) });
      await db.addActivity(env.DB, "offer", `${kid.name.toLowerCase()} ${kind === "do" ? "offered to do" : "offered to pay for"} ${chore.name.toLowerCase()} for ${money(price)}`);
      await deliver(env, to, cleanReply(T.bidAsk(to.name, kid.name, kind, chore.name, price)), "offer");
      reply = T.bidSent(to.name);
    } else {
      reply = T.bidBad(kind, to?.name ?? siblings[0]?.name ?? "your sibling");
    }
  } else if (result.intent === "accept" || result.intent === "decline") {
    const bidder = openBidRow && s.kids.find((k) => k.id === openBidRow.from_kid);
    const bChore = openBidRow && byId.get(openBidRow.chore_id);
    if (!openBidRow || !bidder || !bChore) {
      reply = T.noBid();
    } else if (result.intent === "decline") {
      await db.resolveBid(env.DB, openBidRow.id, "declined");
      await deliver(env, bidder, cleanReply(T.bidDeclined(kid.name, bChore.name)), "decline");
      reply = T.bidNoted(bidder.name);
    } else {
      const b = { choreId: openBidRow.chore_id, fromKid: openBidRow.from_kid, toKid: openBidRow.to_kid, kind: openBidRow.kind };
      if (bidProblem(as, b)) {
        await db.resolveBid(env.DB, openBidRow.id, "declined");
        reply = `that offer expired, the ${bChore.name.toLowerCase()} already changed hands.`;
      } else {
        const { doer, payer } = bidParties(b);
        await db.resolveBid(env.DB, openBidRow.id, "accepted");
        await db.moveChores(env.DB, [{ choreId: bChore.id, kidId: doer, swappedFrom: payer }]);
        const price = openBidRow.cents / 100;
        const deal = T.bidDeal(kidName.get(doer)!, bChore.name, price, kidName.get(payer)!);
        await db.addActivity(env.DB, "deal", `${kidName.get(doer)!.toLowerCase()} took ${bChore.name.toLowerCase()} for ${money(price)} from ${kidName.get(payer)!.toLowerCase()}`);
        await deliver(env, bidder, cleanReply(deal), "accept");
        reply = deal;
      }
    }
  } else if (result.intent === "excuse") {
    await db.addActivity(env.DB, "excuse", `${kid.name.toLowerCase()}: "${text.slice(0, 60)}"`);
  }

  if (!reply.trim()) reply = T.question(kid.name, left());
  reply = cleanReply(reply);
  await db.addMessage(env.DB, kid.id, "out", reply, result.intent, via);
  return { intent: result.intent, chore: chore?.name ?? null, reply, source };
}
