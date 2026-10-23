import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  insertTestAccountCopyrightRationale,
  placeTestAccountPreservationHold,
  readTestCopyrightDecisionRationales,
} from '@voucha/test-helpers/copyright-mcp-audit'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { lockCopyrightRationaleRetentionPage } from '@services/copyright-notices/retention-erasure-preservation'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  createTestPendingOAuthAuthorization,
  issueTestOAuthTokensForClient,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  getTestOAuthRetentionRowCounts,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import {
  deleteTestNativeMintAudit,
  deleteTestNativeMintAuditForRetention,
  insertTestNativeMintAudit,
  testNativeMintAuditExists,
} from '@voucha/test-helpers/entities/oauth-retention-evidence'
import {
  insertPreservationHoldForTest,
  releasePreservationHoldForTest,
} from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { cleanupSecuritySourcePage } from './cleanup-security-records.mts'
import { SOURCES, sourcePlan } from './security-record-plans.mts'

describe('security record cleanup', () => {
  it('does not cascade a never-granted client into pending consent requests', async () => {
    const user = await createTestUser()
    const pending = await createTestPendingOAuthAuthorization(user, {
      ageNeverGrantedClient: true,
    })
    await prepareTestOAuthRetentionRows(pending.client.client_id, {
      expiresAt: new Date(Date.now() + 86_400_000),
      extraRequests: 2,
      only: 'requests',
    })
    await using query = await beginTransaction()
    const plan = sourcePlan('oauth_clients', new Date())
    const client = await query<{ id: string; first_granted_at: Date | null; aged: boolean }>(
      `/* testNeverGrantedClientWithRequests:lock */ SELECT id, first_granted_at,
         id < $2::uuid AS aged
       FROM oauth_clients WHERE client_id = $1::text FOR UPDATE`,
      [pending.client.client_id, getMinUUIDv7ForDate(plan.cutoffAt)],
    )
    expect(client.rows[0]?.first_granted_at).toBeNull()
    expect(client.rows[0]?.aged).toBe(true)
    const deletion = await query(
      `/* testNeverGrantedClientWithRequests:delete */ DELETE FROM oauth_clients target
       WHERE target.id = $1::uuid AND target.id < $2::uuid
         AND target.first_granted_at IS NULL
         AND ${plan.deletePredicate}`,
      [client.rows[0]!.id, getMinUUIDv7ForDate(plan.cutoffAt)],
    )
    expect(deletion.rowCount).toBe(0)
    expect((await getTestOAuthRetentionRowCounts(pending.client.client_id)).requests).toBe(3)
    // The existing OAuth artifact worker retires expired requests in capped pages. Once that
    // child family is drained, the same otherwise eligible client may be removed.
    const drained = await query(
      `/* testNeverGrantedClientWithRequests:drainFixture */
       DELETE FROM oauth_authorization_requests WHERE client_id = $1::uuid`,
      [client.rows[0]!.id],
    )
    expect(drained.rowCount).toBe(3)
    const retired = await query(
      `/* testNeverGrantedClientWithRequests:retire */ DELETE FROM oauth_clients target
       WHERE target.id = $1::uuid AND target.id < $2::uuid
         AND target.first_granted_at IS NULL
         AND ${plan.deletePredicate}`,
      [client.rows[0]!.id, getMinUUIDv7ForDate(plan.cutoffAt)],
    )
    expect(retired.rowCount).toBe(1)
  })

  it('rechecks a noncase rationale after a concurrent account hold commits', async () => {
    const actor = await createTestUserDirect({ administrator: true })
    const subject = await createTestUserDirect()
    const rationaleId = await insertTestAccountCopyrightRationale(subject.id, actor.id)
    const cutoff = sourcePlan('copyright_rationales_noncase', new Date('2032-01-01')).cutoffAt
    const listed = Promise.withResolvers<void>()
    await using hold = await beginTransaction()
    await placeTestAccountPreservationHold(hold, subject.id, actor.id)

    const deletion = withPostgresTransactionForTest(
      async query => {
        const locked = await lockCopyrightRationaleRetentionPage(query, [rationaleId])
        expect(locked.has(rationaleId)).toBe(true)
        await query(
          `/* testCopyrightRationaleHoldRace:cutoff */
           SELECT set_config('app.copyright_rationale_retention_cutoff', $1::text, true)`,
          [cutoff.toISOString()],
        )
        return query(
          `/* testCopyrightRationaleHoldRace:delete */
           DELETE FROM copyright_decision_rationales target
           WHERE target.id = $1::uuid AND
             fn_copyright_decision_rationale_retention_eligible(target, $2::timestamptz)`,
          [rationaleId, cutoff],
        )
      },
      { marker: 'listCopyrightRationaleRetentionAccounts', complete: listed.resolve },
    )
    // The page has read its candidate before this hold commits. Its account lock must wait,
    // then the fresh DELETE predicate observes the hold and retains the ciphertext.
    await listed.promise
    await hold.commit()
    expect((await deletion).rowCount).toBe(0)
    expect((await readTestCopyrightDecisionRationales(actor.id)).map(row => row.id)).toContain(
      rationaleId,
    )
  })

  it('does not cascade a revoked grant into younger authorization artifacts', async () => {
    const user = await createTestUser()
    const { clientId } = await issueTestOAuthTokensForClient(user, {
      audience: 'user',
      scope: 'mcp.user:read',
    })
    const grantId = uuidv7()
    const familyId = uuidv7()
    const now = new Date()
    const futureExpiry = new Date(now.getTime() + 30 * 86_400_000)
    const revokedAt = new Date(now.getTime() - 120 * 86_400_000)
    await using query = await beginTransaction()
    await query(
      `/* testRevokedGrantWithChildren:grant */ INSERT INTO oauth_grants
         (id, user_id, client_id, resource, scopes, revoked_at)
       SELECT $1::uuid, $2::uuid, client.id, 'https://test.voucha.ai/mcp',
         ARRAY['mcp.user:read']::api_scopes[], $4::timestamptz
       FROM oauth_clients client WHERE client.client_id = $3::text`,
      [grantId, user.id, clientId, revokedAt],
    )
    await query(
      `/* testRevokedGrantWithChildren:code */ INSERT INTO oauth_authorization_codes
         (grant_id, code_hash, redirect_uri, resource, scopes, code_challenge, expires_at)
       VALUES ($1::uuid, $2::text, 'https://test.voucha.ai/callback',
         'https://test.voucha.ai/mcp', ARRAY['mcp.user:read']::api_scopes[], $3::text, $4::timestamptz)`,
      [grantId, randomBytes(32).toString('hex'), 'A'.repeat(43), futureExpiry],
    )
    await query(
      `/* testRevokedGrantWithChildren:family */ INSERT INTO oauth_refresh_token_families
         (id, grant_id, resource, scopes, expires_at)
       VALUES ($1::uuid, $2::uuid, 'https://test.voucha.ai/mcp',
         ARRAY['mcp.user:read']::api_scopes[], $3::timestamptz)`,
      [familyId, grantId, futureExpiry],
    )
    await query(
      `/* testRevokedGrantWithChildren:refresh */ INSERT INTO oauth_refresh_tokens
         (family_id, token_hash, scopes, generation, expires_at)
       VALUES ($1::uuid, $2::text, ARRAY['mcp.user:read']::api_scopes[], 0, $3::timestamptz)`,
      [familyId, randomBytes(32).toString('hex'), futureExpiry],
    )
    await query(
      `/* testRevokedGrantWithChildren:access */ INSERT INTO oauth_access_tokens
         (grant_id, refresh_family_id, token_hash, resource, scopes, expires_at)
       VALUES ($1::uuid, $2::uuid, $3::text, 'https://test.voucha.ai/mcp',
         ARRAY['mcp.user:read']::api_scopes[], $4::timestamptz)`,
      [grantId, familyId, randomBytes(32).toString('hex'), futureExpiry],
    )
    await query(
      '/* testRevokedGrantWithChildren:lock */ SELECT id FROM oauth_grants WHERE id = $1::uuid FOR UPDATE',
      [grantId],
    )
    const plan = sourcePlan('oauth_grants', now)
    const deletion = await query(
      `/* testRevokedGrantWithChildren:delete */ DELETE FROM oauth_grants target
       WHERE target.id = $1::uuid AND ${plan.deletePredicate}`,
      [grantId],
    )
    expect(deletion.rowCount).toBe(0)
    const { rows } = await query<{ children: number }>(
      `/* testRevokedGrantWithChildren:remaining */ SELECT (
         (SELECT count(*) FROM oauth_authorization_codes WHERE grant_id = $1::uuid)
         + (SELECT count(*) FROM oauth_refresh_token_families WHERE grant_id = $1::uuid)
         + (SELECT count(*) FROM oauth_access_tokens WHERE grant_id = $1::uuid)
         + (SELECT count(*) FROM oauth_refresh_tokens WHERE family_id = $2::uuid))::integer AS children`,
      [grantId, familyId],
    )
    expect(rows[0]?.children).toBe(4)
    // The transaction intentionally rolls back its synthetic young artifacts.
  })

  it('retires aged native mint audit only after its account hold is released', async () => {
    const now = new Date()
    const cutoff = sourcePlan('oauth_native_mints', now).cutoffAt
    const user = await createTestUserDirect()
    const oldMintId = await insertTestNativeMintAudit(
      user.id,
      new Date(now.getTime() - 730 * 86_400_000),
    )
    const recentMintId = await insertTestNativeMintAudit(
      user.id,
      new Date(now.getTime() - 10 * 86_400_000),
    )
    const holdId = await insertPreservationHoldForTest(user.id, user.id)

    await expect(deleteTestNativeMintAudit(recentMintId)).rejects.toThrow(
      'oauth_native_session_token_mints rows are append-only',
    )
    await expect(deleteTestNativeMintAuditForRetention(oldMintId, cutoff)).rejects.toThrow(
      'oauth_native_session_token_mints rows are append-only',
    )
    expect(await testNativeMintAuditExists(oldMintId)).toBe(true)

    await releasePreservationHoldForTest(holdId, user.id)
    await deleteTestNativeMintAuditForRetention(oldMintId, cutoff)
    await expect(deleteTestNativeMintAuditForRetention(recentMintId, cutoff)).rejects.toThrow(
      'oauth_native_session_token_mints rows are append-only',
    )
    expect(await testNativeMintAuditExists(oldMintId)).toBe(false)
    expect(await testNativeMintAuditExists(recentMintId)).toBe(true)
  })

  it('prepares a bounded page for every source with its own typed cursor', async () => {
    // This cutoff predates synthetic records; the query checks every source without deleting
    // fixtures owned by another parallel test.
    const now = new Date('1974-01-02T00:00:00.000Z')
    const pages = await Promise.all(
      SOURCES.map(source => cleanupSecuritySourcePage(source, 1, now)),
    )
    expect(pages).toEqual(SOURCES.map(() => ({ deleted: 0, hasMore: false })))
  })
})
