import { registerRetainedRelationCleanupReservation } from '../../../test-helpers/vitest-shared-db-scope-violations.mts'
import { beginTransaction, read, write } from '@data-stores/psql'
import { electedRelationMetadata } from '../../services/users/relation-impact-targets.mts'
import {
  cleanupRetainedRelationIdentities,
  readRetainedRelationCleanupCursors,
  type RetainedRelationCleanupCursor,
} from '../../services/data-retention/cleanup-retained-relation-identities.mts'
import {
  insertTestRetainedIdentityRoot,
  insertTestRetainedRelationIdentity,
  hasTestRetainedRelationIdentity,
} from './retained-identities.mts'

export type TestRetainedRelationCleanupCursor = {
  cursor_subject_id: string | null
  cursor_relation_id: string | null
}

export async function readTestRetainedRelationCleanupCursor(
  entityRelation: string,
): Promise<TestRetainedRelationCleanupCursor | null> {
  const { rows } = await read<TestRetainedRelationCleanupCursor>(
    `/* readTestRetainedRelationCleanupCursor */
     SELECT cursor_subject_id, cursor_relation_id
     FROM retained_relation_identity_cleanup_cursors
     WHERE entity_relation = $1`,
    [entityRelation],
  )
  return rows[0] ?? null
}

export async function restoreTestRetainedRelationCleanupCursor(
  entityRelation: string,
  cursor: TestRetainedRelationCleanupCursor | null,
): Promise<void> {
  if (!cursor) {
    await write(
      `/* deleteTestRetainedRelationCleanupCursor */
       DELETE FROM retained_relation_identity_cleanup_cursors WHERE entity_relation = $1`,
      [entityRelation],
    )
    return
  }
  await write(
    `/* restoreTestRetainedRelationCleanupCursor */
     INSERT INTO retained_relation_identity_cleanup_cursors (
       entity_relation, cursor_subject_id, cursor_relation_id
     ) VALUES ($1, $2, $3)
     ON CONFLICT (entity_relation) DO UPDATE
     SET cursor_subject_id = EXCLUDED.cursor_subject_id,
         cursor_relation_id = EXCLUDED.cursor_relation_id`,
    [entityRelation, cursor.cursor_subject_id, cursor.cursor_relation_id],
  )
}

export async function getRetainedRelationCleanupCursors(): Promise<string[]> {
  return (await readRetainedRelationCleanupCursors()).map(row => row.entity_relation)
}

/** Real transaction reservation for exact owned relation fixtures; always rolls back. */
export async function withTestRetainedRelationCleanupReservation<Result>(
  handler: (scope: {
    insertRoot: (family: 'user' | 'post' | 'topic' | 'rss_feed_item', id: string) => Promise<void>
    insertRelation: (table: string, subject: string, relation: string) => Promise<void>
    hasRelation: (table: string, subject: string, relation: string) => Promise<boolean>
    cleanup: typeof cleanupRetainedRelationIdentities
    cursorNames: () => Promise<string[]>
    cursorRows: () => Promise<RetainedRelationCleanupCursor[]>
  }) => Promise<Result>,
): Promise<Result> {
  const query = await beginTransaction()
  let closeReservation: (() => void) | undefined
  let outcome: { ok: true; value: Result } | { ok: false; error: unknown }
  try {
    for (const metadata of electedRelationMetadata) {
      await query(
        '/* reserveTestRetainedRelationCleanupFamily */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`retained-relation-cleanup:${metadata.table_name}`],
      )
    }
    closeReservation = registerRetainedRelationCleanupReservation(query)
    outcome = {
      ok: true,
      value: await handler({
        insertRoot: (family, id) => insertTestRetainedIdentityRoot(family, id, { query }),
        insertRelation: (table, subject, relation) =>
          insertTestRetainedRelationIdentity(table, subject, relation, { query }),
        hasRelation: (table, subject, relation) =>
          hasTestRetainedRelationIdentity(table, subject, relation, { query }),
        cleanup: (pageSize, keys, options) =>
          cleanupRetainedRelationIdentities(pageSize, keys, { ...options, query }),
        cursorNames: async () =>
          (await readRetainedRelationCleanupCursors({ query })).map(row => row.entity_relation),
        cursorRows: () => readRetainedRelationCleanupCursors({ query }),
      }),
    }
  } catch (err) {
    outcome = { ok: false, error: err }
  }
  const cleanupErrors: unknown[] = []
  try {
    closeReservation?.()
  } catch (err) {
    cleanupErrors.push(err)
  }
  try {
    await query.rollback()
  } catch (err) {
    cleanupErrors.push(err)
  }
  if (!outcome.ok) {
    if (cleanupErrors.length > 0)
      throw new AggregateError(
        [outcome.error, ...cleanupErrors],
        'Relation fixture and rollback failed',
      )
    throw outcome.error
  }
  if (cleanupErrors.length > 0)
    throw new AggregateError(cleanupErrors, 'Relation fixture rollback failed')
  return outcome.value
}
