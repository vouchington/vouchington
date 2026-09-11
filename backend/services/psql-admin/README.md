# PostgreSQL Admin Service

Administrative operations for PostgreSQL: migration status and partition inspection.

## Modules

- **authorization.mts** — `currentUserCanAccessPsqlAdmin()` admin role check
- **index.mts** — `getMigrationStatus()` compares applied migrations in DB against files on disk
- **partitions.mts** — `getPartitionStatus()` queries `pg_inherits`/`pg_class` for partition info and sizes

## Data Model

No owned tables. Reads directly from PostgreSQL system catalogs:

- `pg_inherits` — parent/child partition relationships
- `pg_class` — relation names and OIDs
- `pg_namespace` — schema names

Migration tracking uses the `migrations` table managed by the psql system.

## Usage Examples

```typescript
import { getPartitionStatus } from '@services/psql-admin/partitions'
import { getMigrationStatus } from '@services/psql-admin'

// Get all partition tables with sizes
const { tables } = await getPartitionStatus()
// tables[0] => { name: 'posts', partition_count: 12, total_size_bytes: 104857600, partitions: [...] }

// Get migration applied/pending status
const { applied, pending } = await getMigrationStatus()
```

## Related

- API: [../../api/v1/psql/README.md](../../api/v1/psql/README.md)
- System: [../../queues/psql/](../../queues/psql/README.md)
