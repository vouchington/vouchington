import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createCopyrightNoticeSchemaFixture } from '@voucha/test-helpers/data-stores/psql/copyright-notice-schema'
import {
  insertCopyrightActionIntent,
  insertCopyrightActionIntents,
} from './action-intent-insertion.mts'

describe('insertCopyrightActionIntents', () => {
  it('inserts intents in input order and returns the same records on replay', async () => {
    const [first, second] = await Promise.all([
      createCopyrightNoticeSchemaFixture(),
      createCopyrightNoticeSchemaFixture(),
    ])
    const inputs = [
      { restrictionId: second.restrictionId, placementRevision: 2, action: 'withhold' as const },
      { restrictionId: first.restrictionId, placementRevision: 3, action: 'restore' as const },
    ]
    await using transaction = await beginTransaction()
    const inserted = await insertCopyrightActionIntents(transaction, inputs)
    const replayed = await insertCopyrightActionIntents(transaction, inputs)
    expect(inserted.map(intent => intent.copyright_restriction_id)).toEqual([
      second.restrictionId,
      first.restrictionId,
    ])
    expect(inserted.map(intent => intent.expected_placement_revision)).toEqual([2, 3])
    expect(replayed).toEqual(inserted)
    expect(await insertCopyrightActionIntents(transaction, [])).toEqual([])
    const viaWrapper = await insertCopyrightActionIntent(
      transaction,
      first.restrictionId,
      4,
      'withhold',
    )
    const [viaBatch] = await insertCopyrightActionIntents(transaction, [
      { restrictionId: first.restrictionId, placementRevision: 4, action: 'withhold' },
    ])
    expect(viaWrapper).toEqual(viaBatch)
  })
})
