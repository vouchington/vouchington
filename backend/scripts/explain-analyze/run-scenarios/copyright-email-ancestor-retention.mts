import assert from 'node:assert/strict'
import { beginTransaction } from '@data-stores/psql'
import { deleteUnlinkedAncestorEdgePage } from '@services/copyright-notices/operational-retention-email-intake-operations'
import { DEFAULT_DATA_RETENTION_CONFIG } from '@services/data-retention/config'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  ancestorEdgeTable,
  seedCopyrightEmailAncestorRetention,
} from '../seed-data/copyright-email-ancestor-retention.mts'

const pageSize = DEFAULT_DATA_RETENTION_CONFIG.batch_size
const retentionSettings = {
  'app.copyright_retention_erasure': 'on',
  'app.copyright_operational_retention': 'on',
}
const directions = [
  {
    direction: 'reply',
    scenario: 'copyright-unlinked-reply-edges-at-cap',
    root: 'replyRoot',
    rootColumn: 'reply_message_intake_receipt_id',
    neighborColumn: 'ancestor_message_intake_receipt_id',
    select: 'pageUnlinkedReplyAncestorEdges',
    delete: 'deleteUnlinkedReplyAncestorEdges',
  },
  {
    direction: 'ancestor',
    scenario: 'copyright-unlinked-ancestor-edges-at-cap',
    root: 'ancestorRoot',
    rootColumn: 'ancestor_message_intake_receipt_id',
    neighborColumn: 'reply_message_intake_receipt_id',
    select: 'pageUnlinkedAncestorReplyEdges',
    delete: 'deleteUnlinkedAncestorReplyEdges',
  },
] as const

export async function runCopyrightEmailAncestorRetentionScenarios(): Promise<void> {
  const fixture = await seedCopyrightEmailAncestorRetention(pageSize)
  assert.equal(fixture.neighbors.length, pageSize + 1)
  const backgroundEdges =
    fixture.neighbors.length *
    (fixture.backgroundAncestors.length + fixture.backgroundReplies.length)
  const continuationId = fixture.neighbors.at(-1)!
  for (const mode of directions) {
    const rootId = fixture[mode.root]
    registerScenarioContract(mode.scenario, {
      // The DELETE returns a command count rather than RETURNING rows.
      allowEmptyResult: true,
      seededRows: {
        [ancestorEdgeTable]: backgroundEdges + fixture.neighbors.length * 2,
        copyright_notice_email_intake_notice_links: fixture.linkCount,
      },
      expectations: [
        { kind: 'maxProcessedRows', relation: ancestorEdgeTable, max: pageSize + 1 },
        { kind: 'maxProcessedRows', relation: ancestorEdgeTable, max: 1, captureIndex: 2 },
        { kind: 'maxProcessedRows', relation: ancestorEdgeTable, max: 1, captureIndex: 3 },
        // Main can read all notice links for the first delete. The fixture may share its
        // shard with earlier link seeds. Count one pass over the actual corpus.
        // https://github.com/vouchington/vouchington/issues/6534
        // https://github.com/vouchington/vouchington/issues/6535
        {
          kind: 'maxProcessedRows',
          relation: 'copyright_notice_email_intake_notice_links',
          max: fixture.linkCount,
          captureIndex: 1,
        },
      ],
    })
    await runAndCapture(
      mode.scenario,
      async () => {
        await using query = await beginTransaction()
        await query(sql`/* setEmailAncestorRetentionCapacity */
          SELECT set_config('app.copyright_retention_erasure', 'on', true),
            set_config('app.copyright_operational_retention', 'on', true)`)
        const readNeighbors = async () => {
          const { rows } = await query<{ id: string }>(
            sql`/* readEmailAncestorRetentionNeighbors */ SELECT `
              .append(
                `${mode.neighborColumn} AS id FROM ${ancestorEdgeTable} WHERE ${mode.rootColumn} = `,
              )
              .append(sql`${rootId}::uuid ORDER BY id`),
          )
          return rows.map(row => row.id)
        }
        const first = await deleteUnlinkedAncestorEdgePage(
          query,
          rootId,
          mode.direction,
          null,
          pageSize,
        )
        assert.deepEqual(first, {
          done: false,
          lastId: fixture.protectedNeighbor,
          scanned: pageSize,
        })
        assert.deepEqual(await readNeighbors(), [fixture.protectedNeighbor, continuationId])
        const last = await deleteUnlinkedAncestorEdgePage(
          query,
          rootId,
          mode.direction,
          first.lastId,
          pageSize,
        )
        assert.deepEqual(last, { done: true, lastId: continuationId, scanned: 1 })
        assert.deepEqual(await readNeighbors(), [fixture.protectedNeighbor])
        const { rows } = await query<{ count: number }>(sql`
          /* countEmailAncestorRetentionBackground */
          SELECT count(*)::int AS count FROM copyright_notice_email_message_ancestors
          WHERE reply_message_intake_receipt_id = ANY(${fixture.backgroundReplies}::uuid[])
             OR ancestor_message_intake_receipt_id = ANY(${fixture.backgroundAncestors}::uuid[])
        `)
        assert.equal(rows[0]!.count, backgroundEdges)
        await query.rollback()
      },
      undefined,
      [mode.select, mode.delete],
      {
        localSettings: retentionSettings,
        exactCapturedNames: [
          'setEmailAncestorRetentionCapacity',
          mode.select,
          mode.delete,
          'readEmailAncestorRetentionNeighbors',
          mode.select,
          mode.delete,
          'readEmailAncestorRetentionNeighbors',
          'countEmailAncestorRetentionBackground',
        ],
      },
    )
  }
}
