// fair rotation + fair swaps. pure functions, no I/O, easy to test.

export interface Kid { id: number; name: string; lastWeekPoints: number }
export interface Chore { id: number; name: string; points: number; sort: number }
export interface Assignment { choreId: number; kidId: number; done: boolean }

/** hardest chores first, each to the kid with the fewest points.
 *  ties go to whoever did less last week, then lowest id. */
export function assign(chores: Chore[], kids: Kid[]): Assignment[] {
  if (kids.length === 0) return [];
  const totals = new Map(kids.map((k) => [k.id, 0]));
  const ordered = [...chores].sort((a, b) => b.points - a.points || a.sort - b.sort);
  return ordered.map((chore) => {
    const kid = [...kids].sort(
      (a, b) =>
        totals.get(a.id)! - totals.get(b.id)! ||
        a.lastWeekPoints - b.lastWeekPoints ||
        a.id - b.id,
    )[0];
    totals.set(kid.id, totals.get(kid.id)! + chore.points);
    return { choreId: chore.id, kidId: kid.id, done: false };
  });
}

export function pointsByKid(assignments: Assignment[], chores: Chore[]): Map<number, number> {
  const pts = new Map(chores.map((c) => [c.id, c.points]));
  const out = new Map<number, number>();
  for (const a of assignments) out.set(a.kidId, (out.get(a.kidId) ?? 0) + (pts.get(a.choreId) ?? 0));
  return out;
}

export type SwapResult =
  | { ok: true; assignments: Assignment[]; movedChoreId: number; givenBackChoreId: number | null }
  | { ok: false; reason: string };

/** fromKid hands choreId to toKid. toKid gives back their unfinished chore
 *  closest in points, so totals stay even. */
export function swap(
  assignments: Assignment[],
  chores: Chore[],
  fromKidId: number,
  toKidId: number,
  choreId: number,
): SwapResult {
  if (fromKidId === toKidId) return { ok: false, reason: "same kid" };
  const byId = new Map(chores.map((c) => [c.id, c]));
  const target = assignments.find((a) => a.choreId === choreId);
  if (!target || target.kidId !== fromKidId) return { ok: false, reason: "not your chore" };
  if (target.done) return { ok: false, reason: "already done" };
  const points = byId.get(choreId)!.points;

  const candidates = assignments
    .filter((a) => a.kidId === toKidId && !a.done)
    .sort((a, b) => {
      const ca = byId.get(a.choreId)!, cb = byId.get(b.choreId)!;
      return Math.abs(ca.points - points) - Math.abs(cb.points - points) || ca.sort - cb.sort;
    });
  const giveBack = candidates[0] ?? null;

  const next = assignments.map((a) => {
    if (a.choreId === choreId) return { ...a, kidId: toKidId };
    if (giveBack && a.choreId === giveBack.choreId) return { ...a, kidId: fromKidId };
    return { ...a };
  });
  return { ok: true, assignments: next, movedChoreId: choreId, givenBackChoreId: giveBack?.choreId ?? null };
}

// ---------- bids: trade a chore for money ----------

export interface Bid { choreId: number; fromKid: number; toKid: number; kind: "do" | "pay"; cents: number; status: string }

/** "do": the bidder does the other kid's chore and gets paid. "pay": the bidder pays the other kid to do theirs. */
export function bidParties(b: Pick<Bid, "fromKid" | "toKid" | "kind">): { doer: number; payer: number } {
  return b.kind === "do" ? { doer: b.fromKid, payer: b.toKid } : { doer: b.toKid, payer: b.fromKid };
}

/** why a bid can't go through, or null if it can. the payer must own the chore and it must be unfinished. */
export function bidProblem(assignments: Assignment[], b: Pick<Bid, "choreId" | "fromKid" | "toKid" | "kind">): string | null {
  if (b.fromKid === b.toKid) return "same kid";
  const a = assignments.find((x) => x.choreId === b.choreId);
  if (!a) return "no such chore";
  if (a.done) return "already done";
  if (a.kidId !== bidParties(b).payer) return "wrong owner";
  return null;
}

/** settle an accepted bid: the chore (and its points) moves to whoever does the work. */
export function settleBid(assignments: Assignment[], b: Bid): Assignment[] {
  const { doer } = bidParties(b);
  return assignments.map((a) => (a.choreId === b.choreId ? { ...a, kidId: doer } : { ...a }));
}

/** cents earned and paid per kid, from accepted bids only. */
export function earnings(bids: Bid[]): Map<number, { earned: number; paid: number }> {
  const out = new Map<number, { earned: number; paid: number }>();
  const get = (id: number) => out.get(id) ?? (out.set(id, { earned: 0, paid: 0 }), out.get(id)!);
  for (const b of bids) {
    if (b.status !== "accepted") continue;
    const { doer, payer } = bidParties(b);
    get(doer).earned += b.cents;
    get(payer).paid += b.cents;
  }
  return out;
}
