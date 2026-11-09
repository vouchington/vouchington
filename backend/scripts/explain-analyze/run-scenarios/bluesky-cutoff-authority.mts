import assert from 'node:assert/strict'
import { v7 } from 'uuid'
import { beginTransaction, write } from '@data-stores/psql'
import { upsertUserAgentString } from '@data-stores/psql/upsert-user-agent-string'
import type { NodeSavedSession } from '../../../modules/bluesky-oauth/index.mts'
import { BlueskySessionStore } from '@services/bluesky-accounts/session-store'
import { runWithBlueskySessionAuthorization } from '@services/bluesky-accounts/session-lifecycle-context'
import { persistNativeBlueskyLinkCompletion } from '@services/bluesky-accounts/native-completion-persistence'
import { connectBlueskyAccountInLockedTransaction } from '@services/bluesky-accounts/connect-locked'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  BLUESKY_AUTHORITY_CORPUS_ROWS,
  seedBlueskyAuthorityCorpus,
  cleanupBlueskyAuthorityCorpus,
} from './bluesky-authority-corpus.mts'

export async function runBlueskyCutoffAuthorityScenarios(): Promise<void> {
  const userId = seedUuid(19_997, '01')
  const sid = v7()
  const authorizationId = v7()
  const did = `did:plc:explain${v7().replaceAll('-', '')}`
  const tokenHash = 'a'.repeat(64)
  const agent = await upsertUserAgentString('Explain Bluesky cutoff')
  const session = {
    dpopKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private' },
    authMethod: 'none',
    tokenSet: {
      iss: 'https://bsky.social',
      sub: did,
      aud: 'https://example.test',
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'DPoP',
      scope: 'atproto',
    },
  } as unknown as NodeSavedSession
  const prior = await write<{ present: boolean }>(
    '/* checkBlueskyCutoffFixture */ SELECT EXISTS (SELECT 1 FROM user_session_revocation_cutoffs WHERE user_id = $1) AS present',
    [userId],
  )
  assert.equal(prior.rows[0]?.present, false)
  const noise = await seedBlueskyAuthorityCorpus()
  try {
    await write(
      `/* seedBlueskyCutoffSession */ INSERT INTO user_sessions
      (id, user_id, device_id, authentication_origin, user_agent_string_id, expires_at, device_token_digest, device_token_encrypted, device_token_issued_at, device_token_binding)
      VALUES ($1, $2, $1, 'native', $3, CURRENT_TIMESTAMP + INTERVAL '1 day', repeat('a', 64), 'synthetic', CURRENT_TIMESTAMP, '{"client":"native"}')`,
      [sid, userId, agent],
    )
    await write(
      `/* seedBlueskyCutoff */ INSERT INTO user_session_revocation_cutoffs (user_id, cutoff_at, preserved_session_id) VALUES ($1, CURRENT_TIMESTAMP, $2)`,
      [userId, sid],
    )
    await write(
      `/* seedBlueskyCutoffAuthorization */ INSERT INTO bluesky_link_authorizations
      (id, user_id, initiating_session_id, handle, callback_mode, completion_proof_challenge, expires_at)
      VALUES ($1, $2, $3, 'explain.example', 'native', repeat('a', 43), CURRENT_TIMESTAMP + INTERVAL '1 day')`,
      [authorizationId, userId, sid],
    )
    // Refresh every authority join partner after the target session/flow joins the corpus.
    await write(`/* analyzeBlueskyCutoffAuthority */ ANALYZE users, user_sessions,
      user_session_revocation_cutoffs, user_suspensions, bluesky_link_authorizations,
      bluesky_linked_accounts`)
    const seededRows = {
      user_session_revocation_cutoffs: 4_000,
      bluesky_link_authorizations: BLUESKY_AUTHORITY_CORPUS_ROWS + 1,
      bluesky_linked_accounts: BLUESKY_AUTHORITY_CORPUS_ROWS,
    }
    const expectations = [
      { kind: 'maxProcessedRows' as const, relation: 'user_sessions', max: 2 },
      { kind: 'maxProcessedRows' as const, relation: 'user_session_revocation_cutoffs', max: 2 },
      { kind: 'maxProcessedRows' as const, relation: 'users', max: 2 },
      { kind: 'maxProcessedRows' as const, relation: 'user_suspensions', max: 2 },
      { kind: 'maxProcessedRows' as const, relation: 'bluesky_link_authorizations', max: 2 },
      { kind: 'maxProcessedRows' as const, relation: 'bluesky_linked_accounts', max: 2 },
    ]
    registerScenarioContract('bluesky-cutoff-callback', {
      seededRows,
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      expectations,
    })
    await runAndCapture(
      'bluesky-cutoff-callback',
      async () => {
        await runWithBlueskySessionAuthorization(
          { authorizationId, owner: { kind: 'linking', userId }, callbackMode: 'native' },
          () => new BlueskySessionStore().set(did, session),
        )
      },
      undefined,
      'BlueskySessionStore.set:authorizedCallback',
    )
    registerScenarioContract('bluesky-cutoff-completion', {
      seededRows,
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      allowEmptyResult: true,
      expectations,
    })
    await runAndCapture(
      'bluesky-cutoff-completion',
      async () => {
        await persistNativeBlueskyLinkCompletion({
          flowId: authorizationId,
          userId,
          did,
          handle: 'explain.example',
          tokenHash,
        })
      },
      undefined,
      'createNativeBlueskyLinkCompletion',
      {
        afterCapture: async () => {
          await write(
            '/* restoreBlueskyCutoffCompletion */ UPDATE bluesky_link_authorizations SET handoff_ready_at = NULL WHERE id = $1',
            [authorizationId],
          )
        },
      },
    )
    registerScenarioContract('bluesky-cutoff-connect', {
      seededRows,
      forbidSequentialScans: ['user_session_revocation_cutoffs'],
      expectations,
    })
    await runAndCapture(
      'bluesky-cutoff-connect',
      async () => {
        await using query = await beginTransaction()
        await connectBlueskyAccountInLockedTransaction(
          userId,
          did,
          'explain.example',
          authorizationId,
          query,
          null,
        )
        await query.rollback()
      },
      undefined,
      'connectBlueskyAccountToUser',
    )
  } finally {
    await write(
      '/* cleanupBlueskyCutoffAccount */ DELETE FROM bluesky_linked_accounts WHERE bluesky_did = $1',
      [did],
    )
    await write(
      '/* cleanupBlueskyCutoffAuthorization */ DELETE FROM bluesky_link_authorizations WHERE id = $1',
      [authorizationId],
    )
    await write(
      '/* cleanupBlueskyCutoff */ DELETE FROM user_session_revocation_cutoffs WHERE user_id = $1',
      [userId],
    )
    await write('/* cleanupBlueskyCutoffSession */ DELETE FROM user_sessions WHERE id = $1', [sid])
    await cleanupBlueskyAuthorityCorpus(noise)
    await write(`/* vacuumBlueskyCutoffAuthority */ VACUUM (ANALYZE) user_sessions,
      user_session_revocation_cutoffs`)
  }
}
