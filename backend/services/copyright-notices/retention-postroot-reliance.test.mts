import { beforeEach, describe, expect, it } from 'vitest'
import {
  advanceCopyrightRetentionToPostroot,
  closeCopyrightPostrootSource,
  createCopyrightPostrootSuspensionFixture,
  readCopyrightRetentionCaseRows,
  readCopyrightSuspensionRetentionRows,
} from '@voucha/test-helpers/copyright-postroot-retention'
import { useCopyrightRetentionWorkClock } from '@voucha/test-helpers/copyright-retention-work'
import { useFakeCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { purgeCopyrightMinimalRecord } from '@voucha/test-helpers/copyright-minimal-purge'

const START = new Date('2029-10-23T00:00:00.000Z')
const FIRST_EXPIRY = new Date('2036-10-23T00:00:00.000Z')
const SECOND_EXPIRY = new Date('2043-10-23T00:00:00.000Z')

describe('copyright postroot suspension reliance retention', () => {
  useFakeCopyrightEvidenceBucket()
  const setClock = useCopyrightRetentionWorkClock()
  const firstOptions = {
    now: FIRST_EXPIRY,
    cutoff: new Date('2030-10-23T00:00:00.000Z'),
    pageSize: 1,
    maxBatches: 1,
  }

  let setup: {
    fixture: Awaited<ReturnType<typeof createCopyrightPostrootSuspensionFixture>>
    before: Awaited<ReturnType<typeof readCopyrightSuspensionRetentionRows>>
    firstRoot: Awaited<ReturnType<typeof readCopyrightRetentionCaseRows>>
    withLiveBridge: Awaited<ReturnType<typeof readCopyrightSuspensionRetentionRows>>
  }

  beforeEach(async () => {
    await setClock(START)
    const fixture = await createCopyrightPostrootSuspensionFixture()
    const accountId = fixture.poster.id
    const before = await readCopyrightSuspensionRetentionRows(accountId, fixture.reviewId)
    await closeCopyrightPostrootSource(fixture, fixture.first)
    await setClock(FIRST_EXPIRY)
    const firstRoot = await advanceCopyrightRetentionToPostroot(
      fixture.first.noticeId,
      firstOptions,
    )
    const withLiveBridge = await readCopyrightSuspensionRetentionRows(accountId, fixture.reviewId)
    setup = { fixture, before, firstRoot, withLiveBridge }
  })

  it('preserves a live incident bridge, then shares cap one across released authority and parties', async () => {
    const { fixture, before, firstRoot, withLiveBridge } = setup
    const accountId = fixture.poster.id
    expect(before).toMatchObject({
      reliance_exists: true,
      released_at: expect.any(Date),
      source_count: 2,
      operative_source_count: 2,
      review_exists: true,
      suspension_history_count: 1,
      last_released_at: expect.any(Date),
    })
    expect(firstRoot).toMatchObject({
      notice_exists: false,
      party_count: 1,
      work_exists: true,
      identity_exists: true,
    })
    expect(withLiveBridge).toEqual({ ...before, source_count: 1, operative_source_count: 1 })

    // The sibling party is processed, but its released reliance still has a live-case source FK.
    await expect(purgeCopyrightMinimalRecord(fixture.first.noticeId, firstOptions)).resolves.toBe(
      'more',
    )
    await expect(readCopyrightRetentionCaseRows(fixture.first.noticeId)).resolves.toEqual({
      ...firstRoot,
      party_count: 0,
    })
    await expect(
      readCopyrightSuspensionRetentionRows(accountId, fixture.reviewId),
    ).resolves.toEqual(withLiveBridge)
    await expect(purgeCopyrightMinimalRecord(fixture.first.noticeId, firstOptions)).resolves.toBe(
      'purged',
    )

    await closeCopyrightPostrootSource(fixture, fixture.second)
    await setClock(SECOND_EXPIRY)
    const secondOptions = {
      now: SECOND_EXPIRY,
      cutoff: new Date('2037-10-23T00:00:00.000Z'),
      pageSize: 1,
      maxBatches: 1,
    }
    const secondRoot = await advanceCopyrightRetentionToPostroot(
      fixture.second.noticeId,
      secondOptions,
    )
    expect(secondRoot).toMatchObject({
      notice_exists: false,
      party_count: 1,
      work_exists: true,
      identity_exists: true,
    })
    const emptyReliance = await readCopyrightSuspensionRetentionRows(accountId, fixture.reviewId)
    expect(emptyReliance).toEqual({ ...before, source_count: 0, operative_source_count: 0 })

    // Cap one deletes authority alone; its party edge must wait for the next committed page.
    await expect(purgeCopyrightMinimalRecord(fixture.second.noticeId, secondOptions)).resolves.toBe(
      'more',
    )
    await expect(readCopyrightRetentionCaseRows(fixture.second.noticeId)).resolves.toEqual(
      secondRoot,
    )
    const collected = { ...emptyReliance, reliance_exists: false, released_at: null }
    await expect(
      readCopyrightSuspensionRetentionRows(accountId, fixture.reviewId),
    ).resolves.toEqual(collected)
    await expect(purgeCopyrightMinimalRecord(fixture.second.noticeId, secondOptions)).resolves.toBe(
      'more',
    )
    await expect(readCopyrightRetentionCaseRows(fixture.second.noticeId)).resolves.toEqual({
      ...secondRoot,
      party_count: 0,
    })

    // The variable page is empty. The terminal contract removes exactly the two fixed bookkeeping
    // rows (continuation and retained identity) together, even when the variable-row cap is one.
    await expect(purgeCopyrightMinimalRecord(fixture.second.noticeId, secondOptions)).resolves.toBe(
      'purged',
    )
    await expect(readCopyrightRetentionCaseRows(fixture.second.noticeId)).resolves.toEqual({
      notice_exists: false,
      identity_exists: false,
      work_exists: false,
      root_purged_at: null,
      party_count: 0,
      promoted_review_count: 0,
    })
    await expect(
      readCopyrightSuspensionRetentionRows(accountId, fixture.reviewId),
    ).resolves.toEqual(collected)
  })
})
