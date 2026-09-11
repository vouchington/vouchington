# PostgreSQL Admin API

Admin-only endpoints for managing PostgreSQL migrations, jobs, and partitions.

## Endpoints

| Method | Route                     | Authentication   | Description                      |
| ------ | ------------------------- | ---------------- | -------------------------------- |
| GET    | `/api/v1/psql/migrations` | Required (admin) | Get migration status             |
| GET    | `/api/v1/psql/partitions` | Required (admin) | Get partition status and sizes   |
| POST   | `/api/v1/psql/jobs`       | Required (admin) | Dispatch an async PostgreSQL job |

## Authorization

All endpoints require admin access (`currentUserCanAccessPsqlAdmin`). Returns 401 if unauthenticated, 403 if not an admin.

## GET /api/v1/psql/migrations

Returns applied and pending migration files by comparing the `migrations` table against files on disk.

Response: `{ applied: string[], pending: string[], total: number }`

## GET /api/v1/psql/partitions

Returns all partitioned tables with partition counts and sizes (via `pg_inherits` + `pg_class`).

Response:

```json
{
  "tables": [
    {
      "name": "parent_table_name",
      "partition_count": 3,
      "total_size_bytes": 123456,
      "partitions": [{ "name": "partition_name", "size_bytes": 41152 }]
    }
  ]
}
```

## POST /api/v1/psql/jobs

Dispatches an async PostgreSQL job via the `psql` queue.

Request body: `{ type: string }`

Valid job types:

- `runMigrations` — run pending database migrations
- `runViews` — recreate views
- `runConfigDriven` — run config-driven schema operations (seeds, functions, and generators)
- `createPartitions` — create future monthly partitions
- `cleanupPartitions` — drop expired monthly partitions

Response: `{ success: boolean }`

## Performance

| Endpoint                    | Round Trips | Caching | Notes                              |
| --------------------------- | ----------- | ------- | ---------------------------------- |
| GET /api/v1/psql/partitions | 2           | None    | Auth + DB partition metadata query |
| GET /api/v1/psql/migrations | 2           | None    | Auth + DB migration status query   |
| POST /api/v1/psql/jobs      | 2           | None    | Auth + enqueue (fire-and-forget)   |

## Related

- Service: [../../../services/psql-admin/](../../../services/psql-admin/README.md)
- System: [../../../queues/psql/](../../../queues/psql/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
