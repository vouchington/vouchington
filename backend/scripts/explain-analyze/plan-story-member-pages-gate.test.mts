import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ExplainResult } from '@data-stores/psql'
import { assertStoryMemberPagePlan } from './plan-story-member-pages-gate.mts'

type Mode = 'force_custom_plan' | 'force_generic_plan'
type Phase = 'first' | 'after'

const oldPlans = JSON.parse(
  readFileSync(new URL('./story-member-old-plans.json', import.meta.url), 'utf8'),
) as Array<{ mode: Mode; plan: unknown }>

function result(
  scenario_id: string,
  plan: unknown,
  name = 'getStoryMemberPagesBatch',
): ExplainResult {
  return {
    name: `${name}:force_custom_plan`,
    scenario_id,
    query_text: '/* getStoryMemberPagesBatch */ SELECT 1',
    plan,
    execution_time_ms: 1,
    planning_time_ms: 1,
    timestamp: '2026-09-27T00:00:00.000Z',
  }
}

function selectorPlan(limit: number, phase: Phase, extraFiltered = 0) {
  return {
    Plan: {
      'Node Type': 'Nested Loop',
      'Actual Rows': limit + 1,
      'Actual Loops': 1,
      Plans: [
        {
          'Node Type': 'Limit',
          'Actual Rows': limit + 1,
          'Actual Loops': 1,
          Plans: [
            {
              'Node Type': 'Index Scan',
              'Relation Name': 'rss_feed_items_default',
              Alias: 'rss_feed_items',
              'Index Cond':
                phase === 'after'
                  ? '(story_id = input.story_id) AND (id < input.after_id)'
                  : '(story_id = input.story_id)',
              'Actual Rows': limit + 1,
              'Actual Loops': 1,
              'Rows Removed by Filter': extraFiltered,
            },
          ],
        },
      ],
    },
  }
}

describe('story member EXPLAIN gates', () => {
  it('accepts indexed custom and generic first and continuation pages', () => {
    for (const mode of ['force_custom_plan', 'force_generic_plan'] as const) {
      for (const [kind, limit] of [
        ['preview-1', 1],
        ['preview-3', 3],
        ['detail-25', 25],
      ] as const) {
        for (const phase of ['first', 'after'] as const) {
          const input = result(
            `story-members-${kind}-${phase}`,
            selectorPlan(limit, phase, phase === 'first' && kind !== 'detail-25' ? 1 : 0),
          )
          input.name = `getStoryMemberPagesBatch:${mode}`
          expect(() => assertStoryMemberPagePlan(input)).not.toThrow()
        }
      }
    }
  })

  it('rejects work above selected page plus lookahead and primary exclusion', () => {
    const input = result('story-members-preview-3-first', selectorPlan(3, 'first', 2))
    expect(() => assertStoryMemberPagePlan(input)).toThrow('scanned 6 story members')
    input.plan = selectorPlan(3, 'after')
    input.scenario_id = 'story-members-preview-3-after'
    const scan = (
      input.plan as { Plan: { Plans: Array<{ Plans: Array<Record<string, unknown>> }> } }
    ).Plan.Plans[0]!.Plans[0] as Record<string, unknown>
    scan['Index Cond'] = '(story_id = input.story_id)'
    expect(() => assertStoryMemberPagePlan(input)).toThrow('with id <')
    scan['Index Cond'] =
      '((ROW(story_id, id) < ROW(input.story_id, input.after_id)) AND (story_id = input.story_id))'
    expect(() => assertStoryMemberPagePlan(input)).not.toThrow()
    input.name = 'getStoryItemIds:force_custom_plan'
    expect(() => assertStoryMemberPagePlan(input)).toThrow('production story member selector')
  })

  it('rejects the actual old unbounded custom and generic plans', () => {
    expect(oldPlans.map(entry => entry.mode)).toEqual(['force_custom_plan', 'force_generic_plan'])
    for (const { mode, plan } of oldPlans) {
      const input = result('story-members-detail-25-first', plan)
      input.name = `getStoryMemberPagesBatch:${mode}`
      expect(() => assertStoryMemberPagePlan(input)).toThrow('scanned 2000 story members')
    }
  })

  it('requires positive selected-ID hydration work without broad membership scans', () => {
    for (const name of [
      'getRssFeedItemsByIdBatch',
      'getElectionsByIdBatch',
      'getRssFeedItemEmbedsByItems',
    ]) {
      const input = result(
        'story-hydration-preview-3-first',
        {
          Plan: { 'Node Type': 'Nested Loop', 'Actual Rows': 3, 'Actual Loops': 1 },
        },
        name,
      )
      expect(() => assertStoryMemberPagePlan(input)).not.toThrow()
      input.plan = { Plan: { 'Node Type': 'Nested Loop', 'Actual Rows': 1000 } }
      expect(() => assertStoryMemberPagePlan(input)).toThrow('hydrated 1000 rows')
      input.plan = {
        Plan: {
          'Node Type': 'Nested Loop',
          'Actual Rows': 3,
          Plans: [
            {
              'Node Type': 'Seq Scan',
              'Relation Name': 'rss_feed_items_default',
              'Actual Loops': 1,
            },
          ],
        },
      }
      expect(() => assertStoryMemberPagePlan(input)).toThrow('sequentially scan RSS items')
    }
    const unknown = result('story-hydration-preview-3-first', {
      Plan: { 'Node Type': 'Index Scan', 'Actual Rows': 1 },
    })
    expect(() => assertStoryMemberPagePlan(unknown)).toThrow('selected-ID story hydration query')
  })
})
