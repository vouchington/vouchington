import { describe, expect, it } from 'vitest'
import { webModerationAppealActions } from './adapters'
import { webIntegrityReconciliation } from './integrity-adapter'
import type { LifecycleScenarioInput } from './manifest'
import { webForwardPagination } from './pagination-adapter'
import { webPrivatePostCollection } from './private-post-adapter'

function scenarioInput(overrides: Partial<LifecycleScenarioInput> = {}): LifecycleScenarioInput {
  return {
    preconditions: {},
    action: {},
    serverOutcome: {},
    ...overrides,
  }
}

describe('web lifecycle adapters', () => {
  it('fails closed for a missing moderation appeal viewer role', () => {
    expect(
      webModerationAppealActions(
        scenarioInput({
          preconditions: { status: 'pending', sentAt: '2026-01-02T00:00:00Z' },
          action: { type: 'inspect-actions' },
        }),
      ),
    ).toMatchObject({
      visibleState: { viewerRole: 'member' },
      availableActions: [],
    })
  })

  it('only exposes continuation actions when their cursor is present', async () => {
    expect(
      (
        await webForwardPagination(
          scenarioInput({
            preconditions: { itemIds: ['one'], nextCursor: null },
            action: { type: 'remove', itemId: 'one' },
          }),
        )
      ).availableActions,
    ).toEqual([])
    expect(
      (
        await webForwardPagination(
          scenarioInput({
            preconditions: { itemIds: ['one'], nextCursor: null },
            action: { type: 'load-more' },
            serverOutcome: { error: 'network' },
          }),
        )
      ).availableActions,
    ).toEqual([])
  })

  it('fails closed for an unknown private-post action', () => {
    expect(() => webPrivatePostCollection(scenarioInput({ action: { type: 'archive' } }))).toThrow(
      'Unknown web private-post lifecycle action: archive',
    )
  })

  it('confirms a report penalty only when the authoritative count exceeds its baseline', async () => {
    await expect(
      webIntegrityReconciliation(
        scenarioInput({
          preconditions: { penaltyCount: 1 },
          action: { type: 'apply-report-penalty' },
          serverOutcome: { exactReadPenaltyCount: 2 },
        }),
      ),
    ).resolves.toMatchObject({
      availableActions: ['revoke'],
      visibleState: { penaltyApplied: true, error: null },
    })
  })

  it('uses controller retry gating to expose a penalty retry only after an unchanged exact read', async () => {
    await expect(
      webIntegrityReconciliation(
        scenarioInput({
          preconditions: { penaltyCount: 1 },
          action: { type: 'apply-report-penalty' },
          serverOutcome: { exactReadPenaltyCount: 1 },
        }),
      ),
    ).resolves.toMatchObject({
      availableActions: ['apply-penalty'],
      visibleState: { penaltyApplied: false, error: 'mutation-outcome-unknown' },
    })
  })

  it('treats an explicit false revocation read as a pending authoritative result', async () => {
    await expect(
      webIntegrityReconciliation(
        scenarioInput({
          action: { type: 'revoke-report-penalty' },
          serverOutcome: { exactReadRevoked: false },
        }),
      ),
    ).resolves.toMatchObject({
      visibleState: { revoked: false, error: 'mutation-outcome-unknown' },
      reconciliation: { strategy: 'exact-read', committed: false },
    })
  })

  it('fails closed when the controlled exact read is unavailable', async () => {
    await expect(
      webIntegrityReconciliation(
        scenarioInput({
          action: { type: 'resolve-report' },
          serverOutcome: { mutation: 'ambiguous', exactRead: 'failed' },
        }),
      ),
    ).resolves.toMatchObject({
      visibleState: { reportStatus: 'pending', error: 'mutation-outcome-unknown' },
      availableActions: ['retry'],
      reconciliation: { strategy: 'fail-closed' },
    })
  })
})
