-- seed family. edit names, phones and chores here.
-- last_week_points matches the illustrative "before" baseline (maya 11, jake 5).
INSERT INTO kids (id, name, phone, role, last_week_points, sort) VALUES
  (1, 'Parent', NULL, 'parent', 0, 0),
  (2, 'Maya', NULL, 'kid', 11, 1),
  (3, 'Jake', NULL, 'kid', 5, 2);

-- sort breaks ties between chores worth the same points
INSERT INTO chores (id, name, points, icon, sort) VALUES
  (1, 'Clean bathroom', 4, 'spray', 1),
  (2, 'Laundry',        4, 'basket', 2),
  (3, 'Dishes',         3, 'plate', 3),
  (4, 'Vacuum',         2, 'vacuum', 4),
  (5, 'Take out trash', 1, 'trash', 5),
  (6, 'Set the table',  1, 'table', 6),
  (7, 'Feed the dog',   1, 'bowl', 7);
