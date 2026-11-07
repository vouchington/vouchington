import type { SchemaSnapshot } from '@vouchington/postgres/pg-schema-snapshot'

import * as aiRetentionUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/ai-retention-uuid-allowlists.mts'
import * as classifierRunAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/classifier-run-allowlists.mts'
import * as copyrightRetentionUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/copyright-retention-uuid-allowlists.mts'
import * as dsaSubmissionUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/dsa-submission-uuid-allowlists.mts'
import * as membershipUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/membership-uuid-allowlists.mts'
import * as moderationCleanupUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/moderation-cleanup-uuid-allowlists.mts'
import * as moderationLedgerAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/moderation-ledger-allowlists.mts'
import * as moderationLifecycleUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/moderation-lifecycle-uuid-allowlists.mts'
import * as notificationPushRetentionAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/notification-push-retention-allowlists.mts'
import * as oauthAuthorizationAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/oauth-authorization-allowlists.mts'
import * as operationalRetentionUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/operational-retention-uuid-allowlists.mts'
import * as retentionCursorUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/retention-cursor-uuid-allowlists.mts'
import * as socialGraphTimestampAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/social-graph-timestamp-allowlists.mts'
import * as storyPostRelatedUrlProjectionUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/story-post-related-url-projection-uuid-allowlists.mts'
import * as timestampAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/timestamp-allowlists.mts'
import * as topicAliasCursorUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/topic-alias-cursor-uuid-allowlists.mts'
import * as userDeletionUuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/user-deletion-uuid-allowlists.mts'
import * as uuidAllowlists from '../../backend/test-helpers/data-stores/psql/schema-static-analysis/uuid-allowlists.mts'
import * as operationalCursorUuidAllowlists from '../../backend/test-helpers/operational-cursor-uuid-allowlist.mts'
import * as rssCategorySnapshotUuidAllowlists from '../../backend/test-helpers/rss-category-snapshot-uuid-allowlist.mts'
import * as topicMergeSchemaAllowlists from '../../backend/test-helpers/topic-merge-schema-allowlists.mts'

export type AllowlistEntries = ReadonlyMap<string, string> | readonly (readonly [string, string])[]

// Keep this registry aligned with every tracked schema allowlist module. Evaluated exports
// include entries composed with spreads, which source-text extraction cannot see.
export const schemaAllowlistModules: ReadonlyMap<string, readonly AllowlistEntries[]> = new Map<
  string,
  readonly AllowlistEntries[]
>([
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/ai-retention-uuid-allowlists.mts',
    Object.values(aiRetentionUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/classifier-run-allowlists.mts',
    Object.values(classifierRunAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/copyright-retention-uuid-allowlists.mts',
    Object.values(copyrightRetentionUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/dsa-submission-uuid-allowlists.mts',
    Object.values(dsaSubmissionUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/membership-uuid-allowlists.mts',
    Object.values(membershipUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/moderation-cleanup-uuid-allowlists.mts',
    Object.values(moderationCleanupUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/moderation-ledger-allowlists.mts',
    Object.values(moderationLedgerAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/moderation-lifecycle-uuid-allowlists.mts',
    Object.values(moderationLifecycleUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/notification-push-retention-allowlists.mts',
    Object.values(notificationPushRetentionAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/oauth-authorization-allowlists.mts',
    Object.values(oauthAuthorizationAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/operational-retention-uuid-allowlists.mts',
    Object.values(operationalRetentionUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/retention-cursor-uuid-allowlists.mts',
    Object.values(retentionCursorUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/social-graph-timestamp-allowlists.mts',
    Object.values(socialGraphTimestampAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/story-post-related-url-projection-uuid-allowlists.mts',
    Object.values(storyPostRelatedUrlProjectionUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/timestamp-allowlists.mts',
    Object.values(timestampAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/topic-alias-cursor-uuid-allowlists.mts',
    Object.values(topicAliasCursorUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/user-deletion-uuid-allowlists.mts',
    Object.values(userDeletionUuidAllowlists),
  ],
  [
    'backend/test-helpers/data-stores/psql/schema-static-analysis/uuid-allowlists.mts',
    Object.values(uuidAllowlists),
  ],
  [
    'backend/test-helpers/operational-cursor-uuid-allowlist.mts',
    Object.values(operationalCursorUuidAllowlists),
  ],
  [
    'backend/test-helpers/rss-category-snapshot-uuid-allowlist.mts',
    Object.values(rssCategorySnapshotUuidAllowlists),
  ],
  [
    'backend/test-helpers/topic-merge-schema-allowlists.mts',
    Object.values(topicMergeSchemaAllowlists),
  ],
])

function isSchemaAllowlistFile(file: string): boolean {
  return (
    (file.startsWith('backend/test-helpers/data-stores/psql/schema-static-analysis/') ||
      file.startsWith('backend/test-helpers/')) &&
    /-allowlists?\.mts$/.test(file)
  )
}

export function findSchemaAllowlistEntryErrors(
  entries: Iterable<readonly [string, string]>,
  schema: Pick<SchemaSnapshot, 'tables'>,
): string[] {
  const errors = new Set<string>()
  for (const [entry] of entries) {
    const match = /^([a-z][a-z0-9_]*)(?:\.([a-z][a-z0-9_]*))?$/.exec(entry)
    if (!match) {
      errors.add(
        `invalid PostgreSQL schema allowlist entry (expected table or table.column): ${entry}`,
      )
      continue
    }
    const table = match[1]!
    const column = match[2]
    // Bracket access would see inherited keys such as constructor and could throw.
    const tableSnapshot = Object.hasOwn(schema.tables, table) ? schema.tables[table] : undefined
    if (
      tableSnapshot === undefined ||
      (column !== undefined && !Object.hasOwn(tableSnapshot.columns, column))
    ) {
      errors.add(`stale PostgreSQL schema allowlist entry: ${entry}`)
    }
  }
  return [...errors]
}

/** Checks tracked schema allowlist modules for invalid or absent snapshot entries. */
export function checkSchemaAllowlistFreshness(
  trackedFiles: string[],
  schema: Pick<SchemaSnapshot, 'tables'>,
  allowlistModules: ReadonlyMap<string, readonly AllowlistEntries[]>,
  errors: string[],
): void {
  for (const file of trackedFiles) {
    if (!isSchemaAllowlistFile(file)) continue
    const exports = allowlistModules.get(file)
    if (!exports) {
      errors.push(
        `::error file=${file}::schema allowlist module is missing from freshness registry`,
      )
      continue
    }
    for (const entries of exports) {
      for (const error of findSchemaAllowlistEntryErrors(entries, schema)) {
        errors.push(`::error file=${file}::${error}`)
      }
    }
  }
}
