import type { SchemaTableSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

export function emptySchemaSnapshot(tables: Record<string, unknown> = {}) {
  return {
    formatVersion: 2,
    tables,
    views: {},
    enums: {},
    extensions: {},
    functions: {},
    policies: {},
  }
}

export function plainSnapshotTable(triggers: Record<string, string> = {}): SchemaTableSnapshot {
  return {
    columns: {},
    relationKind: 'table',
    primaryKey: null,
    uniqueConstraints: {},
    checkConstraints: {},
    foreignKeys: {},
    indexes: {},
    triggers,
    comment: null,
    physicalPartition: null,
    partition: null,
    growth: 'bounded',
  }
}

export function partitionedSnapshotTable(): SchemaTableSnapshot {
  return {
    columns: {},
    relationKind: 'partitioned table',
    primaryKey: null,
    uniqueConstraints: {},
    checkConstraints: {},
    foreignKeys: {},
    indexes: {},
    triggers: {},
    comment: null,
    physicalPartition: { strategy: 'range', key: 'id' },
    partition: null,
    growth: 'bounded',
  }
}
