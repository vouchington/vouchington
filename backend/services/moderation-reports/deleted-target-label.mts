import type { PendingModerationReport } from './pending-moderation-report.mts'

/**
 * When a report's target has been soft-deleted, render it as "[deleted content]"
 * with no dead links. Applies to all viewer tiers (the moderation event stays visible).
 */
export function applyDeletedTargetLabel(report: PendingModerationReport): PendingModerationReport {
  if (report.target_available !== false) return report
  return {
    ...report,
    target_label: '[deleted content]',
    target_content: null,
    target_path: null,
    admin_action_path: null,
  }
}
