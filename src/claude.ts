// reads a kid's text: claude when ANTHROPIC_API_KEY is set, keyword rules otherwise.

export type Intent = "done" | "swap" | "excuse" | "question" | "offer" | "accept" | "decline";
export type OfferKind = "do" | "pay";
export interface Interpretation {
  intent: Intent;
  chore: string | null;
  to: string | null;
  reply: string;
  price?: number | null; // dollars, for offers
  offer?: OfferKind | null; // "do": i'll do your chore for $x. "pay": i'll pay $x if you do mine.
}
export interface OpenBid { from: string; chore: string; kind: OfferKind; price: number }

export interface ChoreInfo { name: string; points: number; done: boolean; owner: string }
export interface Ctx {
  kid: string;
  siblings: string[];
  chores: ChoreInfo[]; // everyone's chores this week
  swapPreview: { chore: string; to: string; giveBack: string | null }[];
  openBid?: OpenBid | null; // latest open offer waiting on this kid's "deal"
  text: string;
}

const INTENTS: Intent[] = ["done", "swap", "excuse", "question", "offer", "accept", "decline"];

// ---------- reply copy (shared by fallback + server corrections) ----------

const lc = (s: string) => s.toLowerCase();
export const shortName = (chore: string) => lc(chore).split(" ").pop()!;
const OBJECT: Record<string, string> = { vacuum: "the vacuuming", dog: "dog duty" };
/** "dishes" -> "the dishes", for "can jake do the dishes?" */
export const choreObject = (chore: string) => OBJECT[shortName(chore)] ?? `the ${shortName(chore)}`;
export const money = (dollars: number) => `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
/** "$3", "3 dollars", "3 bucks" -> 3 */
export function parsePrice(text: string): number | null {
  const m = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/) ?? text.match(/\b(\d+(?:\.\d{1,2})?)\s?(?:dollars?|bucks?)\b/i);
  const n = m ? Number(m[1]) : NaN;
  return n > 0 && n <= 100 ? n : null;
}
const list = (names: string[]) => {
  const n = names.map(lc);
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
};

export const T = {
  assign: (kid: string, chores: string[], pts: number) =>
    `hi ${lc(kid)}! this week you've got ${list(chores)} (${pts} pts). text me "done with ..." when you finish ✨`,
  done: (kid: string, chore: string, left: string[]) =>
    left.length
      ? `nice work, ${lc(kid)}! ${lc(chore)} is checked off. still on your list: ${list(left)}.`
      : `nice work, ${lc(kid)}! ${lc(chore)} was your last one. you're all done this week 🎉`,
  which: (kid: string, left: string[]) =>
    left.length ? `love that, ${lc(kid)}! which one did you finish? you've got ${list(left)}.` : `you're already all done this week, ${lc(kid)}!`,
  already: (chore: string) => `${lc(chore)} is already checked off. you're on it!`,
  swap: (to: string, chore: string, back: string | null) =>
    back
      ? `done! ${lc(to)} has ${lc(chore)} now and you've got ${lc(back)} instead. same points, fair & square.`
      : `done! ${lc(to)} has ${lc(chore)} now. thanks for asking.`,
  swapFail: (sib: string, left: string[]) =>
    left.length
      ? `hmm, i couldn't swap that one. try "can ${lc(sib)} do ${choreObject(left[0])}?" with one of yours: ${list(left)}.`
      : `you're all done this week, nothing left to swap!`,
  headsUp: (sib: string, from: string, chore: string, back: string | null) =>
    back
      ? `heads up ${lc(sib)}: ${lc(from)} passed you ${lc(chore)}, and ${lc(back)} moved to ${lc(from)}. your points stay the same 💛`
      : `heads up ${lc(sib)}: ${lc(from)} handed you ${lc(chore)} this week.`,
  excuse: (kid: string, sib: string | undefined, chore: string | undefined) =>
    sib && chore
      ? `no stress, ${lc(kid)}. if tonight is tough, text "can ${lc(sib)} do ${choreObject(chore)}?" and i'll set up a fair swap.`
      : `no stress, ${lc(kid)}. thanks for telling me. do what you can when you can 💛`,
  question: (kid: string, left: string[]) =>
    left.length ? `you've got ${list(left)} left this week. text me "done with ..." when you finish!` : `you're all done this week, ${lc(kid)}! enjoy 🌿`,
  // ---- bids ----
  bidAsk: (to: string, from: string, kind: OfferKind, chore: string, price: number) =>
    kind === "do"
      ? `${lc(from)} offers to do your ${lc(chore)} for ${money(price)}. reply "deal" or "no thanks".`
      : `${lc(from)} will pay you ${money(price)} to do their ${lc(chore)}. reply "deal" or "no thanks".`,
  bidSent: (to: string) => `offer sent! i'll tell you when ${lc(to)} answers.`,
  bidBad: (kind: OfferKind, sib: string) =>
    kind === "do"
      ? `which of ${lc(sib)}'s chores? try "i'll do ${lc(sib)}'s dishes for $3".`
      : `which of your chores? try "i'll pay ${lc(sib)} $2 to do my trash".`,
  bidDeal: (doer: string, chore: string, price: number, payer: string) =>
    `deal! ${lc(doer)} does ${lc(chore)} and ${lc(payer)} pays ${money(price)}. the points go to whoever does the work 🤝`,
  bidNoted: (from: string) => `no worries, i'll let ${lc(from)} know.`,
  bidDeclined: (who: string, chore: string) => `${lc(who)} passed on the ${lc(chore)} offer. maybe try a different price?`,
  noBid: () => `there's no offer waiting for you right now.`,
  notAssigned: () => `chores aren't out yet this week. i'll text you as soon as they are!`,
};

/** warm, short, no em/en dashes. */
export function cleanReply(s: string): string {
  let out = s.replace(/\s*[—–]\s*/g, ", ").replace(/\s+/g, " ").trim();
  const words = out.split(" ");
  if (words.length > 35) out = words.slice(0, 35).join(" ").replace(/[,;:]$/, "") + ".";
  return out;
}

// ---------- keyword fallback ----------

const SYNONYMS: Record<string, string[]> = {
  dishes: ["dish", "dishes", "plates"],
  laundry: ["laundry", "clothes", "washing"],
  bathroom: ["bathroom", "toilet", "bath", "shower"],
  vacuum: ["vacuum", "vacuuming", "hoover"],
  trash: ["trash", "garbage", "bins", "rubbish"],
  table: ["table"],
  dog: ["dog", "feed", "fed", "puppy"],
};

export function findChore(text: string, names: string[]): string | null {
  const t = lc(text);
  for (const name of names) {
    const words = SYNONYMS[shortName(name)] ?? [shortName(name)];
    if (t.includes(lc(name)) || words.some((w) => new RegExp(`\\b${w}\\b`).test(t))) return name;
  }
  return null;
}

export function keywordInterpret(ctx: Ctx): Interpretation {
  const t = lc(ctx.text);
  const mine = ctx.chores.filter((c) => lc(c.owner) === lc(ctx.kid));
  const left = mine.filter((c) => !c.done).map((c) => c.name);
  const sib = ctx.siblings.find((s) => new RegExp(`\\b${lc(s)}\\b`).test(t)) ?? null;
  const chore = findChore(t, ctx.chores.map((c) => c.name));

  // bids come first: answering an open offer, then making a new one
  if (ctx.openBid) {
    if (/^\s*(deal|yes|yep|yeah|ok|okay|sure|accept|i accept)\b/.test(t)) return { intent: "accept", chore: ctx.openBid.chore, to: ctx.openBid.from, reply: "" };
    if (/^\s*(no|nope|nah|pass|decline)\b|no thanks/.test(t)) return { intent: "decline", chore: ctx.openBid.chore, to: ctx.openBid.from, reply: T.bidNoted(ctx.openBid.from) };
  }
  const price = parsePrice(t);
  if (price !== null) {
    const kind: OfferKind = /\b(pay|give)\b/.test(t) ? "pay" : "do";
    const to = sib ?? ctx.siblings[0] ?? null;
    return { intent: "offer", chore, to, price, offer: kind, reply: to ? T.bidSent(to) : "" };
  }
  const asksSwap = /\b(swap|trade|switch)\b/.test(t) || (sib !== null && /\b(can|could|would|will|take|do)\b/.test(t));
  if (asksSwap) {
    const to = sib ?? ctx.siblings[0] ?? null;
    const p = ctx.swapPreview.find((s) => s.chore === chore && s.to === to);
    const reply = p ? T.swap(p.to, p.chore, p.giveBack) : T.swapFail(to ?? "your sibling", left);
    return { intent: "swap", chore, to, reply };
  }
  if (/\b(done|finished|did|completed|complete|fed|took)\b|all set/.test(t)) {
    const own = mine.find((c) => c.name === chore);
    const reply = own ? T.done(ctx.kid, own.name, left.filter((n) => n !== own.name)) : T.which(ctx.kid, left);
    return { intent: "done", chore, to: null, reply };
  }
  if (/\b(practice|homework|busy|tired|sick|game|rehearsal|later|tomorrow|exam|test)\b|can'?t|cannot/.test(t)) {
    const target = (chore && left.includes(chore) ? chore : left[0]) ?? undefined;
    return { intent: "excuse", chore, to: null, reply: T.excuse(ctx.kid, ctx.siblings[0], target) };
  }
  return { intent: "question", chore, to: null, reply: T.question(ctx.kid, left) };
}

// ---------- claude ----------

export const SYSTEM = `you are super mom, a warm family chore helper that texts kids so their parent doesn't have to nag.
read one text from a kid and classify it.
- intent "done": they finished a chore.
- intent "swap": they ask a sibling to take one of their chores (this wins even if they also give a reason).
- intent "excuse": they can't do a chore but did not ask for a swap.
- intent "question": anything else.
chore: the exact chore name from the list that the text refers to, or null.
to: for swap, the sibling's exact name, otherwise null.
reply: your text back to the kid. warm, casual, all lowercase, under 35 words, at most one emoji, never use em dashes or en dashes. never nag or guilt.
- done: celebrate and mention what is still on their list.
- swap: use the swap preview to say exactly which chore they get back, and that points stay even.
- excuse: be kind and suggest a fair swap with a sibling.
- question: answer from their chore list.
bids: kids can trade chores for money.
- intent "offer": the text names a price. offer "do" = they will do a sibling's chore for that price. offer "pay" = they will pay a sibling to do one of their own chores. price = the dollar amount as a number. chore = the chore. to = the sibling.
- intent "accept" / "decline": they answer the open offer below with yes/deal or no.
- for offer, accept and decline the server writes the reply, so reply can be short.
for every other intent, price and offer are null.`;

export function buildUserPrompt(ctx: Ctx): string {
  const line = (c: ChoreInfo) => `- ${c.name} (${c.points} pts, ${c.owner}, ${c.done ? "done" : "not done"})`;
  const preview = ctx.swapPreview.length
    ? ctx.swapPreview.map((p) => `- ${p.chore} -> ${p.to}, ${ctx.kid} gets back ${p.giveBack ?? "nothing"}`).join("\n")
    : "- none";
  return [
    `kid: ${ctx.kid}`,
    `siblings: ${ctx.siblings.join(", ") || "none"}`,
    `this week's chores:\n${ctx.chores.map(line).join("\n") || "- not assigned yet"}`,
    `swap preview (if ${ctx.kid} hands a chore to a sibling, the sibling gives back their unfinished chore closest in points):\n${preview}`,
    `open offer waiting on ${ctx.kid}: ${ctx.openBid ? `${ctx.openBid.from} ${ctx.openBid.kind === "do" ? "offers to do" : "will pay to have done"} ${ctx.openBid.chore} for ${money(ctx.openBid.price)}` : "none"}`,
    `text from ${ctx.kid}: ${JSON.stringify(ctx.text)}`,
  ].join("\n\n");
}

const SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: INTENTS },
    chore: { type: ["string", "null"] },
    price: { type: ["number", "null"] },
    offer: { type: ["string", "null"] }, // "do" | "pay", checked in parseClaudeJson
    to: { type: ["string", "null"] },
    reply: { type: "string" },
  },
  required: ["intent", "chore", "to", "reply", "price", "offer"],
  additionalProperties: false,
};

export function parseClaudeJson(text: string): Interpretation | null {
  const raw = text.match(/\{[\s\S]*\}/)?.[0];
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!INTENTS.includes(o.intent) || typeof o.reply !== "string") return null;
    return {
      intent: o.intent,
      chore: typeof o.chore === "string" && o.chore ? o.chore : null,
      to: typeof o.to === "string" && o.to ? o.to : null,
      reply: o.reply,
      price: typeof o.price === "number" && o.price > 0 ? o.price : null,
      offer: o.offer === "do" || o.offer === "pay" ? o.offer : null,
    };
  } catch {
    return null;
  }
}

export async function callClaude(apiKey: string, model: string, ctx: Ctx): Promise<Interpretation | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{ role: "user", content: buildUserPrompt(ctx) }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    console.error("claude error", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (data.stop_reason === "refusal") return null;
  const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return parseClaudeJson(text);
}

export async function interpret(
  env: { ANTHROPIC_API_KEY?: string; CLAUDE_MODEL?: string },
  ctx: Ctx,
): Promise<{ result: Interpretation; source: "claude" | "keywords" }> {
  if (env.ANTHROPIC_API_KEY) {
    try {
      const r = await callClaude(env.ANTHROPIC_API_KEY, env.CLAUDE_MODEL || "claude-haiku-5-5", ctx);
      if (r) return { result: r, source: "claude" };
    } catch (e) {
      console.error("claude failed, using keywords", e);
    }
  }
  return { result: keywordInterpret(ctx), source: "keywords" };
}
