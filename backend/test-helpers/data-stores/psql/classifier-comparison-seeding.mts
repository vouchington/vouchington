import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { write } from '@data-stores/psql'
import {
  getEntityRelationMetadataOrThrow,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'
import { persistClassifierDecision } from '../../../services/classifiers/persist-classifier-decision.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { createSystemUser, createTestUser } from '../../entities/users.mts'
import {
  castHumanTopicRelationVote,
  createHumanTopicRelation,
  persistSubjectTopicDecision,
  type TopicRelationSubject,
} from './classifier-runs/subject-topic-relations.mts'
import type { createClassifierFixture } from './classifiers.mts'

type ComparisonFixture = Awaited<ReturnType<typeof createClassifierFixture>>
export type Ballot = -1 | 0 | 1

/** The day the comparison tests place their decisions on, safely before any real clock time. */
const SEED_DAY_MS = Date.UTC(2026, 2, 10, 12)

/** A moment `hours` after noon on the seed day, for dating decision batches by their UUIDv7 id. */
export function seedMoment(hours: number): Date {
  return new Date(SEED_DAY_MS + hours * 60 * 60 * 1000)
}

export function postSubject(fixture: ComparisonFixture): TopicRelationSubject {
  return { postId: fixture.postId, rssFeedItemId: null }
}

export function rssItemSubject(fixture: ComparisonFixture): TopicRelationSubject {
  return { postId: null, rssFeedItemId: fixture.rssFeedItemId }
}

/**
 * A global-scope decision dated `at`, made with the prompt defaults (0.25 and 0.75) over the
 * fixture's global topic unless another is given.
 */
export function seedGlobalDecision(
  fixture: ComparisonFixture,
  input: { probability: number; at: Date; topicId?: string; subject?: TopicRelationSubject },
) {
  return persistSubjectTopicDecision(
    fixture,
    input.subject ?? postSubject(fixture),
    [{ topicId: input.topicId ?? fixture.topicId, probability: input.probability }],
    uuidv7({ msecs: input.at.getTime() }),
  )
}

/**
 * A decision for the fixture community's own candidate and topic, dated `at`. Its stored snapshot
 * carries the candidate's override, so the effective thresholds are 0.3 and 0.75.
 */
export async function seedCommunityDecision(
  fixture: ComparisonFixture,
  input: { probability: number; at: Date; subject?: TopicRelationSubject },
) {
  const { decision } = await persistClassifierDecision({
    batchId: uuidv7({ msecs: input.at.getTime() }),
    classifierId: fixture.classifierId,
    promptVersionId: fixture.promptVersionId,
    subject: input.subject ?? postSubject(fixture),
    scope: { scopeCategory: 'community_ai', scopeCommunityId: fixture.communityId },
    calls: [
      {
        shardOrdinal: 0,
        results: [
          {
            candidateKind: 'topic',
            topicId: fixture.communityTopicId,
            storedCandidateId: fixture.communityCandidateId,
            probability: input.probability,
            rawResponse: { probability: input.probability },
          },
        ],
      },
    ],
  })
  return decision
}

export function createHumanVoters(count: number): Promise<PrivateUser[]> {
  return Promise.all(Array.from({ length: count }, () => createTestUser()))
}

/**
 * People tag the subject with the topic and vote on it: the first voter creates the relation, and
 * every voter then casts their ballot (one at a time, so each ballot is the newest of its voter).
 */
export async function recordHumanTopicVotes(
  subject: TopicRelationSubject,
  topicId: string,
  ballots: readonly Ballot[],
  voters?: readonly PrivateUser[],
) {
  const people = voters ?? (await createHumanVoters(ballots.length))
  const relation = await createHumanTopicRelation(people[0]!, subject, topicId)
  for (const [index, ballot] of ballots.entries()) {
    await castHumanTopicRelationVote(people[index]!.id, subject, relation.id, ballot)
  }
  return { relationId: relation.id, voters: people }
}

/** A platform account (as the classifier's shared actor is) votes; it must never count as human. */
export async function recordSystemTopicVote(
  subject: TopicRelationSubject,
  relationId: string,
  ballot: Ballot,
) {
  const account = await createSystemUser(`comparison-system-${uuidv7()}`)
  await castHumanTopicRelationVote(account.id, subject, relationId, ballot)
  return account
}

/**
 * Appends a clear event (a NULL score) for the voter. Its id sorts after every earlier ballot, so
 * it is the voter's newest ballot whatever the clock resolution.
 */
export async function recordClearedTopicBallot(
  subject: TopicRelationSubject,
  relationId: string,
  userId: string,
): Promise<void> {
  const metadata = getEntityRelationMetadataOrThrow({
    subjectType: subject.postId === null ? 'rss_feed_item' : 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  await write(
    sql`/* recordClassifierFixtureClearedBallot */
      INSERT INTO `
      .append(getEntityRelationVoteTableName(metadata))
      .append(
        sql` (id, user_id, subject_id, entity_relation_id, score)
      VALUES (${uuidv7({ msecs: Date.now() + 60_000 })}, ${userId},
        ${subject.postId ?? subject.rssFeedItemId}, ${relationId}, NULL)`,
      ),
  )
}

/**
 * Inserts `count` completed global decision batches with no calls or results, one millisecond
 * apart from `startAt`. Enough to show how many batches a window selects, without their weight.
 */
export async function insertCompletedEmptyBatches(
  fixture: ComparisonFixture,
  count: number,
  startAt: Date,
  options: { subject?: TopicRelationSubject; communityId?: string } = {},
): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) =>
    uuidv7({ msecs: startAt.getTime() + index }),
  )
  await write(sql`/* insertClassifierFixtureEmptyBatches */
    INSERT INTO classifier_decision_batches (
      id, classifier_id, prompt_version_id, post_id, rss_feed_item_id,
      scope_category, scope_community_id
    )
    SELECT batch_id, ${fixture.classifierId}, ${fixture.promptVersionId},
      ${(options.subject ?? postSubject(fixture)).postId},
      ${(options.subject ?? postSubject(fixture)).rssFeedItemId},
      ${options.communityId ? 'community_ai' : 'global'}, ${options.communityId ?? null}
    FROM unnest(${ids}::uuid[]) AS batch_id
  `)
  await write(sql`/* completeClassifierFixtureEmptyBatches */
    UPDATE classifier_decision_batches SET completed_at = CURRENT_TIMESTAMP
    WHERE id = ANY(${ids}::uuid[])
  `)
  return ids
}
