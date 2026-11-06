import { describe, it, expect } from "vitest";
import { keywordInterpret, cleanReply, parseClaudeJson, findChore, type Ctx } from "../src/claude";

// the seed week after "assign & text kids"
const chores = [
  { name: "Clean bathroom", points: 4, done: false, owner: "Jake" },
  { name: "Laundry", points: 4, done: false, owner: "Maya" },
  { name: "Dishes", points: 3, done: false, owner: "Jake" },
  { name: "Vacuum", points: 2, done: false, owner: "Maya" },
  { name: "Take out trash", points: 1, done: false, owner: "Maya" },
  { name: "Set the table", points: 1, done: false, owner: "Jake" },
  { name: "Feed the dog", points: 1, done: false, owner: "Maya" },
];
const maya = (text: string): Ctx => ({ kid: "Maya", siblings: ["Jake"], chores, swapPreview: [], text });
const jake = (text: string): Ctx => ({
  kid: "Jake",
  siblings: ["Maya"],
  chores,
  swapPreview: [
    { chore: "Clean bathroom", to: "Maya", giveBack: "Laundry" },
    { chore: "Dishes", to: "Maya", giveBack: "Laundry" },
    { chore: "Set the table", to: "Maya", giveBack: "Take out trash" },
  ],
  text,
});
const words = (s: string) => s.split(/\s+/).length;

describe("keyword fallback", () => {
  it("done with laundry", () => {
    const r = keywordInterpret(maya("done with laundry"));
    expect(r).toMatchObject({ intent: "done", chore: "Laundry" });
    expect(r.reply).toContain("vacuum");
  });

  it("swap wins over the excuse in the demo line", () => {
    const r = keywordInterpret(jake("can maya do the table tonight? i have practice"));
    expect(r).toMatchObject({ intent: "swap", chore: "Set the table", to: "Maya" });
    expect(r.reply).toContain("take out trash");
  });

  it("excuse", () => {
    const r = keywordInterpret(maya("i have practice tonight"));
    expect(r.intent).toBe("excuse");
    expect(r.reply).toContain("jake");
  });

  it("question", () => {
    expect(keywordInterpret(jake("what do i have this week?")).intent).toBe("question");
  });

  it("understands other ways of saying done", () => {
    expect(keywordInterpret(jake("finished the dishes!!"))).toMatchObject({ intent: "done", chore: "Dishes" });
    expect(keywordInterpret(maya("fed the dog"))).toMatchObject({ intent: "done", chore: "Feed the dog" });
    expect(keywordInterpret(maya("took out the garbage"))).toMatchObject({ intent: "done", chore: "Take out trash" });
  });

  it("asks which chore when it can't tell", () => {
    const r = keywordInterpret(maya("done!"));
    expect(r).toMatchObject({ intent: "done", chore: null });
    expect(r.reply).toContain("which one");
  });

  it("every reply is short and has no em dashes", () => {
    for (const t of ["done with laundry", "can maya do the table?", "i have practice", "huh?", "done!"]) {
      const r = keywordInterpret(t.includes("maya") ? jake(t) : maya(t));
      expect(words(r.reply)).toBeLessThan(35);
      expect(r.reply).not.toMatch(/[—–]/);
    }
  });
});

describe("helpers", () => {
  it("cleanReply strips dashes and caps at 35 words", () => {
    expect(cleanReply("nice — great job")).toBe("nice, great job");
    expect(words(cleanReply(Array(50).fill("yay").join(" ")))).toBe(35);
  });

  it("parseClaudeJson accepts valid json and rejects junk", () => {
    expect(parseClaudeJson('{"intent":"done","chore":"Laundry","to":null,"reply":"yay"}')).toMatchObject({ intent: "done", chore: "Laundry" });
    expect(parseClaudeJson('here you go: {"intent":"swap","chore":"Dishes","to":"Maya","reply":"ok"}')?.to).toBe("Maya");
    expect(parseClaudeJson('{"intent":"dance","reply":"x"}')).toBeNull();
    expect(parseClaudeJson("not json")).toBeNull();
  });

  it("findChore does not match 'do' as dog", () => {
    expect(findChore("can you do it", chores.map((c) => c.name))).toBeNull();
  });
});
