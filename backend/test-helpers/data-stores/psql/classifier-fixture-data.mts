import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'
import { createTestPost, createTestTopic } from '../../entities/create-test-entities.mts'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
} from '../../entities/test-entities.mts'
import { insertTestCommunity } from '../../entities/communities.mts'
import { insertTestStory } from '../../entities/stories.mts'
import { createTestUser } from '../../entities/users.mts'

export type ClassifierFixtureData = {
  classifierId: string
  promptVersionId: string
  topicCandidateId: string
  topicThresholdId: string
  communityCandidateId: string
  communityThresholdId: string
  auditUserId: string
  communityId: string
  topicId: string
  communityTopicId: string
  postId: string
  storyId: string
  storyClassifierId: string
  storyPromptVersionId: string
  storyCandidateId: string
  storyThresholdId: string
  rssFeedItemId: string
  standaloneRssFeedItemId: string
}

export async function createClassifierFixtureData(): Promise<ClassifierFixtureData> {
  const suffix = randomUUID()
  const owner = await createTestUser()
  const auditUser = await createTestUser()
  const topic = await createTestTopic({ user: owner, name: `Classifier topic ${suffix}` })
  const communityTopic = await createTestTopic({
    user: owner,
    name: `Community classifier topic ${suffix}`,
  })
  const post = await createTestPost({ user: owner })
  const rssFeedId = await createTestRssFeedWithTiming(topic.id)
  const rssFeedItem = await createTestRssFeedItemWithUrl(rssFeedId)
  // A second, distinct RSS feed item standing in for a standalone-item Choice candidate
  // (never the batch's own subject) so rss_feed_item_classifier_results has a real,
  // FK-satisfying entity to score. See migrations/0730-00-00-story-clustering-rss-item-results.sql.
  const standaloneRssFeedItem = await createTestRssFeedItemWithUrl(rssFeedId)
  const story = await insertTestStory({ title: `Classifier story ${suffix}` })
  const community = await insertTestCommunity({ createdById: owner.id })
  const { rows: classifierRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureClassifier */
    INSERT INTO classifiers (slug, primitive, candidate_kind)
    VALUES (${`classifier-${suffix}`}, 'noul', 'topic')
    RETURNING id
  `)
  const classifierId = classifierRows[0]!.id
  const { rows: promptRows } = await write<{ id: string }>(sql`
    /* createClassifierFixturePrompt */
    INSERT INTO classifier_prompt_versions (
      classifier_id, prompt, model_name, model_provider,
      default_lower_threshold, default_upper_threshold
    )
    VALUES (
      ${classifierId}, 'Classify the subject.', 'typesafe/jev-1.13', 'typesafe', 0.2500, 0.7500
    )
    RETURNING id
  `)
  const promptVersionId = promptRows[0]!.id
  const { rows: candidateRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureTopicCandidate */
    INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id)
    VALUES (${classifierId}, 'topic', ${topic.id})
    RETURNING id
  `)
  const topicCandidateId = candidateRows[0]!.id
  const { rows: topicThresholdRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureTopicThreshold */
    INSERT INTO classifier_candidate_thresholds (
      classifier_id, candidate_id, prompt_version_id
    ) VALUES (${classifierId}, ${topicCandidateId}, ${promptVersionId})
    RETURNING id
  `)
  const { rows: communityCandidateRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureCommunityCandidate */
    INSERT INTO classifier_candidates (classifier_id, candidate_kind, topic_id, community_id)
    VALUES (${classifierId}, 'topic', ${communityTopic.id}, ${community.id})
    RETURNING id
  `)
  const communityCandidateId = communityCandidateRows[0]!.id
  const { rows: thresholdRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureCommunityThreshold */
    INSERT INTO classifier_candidate_thresholds (
      classifier_id, candidate_id, prompt_version_id, lower_threshold_override, created_by_id
    )
    VALUES (
      ${classifierId}, ${communityCandidateId}, ${promptVersionId}, 0.3000, ${auditUser.id}
    )
    RETURNING id
  `)

  const { rows: storyClassifierRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureStoryClassifier */
    INSERT INTO classifiers (slug, primitive, candidate_kind)
    VALUES (${`story-classifier-${suffix}`}, 'choice', 'story')
    RETURNING id
  `)
  const storyClassifierId = storyClassifierRows[0]!.id
  const { rows: storyPromptRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureStoryPrompt */
    INSERT INTO classifier_prompt_versions (
      classifier_id, prompt, model_name, model_provider,
      default_lower_threshold, default_upper_threshold
    ) VALUES (
      ${storyClassifierId}, 'Choose a story.', 'typesafe/jev-1.13', 'typesafe', 0.2500, 0.7500
    ) RETURNING id
  `)
  const { rows: storyCandidateRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureStoryCandidate */
    INSERT INTO classifier_candidates (classifier_id, candidate_kind, story_id)
    VALUES (${storyClassifierId}, 'story', ${story.id}) RETURNING id
  `)
  const storyCandidateId = storyCandidateRows[0]!.id
  const { rows: storyThresholdRows } = await write<{ id: string }>(sql`
    /* createClassifierFixtureStoryThreshold */
    INSERT INTO classifier_candidate_thresholds (
      classifier_id, candidate_id, prompt_version_id
    ) VALUES (${storyClassifierId}, ${storyCandidateId}, ${storyPromptRows[0]!.id})
    RETURNING id
  `)

  return {
    classifierId,
    promptVersionId,
    topicCandidateId,
    topicThresholdId: topicThresholdRows[0]!.id,
    communityCandidateId,
    communityThresholdId: thresholdRows[0]!.id,
    auditUserId: auditUser.id,
    communityId: community.id,
    topicId: topic.id,
    communityTopicId: communityTopic.id,
    postId: post.id,
    storyId: story.id,
    storyClassifierId,
    storyPromptVersionId: storyPromptRows[0]!.id,
    storyCandidateId,
    storyThresholdId: storyThresholdRows[0]!.id,
    rssFeedItemId: rssFeedItem.id,
    standaloneRssFeedItemId: standaloneRssFeedItem.id,
  }
}
