import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { read } from '@data-stores/psql'
import { electedRelationMetadata } from '../../services/users/relation-impact-targets.mts'
import { cleanupRetainedRelationIdentities } from '../../services/data-retention/cleanup-retained-relation-identities.mts'

async function cursorRows() {
  return (
    await read<{
      entity_relation: string
      cursor_subject_id: string | null
      cursor_relation_id: string | null
    }>(
      'SELECT entity_relation, cursor_subject_id, cursor_relation_id FROM retained_relation_identity_cleanup_cursors ORDER BY entity_relation',
    )
  ).rows
}

const receipt: Record<string, unknown> = { state: 'started', stage: 'resource-boundary' }
let failed = false
let originalError: unknown
try {
  assert.equal(
    process.env.CI,
    'true',
    'Fresh-bootstrap acceptance requires the job-owned CI PostgreSQL service',
  )
  receipt.stage = 'before'
  const before = await cursorRows()
  receipt.before = before
  assert.deepEqual(before, [], 'Bootstrap cursors must be empty; never clear an existing database')
  const names = electedRelationMetadata.map(row => row.table_name)
  receipt.names = names
  assert.ok(names.length > 0)
  const expectedRows = names.toSorted().map(entity_relation => ({
    entity_relation,
    cursor_subject_id: null,
    cursor_relation_id: null,
  }))
  const expectedPages = names.map(relationTable => ({
    relationTable,
    scanned: 0,
    deleted: 0,
    hasMore: false,
  }))
  receipt.stage = 'create'
  const created = await cleanupRetainedRelationIdentities()
  receipt.created = created
  receipt.stage = 'after-create-read'
  const after = await cursorRows()
  receipt.after = after
  receipt.stage = 'after-create-assert'
  assert.deepEqual(created, expectedPages)
  assert.deepEqual(after, expectedRows)
  receipt.stage = 'replay'
  const replayed = await cleanupRetainedRelationIdentities()
  receipt.replayed = replayed
  receipt.stage = 'after-replay-read'
  const replay = await cursorRows()
  receipt.replay = replay
  receipt.stage = 'after-replay-assert'
  assert.deepEqual(replayed, expectedPages)
  assert.deepEqual(replay, expectedRows)
  receipt.state = 'passed'
  receipt.stage = 'complete'
} catch (err) {
  failed = true
  originalError = err
  receipt.state = 'failed'
  receipt.error =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { type: typeof err, message: String(err) }
}
const cleanupErrors: unknown[] = []
try {
  await mkdir('../artifacts', { recursive: true })
  await writeFile('../artifacts/retained-relation-bootstrap.json', JSON.stringify(receipt, null, 2))
} catch (err) {
  cleanupErrors.push(err)
}
try {
  await shutdownDataStoresForOneOffCommand()
} catch (err) {
  cleanupErrors.push(err)
}
if (failed) throw originalError
if (cleanupErrors.length > 0)
  throw new AggregateError(cleanupErrors, 'Bootstrap receipt or shutdown failed')
