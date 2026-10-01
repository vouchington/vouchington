import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Lifecycle events a member sees on a case, mirroring `copyrightTimelineEventTypesFor('member')`
 * in `@services/copyright-notices`. The export cannot import that package because it depends on
 * `@services/users`, which depends on this one, so a test in `backend/api` pins the two together.
 */
export const COPYRIGHT_CASE_TIMELINE_EVENT_TYPES = [
  'notice_received',
  'provisional_restriction_imposed',
  'placement_withheld',
  'placement_restored',
  'appeal_received',
  'appeal_reviewed',
  'counter_notice_received',
  'counter_notice_reviewed',
  'withdrawal_received',
]

/**
 * Streams the accepted copyright cases the user is a party to (claimant, or poster of a targeted
 * hosted image) exactly as the participant read model shows them to a non-staff member: the
 * public claimant attribution, each target's visibility and restriction status, and the member
 * timeline. It never selects the other party's legal name, address, contact, email or signature,
 * staff rationale, notes or staff-only timeline events.
 */
export function streamCopyrightCases(userId: string) {
  return createAsyncGeneratorFromCursor(sql`/* streamCopyrightCases */
    SELECT notice.id AS notice_id,
      CASE WHEN notice.claimant_user_id = ${userId} THEN 'claimant' ELSE 'poster' END AS viewer_role,
      notice.jurisdiction, notice.received_at, notice.accepted_at, notice.provisional_withholding_at,
      (SELECT count(*)::integer FROM copyright_notice_targets counted
        WHERE counted.copyright_notice_id = notice.id) AS target_count,
      claimant.id AS claimant_user_id,
      CASE WHEN claimant.id IS NOT NULL THEN
        COALESCE(claimant.display_account->>'name', claimant.username, 'Voucha member')
      END AS claimant_display_name,
      (SELECT COALESCE(json_agg(json_build_object(
          'id', target.id,
          'hosted_use_url', CASE WHEN public_post.post_id IS NOT NULL THEN target.hosted_use_url END,
          'restriction_status', CASE
            WHEN restriction.id IS NULL THEN 'pending'
            WHEN restriction.lifted_at IS NULL THEN 'active'
            ELSE 'lifted'
          END
        ) ORDER BY target.id), '[]'::json)
        FROM copyright_notice_targets target
        LEFT JOIN image_placements image_placement
          ON target.placement_id = image_placement.placement_id
        LEFT JOIN view_public_post_eligibility public_post
          ON public_post.post_id = image_placement.post_id
        LEFT JOIN LATERAL (
          SELECT current_restriction.id, current_restriction.lifted_at
          FROM copyright_restrictions current_restriction
          WHERE current_restriction.copyright_notice_target_id = target.id
          ORDER BY current_restriction.created_at DESC, current_restriction.id DESC
          LIMIT 1
        ) restriction ON true
        WHERE target.copyright_notice_id = notice.id) AS targets,
      (SELECT COALESCE(json_agg(json_build_object(
          'id', event.id, 'event_type', event.event_type, 'created_at', event.created_at
        ) ORDER BY event.created_at, event.id), '[]'::json)
        FROM copyright_notice_lifecycle_events event
        WHERE event.copyright_notice_id = notice.id
          AND event.event_type = ANY(${COPYRIGHT_CASE_TIMELINE_EVENT_TYPES}::text[])) AS timeline
    FROM copyright_notices notice
    LEFT JOIN view_users_public claimant ON claimant.id = notice.claimant_user_id
    WHERE notice.accepted_at IS NOT NULL
      AND (
        notice.claimant_user_id = ${userId}
        OR EXISTS (
          SELECT 1 FROM copyright_notice_targets poster_target
          JOIN media_placements placement ON poster_target.placement_id = placement.id
          JOIN image_placements poster_image ON poster_image.placement_id = placement.id
          JOIN posts post ON post.id = poster_image.post_id
          WHERE poster_target.copyright_notice_id = notice.id AND post.created_by_id = ${userId}
        )
      )
    ORDER BY notice.id
  `)
}
