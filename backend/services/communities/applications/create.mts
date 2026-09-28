import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import { lockAndAssertNotBanned } from '../bans/lock.mts'
import { assertApplicationAnswers } from './answers.mts'
import { communityApplicationColumns } from './columns.mts'
import { getPendingApplicationForUser } from './pending.mts'
import { getApplicationQuestions } from './questions.mts'
import type { CommunityApplication } from '../types.mts'

export async function createApplication(
  currentUserId: string,
  communityId: string,
  answers: Record<string, unknown>,
  message?: string,
): Promise<CommunityApplication> {
  const community = await getCommunity(communityId)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')
  assert(community.visibility === 'private', 422, 'Applications are only for private communities')

  await using query = await beginTransaction()
  const options = { query }
  const questions = await getApplicationQuestions(communityId, { ...options, lock: true })
  // Malformed answers stay 422 ahead of the ban, member, and pending gates.
  assertApplicationAnswers(questions, answers)

  // Serialize against a concurrent ban so a ban committing before the insert blocks the
  // application, matching the join/invite/approval entry points.
  await lockAndAssertNotBanned(communityId, currentUserId, options)

  const existing = await getCommunityMember(communityId, currentUserId, options)
  assert(!existing, 409, 'You are already a member of this community')

  const pending = await getPendingApplicationForUser(communityId, currentUserId, options)
  assert(!pending, 409, 'You already have a pending application for this community')

  const { rows } = await write(
    sql`/* createApplication */
      INSERT INTO community_applications (community_id, user_id, answers, message)
      VALUES (
        ${communityId},
        ${currentUserId},
        ${JSON.stringify(answers)}::jsonb,
        ${message ?? null}
      )
      RETURNING `.append(communityApplicationColumns),
    options,
  )
  const application = rows[0] as CommunityApplication
  await query.commit()
  return application
}
