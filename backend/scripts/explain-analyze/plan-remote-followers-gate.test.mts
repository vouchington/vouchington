import { describe, expect, it } from 'vitest'
import type { ExplainPlanCacheMode, ExplainResult } from '@data-stores/psql'
import { assertRemoteFollowerPagePlanShapeIfApplicable } from './plan-remote-followers-gate.mts'

function result(
  planCacheMode: ExplainPlanCacheMode = 'force_custom_plan',
  plan: Record<string, unknown> = validPlan(),
): ExplainResult {
  return {
    name: `listRemoteFollowerInboxPage:${planCacheMode}`,
    scenario_id: 'remote-follower-inbox-late-cursor',
    query_text:
      'SELECT FROM relation__remote_actor__follow__user WHERE object_id = $1 AND subject_id > $2 ORDER BY subject_id LIMIT $3',
    plan: { Plan: plan },
    execution_time_ms: 1,
    planning_time_ms: 1,
    plan_cache_mode: planCacheMode,
    timestamp: new Date().toISOString(),
  }
}

function validPlan(): Record<string, unknown> {
  return {
    'Node Type': 'Limit',
    'Actual Rows': 501,
    Plans: [
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'relation__remote_actor__follow__user',
        'Index Name': 'idx_relation__remote_actor__follow__user__active_reverse',
        'Index Cond': '((object_id = $1) AND (subject_id > $2))',
        'Actual Rows': 501,
        'Actual Loops': 1,
      },
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'remote_actors',
        'Index Name': 'remote_actors_pkey',
        'Actual Rows': 1,
        'Actual Loops': 501,
      },
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'topics',
        'Index Name': 'idx_topics__fediverse_instance__hostname_id',
        'Actual Rows': 1,
        'Actual Loops': 501,
      },
      {
        'Node Type': 'Index Only Scan',
        'Relation Name': 'topics__fediverse_instances',
        'Index Name': 'topics__fediverse_instances_pkey',
        'Actual Rows': 1,
        'Actual Loops': 501,
      },
    ],
  }
}

function planWithUnboundedRemoteActors(): Record<string, unknown> {
  const plan = validPlan()
  return {
    ...plan,
    Plans: [
      ...(plan.Plans as Record<string, unknown>[]),
      {
        'Node Type': 'Index Scan',
        'Relation Name': 'remote_actors',
        'Index Name': 'remote_actors_pkey',
        'Actual Rows': 100_000,
        'Actual Loops': 1,
      },
    ],
  }
}

function planWithUnboundedFollowerIndex(): Record<string, unknown> {
  const plan = validPlan()
  return {
    ...plan,
    Plans: [
      {
        ...(plan.Plans as Record<string, unknown>[])[0]!,
        'Actual Rows': 100_000,
        'Actual Loops': 1,
      },
    ],
  }
}

function planWithUnboundedDirectory(): Record<string, unknown> {
  const plan = validPlan()
  return {
    ...plan,
    Plans: [
      ...(plan.Plans as Record<string, unknown>[]),
      {
        'Node Type': 'Seq Scan',
        'Relation Name': 'topics__fediverse_instances',
        'Actual Rows': 0,
        'Actual Loops': 1,
        'Rows Removed by Filter': 1000,
      },
    ],
  }
}

describe('remote-follower EXPLAIN plan gate', () => {
  it('ignores unrelated scenarios', () => {
    expect(() =>
      assertRemoteFollowerPagePlanShapeIfApplicable({
        ...result('force_custom_plan', {}),
        scenario_id: 'another-scenario',
      }),
    ).not.toThrow()
  })

  it.each(['force_custom_plan', 'force_generic_plan'] as const)(
    'accepts the bounded reverse-index plan in %s mode',
    planCacheMode => {
      expect(() =>
        assertRemoteFollowerPagePlanShapeIfApplicable(result(planCacheMode)),
      ).not.toThrow()
    },
  )

  it.each([
    [
      'sequential scan',
      {
        'Node Type': 'Limit',
        'Actual Rows': 501,
        Plans: [
          {
            'Node Type': 'Seq Scan',
            'Relation Name': 'relation__remote_actor__follow__user',
          },
        ],
      },
    ],
    [
      'incomplete cursor condition',
      {
        ...validPlan(),
        Plans: [
          {
            'Node Type': 'Index Scan',
            'Relation Name': 'relation__remote_actor__follow__user',
            'Index Name': 'idx_relation__remote_actor__follow__user__active_reverse',
            'Index Cond': '(object_id = $1)',
          },
        ],
      },
    ],
    ['missing limit', { ...validPlan(), 'Node Type': 'Nested Loop' }],
    ['underfilled page', { ...validPlan(), 'Actual Rows': 500 }],
    ['oversized page', { ...validPlan(), 'Actual Rows': 502 }],
    ['unbounded follower index', planWithUnboundedFollowerIndex()],
    ['unbounded remote actor scan', planWithUnboundedRemoteActors()],
    ['unbounded fediverse directory scan', planWithUnboundedDirectory()],
    [
      'unbounded sort',
      {
        ...validPlan(),
        Plans: [
          {
            'Node Type': 'Sort',
            'Actual Rows': 100_000,
            'Actual Loops': 1,
            Plans: validPlan().Plans,
          },
        ],
      },
    ],
  ])('rejects a %s plan', (_name, plan) => {
    expect(() =>
      assertRemoteFollowerPagePlanShapeIfApplicable(result('force_custom_plan', plan)),
    ).toThrow('idx_relation__remote_actor__follow__user__active_reverse')
  })

  it('permits a bounded sort after keyset limiting', () => {
    const plan = {
      ...validPlan(),
      Plans: [
        { 'Node Type': 'Sort', 'Actual Rows': 501, 'Actual Loops': 1, Plans: validPlan().Plans },
      ],
    }

    expect(() =>
      assertRemoteFollowerPagePlanShapeIfApplicable(result('force_generic_plan', plan)),
    ).not.toThrow()
  })
})
