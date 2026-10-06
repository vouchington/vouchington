import { write } from '@data-stores/psql'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

/** Inside CLASSIFIER_COMPARISON_MAX_WINDOW_DAYS and stable across the seed and run processes. */
export const CLASSIFIER_COMPARISON_WINDOW_FROM = new Date('2026-03-10T00:00:00.000Z')
export const CLASSIFIER_COMPARISON_WINDOW_TO = new Date('2026-03-11T00:00:00.000Z')

const COMPARISON_CAP = 1000
const TARGET_IN_WINDOW = COMPARISON_CAP + 100
const TARGET_OLDER = 400
const BYSTANDER_IN_WINDOW = 2000
const COMMUNITY_IN_WINDOW = COMPARISON_CAP + 100
const RSS_IN_WINDOW = COMPARISON_CAP + 100

export const classifierComparisonClassifiers = {
  target: seedUuid(0, '2d'),
  bystander: seedUuid(1, '2d'),
  community: seedUuid(2, '2d'),
  rss: seedUuid(3, '2d'),
} as const

export const classifierComparisonPromptVersions = {
  target: seedUuid(0, '2e'),
  bystander: seedUuid(1, '2e'),
  community: seedUuid(2, '2e'),
  rss: seedUuid(3, '2e'),
} as const

export const classifierComparisonPosts = {
  target: seedUuid(0, '05'),
  bystander: seedUuid(1, '05'),
  community: seedUuid(2, '05'),
} as const

export const classifierComparisonCommunityId = seedUuid(0, '14')

export async function loadClassifierComparisonRssFeedItemId(): Promise<string> {
  const { rows } = await write<{ id: string }>(
    `/* seedExplainData */ SELECT ids.id
     FROM rss_feed_item_guids ids
     WHERE ids.guid LIKE 'seed-item-guid-%'
     ORDER BY ids.id
     LIMIT 1`,
  )
  const id = rows[0]?.id
  if (!id) throw new Error('Expected a seeded RSS feed item for classifier comparison plans')
  return id
}

export async function seedClassifierHumanVoteComparison(): Promise<void> {
  console.log('Seeding classifier human-vote comparison batches...')
  const rssFeedItemId = await loadClassifierComparisonRssFeedItemId()
  const classifiers = [
    [classifierComparisonClassifiers.target, 'explain-classifier-comparison-target'],
    [classifierComparisonClassifiers.bystander, 'explain-classifier-comparison-bystander'],
    [classifierComparisonClassifiers.community, 'explain-classifier-comparison-community'],
    [classifierComparisonClassifiers.rss, 'explain-classifier-comparison-rss'],
  ] as const
  await write(
    `/* seedExplainData */ INSERT INTO classifiers (id, slug, primitive, candidate_kind)
     SELECT id, slug, 'noul', 'topic'
     FROM unnest($1::uuid[], $2::text[]) AS row(id, slug)
     ON CONFLICT DO NOTHING`,
    [classifiers.map(([id]) => id), classifiers.map(([, slug]) => slug)],
  )
  const prompts = [
    [classifierComparisonPromptVersions.target, classifierComparisonClassifiers.target],
    [classifierComparisonPromptVersions.bystander, classifierComparisonClassifiers.bystander],
    [classifierComparisonPromptVersions.community, classifierComparisonClassifiers.community],
    [classifierComparisonPromptVersions.rss, classifierComparisonClassifiers.rss],
  ] as const
  await write(
    `/* seedExplainData */ INSERT INTO classifier_prompt_versions (
       id, classifier_id, prompt, model_name, model_provider,
       default_lower_threshold, default_upper_threshold
     )
     SELECT id, classifier_id, 'Classify the subject.', 'typesafe/jev-1.13', 'typesafe', 0.2500, 0.7500
     FROM unnest($1::uuid[], $2::uuid[]) AS row(id, classifier_id)
     ON CONFLICT DO NOTHING`,
    [prompts.map(([id]) => id), prompts.map(([, classifierId]) => classifierId)],
  )

  const fromMs = CLASSIFIER_COMPARISON_WINDOW_FROM.getTime()
  await insertBatches({
    ids: batchIds(fromMs - TARGET_OLDER, TARGET_OLDER),
    classifierId: classifierComparisonClassifiers.target,
    promptVersionId: classifierComparisonPromptVersions.target,
    postId: classifierComparisonPosts.target,
    rssFeedItemId: null,
    scopeCategory: 'global',
    scopeCommunityId: null,
  })
  await insertBatches({
    ids: batchIds(fromMs + 1, TARGET_IN_WINDOW),
    classifierId: classifierComparisonClassifiers.target,
    promptVersionId: classifierComparisonPromptVersions.target,
    postId: classifierComparisonPosts.target,
    rssFeedItemId: null,
    scopeCategory: 'global',
    scopeCommunityId: null,
  })
  await insertBatches({
    ids: batchIds(fromMs + 1_000_000, BYSTANDER_IN_WINDOW),
    classifierId: classifierComparisonClassifiers.bystander,
    promptVersionId: classifierComparisonPromptVersions.bystander,
    postId: classifierComparisonPosts.bystander,
    rssFeedItemId: null,
    scopeCategory: 'global',
    scopeCommunityId: null,
  })
  await insertBatches({
    ids: batchIds(fromMs + 4_000_000, COMMUNITY_IN_WINDOW),
    classifierId: classifierComparisonClassifiers.community,
    promptVersionId: classifierComparisonPromptVersions.community,
    postId: classifierComparisonPosts.community,
    rssFeedItemId: null,
    scopeCategory: 'community_ai',
    scopeCommunityId: classifierComparisonCommunityId,
  })
  await insertBatches({
    ids: batchIds(fromMs + 6_000_000, RSS_IN_WINDOW),
    classifierId: classifierComparisonClassifiers.rss,
    promptVersionId: classifierComparisonPromptVersions.rss,
    postId: null,
    rssFeedItemId,
    scopeCategory: 'global',
    scopeCommunityId: null,
  })
  await write(`/* seedExplainData */ ANALYZE classifier_decision_batches`)
}

function batchIds(startMs: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) => seedUuidAtTimestamp(startMs + index, index))
}

async function insertBatches(input: {
  ids: readonly string[]
  classifierId: string
  promptVersionId: string
  postId: string | null
  rssFeedItemId: string | null
  scopeCategory: 'global' | 'community_ai'
  scopeCommunityId: string | null
}): Promise<void> {
  await write(
    `/* seedExplainData */ INSERT INTO classifier_decision_batches (
       id, classifier_id, prompt_version_id, post_id, rss_feed_item_id,
       scope_category, scope_community_id, completed_at
     )
     SELECT batch_id, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP
     FROM unnest($1::uuid[]) AS batch_id
     ON CONFLICT (id) DO NOTHING`,
    [
      input.ids,
      input.classifierId,
      input.promptVersionId,
      input.postId,
      input.rssFeedItemId,
      input.scopeCategory,
      input.scopeCommunityId,
    ],
  )
}
