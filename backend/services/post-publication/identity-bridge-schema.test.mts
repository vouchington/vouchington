import { readTestPublicationConcreteSchema } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { PUBLICATION_IDENTITY_BRIDGES } from './identity-bridges.mts'

describe('publication concrete identity schema', () => {
  it('stores only concrete payload columns and requires every receipt snapshot pointer', async () => {
    const { columns, constraints, receiptIndexes } = await readTestPublicationConcreteSchema()
    expect(receiptIndexes.length).toBeGreaterThanOrEqual(2)
    expect(receiptIndexes.filter(index => !index.indexed)).toEqual([])
    expect(
      columns.filter(column =>
        ['kind', 'uuid_value', 'text_value', 'applied_identity'].includes(column.column_name),
      ),
    ).toEqual([])
    expect(columns).toContainEqual({
      table_name: 'post_publication_projection_receipts',
      column_name: 'applied_snapshot_id',
      is_nullable: 'NO',
    })
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'post_publication_identity_snapshots',
          target: 'post_publication_dirty_work',
          delete_action: 'n',
          columns: ['dirty_work_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_post_identities',
          target: 'posts',
          delete_action: 'n',
          columns: ['post_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_dirty_work_keys',
          target: 'post_publication_post_identities',
          delete_action: 'r',
          columns: ['impact_post_identity_id'],
        }),
      ]),
    )
    const bridges = Object.values(PUBLICATION_IDENTITY_BRIDGES)
    expect(constraints).toEqual(
      expect.arrayContaining([
        ...bridges.map(bridge =>
          expect.objectContaining({
            owner: bridge.table,
            target: bridge.liveTable,
            delete_action: 'n',
            columns: [bridge.liveColumn],
          }),
        ),
        ...bridges
          .filter(bridge => bridge.workColumn !== null)
          .map(bridge =>
            expect.objectContaining({
              owner: 'post_publication_dirty_work',
              target: bridge.table,
              delete_action: 'r',
              columns: [bridge.workColumn],
            }),
          ),
        ...bridges
          .filter(bridge => bridge.keyColumn !== null)
          .map(bridge =>
            expect.objectContaining({
              owner: 'post_publication_dirty_work_keys',
              target: bridge.table,
              delete_action: 'r',
              columns: [bridge.keyColumn],
            }),
          ),
      ]),
    )
    expect(constraints).toEqual(
      expect.arrayContaining([
        ...PUBLICATION_IDENTITY_BRIDGES.post.resumeColumns.map(column =>
          expect.objectContaining({
            owner: 'post_publication_dirty_work',
            target: 'post_publication_post_identities',
            delete_action: 'r',
            columns: [column],
          }),
        ),
        expect.objectContaining({
          owner: 'post_publication_projection_receipts',
          target: 'post_publication_post_identities',
          delete_action: 'r',
          columns: ['post_identity_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_identity_snapshots',
          target: 'post_publication_post_identities',
          delete_action: 'r',
          columns: ['post_identity_id'],
        }),
        expect.objectContaining({
          owner: 'post_publication_projection_receipts',
          target: 'post_publication_identity_snapshots',
          delete_action: 'r',
          columns: ['applied_snapshot_id'],
        }),
      ]),
    )
  })
})
