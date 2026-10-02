import type { QueryExecutor } from '@data-stores/psql'
import { describe, expect, it } from 'vitest'
import { getActiveCommunityModerationClassifier } from './active-community-moderation-classifier.mts'

/** A database that answers every read with the given classifier rows. */
const returning =
  (rows: object[]): QueryExecutor =>
  async () => ({
    command: 'SELECT',
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows: rows as never[],
  })

describe('getActiveCommunityModerationClassifier (real PG)', () => {
  it('reads the seeded classifier at its active prompt version', async () => {
    await expect(getActiveCommunityModerationClassifier()).resolves.toMatchObject({
      primitive: 'noul',
      candidateKind: 'community_prompt',
      classifierId: expect.any(String),
      promptVersionId: expect.any(String),
      prompt: expect.stringContaining('{{candidate}}'),
      modelName: expect.any(String),
      defaultThresholds: { lower: expect.any(Number), upper: expect.any(Number) },
    })
  })

  it('throws for a missing classifier instead of judging by another model', async () => {
    await expect(getActiveCommunityModerationClassifier(returning([]))).rejects.toThrow(
      "Classifier configuration for slug 'community-moderation' not found",
    )
  })

  it('throws when the classifier is wired to another kind of candidate', async () => {
    const topicClassifier = {
      classifier_id: 'classifier',
      primitive: 'noul',
      candidate_kind: 'topic',
      prompt_version_id: 'version',
      prompt: 'Is {{candidate}} a fit?',
      model_name: 'typesafe/jev-1.13',
      model_provider: 'openrouter',
      default_lower_threshold: 0.2,
      default_upper_threshold: 0.8,
    }

    await expect(
      getActiveCommunityModerationClassifier(returning([topicClassifier])),
    ).rejects.toThrow('Community moderation classifier must use community prompt candidates')
  })
})
