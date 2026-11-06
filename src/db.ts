// D1 queries. all SQL lives here.

export interface KidRow { id: number; name: string; phone: string | null; role: string; last_week_points: number; sort: number }
export interface ChoreRow { id: number; name: string; points: number; icon: string; sort: number }
export interface AssignmentRow { id: number; chore_id: number; kid_id: number; done: number; done_at: string | null; swapped_from: number | null }
export interface MessageRow { id: number; kid_id: number; direction: "in" | "out"; body: string; intent: string | null; via: string; created_at: string }
export interface ActivityRow { id: number; kind: string; text: string; created_at: string }

export interface Snapshot {
  kids: KidRow[];
  chores: ChoreRow[];
  assignments: AssignmentRow[];
  messages: MessageRow[];
  activity: ActivityRow[];
  reminders: number;
}

export async function load(db: D1Database): Promise<Snapshot> {
  const [kids, chores, assignments, messages, activity, reminders] = await db.batch([
    db.prepare("SELECT * FROM kids WHERE role = 'kid' ORDER BY sort, id"),
    db.prepare("SELECT * FROM chores ORDER BY sort, id"),
    db.prepare("SELECT * FROM assignments ORDER BY id"),
    db.prepare("SELECT * FROM (SELECT * FROM messages ORDER BY id DESC LIMIT 200) ORDER BY id"),
    db.prepare("SELECT * FROM activity ORDER BY id DESC LIMIT 40"),
    db.prepare("SELECT COUNT(*) AS n FROM activity WHERE kind = 'reminder'"),
  ]);
  return {
    kids: kids.results as unknown as KidRow[],
    chores: chores.results as unknown as ChoreRow[],
    assignments: assignments.results as unknown as AssignmentRow[],
    messages: messages.results as unknown as MessageRow[],
    activity: activity.results as unknown as ActivityRow[],
    reminders: Number((reminders.results[0] as { n: number } | undefined)?.n ?? 0),
  };
}

export async function replaceAssignments(db: D1Database, list: { choreId: number; kidId: number }[]) {
  await db.batch([
    db.prepare("DELETE FROM assignments"),
    ...list.map((a) => db.prepare("INSERT INTO assignments (chore_id, kid_id) VALUES (?, ?)").bind(a.choreId, a.kidId)),
  ]);
}

export async function markDone(db: D1Database, choreId: number) {
  await db.prepare("UPDATE assignments SET done = 1, done_at = datetime('now') WHERE chore_id = ?").bind(choreId).run();
}

export async function moveChores(db: D1Database, moves: { choreId: number; kidId: number; swappedFrom: number }[]) {
  await db.batch(
    moves.map((m) =>
      db.prepare("UPDATE assignments SET kid_id = ?, swapped_from = ? WHERE chore_id = ?").bind(m.kidId, m.swappedFrom, m.choreId),
    ),
  );
}

export async function addMessage(db: D1Database, kidId: number, direction: "in" | "out", body: string, intent: string | null, via: string) {
  await db
    .prepare("INSERT INTO messages (kid_id, direction, body, intent, via) VALUES (?, ?, ?, ?, ?)")
    .bind(kidId, direction, body, intent, via)
    .run();
}

export async function addActivity(db: D1Database, kind: string, text: string) {
  await db.prepare("INSERT INTO activity (kind, text) VALUES (?, ?)").bind(kind, text).run();
}

export async function reset(db: D1Database) {
  await db.batch([db.prepare("DELETE FROM assignments"), db.prepare("DELETE FROM messages"), db.prepare("DELETE FROM activity")]);
}
