import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import { holdCopyrightCaseBeforeThreadEligibility } from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import {
  enterOwnedCopyrightThreadChildPhase,
  readOwnedCopyrightThreadChildren,
  readOwnedCopyrightCaseHoldHistory,
} from '@voucha/test-helpers/copyright-thread-preservation-fixture'
import {
  placeCopyrightCasePreservationHold,
  releaseCopyrightCasePreservationHold,
} from './retention-review-closures.mts'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightOperationalScope } from '@voucha/test-helpers/copyright-operational-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import {
  seedTestCopyrightAncestorEdge,
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { afterCopyrightHoldCoverage } from '@voucha/test-helpers/copyright-preservation-coverage-interleave'
import {
  releaseUserPreservationHold,
  placeUserPreservationHold,
  getUserPreservationHoldState,
} from '../users/preservation-holds.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const day = 24 * 60 * 60 * 1000

describe('copyright preservation transaction commit order', () => {
  it.each(['account', 'case'] as const)(
    'preserves exact %s hold and retirement facts in either commit outcome',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const notice = await createRetentionMinimalCase()
      const initial = await createRetentionParsedEmail('hold-ssi-initial', {
        sesMessageId: notice.initialEmailSesMessageId,
      })
      const reply = await createRetentionParsedEmail('hold-ssi-reply', { reply: true })
      await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
      await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
      expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBeGreaterThan(0)
      const scope1 = createCopyrightOperationalScope([notice.noticeId])
      await enterOwnedCopyrightThreadChildPhase(
        scope1,
        notice.noticeId,
        reply.id,
        'references',
        false,
      )
      const before = await readCopyrightThreadReferenceState(reply.id)
      let retired: boolean | null = null
      let holdId: string | undefined
      try {
        const hold = await afterCopyrightHoldCoverage(
          notice.noticeId,
          async () => {
            retired =
              (
                await sweepCopyrightCaseThreads({
                  scope: scope1,
                  now: new Date(Date.now() + 181 * day),
                  replyDays: 180,
                  batchSize: 10,
                  maxBatches: 100,
                })
              ).deleted > 0
          },
          async () => {
            const value = await (kind === 'account'
              ? placeUserPreservationHold(admin, notice.posterId, 'native-retirement-conflict')
              : placeCopyrightCasePreservationHold(
                  notice.moderator,
                  notice.noticeId,
                  'litigation_threat',
                ))
            holdId = value.id
            return value
          },
        )
          .then(value => ({ status: 'fulfilled', value }))
          .catch((err: unknown) => ({ status: 'rejected', reason: err }))
        const conflict = expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({
            status: 409,
            code: 'CONFLICT',
            cause: expect.objectContaining({ code: '40001' }),
          }),
        })
        const success = expect.objectContaining({
          status: 'fulfilled',
          value: expect.objectContaining({ id: holdId }),
        })
        expect([
          {
            hold: conflict,
            retired: true,
            references: { tokenId: null, referenceCount: 0 },
            accounts: 0,
            cases: 0,
            marker: true,
          },
          {
            hold: conflict,
            retired: false,
            references: before,
            accounts: 0,
            cases: 0,
            marker: false,
          },
          {
            hold: conflict,
            retired: null,
            references: before,
            accounts: 0,
            cases: 0,
            marker: false,
          },
          {
            hold: success,
            retired: false,
            references: before,
            accounts: Number(kind === 'account'),
            cases: Number(kind === 'case'),
            marker: false,
          },
        ]).toContainEqual({
          hold,
          retired,
          references: await readCopyrightThreadReferenceState(reply.id),
          accounts: (await getUserPreservationHoldState(admin, notice.posterId)).holds.length,
          cases: (await readOwnedCopyrightCaseHoldHistory(notice.noticeId)).length,
          marker: (await readCopyrightThreadRetirementBound(notice.noticeId)) !== null,
        })
      } finally {
        if (holdId) {
          if (kind === 'account') await releaseUserPreservationHold(admin, notice.posterId)
          else await releaseCopyrightCasePreservationHold(notice.moderator, notice.noticeId, holdId)
        }
      }
    },
  )
  it.each(['matched_token', 'reply_edges', 'ancestor_edges'] as const)(
    'retains %s when the account hold commits first',
    async family => {
      const admin = await createTestUser({ administrator: true })
      const notice = await createRetentionMinimalCase()
      const initial = await createRetentionParsedEmail('hold-family-initial', {
        sesMessageId: notice.initialEmailSesMessageId,
      })
      const reply = await createRetentionParsedEmail('hold-family-reply', { reply: true })
      const token = (await readCopyrightThreadReferenceState(reply.id)).tokenId!
      await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
      await linkTestCopyrightEmailIntake(
        reply.id,
        notice.noticeId,
        'thread',
        notice.moderator.id,
        family === 'matched_token' ? token : undefined,
      )
      if (family !== 'matched_token') await seedTestCopyrightAncestorEdge(reply.id, initial.id)
      const target = family === 'ancestor_edges' ? initial.id : reply.id
      const scope2 = createCopyrightOperationalScope([notice.noticeId])
      await enterOwnedCopyrightThreadChildPhase(
        scope2,
        notice.noticeId,
        target,
        family === 'matched_token' ? 'references' : family,
      )
      const before = await readOwnedCopyrightThreadChildren(target)
      expect({ matchedToken: before.matched_token_id, edges: before.edges }).toEqual({
        matchedToken: family === 'matched_token' ? token : null,
        edges: family === 'matched_token' ? 0 : 1,
      })
      const failures: unknown[] = []
      let held = false
      let holdOutcome: unknown
      try {
        const result = await holdCopyrightCaseBeforeThreadEligibility(
          notice.noticeId,
          async () => {
            holdOutcome = await placeUserPreservationHold(admin, notice.posterId, family)
              .then(value => {
                held = true
                return { status: 'fulfilled', value }
              })
              .catch((err: unknown) => ({ status: 'rejected', reason: err }))
          },
          () =>
            sweepCopyrightCaseThreads({
              scope: scope2,
              now: new Date(Date.now() + 181 * day),
              replyDays: 180,
              batchSize: 10,
              maxBatches: 100,
            }),
          err => failures.push(err),
        )
        const nativeAbort = expect.objectContaining({ code: '40001' })
        const holdAbort = expect.objectContaining({
          status: 'rejected',
          reason: expect.objectContaining({ status: 409, code: 'CONFLICT', cause: nativeAbort }),
        })
        const holdSuccess = expect.objectContaining({ status: 'fulfilled' })
        const state = {
          hold: holdOutcome,
          deleted: result.deleted > 0,
          children: await readOwnedCopyrightThreadChildren(target),
          failures,
        }
        expect([
          { hold: holdSuccess, deleted: false, children: before, failures: [nativeAbort] },
          { hold: holdSuccess, deleted: false, children: before, failures: [] },
          {
            hold: holdAbort,
            deleted: true,
            children: { matched_token_id: null, edges: 0 },
            failures: [],
          },
          { hold: holdAbort, deleted: false, children: before, failures: [nativeAbort] },
        ]).toContainEqual(state)
      } finally {
        if (held) await releaseUserPreservationHold(admin, notice.posterId)
      }
    },
  )
  it('retains thread records when a case hold commits before admission', async () => {
    const notice = await createRetentionMinimalCase()
    const initial = await createRetentionParsedEmail('case-hold-initial', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('case-hold-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
    const before = await readCopyrightThreadReferenceState(reply.id)
    const scope3 = createCopyrightOperationalScope([notice.noticeId])
    let holdId: string | undefined
    let holdOutcome: unknown
    const failures: unknown[] = []
    try {
      const result = await holdCopyrightCaseBeforeThreadEligibility(
        notice.noticeId,
        async () => {
          holdOutcome = await placeCopyrightCasePreservationHold(
            notice.moderator,
            notice.noticeId,
            'litigation_threat',
          )
            .then(value => {
              holdId = value.id
              return { status: 'fulfilled', value }
            })
            .catch((err: unknown) => ({ status: 'rejected', reason: err }))
        },
        () =>
          sweepCopyrightCaseThreads({
            scope: scope3,
            now: new Date(Date.now() + 181 * day),
            replyDays: 180,
            batchSize: 10,
            maxBatches: 100,
          }),
        err => failures.push(err),
      )
      const native = expect.objectContaining({ code: '40001' })
      const conflict = expect.objectContaining({
        status: 'rejected',
        reason: expect.objectContaining({ status: 409, code: 'CONFLICT', cause: native }),
      })
      const success = expect.objectContaining({ status: 'fulfilled' })
      expect([
        { hold: success, deleted: false, references: before, failures: [native], history: 1 },
        { hold: success, deleted: false, references: before, failures: [], history: 1 },
        { hold: conflict, deleted: false, references: before, failures: [native], history: 0 },
        {
          hold: conflict,
          deleted: true,
          references: { tokenId: null, referenceCount: 0 },
          failures: [],
          history: 0,
        },
      ]).toContainEqual({
        hold: holdOutcome,
        deleted: result.deleted > 0,
        references: await readCopyrightThreadReferenceState(reply.id),
        failures,
        history: (await readOwnedCopyrightCaseHoldHistory(notice.noticeId)).length,
      })
    } finally {
      if (holdId)
        await releaseCopyrightCasePreservationHold(notice.moderator, notice.noticeId, holdId)
    }
  })
})
