import type { Chore, Kid } from "../src/rotation";
// mirrors migrations/0002_seed.sql
export const kids: Kid[] = [
  { id: 2, name: "Maya", lastWeekPoints: 11 },
  { id: 3, name: "Jake", lastWeekPoints: 5 },
];
export const chores: Chore[] = [
  { id: 1, name: "Clean bathroom", points: 4, sort: 1 },
  { id: 2, name: "Laundry", points: 4, sort: 2 },
  { id: 3, name: "Dishes", points: 3, sort: 3 },
  { id: 4, name: "Vacuum", points: 2, sort: 4 },
  { id: 5, name: "Take out trash", points: 1, sort: 5 },
  { id: 6, name: "Set the table", points: 1, sort: 6 },
  { id: 7, name: "Feed the dog", points: 1, sort: 7 },
];
