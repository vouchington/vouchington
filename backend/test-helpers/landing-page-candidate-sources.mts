import { beginTransaction, read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type TestLandingCandidateSource = {
  user_id: string
  profile_link_id: string | null
  review_post_id: string | null
  referral_link_id: string | null
  tier: number
  sort_order: number | null
}

type TestLandingCandidateMutation =
  | { kind: 'profile'; id: string; ownerId: string; sortOrder: number }
  | { kind: 'review'; id: string; ownerId: string | null; postType: 'review' | 'discussion' }
  | { kind: 'referral'; id: string; ownerId: string }
  | { kind: 'delete_profile' | 'delete_review' | 'delete_referral'; id: string }

export async function readTestLandingCandidateSources(
  sourceIds: readonly string[],
  options?: QueryOptions,
): Promise<TestLandingCandidateSource[]> {
  const { rows } = await read<TestLandingCandidateSource>(
    sql`/* readTestLandingCandidateSources */
      SELECT user_id, profile_link_id, review_post_id, referral_link_id, tier, sort_order
      FROM user_landing_page_candidates
      WHERE profile_link_id = ANY(${sourceIds}::uuid[])
         OR review_post_id = ANY(${sourceIds}::uuid[])
         OR referral_link_id = ANY(${sourceIds}::uuid[])
      ORDER BY tier DESC
    `,
    options,
  )
  return rows
}

export async function insertTestLandingCandidateProfileLink(
  userId: string,
  options: { id?: string; sortOrder?: number; rollback?: boolean } = {},
) {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(sql`/* insertTestLandingCandidateProfileLink */
    INSERT INTO user_profile_links (id, user_id, link_type, name, sort_order)
    VALUES (COALESCE(${options.id ?? null}::uuid, uuidv7()), ${userId}, 'url', 'Candidate profile', ${options.sortOrder ?? 0})
    RETURNING id
  `)
  const id = rows[0]!.id
  const during = await readTestLandingCandidateSources([id], { query })
  if (options.rollback) await query.rollback()
  else await query.commit()
  return { id, during }
}

/** Observe the maintained read relation inside the source transaction, including rollback. */
export async function mutateTestLandingCandidateSources(
  mutations: readonly TestLandingCandidateMutation[],
  options: { rollback?: boolean } = {},
): Promise<TestLandingCandidateSource[]> {
  await using query = await beginTransaction()
  for (const mutation of mutations) {
    switch (mutation.kind) {
      case 'profile':
        await query(sql`/* mutateTestLandingCandidateSources:profile */
          UPDATE user_profile_links SET user_id = ${mutation.ownerId}, sort_order = ${mutation.sortOrder}
          WHERE id = ${mutation.id}`)
        break
      case 'review':
        await query(sql`/* mutateTestLandingCandidateSources:review */
          UPDATE posts SET created_by_id = ${mutation.ownerId}, post_type = ${mutation.postType}
          WHERE id = ${mutation.id}`)
        break
      case 'referral':
        await query(sql`/* mutateTestLandingCandidateSources:referral */
          UPDATE user_referral_program_links SET user_id = ${mutation.ownerId}
          WHERE id = ${mutation.id}`)
        break
      case 'delete_profile':
        await query(sql`/* mutateTestLandingCandidateSources:deleteProfile */
          DELETE FROM user_profile_links WHERE id = ${mutation.id}`)
        break
      case 'delete_review':
        await query(sql`/* mutateTestLandingCandidateSources:deleteReview */
          DELETE FROM posts WHERE id = ${mutation.id}`)
        break
      case 'delete_referral':
        await query(sql`/* mutateTestLandingCandidateSources:deleteReferral */
          DELETE FROM user_referral_program_links WHERE id = ${mutation.id}`)
        break
    }
  }
  const during = await readTestLandingCandidateSources(
    mutations.map(mutation => mutation.id),
    { query },
  )
  if (options.rollback) await query.rollback()
  else await query.commit()
  return during
}
