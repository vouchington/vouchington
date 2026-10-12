import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { createTestExpiryWindow } from '@voucha/test-helpers/data'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  getTestOAuthRetentionRowCounts,
  lockTestOAuthRetentionFamily,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import { createTestApprovedOAuthAuthorization } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  deleteExpiredOAuthAuthorizationServerArtifacts,
  exchangeOAuthAuthorizationCode,
} from './index.mts'

describe('OAuth retention family phase', () => {
  it('uses one short physical batch across empty and occupied phases', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      childExpiresAt: window.firstEligibleDate,
      only: 'family',
    })
    const before = await getTestOAuthRetentionRowCounts(flow.client.client_id)

    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(4, {
      ...window,
      maxBatches: 1,
    })
    const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(result).toEqual({ deleted: 3, hasMore: false })
    expect(before.total - after.total).toBe(3)
    expect(after).toMatchObject({ access: 0, refresh: 0, families: 0 })
  })

  it('spends the family share on access children before refresh children', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      extraAccessTokens: 1,
      childExpiresAt: window.afterUpperBoundDate,
    })
    const before = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(before).toMatchObject({ requests: 1, codes: 1, access: 2, refresh: 1, families: 1 })

    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
      ...window,
      maxBatches: 4,
    })
    const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(result).toEqual({ deleted: 4, hasMore: true })
    expect(before.total - after.total).toBe(4)
    expect(after).toMatchObject({ requests: 0, codes: 0, access: 0, refresh: 1, families: 1 })
  })

  it('deletes an empty expired family before an unrelated expired refresh token', async () => {
    const user = await createTestUserDirect()
    const familyFlow = await createTestApprovedOAuthAuthorization(user)
    await exchangeOAuthAuthorizationCode({
      clientId: familyFlow.client.client_id,
      code: familyFlow.code,
      codeVerifier: familyFlow.verifier,
      redirectUri: familyFlow.redirectUri,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(familyFlow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      only: 'family',
      childExpiresAt: window.afterUpperBoundDate,
    })
    const drain = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
      ...window,
      maxBatches: 2,
    })
    expect(drain.deleted).toBe(2)
    await expect(
      getTestOAuthRetentionRowCounts(familyFlow.client.client_id),
    ).resolves.toMatchObject({
      access: 0,
      refresh: 0,
      families: 1,
    })

    const otherFlow = await createTestApprovedOAuthAuthorization(user)
    await exchangeOAuthAuthorizationCode({
      clientId: otherFlow.client.client_id,
      code: otherFlow.code,
      codeVerifier: otherFlow.verifier,
      redirectUri: otherFlow.redirectUri,
    })
    await prepareTestOAuthRetentionRows(otherFlow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      only: 'requests',
      childExpiresAt: window.firstEligibleDate,
    })
    const familyBefore = await getTestOAuthRetentionRowCounts(familyFlow.client.client_id)
    const otherBefore = await getTestOAuthRetentionRowCounts(otherFlow.client.client_id)
    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
      ...window,
      maxBatches: 2,
    })
    const familyAfter = await getTestOAuthRetentionRowCounts(familyFlow.client.client_id)
    const otherAfter = await getTestOAuthRetentionRowCounts(otherFlow.client.client_id)
    expect(result).toEqual({ deleted: 2, hasMore: true })
    expect(familyBefore.total + otherBefore.total - familyAfter.total - otherAfter.total).toBe(2)
    expect(familyAfter.families).toBe(0)
    expect(otherAfter.refresh).toBe(1)
  })

  it('drains a large family across runs without an uncounted cascade', async () => {
    const user = await createTestUserDirect()
    const flow = await createTestApprovedOAuthAuthorization(user)
    await exchangeOAuthAuthorizationCode({
      clientId: flow.client.client_id,
      code: flow.code,
      codeVerifier: flow.verifier,
      redirectUri: flow.redirectUri,
    })
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(flow.client.client_id, {
      expiresAt: window.firstEligibleDate,
      only: 'family',
      extraAccessTokens: 1,
      extraRefreshTokens: 1,
      childExpiresAt: window.afterUpperBoundDate,
    })
    let before = await getTestOAuthRetentionRowCounts(flow.client.client_id)
    expect(before).toMatchObject({ access: 2, refresh: 2, families: 1 })
    for (const [deleted, expected] of [
      [2, { access: 0, refresh: 2, families: 1 }],
      [2, { access: 0, refresh: 0, families: 1 }],
      [1, { access: 0, refresh: 0, families: 0 }],
    ] as const) {
      const result = await deleteExpiredOAuthAuthorizationServerArtifacts(1, {
        ...window,
        maxBatches: 2,
      })
      const after = await getTestOAuthRetentionRowCounts(flow.client.client_id)
      expect(result).toEqual({ deleted, hasMore: deleted === 2 })
      expect(before.total - after.total).toBe(deleted)
      expect(after).toMatchObject(expected)
      before = after
    }
  })

  it('reaches an independently expired live-family token while an expired family is locked', async () => {
    const user = await createTestUserDirect()
    const expired = await createTestApprovedOAuthAuthorization(user)
    const live = await createTestApprovedOAuthAuthorization(user)
    for (const flow of [expired, live]) {
      await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
    }
    const window = createTestExpiryWindow()
    await prepareTestOAuthRetentionRows(expired.client.client_id, {
      expiresAt: window.firstEligibleDate,
      childExpiresAt: window.afterUpperBoundDate,
      only: 'family',
    })
    await prepareTestOAuthRetentionRows(live.client.client_id, {
      expiresAt: window.afterUpperBoundDate,
      childExpiresAt: window.firstEligibleDate,
      only: 'requests',
    })
    await using held = await beginTransaction()
    let released = false
    onTestFinished(async () => {
      if (!released) await held.rollback()
    })
    await lockTestOAuthRetentionFamily(expired.client.client_id, held)

    const first = await deleteExpiredOAuthAuthorizationServerArtifacts(4, {
      ...window,
      maxBatches: 1,
    })
    expect(first).toEqual({ deleted: 1, hasMore: true })
    await expect(getTestOAuthRetentionRowCounts(live.client.client_id)).resolves.toMatchObject({
      refresh: 0,
      families: 1,
    })
    await expect(getTestOAuthRetentionRowCounts(expired.client.client_id)).resolves.toMatchObject({
      access: 1,
      refresh: 1,
      families: 1,
    })

    await held.rollback()
    released = true
    const second = await deleteExpiredOAuthAuthorizationServerArtifacts(4, {
      ...window,
      maxBatches: 1,
    })
    expect(second).toEqual({ deleted: 3, hasMore: false })
    await expect(getTestOAuthRetentionRowCounts(expired.client.client_id)).resolves.toMatchObject({
      access: 0,
      refresh: 0,
      families: 0,
    })
  })

  it('pages multiple short expired families before the physical batch cap reports completion', async () => {
    const user = await createTestUserDirect()
    const window = createTestExpiryWindow()
    const clients: string[] = []
    for (let index = 0; index < 3; index++) {
      const flow = await createTestApprovedOAuthAuthorization(user)
      clients.push(flow.client.client_id)
      await exchangeOAuthAuthorizationCode({
        clientId: flow.client.client_id,
        code: flow.code,
        codeVerifier: flow.verifier,
        redirectUri: flow.redirectUri,
      })
      await prepareTestOAuthRetentionRows(flow.client.client_id, {
        expiresAt: window.firstEligibleDate,
        childExpiresAt: window.afterUpperBoundDate,
        only: 'family',
      })
    }

    const result = await deleteExpiredOAuthAuthorizationServerArtifacts(12, {
      ...window,
      maxBatches: 1,
    })
    expect(result).toEqual({ deleted: 9, hasMore: false })
    for (const clientId of clients) {
      await expect(getTestOAuthRetentionRowCounts(clientId)).resolves.toMatchObject({
        access: 0,
        refresh: 0,
        families: 0,
      })
    }
  })
})
