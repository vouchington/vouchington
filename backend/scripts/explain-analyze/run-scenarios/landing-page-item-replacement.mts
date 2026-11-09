import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { buildLandingPageInsertRows } from '@services/my/landing-pages/replace-item-rows'
import { replaceLandingPageItemRows } from '@services/my/landing-pages/replace-item-writes'
import { MAX_LANDING_PAGES } from '@services/my/landing-pages/shared'
import type { LandingPageItemInput } from '@services/my/landing-pages/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedPostId, seedTopicId, seedUser } from '../run-support.mts'
import {
  cleanupLandingPageItemReplacementCorpus,
  seedLandingPageItemReplacementCorpus,
} from './landing-page-item-replacement-corpus.mts'

/** A bounded page with one group, member and surplus row exercises both replacement shapes. */
export async function runLandingPageItemReplacementScenarios(): Promise<void> {
  const corpusPageIds = await seedLandingPageItemReplacementCorpus()
  let pageId = ''
  try {
    const { rows } = await write<{ id: string }>(
      `/* seedExplainLandingReplacementPage */ INSERT INTO user_landing_pages (user_id, title, slug, slot)
       SELECT $1::uuid, 'Explain item replacement', $2, candidate.slot
       FROM generate_series(1, $3::integer) AS candidate(slot)
       WHERE NOT EXISTS (SELECT 1 FROM user_landing_pages page
         WHERE page.user_id = $1::uuid AND page.slot = candidate.slot)
       ORDER BY candidate.slot LIMIT 1 RETURNING id`,
      [seedUser.id, `explain-replace-${randomUUID()}`, MAX_LANDING_PAGES],
    )
    pageId = rows[0]!.id
    const group: LandingPageItemInput = {
      type: 'topic_group',
      topic_id: seedTopicId,
      entries: [{ type: 'review', review_post_id: seedPostId }],
    }
    const initial: LandingPageItemInput[] = [group, { type: 'review', review_post_id: seedPostId }]
    const writeItems = async (items: LandingPageItemInput[]) => {
      const built = buildLandingPageInsertRows(items, new Map())
      await using query = await beginTransaction()
      await replaceLandingPageItemRows(query, pageId, built.itemRows, built.groupMemberRows)
      await query.commit()
    }
    for (const id of ['landing-page-items-replace', 'landing-page-items-clear'])
      registerScenarioContract(id, {
        allowEmptyResult: true,
        expectations: [
          { kind: 'maxProcessedRows', relation: 'user_landing_page_items', max: 8 },
          { kind: 'maxProcessedRows', relation: 'user_landing_page_group_members', max: 4 },
        ],
      })
    await writeItems(initial)
    await runAndCapture(
      'landing-page-items-replace',
      async () => {
        await writeItems([group])
        const { rows: counts } = await write<{ n: number }>(
          `/* verifyExplainLandingReplacement */ SELECT count(*)::int AS n FROM user_landing_page_items WHERE landing_page_id = $1::uuid`,
          [pageId],
        )
        assert.equal(counts[0]?.n, 1)
      },
      undefined,
      [
        'replaceMyLandingPageItems:lockWrittenItems',
        'replaceMyLandingPageItems:upsertItems',
        'replaceMyLandingPageItems:clearGroupMembers',
        'replaceMyLandingPageItems:deleteSurplus',
        'replaceMyLandingPageItems:insertGroupMembers',
      ],
      { afterCapture: () => writeItems(initial) },
    )
    await runAndCapture(
      'landing-page-items-clear',
      async () => {
        await writeItems([])
        const { rows: counts } = await write<{ n: number }>(
          `/* verifyExplainLandingClear */ SELECT count(*)::int AS n FROM user_landing_page_items WHERE landing_page_id = $1::uuid`,
          [pageId],
        )
        assert.equal(counts[0]?.n, 0)
      },
      undefined,
      ['replaceMyLandingPageItems:lockWrittenItems', 'replaceMyLandingPageItems:clearRemaining'],
      { afterCapture: () => writeItems(initial) },
    )
  } finally {
    try {
      if (pageId) {
        await write(
          `/* cleanupExplainLandingReplacementPage */ DELETE FROM user_landing_pages WHERE id = $1::uuid`,
          [pageId],
        )
      }
    } finally {
      await cleanupLandingPageItemReplacementCorpus(corpusPageIds)
    }
  }
}
