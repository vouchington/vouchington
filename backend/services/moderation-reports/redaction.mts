import {
  listModerationReports,
  type ListModerationReportsOptions,
  type PendingModerationReport,
  type RedactedModerationReport,
} from './get.mts'
import { toPublicPostModerationContext } from './post-moderation-context-attach.mts'

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

/**
 * Redacted list for signed-in non-staff viewers. Omits reporter identity, note,
 * resolved_by_id, admin_action_path, and the AI judgement (its public_response is
 * LLM-generated from reporter notes, so it can paraphrase hidden note content — keep it
 * staff-only). Masks target metadata for private-community / non-public posts/comments.
 */
export async function listRedactedModerationReports(
  options: ListModerationReportsOptions,
): Promise<{
  reports: RedactedModerationReport[]
  hasNextPage: boolean
  hasPreviousPage: boolean
}> {
  const { reports, hasNextPage, hasPreviousPage } = await listModerationReports({
    ...options,
    excludeSystemGenerated: true,
  })
  // Strip staff-tier fields; downgrade post_moderation_context to public tier in memory
  // (no extra DB queries — listModerationReports already loaded the staff context).
  // System-generated reports (ban-evasion detector) are staff-only — exclude them to avoid
  // leaking pending ban-evasion flag presence to non-staff viewers.
  const redacted = reports.flatMap(report => {
    // Defense-in-depth for callers of this redaction layer if the SQL filter changes.
    if (report.is_system_generated) return []
    const {
      reporter_user_id: _r,
      reporter_username: _u,
      note: _n,
      resolved_by_id: _rid,
      admin_action_path: _a,
      target_user_id: _tuid,
      post_moderation_context,
      target_is_restricted,
      target_label,
      target_content,
      target_path,
      judgement: _j,
      community_ban_evasion: _cbe,
      is_system_generated: _sg,
      ...rest
    } = report
    // Hidden = private/followers-only or soft-deleted: withhold content-derived data.
    const hidden = target_is_restricted || rest.target_available === false
    return [
      {
        ...rest,
        target_label: target_is_restricted ? '[Private content]' : target_label,
        target_content: hidden ? null : target_content,
        target_path: target_is_restricted ? null : target_path,
        post_moderation_context: hidden
          ? null
          : toPublicPostModerationContext(post_moderation_context),
      },
    ]
  })
  return { reports: redacted as RedactedModerationReport[], hasNextPage, hasPreviousPage }
}
