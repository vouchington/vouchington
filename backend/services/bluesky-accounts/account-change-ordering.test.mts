import { describe, expect, it, onTestFinished } from 'vitest'
import { createTestUser, insertTestBlueskyLinkedAccount } from '@voucha/test-helpers'
import {
  createTestAccountChangeActor,
  createTestAccountChangeProof,
} from '@voucha/test-helpers/account-change'
import { getTestPostgresBackendProcessId } from '@voucha/test-helpers/postgres-lock-wait'
import { withTestOwnedPostgresWait } from '@voucha/test-helpers/postgres-client-lock-observer'
import { withReauthenticatedAccountChange } from '@services/mfa/account-change'
import { withActiveAccountSession } from '@services/mfa/active-account-session'
import { revokeAllAuthenticatedSessions } from '@services/jwt-session/user-session-revocation'
import { connectBlueskyAccountToUser } from './connect.mts'

// First attachment takes the real user FK lock before it can write a session cutoff.
describe('Bluesky attachment and account-change ordering', () => {
  it('waits before the cutoff and preserves denial of the revoked initiating session', async () => {
    const user = await createTestUser()
    await revokeAllAuthenticatedSessions(user.id)
    const accountActor = await createTestAccountChangeActor(user.id)
    const blueskyActor = await createTestAccountChangeActor(user.id)
    const proof = await createTestAccountChangeProof(user.id, accountActor.session)
    const linked = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      initiatingSessionId: blueskyActor.session.sid,
    })
    const ready = Promise.withResolvers<number>()
    const release = Promise.withResolvers<void>()
    onTestFinished(() => release.resolve())
    const accountChange = withReauthenticatedAccountChange(
      user.id,
      accountActor.session,
      proof,
      async query => {
        // The real one-use proof has already been consumed on the actor session row.
        ready.resolve(await getTestPostgresBackendProcessId(query))
        await release.promise
      },
    )
    const holderProcessId = await Promise.race([
      ready.promise,
      accountChange.then(() => {
        throw new Error('Account change completed before its owned hold')
      }),
    ])
    await withTestOwnedPostgresWait(
      {
        pool: 'write',
        holderProcessId,
        lock: { kind: 'transaction' },
        queryMarker: '/* connectBlueskyAccountToUser */',
        releaseHolder: async () => {
          release.resolve()
          await accountChange
        },
      },
      async waitForLock => {
        const attachment = connectBlueskyAccountToUser(
          user.id,
          linked.bluesky_did,
          'owned.bsky.social',
          { linkAuthorizationId: linked.link_authorization_id },
        )
        const outcome = Promise.allSettled([attachment])
        await waitForLock(attachment)
        release.resolve()
        await accountChange
        const [result] = await outcome
        expect(result).toMatchObject({ status: 'fulfilled' })
      },
    )
    await expect(
      withActiveAccountSession(user.id, blueskyActor.session, async () => {}),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_RELOGIN_REQUIRED' })
  })
})
