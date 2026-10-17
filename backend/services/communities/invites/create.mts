import { randomBytes } from 'node:crypto'
import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { LoadedCommunity } from '../load-with-viewer.mts'
import { getCommunityMember } from '../members/get.mts'
import { getPublicUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { enqueueSendCommunityInviteEmail } from '@queues/emails/enqueues'
import onError from '@modules/on-error'
import type { CommunityInvite, CreatedCommunityInvite } from '../types.mts'
import { hashCommunityInviteCode } from './code.mts'
import { lockCommunityUser } from '../bans/lock.mts'

function generateInviteCode(): string {
  return randomBytes(4).toString('hex')
}

export type CreateInviteInput = {
  username?: string
  email?: string
}

export async function createInvite(
  currentUserId: string,
  loaded: Pick<LoadedCommunity, 'community' | 'membership'>,
  input: CreateInviteInput,
  inviter?: Pick<PrivateUser, 'username'>,
): Promise<CreatedCommunityInvite> {
  const { invite } = await createInviteWithEmailEnqueue(currentUserId, loaded, input, inviter)
  return invite
}

export async function createInviteWithEmailEnqueue(
  currentUserId: string,
  { community, membership }: Pick<LoadedCommunity, 'community' | 'membership'>,
  input: CreateInviteInput,
  loadedInviter?: Pick<PrivateUser, 'username'>,
): Promise<{
  invite: CreatedCommunityInvite
  emailEnqueue: ReturnType<typeof enqueueSendCommunityInviteEmail> | null
}> {
  assert(input.username || input.email, 422, 'Either username or email is required')
  assert(!(input.username && input.email), 422, 'Provide either username or email, not both')

  const communityId = community.id
  assert(!community.archived_at, 403, 'Community is archived')
  assert(membership, 403, 'Forbidden')

  if (membership.role === 'member') {
    assert(
      community.member_invites_allowed_at,
      403,
      'Members are not allowed to invite in this community',
    )
  }

  let invitedUserId: string | null = null
  let invitedEmail: string | null = null
  let inviterName: string = 'A community member'

  if (input.username) {
    const user = await getPublicUserByAny(input.username)
    assert(user, 404, 'User not found')
    invitedUserId = user.id
  } else if (input.email) {
    invitedEmail = input.email.toLowerCase().trim()
    assert(invitedEmail.length > 0 && invitedEmail.length <= 320, 422, 'Invalid email address')
  }

  // Look up inviter's display name for email
  const inviter = loadedInviter ?? (await getPublicUserByAny(currentUserId))
  if (inviter?.username) inviterName = inviter.username

  const code = generateInviteCode()
  const codeHash = hashCommunityInviteCode(code)

  await using transaction = await beginTransaction()
  const options = { query: transaction }
  if (invitedUserId) {
    await lockCommunityUser(communityId, invitedUserId, options)
    const existing = await getCommunityMember(communityId, invitedUserId, options)
    assert(!existing, 409, 'This user is already a member of the community')
    await write(
      sql`/* createInvite:revoke-pending */
      UPDATE community_invites SET revoked_at = CURRENT_TIMESTAMP
      WHERE community_id = ${communityId} AND invited_user_id = ${invitedUserId}
        AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
    `,
      options,
    )
  }

  const { rows } = await write(
    sql`/* createInvite */
    INSERT INTO community_invites (community_id, code_hash, invited_user_id, invited_email, invited_by_id)
    VALUES (${communityId}, ${codeHash}, ${invitedUserId}, ${invitedEmail}, ${currentUserId})
    RETURNING 'community_invite'::text AS __entity_type,
      id, community_id, invited_user_id, invited_email, invited_by_id,
      accepted_at, accepted_by_id, declined_at, revoked_at, created_at
    `,
    options,
  )

  const invite = { ...(rows[0] as CommunityInvite), code }
  await transaction.commit()

  const emailEnqueue = invitedEmail
    ? enqueueInviteEmail(
        invitedEmail,
        await getCommunityInviteRecipientUiLocale(invitedEmail),
        community.name,
        inviterName,
        code,
      )
    : null

  return { invite, emailEnqueue }
}

function enqueueInviteEmail(
  emailAddress: string,
  uiLocale: string | null,
  communityName: string,
  inviterName: string,
  code: string,
): ReturnType<typeof enqueueSendCommunityInviteEmail> {
  return enqueueSendCommunityInviteEmail(
    { emailAddress, uiLocale },
    { communityName, inviterName, code },
  )
}

type CommunityInviteRecipientUiLocaleLookup = (emailAddress: string) => Promise<string | null>

export async function getCommunityInviteRecipientUiLocale(
  emailAddress: string,
  lookup: CommunityInviteRecipientUiLocaleLookup = readCommunityInviteRecipientUiLocale,
): Promise<string | null> {
  try {
    return await lookup(emailAddress)
  } catch (err) {
    const reportableError = err instanceof Error ? err : new Error(String(err))
    reportableError.message = `Failed to look up community invite recipient locale: ${reportableError.message}`
    onError(reportableError)
    return null
  }
}

async function readCommunityInviteRecipientUiLocale(emailAddress: string): Promise<string | null> {
  const { rows } = await read<{
    ui_locale: string | null
  }>(sql`/* getCommunityInviteRecipientUiLocale */
      SELECT users.ui_locale
      FROM users
      JOIN user_email_addresses ON user_email_addresses.user_id = users.id
      WHERE user_email_addresses.email_address = ${emailAddress}
        AND users.deleted_at IS NULL
      LIMIT 1
    `)
  return rows[0]?.ui_locale ?? null
}
