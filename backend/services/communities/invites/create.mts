import { randomBytes } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import { getPublicUserByAny } from '@services/users/get'
import { enqueueSendCommunityInviteEmail } from '@queues/emails/enqueues'
import onError from '@modules/on-error'
import type { CommunityInvite } from '../types.mts'

function generateInviteCode(): string {
  return randomBytes(4).toString('hex')
}

export type CreateInviteInput = {
  username?: string
  email?: string
}

export async function createInvite(
  currentUserId: string,
  communityId: string,
  input: CreateInviteInput,
): Promise<CommunityInvite> {
  assert(input.username || input.email, 422, 'Either username or email is required')
  assert(!(input.username && input.email), 422, 'Provide either username or email, not both')

  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')

  const membership = await getCommunityMember(communityId, currentUserId)
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

    const existing = await getCommunityMember(communityId, invitedUserId)
    assert(!existing, 409, 'This user is already a member of the community')
  } else if (input.email) {
    invitedEmail = input.email.toLowerCase().trim()
    assert(invitedEmail.length > 0 && invitedEmail.length <= 320, 422, 'Invalid email address')
  }

  // Look up inviter's display name for email
  const inviter = await getPublicUserByAny(currentUserId)
  if (inviter?.username) inviterName = inviter.username

  const code = generateInviteCode()

  const { rows } = await write(
    sql`/* createInvite */
    INSERT INTO community_invites (community_id, code, invited_user_id, invited_email, invited_by_id)
    VALUES (${communityId}, ${code}, ${invitedUserId}, ${invitedEmail}, ${currentUserId})
    RETURNING *
    `,
  )

  const invite = rows[0] as CommunityInvite

  if (invitedEmail) {
    void enqueueSendCommunityInviteEmail(
      {
        emailAddress: invitedEmail,
        uiLocale: await getCommunityInviteRecipientUiLocale(invitedEmail),
      },
      {
        communityName: community.name,
        inviterName,
        code,
      },
    )
  }

  return invite
}

type CommunityInviteRecipientUiLocaleLookup = (emailAddress: string) => Promise<string | null>

export async function getCommunityInviteRecipientUiLocale(
  emailAddress: string,
  lookup: CommunityInviteRecipientUiLocaleLookup = readCommunityInviteRecipientUiLocale,
): Promise<string | null> {
  try {
    return await lookup(emailAddress)
  } catch (error) {
    const reportableError = error instanceof Error ? error : new Error(String(error))
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
