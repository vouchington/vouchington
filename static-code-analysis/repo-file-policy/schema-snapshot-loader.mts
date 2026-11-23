import { loadSchemaSnapshot as loadUpstream } from 'vouchington-tooling/pg-schema-snapshot'

export const SCHEMA_SNAPSHOT_PATH = 'backend/data-stores/psql/schema-snapshot/schema.json'

export function loadSchemaSnapshot(
  repoRoot: string,
  trackedFiles: ReadonlySet<string>,
  snapshot?: unknown,
) {
  return loadUpstream({
    snapshotPath: SCHEMA_SNAPSHOT_PATH,
    repoRoot,
    trackedFiles,
    snapshot,
    partitionPolicy: {
      strategies: ['RANGE'],
      children: ['default', 'monthly'],
      retentionOwners: ['cleanupPartitions', 'runDataRetentionCleanup', 'operatorPartitionDrop'],
      accessClasses: ['target-scoped', 'retention-window', 'intentional-fanout'],
    },
  })
}
