import { describe, it, expect } from "vitest";
import { assign, swap, pointsByKid } from "../src/rotation";
import { kids, chores } from "./fixtures";

const MAYA = 2, JAKE = 3;

describe("swap", () => {
  it("jake hands maya the table, maya gives back a 1-pointer, totals stay 8/8", () => {
    const r = swap(assign(chores, kids), chores, JAKE, MAYA, 6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.assignments.find((a) => a.choreId === 6)!.kidId).toBe(MAYA);
    expect(r.givenBackChoreId).toBe(5); // trash: 1 pt, lowest sort
    const pts = pointsByKid(r.assignments, chores);
    expect(pts.get(MAYA)).toBe(8);
    expect(pts.get(JAKE)).toBe(8);
  });

  it("skips chores the sibling already finished", () => {
    const start = assign(chores, kids).map((a) => (a.choreId === 5 ? { ...a, done: true } : a));
    const r = swap(start, chores, JAKE, MAYA, 6);
    expect(r.ok && r.givenBackChoreId).toBe(7); // trash is done, so feed the dog
  });

  it("picks the closest points when there is no exact match", () => {
    // maya has laundry 4, vacuum 2, trash 1, dog 1. dishes is 3.
    const r = swap(assign(chores, kids), chores, JAKE, MAYA, 3);
    expect(r.ok && r.givenBackChoreId).toBe(2); // laundry and vacuum both differ by 1, laundry sorts first
  });

  it("moves the chore with nothing back when the sibling is all done", () => {
    const start = assign(chores, kids).map((a) => (a.kidId === MAYA ? { ...a, done: true } : a));
    const r = swap(start, chores, JAKE, MAYA, 6);
    expect(r.ok && r.givenBackChoreId).toBe(null);
  });

  it("rejects a chore you do not own, a finished chore, or a swap with yourself", () => {
    const start = assign(chores, kids);
    expect(swap(start, chores, JAKE, MAYA, 2).ok).toBe(false); // laundry is maya's
    expect(swap(start, chores, JAKE, JAKE, 6).ok).toBe(false);
    const done = start.map((a) => (a.choreId === 6 ? { ...a, done: true } : a));
    expect(swap(done, chores, JAKE, MAYA, 6).ok).toBe(false);
  });

  it("does not mutate the input", () => {
    const start = assign(chores, kids);
    const copy = JSON.parse(JSON.stringify(start));
    swap(start, chores, JAKE, MAYA, 6);
    expect(start).toEqual(copy);
  });
});
