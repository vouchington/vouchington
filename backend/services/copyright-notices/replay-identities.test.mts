import {
  createCopyrightReplayOwner,
  raceCopyrightReplayFixtureAdmissions,
  recordCopyrightReplayFixtureIdentity,
  replayCopyrightReplayFixtureIdentity,
} from '@voucha/test-helpers/copyright-replay-identities'
import { createTestUser } from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CopyrightReplayInput } from './replay-admission-locks.mts'
import { acknowledgeEuCopyrightNotice } from './eu-acknowledgment.mts'
import { receiveEuCopyrightNotice } from './eu-notice-receipt.mts'
import { submitEuCopyrightRedress } from './eu-redress.mts'
import { recordEuCopyrightStatementOfReasons } from './eu-reasons.mts'
import { recordCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import type { EuTerritorialNoticeRequest } from './territorial-fields.mts'

const ENV = 'VOUCHA_COPYRIGHT_REPLAY_HMAC_KEYS'
const KEY_A = `codex-test-replay-a:${Buffer.alloc(32, 0x31).toString('base64')}`
const KEY_B = `codex-test-replay-b:${Buffer.alloc(32, 0x47).toString('base64')}`
const input = (
  identity: string,
  request = 'canonical request',
  requester = 'synthetic requester',
) =>
  ({
    family: 'form_notice',
    jurisdiction: 'us_dmca',
    identity,
    requester,
    request,
  }) satisfies CopyrightReplayInput

function euNoticeRequest(): EuTerritorialNoticeRequest {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    contentDescription: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hostedUseUrl: `https://example.test/${suffix}`,
    notifierName: `Notifier ${suffix}`,
    notifierEmail: `notifier-${suffix}@example.test`,
    goodFaithStatement: true,
  }
}

describe('copyright replay identity persistence', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('deduplicates and rekeys the same identity when active slots reverse', async () => {
    const owner = await createCopyrightReplayOwner()
    const replayInput = input(crypto.randomUUID())
    const snapshot = { notice_id: crypto.randomUUID(), receipt_id: crypto.randomUUID() }

    vi.stubEnv(ENV, `${KEY_A},${KEY_B}`)
    const id = await recordCopyrightReplayFixtureIdentity(owner.noticeId, replayInput, snapshot)
    vi.stubEnv(ENV, `${KEY_B},${KEY_A}`)
    const result = await replayCopyrightReplayFixtureIdentity(replayInput)

    expect(result).toMatchObject({
      identityId: id,
      outcomeCode: 'notice_received',
      liveSnapshot: snapshot,
    })
  })

  it('fails closed when a required slot is omitted or a version ID is reused with different material', async () => {
    const firstOwner = await createCopyrightReplayOwner()
    const firstInput = input(crypto.randomUUID())
    vi.stubEnv(ENV, `${KEY_B},${KEY_A}`)
    await recordCopyrightReplayFixtureIdentity(firstOwner.noticeId, firstInput, {
      notice_id: crypto.randomUUID(),
    })

    vi.stubEnv(ENV, KEY_A)
    await expect(replayCopyrightReplayFixtureIdentity(firstInput)).rejects.toThrow(
      'omits a required retained key version',
    )

    const secondOwner = await createCopyrightReplayOwner()
    vi.stubEnv(ENV, `${KEY_A},${KEY_B}`)
    await recordCopyrightReplayFixtureIdentity(secondOwner.noticeId, input(crypto.randomUUID()), {
      notice_id: crypto.randomUUID(),
    })
    const changedMaterial = `${KEY_A.split(':')[0]}:${Buffer.alloc(32, 0x3d).toString('base64')}`
    vi.stubEnv(ENV, `${changedMaterial},${KEY_B}`)
    await expect(
      recordCopyrightReplayFixtureIdentity(secondOwner.noticeId, input(crypto.randomUUID()), {
        notice_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow('key version material changed')
  })

  it('returns the exact live snapshot while rejecting a changed request under the same identity', async () => {
    const owner = await createCopyrightReplayOwner()
    const replayInput = input(crypto.randomUUID())
    const snapshot = {
      notice_id: crypto.randomUUID(),
      receipt_id: crypto.randomUUID(),
      exact_protocol_value: 'kept',
    }
    vi.stubEnv(ENV, `${KEY_A},${KEY_B}`)
    await recordCopyrightReplayFixtureIdentity(owner.noticeId, replayInput, snapshot)

    await expect(replayCopyrightReplayFixtureIdentity(replayInput)).resolves.toMatchObject({
      liveSnapshot: snapshot,
    })
    await expect(
      replayCopyrightReplayFixtureIdentity(input(replayInput.identity, 'changed request')),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('preserves the original requester binding after a privileged live replay', async () => {
    const owner = await createCopyrightReplayOwner()
    const replayInput = input(crypto.randomUUID(), 'acknowledgment', 'original requester')
    const snapshot = { id: crypto.randomUUID(), acknowledged_at: '2026-07-01T12:00:00.000Z' }
    vi.stubEnv(ENV, `${KEY_A},${KEY_B}`)
    await recordCopyrightReplayFixtureIdentity(owner.noticeId, replayInput, snapshot)

    await expect(
      replayCopyrightReplayFixtureIdentity(
        input(replayInput.identity, replayInput.request, 'privileged reviewer'),
        true,
      ),
    ).resolves.toMatchObject({ liveSnapshot: snapshot })
    await expect(
      replayCopyrightReplayFixtureIdentity(
        input(replayInput.identity, replayInput.request, 'privileged reviewer'),
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(replayCopyrightReplayFixtureIdentity(replayInput)).resolves.toMatchObject({
      liveSnapshot: snapshot,
    })
  })

  it('serializes opposite active-slot orders during concurrent first admissions', async () => {
    const [firstOwner, secondOwner] = await Promise.all([
      createCopyrightReplayOwner(),
      createCopyrightReplayOwner(),
    ])
    const replayInput = input(crypto.randomUUID())
    const snapshot = { notice_id: crypto.randomUUID() }
    vi.stubEnv(ENV, `${KEY_A},${KEY_B}`)

    const result = await raceCopyrightReplayFixtureAdmissions(
      firstOwner.noticeId,
      secondOwner.noticeId,
      replayInput,
      snapshot,
      () => vi.stubEnv(ENV, `${KEY_B},${KEY_A}`),
    )
    expect(result.firstId).toEqual(expect.any(String))
    expect(result.firstKeyVersionId).toBe(KEY_A.split(':')[0])
    expect(result.secondError).toMatch(/final duplicate recheck/)
  })

  it('rejects changed explanation text when a redress idempotency key is reused', async () => {
    const [claimant, staff, administrator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    vi.stubEnv(ENV, `${KEY_A},${KEY_B}`)
    await recordCopyrightJurisdictionPolicyApproval(administrator, {
      jurisdiction: 'eu_dsa',
      policyVersion: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    })
    const receipt = await receiveEuCopyrightNotice(
      { user: claimant, identity: `user:${claimant.id}` },
      crypto.randomUUID(),
      euNoticeRequest(),
    )
    await acknowledgeEuCopyrightNotice(claimant, receipt.notice_id)
    await recordEuCopyrightStatementOfReasons(staff, receipt.notice_id, {
      text: 'The reported use was reviewed.',
      publicExplanation: 'No action was taken.',
      outcome: 'no_action',
      targets: [],
    })
    const idempotencyKey = crypto.randomUUID()
    const created = await submitEuCopyrightRedress(
      claimant,
      receipt.notice_id,
      idempotencyKey,
      'Please reconsider the decision.',
    )
    expect(created.is_duplicate).toBe(false)
    await expect(
      submitEuCopyrightRedress(
        claimant,
        receipt.notice_id,
        idempotencyKey,
        'I am adding new facts to the appeal.',
      ),
    ).rejects.toMatchObject({ status: 409 })
  })
})
