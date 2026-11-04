import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { peekLoginAttempt } from '@services/mfa/login-attempt'
import { upsertUser } from '@services/users/create'
import { createTestUser, insertTestTotpAuthenticator } from '@voucha/test-helpers'
import {
  failOwnedAccountSecurityEmailEnqueue,
  failOwnedGithubFriendSyncEnqueue,
  readAccountSecurityEmailJobs,
  readGithubFriendSyncJobs,
} from '@voucha/test-helpers/oauth-completion-effects'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import { connectTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import { completeOAuthAuthorization } from '../authorization-completion.mts'
import { completeOAuthAuthorizationTransaction } from '../authorization-completion-transaction.mts'
import {
  failOwnedVoteWeightEnqueue,
  readOwnedVoteWeightRecalculationJobs,
} from '../../../test-helpers/vote-weight-dirty-marker.mts'
import {
  createOAuthAccount,
  insertCompletionReadyAuthorization,
  registerCleanup,
} from '../../../test-helpers/services/oauth/authorization-completion.mts'

const postCommitFailure = () =>
  Object.assign(new Error('Valkey unavailable'), { tags: { suppressLogging: true } })

/** A GitHub account not yet linked to the user, ready for a connect completion. */
async function insertNewGithubConnection() {
  const cleanup = registerCleanup()
  const user = await createTestUser()
  cleanup.userIds.push(user.id)
  const actor = await createTestAccountChangeActor(user.id)
  const account = await createOAuthAccount('github', cleanup)
  const completionToken = randomBytes(32).toString('base64url')
  const flowId = await insertCompletionReadyAuthorization(
    {
      accountId: account.provider_user_id,
      provider: 'github',
      deviceId: actor.session.did,
      sessionId: actor.session.sid,
      completionToken,
      purpose: 'connect',
      callbackMode: 'web',
      initiatingUserId: user.id,
    },
    cleanup,
  )
  return {
    user,
    account,
    options: {
      flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      currentUserId: user.id,
      deviceId: actor.session.did,
      sessionId: actor.session.sid,
    },
  }
}

describe('OAuth authorization completion orchestration', () => {
  it('replays the durable MFA challenge without refreshing its login attempt', async () => {
    const cleanup = registerCleanup()
    const account = await createOAuthAccount('github', cleanup)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const user = await upsertUser({
      emailAddress: account.provider_user_email_address!,
      deviceId,
      sessionId,
    })
    cleanup.userIds.push(user.id)
    await connectTestOAuthAccount('github', user.id, account.provider_user_id)
    await insertTestTotpAuthenticator(user.id, `completion-mfa-${randomUUID()}`)
    const completionToken = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'authenticate',
        callbackMode: 'web',
      },
      cleanup,
    )
    const options = {
      flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      deviceId,
      sessionId,
    }

    const first = await completeOAuthAuthorization(options)
    expect(first).toMatchObject({ status: 'mfa_required' })
    if (first.status !== 'mfa_required') throw new Error('Expected MFA result')
    await expect(completeOAuthAuthorization(options)).resolves.toEqual(first)
    await expect(peekLoginAttempt(first.loginAttemptId)).resolves.toMatchObject({
      userId: user.id,
      authOrigin: 'web',
    })
  })

  it('fails closed when a durable authentication unexpectedly requires MFA at first issuance', async () => {
    const cleanup = registerCleanup()
    const account = await createOAuthAccount('github', cleanup)
    const deviceId = randomUUID()
    const sessionId = randomUUID()
    const completionToken = randomBytes(32).toString('base64url')
    const flowId = await insertCompletionReadyAuthorization(
      {
        accountId: account.provider_user_id,
        provider: 'github',
        deviceId,
        sessionId,
        completionToken,
        purpose: 'authenticate',
        callbackMode: 'web',
      },
      cleanup,
    )
    const options = {
      flowId,
      completionToken,
      completionTokenSource: 'cookie' as const,
      deviceId,
      sessionId,
    }
    const durable = await completeOAuthAuthorizationTransaction(options)
    expect(durable).toMatchObject({ kind: 'authenticated' })
    if (durable.kind !== 'authenticated') throw new Error('Expected authentication')
    cleanup.userIds.push(durable.userId)
    await insertTestTotpAuthenticator(durable.userId, `completion-late-${randomUUID()}`)

    await expect(completeOAuthAuthorization(options)).rejects.toThrow(
      'Stored OAuth authentication result unexpectedly requires MFA',
    )
  })

  it('runs connection effects exactly once for a newly completed connection', async () => {
    const { user, account, options } = await insertNewGithubConnection()

    await expect(completeOAuthAuthorization(options)).resolves.toMatchObject({
      status: 'connected',
      name: 'Broker Completion',
    })
    await expect(completeOAuthAuthorization(options)).resolves.toMatchObject({
      status: 'connected',
    })

    expect((await readOwnedVoteWeightRecalculationJobs(user.id)).map(job => job.data)).toEqual([
      { userId: user.id },
    ])
    expect(await readGithubFriendSyncJobs(account.account_id)).toHaveLength(1)
    expect(await readAccountSecurityEmailJobs(user.email_address!)).toHaveLength(1)
  })

  it('returns a durable connection when the account security email enqueue fails', async () => {
    const { user, account, options } = await insertNewGithubConnection()
    const failure = failOwnedAccountSecurityEmailEnqueue(user.email_address!, postCommitFailure())
    try {
      await expect(completeOAuthAuthorization(options)).resolves.toMatchObject({
        status: 'connected',
        account: { provider_user_id: account.provider_user_id },
      })
    } finally {
      failure.mockRestore()
    }
    expect(await readAccountSecurityEmailJobs(user.email_address!)).toEqual([])
    expect((await readOwnedVoteWeightRecalculationJobs(user.id)).map(job => job.data)).toEqual([
      { userId: user.id },
    ])
    expect(await readGithubFriendSyncJobs(account.account_id)).toHaveLength(1)
  })

  it('returns a durable connection when the friend sync enqueue fails', async () => {
    const { user, account, options } = await insertNewGithubConnection()
    const failure = failOwnedGithubFriendSyncEnqueue(account.account_id, postCommitFailure())
    try {
      await expect(completeOAuthAuthorization(options)).resolves.toMatchObject({
        status: 'connected',
        account: { provider_user_id: account.provider_user_id },
      })
    } finally {
      failure.mockRestore()
    }
    expect(await readGithubFriendSyncJobs(account.account_id)).toEqual([])
    expect(await readAccountSecurityEmailJobs(user.email_address!)).toHaveLength(1)
    expect((await readOwnedVoteWeightRecalculationJobs(user.id)).map(job => job.data)).toEqual([
      { userId: user.id },
    ])
  })

  it('returns a durable connection and continues friend sync when the vote-weight enqueue fails', async () => {
    const { user, account, options } = await insertNewGithubConnection()
    const failure = failOwnedVoteWeightEnqueue(user.id, postCommitFailure())
    try {
      await expect(completeOAuthAuthorization(options)).resolves.toMatchObject({
        status: 'connected',
        account: { provider_user_id: account.provider_user_id },
      })
    } finally {
      failure.mockRestore()
    }
    expect(await readOwnedVoteWeightRecalculationJobs(user.id)).toEqual([])
    expect(await readGithubFriendSyncJobs(account.account_id)).toHaveLength(1)
  })
})
