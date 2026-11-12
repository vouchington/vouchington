import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

export const LANDING_PAGE_REVIEW_COUNT = 10_000
export const LANDING_PAGE_REVIEW_OWNER_ID = seedUuid(21_000, '01')
export const LANDING_PAGE_REVIEW_CURSOR_INDEX = 5_000

export function landingPageReviewId(index: number): string {
  return seedUuid(120_000 + index, '05')
}

/** One prolific owner amid the ordinary 100k-post corpus; 20% of reviews are nonpublic. */
export async function seedLandingPageCandidates(): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* seedLandingPageCandidates.owner */ INSERT INTO users (id, username)
     VALUES ($1, 'explain-landing-page-owner') ON CONFLICT DO NOTHING`,
    [LANDING_PAGE_REVIEW_OWNER_ID],
  )
  for (let start = 0; start < LANDING_PAGE_REVIEW_COUNT; start += 500) {
    const ids = Array.from({ length: 500 }, (_, offset) => landingPageReviewId(start + offset))
    await transaction(
      `/* seedLandingPageCandidates.posts */ INSERT INTO posts
       (id, created_via, post_type, title, markdown, created_by_id,
        gemini_embedding_2_content_sha256, llm_moderation_content_sha256,
        privacy, broadcast, approved_at, bedrock_nova_multimodal_v1_content_sha256)
       SELECT input.id, 'system', 'review', 'Landing page review ' || input.ordinal,
         'Heavy-author landing page fixture', $2, $3, $3,
         CASE WHEN (input.ordinal + $4) % 10 = 9 THEN 'private'::privacy_types
           ELSE 'public'::privacy_types END,
         CASE WHEN (input.ordinal + $4) % 10 = 9 THEN 'users'::broadcast_types
           ELSE 'everyone'::broadcast_types END,
         CASE WHEN (input.ordinal + $4) % 10 = 0 THEN NULL ELSE CURRENT_TIMESTAMP END
       , $3 FROM unnest($1::uuid[]) WITH ORDINALITY input(id, ordinal)
       ON CONFLICT DO NOTHING`,
      [ids, LANDING_PAGE_REVIEW_OWNER_ID, contentHash('landing-page-candidates'), start],
    )
    await transaction(
      `/* seedLandingPageCandidates.ratings */ INSERT INTO post_review_topic_ratings
       (post_id, topic_id, rating, order_index)
       SELECT input.id, topic.id, 4, topic.order_index
       FROM unnest($1::uuid[]) input(id)
       CROSS JOIN unnest($2::uuid[]) WITH ORDINALITY topic(id, order_index)
       ON CONFLICT DO NOTHING`,
      [ids, [seedUuid(2498, '04'), seedUuid(2499, '04')]],
    )
    await transaction(
      `/* seedLandingPageCandidates.slugs */ INSERT INTO post_slugs (id, post_id, slug)
       SELECT input.slug_id, input.post_id, 'explain-landing-review-' || input.slug_id
       FROM unnest($1::uuid[], $2::uuid[]) input(post_id, slug_id)
       ON CONFLICT DO NOTHING`,
      [ids, ids.map((_, offset) => seedUuid(start + offset, 'e8'))],
    )
  }
  await transaction.commit()
}
