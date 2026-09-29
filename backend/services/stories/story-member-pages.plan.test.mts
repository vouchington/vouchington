import { describe, it, expect } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import {
  analyzeStoryMemberPlanTables,
  assertBoundedStoryMemberPlan,
} from '@voucha/test-helpers/entities/story-member-page-plans'
import { enableQueryCapture, stopTestQueryCapture } from '@voucha/test-helpers/query-capture'
import { explainCapturedTestQuery } from '@voucha/test-helpers/query-plans'
import { getStoryMemberPagesBatch } from './story-member-pages.mts'

describe('story membership plans', () => {
  it('bounds indexed membership work in custom and generic first and continuation plans', async () => {
    const fixture = await createTestStoryMembers(2000)
    const user = await createTestUser()
    for (const viewer of [null, user]) {
      const first = (
        await getStoryMemberPagesBatch(viewer, [{ story_id: fixture.story.id }], { limit: 3 })
      )[fixture.story.id]!
      for (const after of [undefined, first.page_info.end_cursor!]) {
        enableQueryCapture()
        let captured
        try {
          await getStoryMemberPagesBatch(viewer, [{ story_id: fixture.story.id, after }], {
            limit: 3,
          })
        } finally {
          captured = stopTestQueryCapture().find(query =>
            query.text.includes('/* getStoryMemberPagesBatch */'),
          )
        }
        expect(captured).toBeDefined()
        for (const mode of ['force_custom_plan', 'force_generic_plan'] as const) {
          const plan = await explainCapturedTestQuery(
            'story-members',
            captured!,
            mode,
            analyzeStoryMemberPlanTables,
          )
          assertBoundedStoryMemberPlan(plan, 3, Boolean(after))
        }
      }
    }
  })
})
