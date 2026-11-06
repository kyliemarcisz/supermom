import { describe, it, expect } from "vitest";
import { assign, pointsByKid } from "../src/rotation";
import { kids, chores } from "./fixtures";

const owner = (as: ReturnType<typeof assign>, choreId: number) => as.find((a) => a.choreId === choreId)!.kidId;

describe("assign", () => {
  it("splits the seed family 8/8", () => {
    const pts = pointsByKid(assign(chores, kids), chores);
    expect(pts.get(2)).toBe(8);
    expect(pts.get(3)).toBe(8);
  });

  it("gives the demo-script chores to the right kids", () => {
    const as = assign(chores, kids);
    expect(owner(as, 2)).toBe(2); // laundry -> maya
    expect(owner(as, 6)).toBe(3); // table -> jake
    expect(owner(as, 3)).toBe(3); // dishes -> jake
  });

  it("breaks ties toward whoever did less last week", () => {
    expect(owner(assign(chores, kids), 1)).toBe(3); // 0/0 tie, jake did 5 < 11
    const flipped = assign(chores, [
      { ...kids[0], lastWeekPoints: 0 },
      { ...kids[1], lastWeekPoints: 9 },
    ]);
    expect(owner(flipped, 1)).toBe(2);
  });

  it("assigns every chore exactly once", () => {
    const as = assign(chores, kids);
    expect(as.map((a) => a.choreId).sort()).toEqual(chores.map((c) => c.id).sort());
    expect(as.every((a) => !a.done)).toBe(true);
  });

  it("handles one kid and no kids", () => {
    expect(pointsByKid(assign(chores, [kids[0]]), chores).get(2)).toBe(16);
    expect(assign(chores, [])).toEqual([]);
  });

  it("stays within the largest chore for three kids", () => {
    const three = [...kids, { id: 4, name: "Sam", lastWeekPoints: 0 }];
    const vals = [...pointsByKid(assign(chores, three), chores).values()];
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(4);
  });
});
