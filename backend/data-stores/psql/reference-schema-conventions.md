# Schema Conventions

[Back to PostgreSQL Data Store](README.md#schema-conventions)

| Topic              | Rule                                           |
| ------------------ | ---------------------------------------------- |
| PostgreSQL version | PostgreSQL 18+                                 |
| IDs                | Use `UUIDv7` or generated integer identities   |
| Timestamps         | Use `TIMESTAMPTZ`, not `TIMESTAMP`             |
| Index names        | Prefix with `idx_`, keep names within 64 bytes |
| Trigger names      | Prefix with `trigger_`                         |
| Function names     | Prefix with `fn_`                              |
| View names         | Prefix with `view_` or `view_embedded_`        |
| Table names        | Use plural snake_case collection names         |
