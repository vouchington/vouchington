import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { psql } from '@queues/psql/queues'
import type { PsqlRetentionJobData } from '@queues/psql/types'
import { dataRetentionConfig } from '@services/data-retention/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withClassifierRetentionSweepLock } from '@voucha/test-helpers/classifier-retention-sweep-lock'
import { countClassifierRows } from '@voucha/test-helpers/classifier-retention'
import { readClassifierDefaultLineage } from '@voucha/test-helpers/classifier-default-retention'
import { readCopyrightOperationalRow } from '@voucha/test-helpers/copyright-operational-retention'
import { loseNextPsqlJobAddReplyForTest } from '@voucha/test-helpers/injected-failures'
import {
  createContinuationRunFixture,
  createIndependentClassifierContinuationFixture,
  createDailyCopyrightContinuationFixture,
  createMembershipContinuationFixture,
  readContinuationRequestIds,
  rearmMembershipEffectForContinuation,
  readMembershipContinuationOutsideState,
} from '@voucha/test-helpers/retention-processor-continuations'
import {
  acquireMembershipOperationalRetentionTestLock,
  membershipEffectExists,
  membershipRenewalNoticeExists,
  resetMembershipOperationalRetentionCursor,
} from '@voucha/test-helpers/membership-operational-retention'
import processPsql from '../processors.mts'

describe('processPsql retention continuations', () => {
  it('admits distinct deterministic continuation jobs until the capped sweep converges', async () => {
    await withClassifierRetentionSweepLock(async () => {
      const fixture = await createContinuationRunFixture()
      const owned = fixture.terminalIds.slice(0, 3)
      const outside = [fixture.terminalIds[3]!]
      expect(await countClassifierRows('classifier_runs', outside)).toBe(1)
      const initialJobId = `retention-test-${randomUUID()}`
      const runId = createHash('sha256').update(initialJobId).digest('hex')
      const continuationIds = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
      onTestFinished(async () => {
        await Promise.all(continuationIds.map(async id => (await psql.getJob(id))?.remove()))
      })
      const options = {
        retention: {
          families: ['classifierRecords'] as const,
          classifierRecords: {
            activeSweeps: ['runs'],
            runIds: owned,
            now: fixture.now,
            batchSize: 1,
            maxBatches: 1,
          },
        },
      }
      const firstResult = await processPsql(
        'dataRetentionCleanup',
        {},
        undefined,
        initialJobId,
        options,
      )
      expect(firstResult).toMatchObject({
        classifierRecords: { runs: { scanned: 1, deleted: 1, hasMore: true } },
      })
      const first = await psql.getJob(continuationIds[0]!)
      expect(first?.data).toMatchObject({ continuation: { runId, step: 1 } })
      const secondResult = await processPsql(
        'dataRetentionCleanup',
        first?.data as PsqlRetentionJobData,
        undefined,
        first!.id,
        options,
      )
      expect(secondResult).toMatchObject({
        classifierRecords: { runs: { scanned: 1, deleted: 1, hasMore: true } },
      })
      const second = await psql.getJob(continuationIds[1]!)
      expect(second?.data).toMatchObject({ continuation: { runId, step: 2 } })
      const thirdResult = await processPsql(
        'dataRetentionCleanup',
        second?.data as PsqlRetentionJobData,
        undefined,
        second!.id,
        options,
      )
      expect(thirdResult).toMatchObject({
        classifierRecords: { runs: { scanned: 1, deleted: 1, hasMore: false } },
      })
      expect(await psql.getJob(continuationIds[2]!)).toBeNull()
      expect(await countClassifierRows('classifier_runs', owned)).toBe(0)
      expect(await countClassifierRows('classifier_runs', outside)).toBe(1)
    })
  })

  describe('daily copyright admission', () => {
    it('admits pending copyright families from the daily result and propagates admission failure', async () => {
      const fixture = await createDailyCopyrightContinuationFixture()
      const initialJobId = `retention-test-${randomUUID()}`
      const runId = createHash('sha256').update(initialJobId).digest('hex')
      const copyrightId = `data-retention-copyright__${runId}__1`
      onTestFinished(async () => {
        await (await psql.getJob(copyrightId))?.remove()
      })
      await dataRetentionConfig.waitForInitialization()
      onTestFinished(
        overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
          batch_size: 1,
          max_batches_per_run: 1,
        }),
      )
      onTestFinished(
        loseNextPsqlJobAddReplyForTest(copyrightId, new Error('admission acknowledgement failed')),
      )
      expect(await readCopyrightOperationalRow('form_screening_attempts', fixture.outsideId)).toBe(
        true,
      )
      await expect(
        processPsql('dataRetentionCleanup', {}, undefined, initialJobId, {
          retention: {
            families: ['copyrightFormScreeningAttempts'],
            copyrightScopes: fixture.copyrightScopes,
            copyrightNow: fixture.now,
          },
        }),
      ).rejects.toThrow('admission acknowledgement failed')
      expect((await psql.getJob(copyrightId))?.data).toEqual({
        continuation: {
          runId,
          step: 1,
          activeClassifierSweeps: [],
          activeMembershipFamilies: [],
          activePostModerationKinds: [],
          copyrightFamilies: ['copyrightFormScreeningAttempts'],
        },
      })
      expect(await readCopyrightOperationalRow('form_screening_attempts', fixture.ids[0]!)).toBe(
        false,
      )
      expect(await readCopyrightOperationalRow('form_screening_attempts', fixture.ids[1]!)).toBe(
        true,
      )
      expect(await readCopyrightOperationalRow('form_screening_attempts', fixture.outsideId)).toBe(
        true,
      )
    })
  })
  it('does not restart a finished independent classifier sweep while another page drains', async () => {
    await withClassifierRetentionSweepLock(async () => {
      const fixture = await createIndependentClassifierContinuationFixture()
      const ownedBatches = fixture.batches.slice(0, 3)
      const ownedRequests = fixture.requests.slice(0, 2).map(row => row.requestId)
      const outsideBatches = [fixture.batches[3]!]
      const outsideRequests = [fixture.requests[2]!.requestId]
      const beforeBatches = await readClassifierDefaultLineage(outsideBatches)
      expect(beforeBatches).toEqual({ results: 1, candidates: 1, calls: 1, batches: 1 })
      expect(await readContinuationRequestIds(outsideRequests)).toEqual(outsideRequests)
      const initialJobId = `retention-test-${randomUUID()}`
      const runId = createHash('sha256').update(initialJobId).digest('hex')
      const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
      onTestFinished(async () => {
        await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
      })
      const options = {
        retention: {
          families: ['classifierRecords'] as const,
          classifierRecords: {
            activeSweeps: ['topicResults', 'requests'],
            topicResultBatchIds: ownedBatches,
            requestIds: ownedRequests,
            now: fixture.now,
            batchSize: 1,
            maxBatches: 1,
          },
        },
      }
      await processPsql('dataRetentionCleanup', {}, undefined, initialJobId, options)
      const first = await psql.getJob(ids[0]!)
      const firstSweeps = (first!.data as PsqlRetentionJobData).continuation?.activeClassifierSweeps
      expect(firstSweeps).toContain('requests')
      expect(firstSweeps).toContain('topicResults')
      await processPsql(
        'dataRetentionCleanup',
        first?.data as PsqlRetentionJobData,
        undefined,
        first!.id,
        options,
      )
      const second = await psql.getJob(ids[1]!)
      const secondSweeps = (second!.data as PsqlRetentionJobData).continuation
        ?.activeClassifierSweeps
      expect(secondSweeps).toContain('topicResults')
      expect(secondSweeps).not.toContain('requests')
      expect(await readContinuationRequestIds(ownedRequests)).toEqual([])
      await fixture.rearmRequest()
      await processPsql(
        'dataRetentionCleanup',
        second?.data as PsqlRetentionJobData,
        undefined,
        second!.id,
        options,
      )
      expect(await psql.getJob(ids[2]!)).toBeNull()
      expect(await readClassifierDefaultLineage(ownedBatches)).toEqual({
        results: 0,
        candidates: 3,
        calls: 3,
        batches: 3,
      })
      expect(await readContinuationRequestIds([ownedRequests[0]!])).toEqual([ownedRequests[0]!])
      expect(await readClassifierDefaultLineage(outsideBatches)).toEqual(beforeBatches)
      expect(await readContinuationRequestIds(outsideRequests)).toEqual(outsideRequests)
    })
  })
  it('continues only the membership families that exceeded their cap', async () => {
    const reservation = await acquireMembershipOperationalRetentionTestLock()
    onTestFinished(() => reservation.release())
    await resetMembershipOperationalRetentionCursor('entitlement_effects')
    await resetMembershipOperationalRetentionCursor('renewal_notices')
    const {
      at,
      effectUser,
      firstEffect,
      secondEffect,
      firstNotice,
      secondNotice,
      thirdNotice,
      outsideEffect,
      outsideNotice,
      outsideBefore,
      options,
    } = await createMembershipContinuationFixture()
    expect(outsideBefore).toMatchObject([
      {
        effect: { id: outsideEffect.effectId },
        notice: { membership_id: outsideNotice },
      },
    ])
    const initialJobId = `retention-test-${randomUUID()}`
    const runId = createHash('sha256').update(initialJobId).digest('hex')
    const ids = [1, 2, 3].map(step => `data-retention-cleanup__${runId}__${step}`)
    onTestFinished(async () => {
      await Promise.all(ids.map(async id => (await psql.getJob(id))?.remove()))
    })
    const initial = await processPsql('dataRetentionCleanup', {}, undefined, initialJobId, options)
    expect(initial).toMatchObject({
      deliveredMembershipEntitlementEffects: { deleted: 1, hasMore: true },
      endedMembershipRenewalNotices: { deleted: 1, hasMore: true },
    })
    const first = await psql.getJob(ids[0]!)
    expect(first?.opts.attempts).toBe(3)
    expect((first!.data as PsqlRetentionJobData).continuation?.activeMembershipFamilies).toEqual([
      'deliveredMembershipEntitlementEffects',
      'endedMembershipRenewalNotices',
    ])
    const next = await processPsql(
      'dataRetentionCleanup',
      first?.data as PsqlRetentionJobData,
      undefined,
      first!.id,
      options,
    )
    expect(next).toMatchObject({
      deliveredMembershipEntitlementEffects: { deleted: 1, hasMore: false },
      endedMembershipRenewalNotices: { deleted: 1, hasMore: true },
    })
    const second = await psql.getJob(ids[1]!)
    expect((second!.data as PsqlRetentionJobData).continuation?.activeMembershipFamilies).toEqual([
      'endedMembershipRenewalNotices',
    ])
    expect(await membershipEffectExists(firstEffect.effectId)).toBe(false)
    expect(await membershipEffectExists(secondEffect.effectId)).toBe(false)
    await rearmMembershipEffectForContinuation(
      firstEffect.effectId,
      firstEffect.changeId,
      effectUser.id,
      at,
    )
    const last = await processPsql(
      'dataRetentionCleanup',
      second?.data as PsqlRetentionJobData,
      undefined,
      second!.id,
      options,
    )
    expect(last).toMatchObject({
      deliveredMembershipEntitlementEffects: { deleted: 0, hasMore: false },
      endedMembershipRenewalNotices: { deleted: 1, hasMore: false },
    })
    expect(await membershipEffectExists(firstEffect.effectId)).toBe(true)
    expect(await membershipRenewalNoticeExists(firstNotice)).toBe(false)
    expect(await membershipRenewalNoticeExists(secondNotice)).toBe(false)
    expect(await membershipRenewalNoticeExists(thirdNotice)).toBe(false)
    expect(await psql.getJob(ids[2]!)).toBeNull()
    expect(
      await readMembershipContinuationOutsideState(outsideEffect.effectId, outsideNotice),
    ).toEqual(outsideBefore)
  })
})
