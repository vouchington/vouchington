import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestBlueskyLinkedAccount } from '@voucha/test-helpers'
import { createTestAccountChangeActor } from '@voucha/test-helpers/account-change'
import {
  captureTestAccountSecurityEmail,
  countTestAccountSecurityEmailAdmissions,
} from '@voucha/test-helpers/account-security-email'
import {
  deleteTestUserSession,
  invalidateTestUserSession,
} from '@voucha/test-helpers/entities/user-sessions'
import { getTestBlueskyLinkAuthorizationRow } from '@voucha/test-helpers/entities/bluesky-link-authorizations'
import { isSessionRevoked } from '@services/jwt-session'
import { connectBlueskyAccountToUser } from './connect.mts'

// The provider callback has persisted a credential for the exact authorization generation.
// First attachment still needs the live session that admitted the account-change flow.
describe('Bluesky account-change session admission', () => {
  it('revokes others and notifies only on first attachment; replay preserves later sessions', async () => {
    const user = await createTestUser()
    const actor = await createTestAccountChangeActor(user.id)
    const other = await createTestAccountChangeActor(user.id)
    const linked = await insertTestBlueskyLinkedAccount({
      userId: null,
      linkingUserId: user.id,
      initiatingSessionId: actor.session.sid,
    })
    const connect = () =>
      connectBlueskyAccountToUser(user.id, linked.bluesky_did, 'owned.bsky.social', {
        linkAuthorizationId: linked.link_authorization_id,
      })
    await captureTestAccountSecurityEmail(user.email_address!, connect)
    await expect(isSessionRevoked(actor.session.sid, { userId: user.id })).resolves.toBe(false)
    await expect(isSessionRevoked(other.session.sid, { userId: user.id })).resolves.toBe(true)
    const later = await createTestAccountChangeActor(user.id)
    await expect(
      countTestAccountSecurityEmailAdmissions(user.email_address!, connect),
    ).resolves.toBe(0)
    await expect(isSessionRevoked(later.session.sid, { userId: user.id })).resolves.toBe(false)
  })

  it.each(['revoked', 'expired', 'deleted'] as const)(
    'rejects first attachment after its initiating session is %s',
    async invalid => {
      const user = await createTestUser()
      const actor = await createTestAccountChangeActor(user.id)
      const linked = await insertTestBlueskyLinkedAccount({
        userId: null,
        linkingUserId: user.id,
        initiatingSessionId: actor.session.sid,
      })
      if (invalid === 'deleted') await deleteTestUserSession(actor.session.sid)
      else await invalidateTestUserSession(actor.session.sid, invalid)
      await expect(
        connectBlueskyAccountToUser(user.id, linked.bluesky_did, 'owned.bsky.social', {
          linkAuthorizationId: linked.link_authorization_id,
        }),
      ).rejects.toMatchObject({ status: 401 })
      await expect(
        getTestBlueskyLinkAuthorizationRow(linked.link_authorization_id),
      ).resolves.toMatchObject({ status: 'callback_claimed' })
    },
  )
})
