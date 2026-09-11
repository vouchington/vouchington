# TypeScript Standards reference

[Back to TypeScript Standards](typescript-standards.md)

## Function Naming Prefixes

Backend data-accessing functions must use these prefixes consistently:

| Prefix        | Meaning                           |
| ------------- | --------------------------------- |
| `get*`        | Look up a single row              |
| `search*`     | Query multiple rows               |
| `create*`     | Insert a new row                  |
| `update*`     | Update an existing row            |
| `upsert*`     | Create or update                  |
| `delete*`     | Soft-delete                       |
| `hardDelete*` | Hard-delete (remove row)          |
| `assert*`     | Validate; throw if invalid        |
| `validate*`   | Validate; return truthy/falsey    |
| `sanitize*`   | Return a sanitized copy           |
| `is*`         | Check a condition, return boolean |
| `has*`        | Check a condition, return boolean |

Applies across `backend/services/**` and `backend/api/**`. See [backend/CLAUDE.md](../../../backend/CLAUDE.md).
