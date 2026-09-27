# PostgreSQL 18 Features

[Back to PostgreSQL Data Store](README.md#postgresql-18-features)

- Use `RETURNING WITH (OLD AS old, NEW AS new)` for update flows that need both previous and
  current row values for audit or lifecycle decisions. This keeps change capture tied to the row
  the database actually updated instead of a separately-read application snapshot.
- Use `WITHOUT OVERLAPS` or `PERIOD` constraints only when a table already models validity with
  range or multirange columns. Do not add synthetic range columns just to use temporal syntax; use
  ordinary timestamp checks and partial indexes for current-state lifecycles.
