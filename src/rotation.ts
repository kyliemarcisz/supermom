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
