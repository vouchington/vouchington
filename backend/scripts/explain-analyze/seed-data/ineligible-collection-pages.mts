import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

/** Each end has more than one page of hidden targets, followed by enough live targets to fill. */
export const INELIGIBLE_COLLECTION_PAGE_COUNT = 400
export const INELIGIBLE_COLLECTION_PAGE_LIMIT = 21
export const INELIGIBLE_COLLECTION_NOISE_COMMUNITY_COUNT = 20

const PAGE_USER_ID = seedUuid(7, '01')
const PAGE_COMMUNITY_ID = seedUuid(9, '14')
const PAGE_LIST_ID = seedUuid(9, '34')
const POST_INDEX_BASE = 100_000
const RELATION_BASE_MS = postSeedTimestampMs(0) + 400 * 24 * 60 * 60 * 1000
export const INELIGIBLE_COLLECTION_PAGE_TOPIC_IDS = Array.from({ length: 400 }, (_, index) =>
  seedUuid(index, 'b7'),
)

export async function seedIneligibleCollectionPages(): Promise<void> {
  const count = INELIGIBLE_COLLECTION_PAGE_COUNT
  const postIds = Array.from({ length: count }, (_, index) =>
    seedUuid(POST_INDEX_BASE + index, '05'),
  )
  const hiddenRun = INELIGIBLE_COLLECTION_PAGE_LIMIT + 1
  const isLive = (index: number) => index >= hiddenRun && index < count - hiddenRun
  const livePostIds = postIds.filter((_, index) => isLive(index))
  const highestRankedHiddenPostIds = postIds.slice(-hiddenRun)
  const topicIds = INELIGIBLE_COLLECTION_PAGE_TOPIC_IDS
  const hostnameIds = Array.from({ length: count }, (_, index) => seedUuid(index, 'b8'))
  const membershipIds = Array.from({ length: count }, (_, index) =>
    seedUuidAtTimestamp(RELATION_BASE_MS + index * 1000, index),
  )
  const introducedAt = hostnameIds.map((_, index) =>
    isLive(index) ? new Date(RELATION_BASE_MS) : null,
  )
  const deletedAt = postIds.map((_, index) => (isLive(index) ? null : new Date(RELATION_BASE_MS)))
  const orderIndexes = postIds.map((_, index) => index)

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO communities
       (id, name, slug, created_by_id, created_via)
     VALUES ($1, 'Ineligible page', 'ineligible-page', $2, 'system')
     ON CONFLICT DO NOTHING`,
    [PAGE_COMMUNITY_ID, PAGE_USER_ID],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO user_lists
       (id, created_via, owner_user_id, name)
     VALUES ($1, 'system', $2, 'Ineligible page')
     ON CONFLICT DO NOTHING`,
    [PAGE_LIST_ID, PAGE_USER_ID],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO posts (
       id, created_by_id, post_type, title, markdown, created_via, approved_at,
       privacy, broadcast, deleted_at,
       bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256
     )
     SELECT id, $1, 'discussion', 'Ineligible page', 'Ineligible page', 'system',
       CURRENT_TIMESTAMP, 'public', 'everyone', deleted_at,
       decode(repeat('00', 32), 'hex'), decode(repeat('00', 32), 'hex')
     FROM unnest($2::uuid[], $3::timestamptz[]) AS row(id, deleted_at)
     ON CONFLICT DO NOTHING`,
    [PAGE_USER_ID, postIds, deletedAt],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO topics
       (id, name, slug, created_via, bedrock_nova_multimodal_v1_content_sha256)
     SELECT id, name, slug, 'system', decode(repeat('00', 32), 'hex')
     FROM unnest($1::uuid[], $2::text[], $3::text[]) AS row(id, name, slug)
     ON CONFLICT DO NOTHING`,
    [
      topicIds,
      topicIds.map((_, index) => `Ineligible page ${index}`),
      topicIds.map((_, index) => `ineligible-page-${index}`),
    ],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO url_hostnames
       (id, hostname, publicly_introduced_at)
     SELECT id, hostname, introduced_at
     FROM unnest($1::uuid[], $2::text[], $3::timestamptz[]) AS row(id, hostname, introduced_at)
     ON CONFLICT DO NOTHING`,
    [
      hostnameIds,
      hostnameIds.map((_, index) => `ineligible-page-${index}.example.com`),
      introducedAt,
    ],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO relation__user__save__post
       (subject_id, object_id, created_by_id, created_at)
     SELECT $1, object_id, $1, to_timestamp($2::double precision / 1000 + ordinality)
     FROM unnest($3::uuid[]) WITH ORDINALITY AS row(object_id, ordinality)
     ON CONFLICT DO NOTHING`,
    [PAGE_USER_ID, RELATION_BASE_MS, postIds],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO user_list_posts (id, user_list_id, post_id)
     SELECT item_id, $1, post_id
     FROM unnest($2::uuid[], $3::uuid[]) AS row(item_id, post_id)
     ON CONFLICT DO NOTHING`,
    [PAGE_LIST_ID, membershipIds, postIds],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO community_list_posts
       (id, community_id, post_id, added_by_id, order_index)
     SELECT item_id, $1, post_id, $2, order_index
     FROM unnest($3::uuid[], $4::uuid[], $5::int[]) AS row(item_id, post_id, order_index)
     ON CONFLICT DO NOTHING`,
    [PAGE_COMMUNITY_ID, PAGE_USER_ID, membershipIds, postIds, orderIndexes],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO community_list_topics
       (id, community_id, topic_id, added_by_id, order_index)
     SELECT item_id, $1, topic_id, $2, order_index
     FROM unnest($3::uuid[], $4::uuid[], $5::int[]) AS row(item_id, topic_id, order_index)
     ON CONFLICT DO NOTHING`,
    [PAGE_COMMUNITY_ID, PAGE_USER_ID, membershipIds, topicIds, orderIndexes],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO community_list_url_hostnames
       (id, community_id, url_hostname_id, added_by_id, order_index)
     SELECT item_id, $1, hostname_id, $2, order_index
     FROM unnest($3::uuid[], $4::uuid[], $5::int[]) AS row(item_id, hostname_id, order_index)
     ON CONFLICT DO NOTHING`,
    [PAGE_COMMUNITY_ID, PAGE_USER_ID, membershipIds, hostnameIds, orderIndexes],
  )
  const subjectPostId = postIds[hiddenRun]!
  const objectIds = postIds.filter(id => id !== subjectPostId)
  const relationIds = objectIds.map((_, index) =>
    seedUuidAtTimestamp(RELATION_BASE_MS + (count + index) * 1000, index),
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO relation__post__related__post
       (id, subject_id, object_id, created_by_id, created_at, votes_score_up)
     SELECT relation_id, $1, object_id, $2, to_timestamp($3::double precision / 1000 + ordinality),
       CASE WHEN object_id = ANY($4::uuid[]) THEN 100
         WHEN object_id = ANY($7::uuid[]) THEN 1 ELSE 0 END
     FROM unnest($5::uuid[], $6::uuid[]) WITH ORDINALITY AS row(relation_id, object_id, ordinality)
     ON CONFLICT DO NOTHING`,
    [
      subjectPostId,
      PAGE_USER_ID,
      RELATION_BASE_MS,
      highestRankedHiddenPostIds,
      relationIds,
      objectIds,
      livePostIds,
    ],
  )
  // Newer memberships in other communities expose a global-id walk that skips unrelated rows.
  const noiseCommunityIds = Array.from(
    { length: INELIGIBLE_COLLECTION_NOISE_COMMUNITY_COUNT },
    (_, index) => seedUuid(index, 'b9'),
  )
  const noiseMembershipIds = Array.from({ length: noiseCommunityIds.length * count }, (_, index) =>
    seedUuidAtTimestamp(RELATION_BASE_MS + (count * 2 + index) * 1000, index),
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO communities
       (id, name, slug, created_by_id, created_via)
     SELECT id, 'Ineligible page noise', 'ineligible-page-noise-' || ordinality, $2, 'system'
     FROM unnest($1::uuid[]) WITH ORDINALITY AS row(id, ordinality)
     ON CONFLICT DO NOTHING`,
    [noiseCommunityIds, PAGE_USER_ID],
  )
  await transaction(
    `/* seedIneligibleCollectionPages */ INSERT INTO community_list_posts
       (id, community_id, post_id, added_by_id, order_index)
     SELECT membership_id, community_id, post_id, $4, post_ordinality - 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS memberships(membership_id, membership_ordinality)
     JOIN unnest($2::uuid[]) WITH ORDINALITY AS communities(community_id, community_ordinality)
       ON community_ordinality = ((membership_ordinality - 1) / $5) + 1
     JOIN unnest($3::uuid[]) WITH ORDINALITY AS posts(post_id, post_ordinality)
       ON post_ordinality = ((membership_ordinality - 1) % $5) + 1
     ON CONFLICT DO NOTHING`,
    [noiseMembershipIds, noiseCommunityIds, postIds, PAGE_USER_ID, count],
  )
  await transaction.commit()
}

export const ineligibleCollectionPageIds = {
  userId: PAGE_USER_ID,
  communityId: PAGE_COMMUNITY_ID,
  listId: PAGE_LIST_ID,
  subjectPostId: seedUuid(POST_INDEX_BASE + INELIGIBLE_COLLECTION_PAGE_LIMIT + 1, '05'),
}
