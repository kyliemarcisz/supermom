import { describe, it, expect } from "vitest";
import { assign, bidParties, bidProblem, settleBid, earnings, pointsByKid, type Bid } from "../src/rotation";
import { keywordInterpret, parsePrice, type Ctx } from "../src/claude";
import { kids, chores } from "./fixtures";

const MAYA = 2, JAKE = 3;
const DISHES = 3, TRASH = 5, BATHROOM = 1;

describe("bid rules", () => {
  const week = assign(chores, kids); // jake: bathroom, dishes, table. maya: laundry, vacuum, trash, dog

  it("'do' bid: maya does jake's dishes, jake pays", () => {
    const b: Bid = { choreId: DISHES, fromKid: MAYA, toKid: JAKE, kind: "do", cents: 300, status: "open" };
    expect(bidParties(b)).toEqual({ doer: MAYA, payer: JAKE });
    expect(bidProblem(week, b)).toBeNull();
    const after = settleBid(week, b);
    expect(after.find((a) => a.choreId === DISHES)!.kidId).toBe(MAYA);
    const pts = pointsByKid(after, chores);
    expect(pts.get(MAYA)).toBe(11); // points follow the work
    expect(pts.get(JAKE)).toBe(5);
  });

  it("'pay' bid: jake pays maya to do his bathroom", () => {
    const b: Bid = { choreId: BATHROOM, fromKid: JAKE, toKid: MAYA, kind: "pay", cents: 400, status: "open" };
    expect(bidParties(b)).toEqual({ doer: MAYA, payer: JAKE });
    expect(bidProblem(week, b)).toBeNull();
  });

  it("rejects bids on the wrong kid's chore, finished chores, or yourself", () => {
    expect(bidProblem(week, { choreId: TRASH, fromKid: MAYA, toKid: JAKE, kind: "do" })).toBe("wrong owner"); // trash is maya's already
    expect(bidProblem(week, { choreId: TRASH, fromKid: JAKE, toKid: MAYA, kind: "pay" })).toBe("wrong owner"); // jake can't pay for maya's chore
    const done = week.map((a) => (a.choreId === DISHES ? { ...a, done: true } : a));
    expect(bidProblem(done, { choreId: DISHES, fromKid: MAYA, toKid: JAKE, kind: "do" })).toBe("already done");
    expect(bidProblem(week, { choreId: DISHES, fromKid: JAKE, toKid: JAKE, kind: "do" })).toBe("same kid");
  });

  it("totals earnings from accepted bids only", () => {
    const m = earnings([
      { choreId: DISHES, fromKid: MAYA, toKid: JAKE, kind: "do", cents: 300, status: "accepted" },
      { choreId: BATHROOM, fromKid: JAKE, toKid: MAYA, kind: "pay", cents: 400, status: "accepted" },
      { choreId: 6, fromKid: MAYA, toKid: JAKE, kind: "do", cents: 999, status: "open" },
    ]);
    expect(m.get(MAYA)).toEqual({ earned: 700, paid: 0 });
    expect(m.get(JAKE)).toEqual({ earned: 0, paid: 700 });
  });
});

describe("reading bid texts", () => {
  const week = [
    { name: "Clean bathroom", points: 4, done: false, owner: "Jake" },
    { name: "Dishes", points: 3, done: false, owner: "Jake" },
    { name: "Laundry", points: 4, done: false, owner: "Maya" },
    { name: "Take out trash", points: 1, done: false, owner: "Maya" },
  ];
  const ctx = (kid: string, text: string, openBid: Ctx["openBid"] = null): Ctx => ({
    kid, siblings: [kid === "Maya" ? "Jake" : "Maya"], chores: week, swapPreview: [], text, openBid,
  });

  it("parses prices", () => {
    expect(parsePrice("i'll do it for $3")).toBe(3);
    expect(parsePrice("2.50 dollars")).toBe(2.5);
    expect(parsePrice("5 bucks")).toBe(5);
    expect(parsePrice("i have practice at 5")).toBeNull();
  });

  it("an offer to do a sibling's chore beats the swap rule", () => {
    expect(keywordInterpret(ctx("Maya", "i'll do jake's dishes for $3"))).toMatchObject({ intent: "offer", offer: "do", chore: "Dishes", to: "Jake", price: 3 });
  });

  it("an offer to pay", () => {
    expect(keywordInterpret(ctx("Jake", "i'll pay maya $4 to do my bathroom"))).toMatchObject({ intent: "offer", offer: "pay", chore: "Clean bathroom", price: 4 });
  });

  it("deal / no thanks only count when an offer is waiting", () => {
    const open = { from: "Maya", chore: "Dishes", kind: "do" as const, price: 3 };
    expect(keywordInterpret(ctx("Jake", "deal!", open)).intent).toBe("accept");
    expect(keywordInterpret(ctx("Jake", "no thanks", open)).intent).toBe("decline");
    expect(keywordInterpret(ctx("Jake", "deal!")).intent).not.toBe("accept");
  });
});
