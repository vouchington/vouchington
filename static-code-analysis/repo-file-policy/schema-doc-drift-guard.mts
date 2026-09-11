import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import {
  checkModerationPolicyDocSync,
  isModerationPolicyDocSyncPath,
} from './moderation-policy-doc-sync-guard.mts'
import { isMigrationSqlFile, isSchemaDocDriftSourcePath } from './policy-matchers.mts'
import {
  checkDocumentedPartitionTables,
  checkPartitionInventoryDoc,
  isPartitionInventoryDocPath,
  PARTITION_STRATEGY_DOC,
} from './partition-inventory-doc.mts'

const REPORTING_DOC_PATHS = new Set([
  'docs/requirements/moderation/REPORTING.md',
  'docs/requirements/moderation/MODERATION-FLOWS.md',
  'backend/services/moderation-reports/README.md',
])

const LEGACY_REPORTING_PATTERNS = [
  {
    pattern: new RegExp(
      String.raw`\bentity_type\b[\s\S]{0,240}\bentity_id\b|\bentity_id\b[\s\S]{0,240}\bentity_type\b`,
    ),
    message: 'legacy polymorphic entity_type/entity_id reporting schema example',
  },
  {
    pattern: new RegExp(String.raw`\bgen_random_uuid\(\)`, 'i'),
    message: 'legacy gen_random_uuid() report id example',
  },
  {
    pattern: new RegExp(String.raw`\bcreated_at\b[\s\S]{0,160}\bDEFAULT\s+now\(\)`, 'i'),
    message: 'legacy mutable created_at DEFAULT now() example',
  },
  {
    pattern: new RegExp(
      String.raw`^\s*status\s+[\s\S]{0,80}\b(?:text|moderation_report_status|review_dispute_status|moderation_appeal_status)\b`,
      'im',
    ),
    message: 'legacy physical status column example',
  },
]

const DERIVED_LIFECYCLE_STATUS_TABLES = [
  'moderation_reports',
  'review_disputes',
  'moderation_appeals',
  'verified_identities',
]

const DERIVED_LIFECYCLE_STATUS_WRITE_PATTERNS = DERIVED_LIFECYCLE_STATUS_TABLES.flatMap(table => [
  {
    pattern: new RegExp(
      String.raw`\bUPDATE\s+${table}\b[\s\S]{0,800}\bSET\b(?:(?!\b(?:WHERE|RETURNING)\b)[\s\S]){0,800}\bstatus\s*=`,
      'i',
    ),
    table,
  },
  {
    pattern: new RegExp(
      String.raw`\bINSERT\s+INTO\s+${table}\b\s*\((?:(?!\))[\s\S]){0,800}\bstatus\b`,
      'i',
    ),
    table,
  },
])

const RSS_PARTITION_COMMENT_PATH = 'backend/services/rss-feed-items/get.mts'

function isDerivedLifecycleStatusDocPath(file: string): boolean {
  return (
    file.endsWith('.md') && (file.includes('moderation') || file.includes('identity-verification'))
  )
}

/** Path boundary for the schema/doc guard's repository-wide source scan. */
export function shouldReadSchemaDocDriftFile(file: string): boolean {
  return (
    isMigrationSqlFile(file) ||
    isSchemaDocDriftSourcePath(file) ||
    isDerivedLifecycleStatusDocPath(file) ||
    REPORTING_DOC_PATHS.has(file) ||
    isModerationPolicyDocSyncPath(file) ||
    isPartitionInventoryDocPath(file) ||
    file === RSS_PARTITION_COMMENT_PATH
  )
}

export function checkSchemaDocDriftGuard(
  repoRoot: string,
  trackedFiles: string[],
  schema: Pick<SchemaSnapshot, 'tables'>,
  errors: string[],
  readTrackedFile?: (file: string) => string | null,
): void {
  const contentsByFile = new Map<string, string>()
  const partitionedTables = new Set<string>()
  for (const [tableName, table] of Object.entries(schema.tables)) {
    if (table.physicalPartition !== null) partitionedTables.add(tableName)
  }

  for (const file of trackedFiles) {
    if (!shouldReadSchemaDocDriftFile(file)) continue
    const path = join(repoRoot, file)
    if (!statSync(path).isFile()) continue
    const content = readTrackedFile?.(file) ?? readFileSync(path, 'utf8')
    if (content === null) continue
    contentsByFile.set(file, content)
    if (isMigrationSqlFile(file) && /\bPARTITION\s+BY\s+HASH\b/i.test(content)) {
      errors.push(
        `::error file=${file}::${file}: HASH partitioning is not allowed; use UUIDv7 RANGE partitioning`,
      )
    }
  }

  for (const [file, content] of contentsByFile) {
    if (REPORTING_DOC_PATHS.has(file)) {
      for (const { pattern, message } of LEGACY_REPORTING_PATTERNS) {
        if (!pattern.test(content)) continue
        errors.push(
          `::error file=${file}::${file}: ${message}; document per-target FKs and derived lifecycle status instead`,
        )
      }
    }

    for (const { pattern, table } of DERIVED_LIFECYCLE_STATUS_WRITE_PATTERNS) {
      if (!pattern.test(content)) continue
      errors.push(
        `::error file=${file}::${file}: ${table}.status is derived from lifecycle fields; do not write a physical status column`,
      )
    }

    if (file === RSS_PARTITION_COMMENT_PATH && /all 8 hash partitions/i.test(content)) {
      errors.push(
        `::error file=${file}::${file}: rss_feed_items is not hash-partitioned; remove stale partition-pruning comments`,
      )
    }
  }

  if (partitionedTables.size > 0) {
    const docFile = join(repoRoot, PARTITION_STRATEGY_DOC)
    if (!existsSync(docFile)) {
      errors.push(
        `::error file=${PARTITION_STRATEGY_DOC}::${PARTITION_STRATEGY_DOC}: partitioning doc is required when migrations define partitioned tables`,
      )
    } else {
      const docContent = contentsByFile.get(PARTITION_STRATEGY_DOC) ?? readFileSync(docFile, 'utf8')
      for (const table of [...partitionedTables].toSorted()) {
        if (docContent.includes(`\`${table}\``)) continue
        errors.push(
          `::error file=${PARTITION_STRATEGY_DOC}::${PARTITION_STRATEGY_DOC}: partitioned table ${table} is missing from partitioning docs`,
        )
      }
    }
  }

  const strategyDoc =
    contentsByFile.get(PARTITION_STRATEGY_DOC) ??
    (existsSync(join(repoRoot, PARTITION_STRATEGY_DOC))
      ? readFileSync(join(repoRoot, PARTITION_STRATEGY_DOC), 'utf8')
      : undefined)
  if (strategyDoc) {
    checkPartitionInventoryDoc(repoRoot, strategyDoc, partitionedTables, errors)
  }

  checkDocumentedPartitionTables(contentsByFile, partitionedTables, errors)

  checkModerationPolicyDocSync(repoRoot, trackedFiles, contentsByFile, errors)
}
