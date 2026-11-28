import { randomUUID } from 'node:crypto'
import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import { createClassifierFixture } from '../../../test-helpers/data-stores/psql/classifiers.mts'
import { readForeignKeyWithLeadingIndex } from '../../../test-helpers/data-stores/psql/schema-catalog.mts'
import {
  insertOwnerFkClassifierBatchWithMissingCommunity,
  pointOwnerFkReferralLinkAtMissingCrawl,
} from '../../../test-helpers/data-stores/psql/schema-owner-foreign-keys.mts'
import {
  createTestReferralLinkWithLastCrawl,
  deleteTestCrawl,
  readTestReferralLinkLastCrawl,
} from '../../../test-helpers/entities/referral-link-crawl-pointers.mts'

const foreignKeys = [
  {
    table: 'story_post_related_url_projection_relation_mutations',
    constraint: 'story_post_url_projection_mutations_relation_fkey',
    target: 'relation__post__related__url',
    deleteAction: 'c',
    leadingColumn: 'post_id',
  },
  {
    table: 'classifier_decision_batches',
    constraint: 'classifier_decision_batches_scope_community_id_fkey',
    target: 'communities',
    deleteAction: 'c',
    leadingColumn: 'scope_community_id',
  },
  {
    table: 'user_referral_program_links',
    constraint: 'user_referral_program_links_last_crawl_id_fkey',
    target: 'crawls',
    deleteAction: 'n',
    leadingColumn: 'last_crawl_id',
  },
]

describe('owner foreign keys', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it.each(foreignKeys)(
    '$table has a validated $deleteAction-delete FK to $target with a leading index',
    async ({ table, constraint, target, deleteAction, leadingColumn }) => {
      const rows = await readForeignKeyWithLeadingIndex(table, constraint)
      expect(rows).toEqual([
        { target, delete_action: deleteAction, validated: true, leading_column: leadingColumn },
      ])
    },
  )

  describe('classifier decision batch community scope', () => {
    it('rejects a community-scoped batch for a community that does not exist', async () => {
      const fixture = await createClassifierFixture()

      await expect(
        insertOwnerFkClassifierBatchWithMissingCommunity({
          classifierId: fixture.classifierId,
          promptVersionId: fixture.promptVersionId,
          postId: fixture.postId,
          missingCommunityId: randomUUID(),
        }),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'classifier_decision_batches_scope_community_id_fkey',
      })
    })

    it('cascades a community-scoped batch when its community is deleted', async () => {
      const fixture = await createClassifierFixture()
      const lineage = await fixture.createTopicBatch({ communityId: fixture.communityId })
      const candidateId = fixture.communityCandidateId

      await fixture.deleteCommunity()

      await expect(fixture.getLineageCounts({ ...lineage, candidateId })).resolves.toEqual({
        batches: 0,
        calls: 0,
        candidates: 0,
        results: 0,
      })
    })
  })

  describe('referral link last crawl', () => {
    it('rejects a last crawl that does not exist', async () => {
      const { linkId } = await createTestReferralLinkWithLastCrawl()

      await expect(
        pointOwnerFkReferralLinkAtMissingCrawl(linkId, randomUUID()),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'user_referral_program_links_last_crawl_id_fkey',
      })
    })

    it('clears the pointer and keeps the link when its crawl is deleted', async () => {
      const { linkId, crawlId } = await createTestReferralLinkWithLastCrawl()
      expect(await readTestReferralLinkLastCrawl(linkId)).toEqual({
        exists: true,
        lastCrawlId: crawlId,
      })

      await deleteTestCrawl(crawlId)

      expect(await readTestReferralLinkLastCrawl(linkId)).toEqual({
        exists: true,
        lastCrawlId: null,
      })
    })
  })
})
