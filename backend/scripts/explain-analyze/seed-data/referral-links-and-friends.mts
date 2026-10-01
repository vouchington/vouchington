import { beginTransaction } from '@data-stores/psql'
import { contentHash, seedUuid } from './common.mts'

// prioritized-referral-links needs a real referral-program topic (topics__referral_programs)
// plus one active, non-owner user_referral_program_links row so getPrioritizedReferralLinks'
// active_links CTE has a row to rank. User index 2 is the link owner: never followed, muted, or
// blocked by seedUser (index 0), so it isn't excluded by the query's own filters.
export async function seedPrioritizedReferralLink(): Promise<void> {
  console.log('Seeding a referral program topic and an active referral link...')

  const referralProgramId = seedUuid(0, '09')
  const linkOwnerId = seedUuid(2, '01')
  const urlId = seedUuid(0, '03')

  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO topics
         (id, topic_type, name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
       VALUES ($1, 'referral_program', $2, $3, $4, 'system') ON CONFLICT DO NOTHING`,
      [
        referralProgramId,
        'Seed Referral Program',
        'seed-referral-program',
        contentHash('referral-program-0'),
      ],
    )
    await query(
      `/* seedExplainData */ INSERT INTO topics__referral_programs (topic_id)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [referralProgramId],
    )
    await query(
      `/* seedExplainData */ INSERT INTO user_referral_program_links (user_id, referral_program_id, url_id, created_via)
       VALUES ($1, $2, $3, 'system') ON CONFLICT DO NOTHING`,
      [linkOwnerId, referralProgramId, urlId],
    )

    await transaction.commit()
  }
}

// friend-recommendations needs a facebook_accounts row for seedUser plus a second, otherwise
// unentangled user (index 3 -- not followed like index 1, not muted like index 5000), tied
// together by a facebook_friends row so getFriendRecommendations' Facebook branch has a match.
export async function seedFriendRecommendation(): Promise<void> {
  console.log('Seeding a Facebook friend recommendation for the anchor seed user...')

  const seedUserFacebookId = 'seed-fb-user-0'
  const friendFacebookId = 'seed-fb-user-3'

  {
    await using transaction = await beginTransaction()
    const query = transaction
    await query(
      `/* seedExplainData */ INSERT INTO facebook_accounts (user_id, facebook_user_id, facebook_user_data)
       VALUES ($1, $2, $3), ($4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [
        seedUuid(0, '01'),
        seedUserFacebookId,
        JSON.stringify({ name: 'Seed User 0' }),
        seedUuid(3, '01'),
        friendFacebookId,
        JSON.stringify({ name: 'Seed User 3' }),
      ],
    )
    await query(
      `/* seedExplainData */ INSERT INTO facebook_friends (facebook_user_id, facebook_friend_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [seedUserFacebookId, friendFacebookId],
    )

    await transaction.commit()
  }
}
