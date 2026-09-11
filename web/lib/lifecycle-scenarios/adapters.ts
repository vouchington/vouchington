import { canResolveModerationAppealAction, type ModerationAppeal } from '@/types/appeals'
import { hasUpdatedAppealDraftLifecycle } from '@/lib/api/client/appeals'
import type { LifecycleJson, LifecycleScenarioInput } from './manifest'
import { webForwardPagination } from './pagination-adapter'
import { webIntegrityReconciliation } from './integrity-adapter'
import { webPrivatePostCollection } from './private-post-adapter'

const moderationAppealViewerRoles = ['administrator', 'moderator', 'member'] as const
type LifecycleModerationAppealViewerRole = (typeof moderationAppealViewerRoles)[number]

export interface LifecycleObservation {
  visibleState: Record<string, LifecycleJson | undefined>
  availableActions: string[]
  reconciliation: Record<string, LifecycleJson | undefined>
  cancellation: Record<string, LifecycleJson | undefined>
}

export type LifecycleAdapter = (
  input: LifecycleScenarioInput,
) => LifecycleObservation | Promise<LifecycleObservation>

export const lifecycleNotApplicable = { behavior: 'not-applicable' } satisfies Record<
  string,
  LifecycleJson
>

export function stringValue(input: Record<string, LifecycleJson>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' ? value : undefined
}

export function nullableStringValue(
  input: Record<string, LifecycleJson>,
  key: string,
): string | null {
  const value = input[key]
  return typeof value === 'string' ? value : null
}

export function booleanValue(input: Record<string, LifecycleJson>, key: string): boolean {
  return input[key] === true
}

export function numberValue(input: Record<string, LifecycleJson>, key: string): number | undefined {
  const value = input[key]
  return typeof value === 'number' ? value : undefined
}

export function stringArrayValue(input: Record<string, LifecycleJson>, key: string): string[] {
  const value = input[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function lifecycleViewerRole(
  input: Record<string, LifecycleJson>,
): LifecycleModerationAppealViewerRole {
  const role = stringValue(input, 'viewerRole')
  return moderationAppealViewerRoles.includes(role as LifecycleModerationAppealViewerRole)
    ? (role as LifecycleModerationAppealViewerRole)
    : 'member'
}

function appealFor(source: Record<string, LifecycleJson>): ModerationAppeal {
  const appealType = stringValue(source, 'appealType')
  return {
    id: 'lifecycle-appeal',
    user_warning_id: appealType === 'suspension' ? null : 'warning-1',
    community_ban_id: null,
    post_id: null,
    user_suspension_id: appealType === 'suspension' ? 'suspension-1' : null,
    community_id: null,
    post_removal_kind: null,
    status: (stringValue(source, 'status') ?? 'pending') as ModerationAppeal['status'],
    recommended_action: null,
    ai_drafted_at: booleanValue(source, 'latestLifecycleChangeChanged')
      ? '2026-01-01T00:01:00.000Z'
      : '2026-01-01T00:00:00.000Z',
    public_response: 'Ready for delivery',
    drafted_at: null,
    edited_at: null,
    approved_at: nullableStringValue(source, 'approvedAt'),
    sent_at: nullableStringValue(source, 'sentAt'),
    resolved_at: null,
    resolution_action: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    target_context: null,
    latest_lifecycle_change_id: booleanValue(source, 'latestLifecycleChangeChanged')
      ? 'change-2'
      : 'change-1',
  }
}

export const webModerationAppealActions: LifecycleAdapter = input => {
  const action = stringValue(input.action, 'type')
  const source = { ...input.preconditions, ...input.serverOutcome }
  const role = lifecycleViewerRole(input.preconditions)
  const before = appealFor(input.preconditions)
  const appeal = appealFor(source)
  const availableActions =
    role === 'member' || appeal.status !== 'pending'
      ? []
      : [
          appeal.approved_at || appeal.sent_at ? null : 'rerun',
          appeal.approved_at || appeal.sent_at || !appeal.public_response ? null : 'approve',
          appeal.approved_at && !appeal.sent_at ? 'send' : null,
          canResolveModerationAppealAction(appeal, 'accept', role) ? 'accept' : null,
          canResolveModerationAppealAction(appeal, 'reduce', role) ? 'reduce' : null,
          canResolveModerationAppealAction(appeal, 'deny', role) ? 'deny' : null,
        ].filter((item): item is string => item !== null)

  if (action === 'inspect-actions') {
    return {
      visibleState: { status: stringValue(source, 'status') ?? 'pending', viewerRole: role },
      availableActions,
      reconciliation: { strategy: 'not-applicable' },
      cancellation: lifecycleNotApplicable,
    }
  }
  const visibleState: Record<string, LifecycleJson> = {
    status: stringValue(source, 'status') ?? 'pending',
    latestLifecycleChangeChanged:
      action === 'rerun'
        ? hasUpdatedAppealDraftLifecycle(before, appeal)
        : booleanValue(source, 'latestLifecycleChangeChanged'),
  }
  if (action === 'approve' || action === 'send') {
    visibleState.approved = nullableStringValue(source, 'approvedAt') !== null
    visibleState.sent = nullableStringValue(source, 'sentAt') !== null
  }
  if (action === 'deny')
    visibleState.resolutionAction = stringValue(source, 'resolutionAction') ?? null
  return {
    visibleState,
    availableActions,
    reconciliation: { strategy: 'server-response' },
    cancellation: lifecycleNotApplicable,
  }
}

export const webLifecycleAdapters: Record<string, LifecycleAdapter> = {
  'web-moderation-appeal-actions': webModerationAppealActions,
  'web-integrity-reconciliation': webIntegrityReconciliation,
  'web-forward-pagination': webForwardPagination,
  'web-playwright-private-post-collection': webPrivatePostCollection,
}
