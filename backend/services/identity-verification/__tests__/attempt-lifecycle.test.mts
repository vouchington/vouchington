import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getIdentityVerificationAttemptLifecycleByCheckout } from '@voucha/test-helpers/entities/identity-verification-attempt-lifecycle'
import { v7 } from 'uuid'
import {
  attachCheckoutToIdentityVerificationAttempt,
  reserveIdentityVerificationAttempt,
} from '../attempts.mts'
import {
  abandonIdentityVerificationProviderSession,
  beginIdentityVerificationProviderSession,
  consumeIdentityVerificationAttempt,
  releaseAttachedIdentityVerificationAttempt,
  releaseIdentityVerificationAttempt,
} from '../attempt-lifecycle.mts'

const unavailable = {
  status: 409,
  message: 'Identity verification attempt is no longer available.',
}

async function attachedAttempt() {
  const user = await createTestUser()
  const attempt = await reserveIdentityVerificationAttempt(user.id)
  const checkoutSessionId = `cs_${v7()}`
  await attachCheckoutToIdentityVerificationAttempt(attempt.id, checkoutSessionId)
  return { attemptId: attempt.id, checkoutSessionId }
}

const lifecycleOf = getIdentityVerificationAttemptLifecycleByCheckout

describe('releaseIdentityVerificationAttempt', () => {
  it('releases an attempt before provider creation starts', async () => {
    const { checkoutSessionId } = await attachedAttempt()

    await releaseIdentityVerificationAttempt(checkoutSessionId)

    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({
      released_at: expect.any(Date),
      consumed_at: null,
    })
  })

  it('leaves an attempt unreleased once provider creation started', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    await beginIdentityVerificationProviderSession(checkoutSessionId)

    await releaseIdentityVerificationAttempt(checkoutSessionId)

    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({ released_at: null })
  })
})

describe('releaseAttachedIdentityVerificationAttempt', () => {
  it('releases the attempt for its exact Checkout', async () => {
    const { attemptId, checkoutSessionId } = await attachedAttempt()

    await releaseAttachedIdentityVerificationAttempt(attemptId, checkoutSessionId)

    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({
      id: attemptId,
      released_at: expect.any(Date),
    })
  })

  it('rejects a Checkout that does not belong to the attempt', async () => {
    const { attemptId, checkoutSessionId } = await attachedAttempt()

    await expect(
      releaseAttachedIdentityVerificationAttempt(attemptId, `cs_${v7()}`),
    ).rejects.toMatchObject(unavailable)
    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({ released_at: null })
  })

  it('rejects an attempt whose provider creation already started', async () => {
    const { attemptId, checkoutSessionId } = await attachedAttempt()
    await beginIdentityVerificationProviderSession(checkoutSessionId)

    await expect(
      releaseAttachedIdentityVerificationAttempt(attemptId, checkoutSessionId),
    ).rejects.toMatchObject(unavailable)
    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({ released_at: null })
  })
})

describe('beginIdentityVerificationProviderSession', () => {
  it('marks provider creation started and treats a repeat as idempotent', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    const first = await lifecycleOf(checkoutSessionId)
    expect(first!.provider_creation_started_at).toBeInstanceOf(Date)

    await expect(
      beginIdentityVerificationProviderSession(checkoutSessionId),
    ).resolves.toBeUndefined()

    const second = await lifecycleOf(checkoutSessionId)
    expect(second!.provider_creation_started_at).toEqual(first!.provider_creation_started_at)
  })

  it('rejects an unknown Checkout', async () => {
    await expect(beginIdentityVerificationProviderSession(`cs_${v7()}`)).rejects.toMatchObject(
      unavailable,
    )
  })

  it('rejects a released attempt', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    await releaseIdentityVerificationAttempt(checkoutSessionId)

    await expect(beginIdentityVerificationProviderSession(checkoutSessionId)).rejects.toMatchObject(
      unavailable,
    )
  })
})

describe('abandonIdentityVerificationProviderSession', () => {
  it('clears the provider-creation marker so creation can restart', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    await beginIdentityVerificationProviderSession(checkoutSessionId)

    await abandonIdentityVerificationProviderSession(checkoutSessionId)

    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({
      provider_creation_started_at: null,
      consumed_at: null,
    })
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    expect((await lifecycleOf(checkoutSessionId))!.provider_creation_started_at).toBeInstanceOf(
      Date,
    )
  })

  it('leaves a consumed attempt untouched', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, 'vs_abandon_consumed')

    await abandonIdentityVerificationProviderSession(checkoutSessionId)

    const state = await lifecycleOf(checkoutSessionId)
    expect(state).toMatchObject({ provider_session_id: 'vs_abandon_consumed' })
    expect(state!.provider_creation_started_at).toBeInstanceOf(Date)
    expect(state!.consumed_at).toBeInstanceOf(Date)
  })
})

describe('consumeIdentityVerificationAttempt', () => {
  it('records the provider session and treats the same session as idempotent', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    const providerSessionId = `vs_${v7()}`
    await beginIdentityVerificationProviderSession(checkoutSessionId)

    await consumeIdentityVerificationAttempt(checkoutSessionId, providerSessionId)
    await expect(
      consumeIdentityVerificationAttempt(checkoutSessionId, providerSessionId),
    ).resolves.toBeUndefined()

    const state = await lifecycleOf(checkoutSessionId)
    expect(state).toMatchObject({ provider_session_id: providerSessionId, released_at: null })
    expect(state!.consumed_at).toBeInstanceOf(Date)
  })

  it('rejects a different provider session for an already consumed attempt', async () => {
    const { checkoutSessionId } = await attachedAttempt()
    const providerSessionId = `vs_${v7()}`
    await beginIdentityVerificationProviderSession(checkoutSessionId)
    await consumeIdentityVerificationAttempt(checkoutSessionId, providerSessionId)

    await expect(
      consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`),
    ).rejects.toMatchObject(unavailable)
    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({
      provider_session_id: providerSessionId,
    })
  })

  it('rejects an attempt whose provider creation never started', async () => {
    const { checkoutSessionId } = await attachedAttempt()

    await expect(
      consumeIdentityVerificationAttempt(checkoutSessionId, `vs_${v7()}`),
    ).rejects.toMatchObject(unavailable)
    expect(await lifecycleOf(checkoutSessionId)).toMatchObject({
      provider_session_id: null,
      consumed_at: null,
    })
  })

  it('rejects an unknown Checkout', async () => {
    await expect(
      consumeIdentityVerificationAttempt(`cs_${v7()}`, `vs_${v7()}`),
    ).rejects.toMatchObject(unavailable)
  })
})
