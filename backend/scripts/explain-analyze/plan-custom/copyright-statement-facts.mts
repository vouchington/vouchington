import type { ExplainResult } from '@data-stores/psql'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { collectPlanNodes, type PlanNode } from '../plan-nodes.mts'

const SCENARIO_ID = 'copyright-statement-facts'
// A hashed SubPlan reads its whole relation once per execution, so it must never be the way the
// query asks about the target's own placement or post.
const TARGET_BOUND_RELATIONS = new Set(['posts', 'image_placements', 'image_surface_placements'])
const CONDITION_KEYS = ['Filter', 'Join Filter', 'One-Time Filter', 'Index Cond', 'Recheck Cond']

/**
 * The statement facts query asks whether the target's placement has a public page. With an
 * uncorrelated hashed SubPlan, PostgreSQL derived that answer for every post, or every surface
 * owner, in the database on every execution; with no statistics the same plan also nested-looped the
 * eligibility view over all posts, so each execution took seconds on a busy shard (#2207). The plan
 * has to look up the target's placement instead: no hashed SubPlan over posts or placements, and
 * only a handful of post rows read.
 */
export function assertCopyrightStatementFactsIsTargetBounded(result: ExplainResult): void {
  if (result.scenario_id !== SCENARIO_ID) return
  const nodes = collectPlanNodes(result.plan)
  const hashed = new Set(nodes.flatMap(hashedSubPlanNames))
  for (const node of nodes) {
    const name = stringFromUnknown(node['Subplan Name'] ?? '')
    if (!hashed.has(name)) continue
    const relation = collectPlanNodes(node)
      .map(child => baseRelationName(child))
      .find(candidate => TARGET_BOUND_RELATIONS.has(candidate))
    if (relation) {
      throw new Error(
        `${result.name} must look up the target's own placement, but hashed ${name} reads all of ${relation}`,
      )
    }
  }
  const placementLookups = nodes.filter(
    node => baseRelationName(node) === 'image_placements' && Number(node['Actual Loops'] ?? 0) > 0,
  )
  if (placementLookups.length === 0) {
    throw new Error(`${result.name} must evaluate the seeded target's post placement`)
  }
}

function hashedSubPlanNames(node: PlanNode): string[] {
  return CONDITION_KEYS.flatMap(key =>
    [...stringFromUnknown(node[key] ?? '').matchAll(/hashed (SubPlan \d+)/g)].map(
      match => match[1] ?? '',
    ),
  )
}

function baseRelationName(node: PlanNode): string {
  return stringFromUnknown(node['Relation Name'] ?? '').replace(/__[^_].*$/, '')
}
