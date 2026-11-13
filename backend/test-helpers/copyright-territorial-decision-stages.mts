import { expect } from 'vitest'
import type {
  readTerritorialDecisionState,
  TerritorialRestrictionScene,
} from './copyright-territorial-decision-state.mts'
import type { TerritorialCopyrightDecisionInput } from '../services/copyright-notices/territorial-decision.mts'
import type { CopyrightNoticeTargetInput } from '../services/copyright-notices/types.mts'

type State = Awaited<ReturnType<typeof readTerritorialDecisionState>>
import { territorialDecisionAdmission } from './copyright-territorial-decision-admission.mts'
export function territorialDecisionStages(
  jurisdiction: 'eu_dsa' | 'uk',
  scene: TerritorialRestrictionScene,
  input: TerritorialCopyrightDecisionInput,
  before: State,
  after: State,
  placements: CopyrightNoticeTargetInput[],
  staydown: boolean,
) {
  const admission = territorialDecisionAdmission(
    jurisdiction,
    scene,
    input,
    before,
    after,
    placements,
  )
  if (!admission) return []
  const { admitted, targets, assessment, restrict } = admission
  if (!restrict) return [admitted]
  return Array.from({ length: targets.length + 1 }, (_, count) => {
    const imposed = targets.slice(0, count)
    const restrictions = imposed.map(target => ({
      id: after.effective.state.restrictions.find(row => row.target === target.id)?.id,
      target: target.id,
      assessment: assessment?.id,
      lifted: null,
      review: 'confirm',
      reviewer: scene.staff.id,
    }))
    const affected = imposed.map(target => ({
      target,
      poster: scene.posts.find(post => post.imageId === target.image_id)!.poster.id,
    }))
    return {
      ...admitted,
      notice: count
        ? {
            ...before.notice,
            accepted_at: expect.any(Date),
            provisional_withholding_at: expect.any(Date),
          }
        : before.notice,
      effective: {
        ...admitted.effective,
        accounts: before.effective.accounts.map(account => ({
          ...account,
          incidents: affected.some(row => row.poster === account.id)
            ? [
                ...account.incidents,
                { notice: scene.noticeId, operative: true, disposition: null },
              ].toSorted((a, b) => a.notice.localeCompare(b.notice))
            : account.incidents,
        })),
        provenance: [
          ...before.effective.provenance,
          ...affected.map(row => ({ account: row.poster, target: row.target.id })),
        ].toSorted(
          (a, b) =>
            a.account.localeCompare(b.account) || String(a.target).localeCompare(String(b.target)),
        ),
        state: {
          ...admitted.effective.state,
          accepted: count > 0,
          provisional: count > 0,
          restrictions,
          actions: restrictions.map(row => ({
            id: after.effective.state.actions.find(action => action.restriction === row.id)?.id,
            restriction: row.id,
            deadline: null,
            revision: imposed.find(target => target.id === row.target)!.placement_revision,
            action: 'withhold',
            state: 'pending',
          })),
          events: [
            ...admitted.effective.state.events,
            ...imposed.map(() => 'provisional_restriction_imposed'),
          ].toSorted(),
          deliveries: [
            ...admitted.effective.state.deliveries,
            ...(count
              ? [
                  ...(jurisdiction === 'eu_dsa'
                    ? [`claimant_decision_notice:email:${scene.claimant.id}`]
                    : []),
                  `claimant_decision_notice:in_app:${scene.claimant.id}`,
                ]
              : []),
            ...affected.flatMap(row => [
              `poster_restriction_notice:email:${row.poster}`,
              `poster_restriction_notice:in_app:${row.poster}`,
            ]),
          ].toSorted(),
          correspondence: [
            ...admitted.effective.state.correspondence,
            ...(count ? ['decision_notice'] : []),
            ...imposed.map(() => 'restriction_notice'),
          ].toSorted(),
          incidents: count,
          staydown: staydown ? count : 0,
        },
      },
    }
  })
}
