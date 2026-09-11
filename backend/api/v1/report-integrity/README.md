# Report Integrity API

Admin-only endpoints for reviewing and acting on suspected mass-report campaigns.

## Endpoints

| Method   | Path                                           | Auth  | Description                                                |
| -------- | ---------------------------------------------- | ----- | ---------------------------------------------------------- |
| `GET`    | `/api/v1/report-integrity/flags`               | admin | List flags (cursor-paginated, `?status=pending\|resolved`) |
| `GET`    | `/api/v1/report-integrity/flags/:id`           | admin | Get a single flag by ID                                    |
| `PATCH`  | `/api/v1/report-integrity/flags/:id`           | admin | Resolve a flag (`{ resolution: "dismissed" }`)             |
| `POST`   | `/api/v1/report-integrity/flags/:id/penalties` | admin | Penalize reporters (resolve flag as `"penalized"`)         |
| `GET`    | `/api/v1/report-integrity/penalties`           | admin | List reporter penalties with scoped cursor pagination      |
| `GET`    | `/api/v1/report-integrity/penalties/:id`       | admin | Get one authoritative reporter penalty for reconciliation  |
| `DELETE` | `/api/v1/report-integrity/penalties/:id`       | admin | Revoke a reporter penalty                                  |

`POST /api/v1/report-integrity/flags/:id/penalties` returns the authoritative updated flag
together with `penalized_user_count` and the created `{ id, user_id }` penalty rows. The flag is
resolved as `"penalized"` in the same transaction as the penalty inserts.

`GET /api/v1/report-integrity/penalties` accepts `status=active|revoked` (omitted means all),
optional `user_id`, optional `source_flag_id`, `after`, and `limit` (1-100, default 25). The
opaque cursor is valid only with the same normalized filters. Flag and penalty lists emit scoped
cursors; legacy simple UUID cursors remain accepted during deployment compatibility, while a
scoped cursor from another resource or filter set returns 400.

`DELETE /api/v1/report-integrity/penalties/:id` returns
`{ penalty, penaltyId, userId }`. `penalty` is the authoritative revoked row; the two scalar fields
remain for existing consumers.

## Performance

| Endpoint                    | Round trips                                                              | Cache |
| --------------------------- | ------------------------------------------------------------------------ | ----- |
| `GET /flags`                | 1 read-replica                                                           | none  |
| `GET /flags/:id`            | 1 read-replica                                                           | none  |
| `PATCH /flags/:id`          | 1 write                                                                  | none  |
| `POST /flags/:id/penalties` | 1 replica read + 2-3 transactional writes + optional Valkey invalidation | none  |
| `GET /penalties`            | 1 read-replica                                                           | none  |
| `GET /penalties/:id`        | 1 read-replica                                                           | none  |
| `DELETE /penalties/:id`     | 3 primary statements in one transaction + optional Valkey invalidation   | none  |
