import { beginTransaction } from '@data-stores/psql'

export async function insertOwnerFkClassifierBatchWithMissingCommunity(params: {
  classifierId: string
  promptVersionId: string
  postId: string
  missingCommunityId: string
}): Promise<void> {
  await using query = await beginTransaction()
  await query(
    `/* insertOwnerFkClassifierBatch */
      INSERT INTO classifier_decision_batches
        (classifier_id, prompt_version_id, post_id, scope_category, scope_community_id)
      VALUES ($1, $2, $3, 'community_ai', $4)`,
    [params.classifierId, params.promptVersionId, params.postId, params.missingCommunityId],
  )
}

export async function pointOwnerFkReferralLinkAtMissingCrawl(
  linkId: string,
  missingCrawlId: string,
): Promise<void> {
  await using query = await beginTransaction()
  await query(
    '/* pointOwnerFkReferralLinkAtMissingCrawl */ UPDATE user_referral_program_links SET last_crawl_id = $2 WHERE id = $1',
    [linkId, missingCrawlId],
  )
}
