import { createOwnedSqlFixtureLifetime } from '../owned-sql-fixture-lifetime.mts'
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
  let query: Awaited<ReturnType<typeof beginTransaction>> | undefined
  let closeReservation: (() => void) | undefined
  const owner = createOwnedSqlFixtureLifetime(async () => {
    const failures: unknown[] = []
    try {
      closeReservation?.()
    } catch (err) {
      failures.push(err)
    }
    try {
      await query?.rollback()
    } catch (err) {
      failures.push(err)
    }
    try {
      await query?.[Symbol.asyncDispose]()
    } catch (err) {
      failures.push(err)
    }
    if (failures.length) throw new AggregateError(failures, 'Relation fixture rollback failed')
  })
  return owner.withBody(async () => {
    await owner.prepare(async () => {
      query = await beginTransaction()
      owner.assertOpen()
      for (const metadata of electedRelationMetadata) {
        await query(
          '/* reserveTestRetainedRelationCleanupFamily */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`retained-relation-cleanup:${metadata.table_name}`],
        )
        owner.assertOpen()
      }
      closeReservation = registerRetainedRelationCleanupReservation(query)
    })
    const transaction = query!
    return handler({
      insertRoot: (family, id) =>
        owner.run(() => insertTestRetainedIdentityRoot(family, id, { query: transaction })),
      insertRelation: (table, subject, relation) =>
        owner.run(() =>
          insertTestRetainedRelationIdentity(table, subject, relation, { query: transaction }),
        ),
      hasRelation: (table, subject, relation) =>
        owner.run(() =>
          hasTestRetainedRelationIdentity(table, subject, relation, { query: transaction }),
        ),
      cleanup: (pageSize, keys, options) =>
        owner.run(() =>
          cleanupRetainedRelationIdentities(pageSize, keys, { ...options, query: transaction }),
        ),
      cursorNames: () =>
        owner.run(async () =>
          (await readRetainedRelationCleanupCursors({ query: transaction })).map(
            row => row.entity_relation,
          ),
        ),
      cursorRows: () => owner.run(() => readRetainedRelationCleanupCursors({ query: transaction })),
    })
  })
}
