import {
  beginTransaction,
  withTransactionOptions,
  write,
  type QueryOptions,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import { lockAndAssertNotBanned } from '../bans/lock.mts'
import { insertApplicationAnswers } from './answer-rows.mts'
import { assertApplicationAnswers } from './answers.mts'
import { getApplication } from './get.mts'
import { getPendingApplicationForUser } from './pending.mts'
import { getApplicationQuestions } from './questions.mts'
import type { CommunityApplication } from '../types.mts'

/**
 * Files an application. With `queryOptions.query` it joins the caller's transaction, which then
 * owns the commit; otherwise it runs and commits its own.
 */
export async function createApplication(
  currentUserId: string,
  provenance: ContentProvenance,
  communityId: string,
  answers: Record<string, unknown>,
  message?: string,
  queryOptions?: QueryOptions,
): Promise<CommunityApplication> {
  const run = (query: TransactionQuery) =>
    insertApplication(query, currentUserId, provenance, communityId, answers, message)
  if (queryOptions?.query) return withTransactionOptions(queryOptions, run)
  await using query = await beginTransaction()
  const application = await run(query)
  await query.commit()
  return application
}

async function insertApplication(
  query: TransactionQuery,
  currentUserId: string,
  provenance: ContentProvenance,
  communityId: string,
  answers: Record<string, unknown>,
  message?: string,
): Promise<CommunityApplication> {
  const options = { query }
  const community = await getCommunity(communityId, options)
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 409, 'Archived communities cannot be updated')
  assert(community.visibility === 'private', 422, 'Applications are only for private communities')

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
      INSERT INTO community_applications (community_id, user_id, message, created_via, created_via_oauth_client_id)
      VALUES (${communityId}, ${currentUserId}, ${message ?? null}, ${provenance.createdVia}, ${provenance.oauthClientId})
      RETURNING id`,
    options,
  )
  const applicationId = (rows[0] as { id: string }).id
  await insertApplicationAnswers(applicationId, communityId, answers, options)
  // Read back so the response carries the answers object rebuilt from the stored rows.
  return (await getApplication(applicationId, options))!
}
