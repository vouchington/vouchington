import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getImagePlacementsForCopyright } from '@services/images/placements'
import { groupByNotice } from './read-models-staff-group.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

const MATCHES_PER_CASE = 25

/** Unreviewed uploads that matched an image each case confirmed as infringing, oldest first. */
export async function selectStaffStaydownMatches(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  const { rows } = await query<
    Omit<CopyrightStaffCase['staydown_matches'][number], 'image_placement'> & {
      copyright_notice_id: string
      candidate_placement_id: string | null
    }
  >(sql`
    /* getPendingCopyrightStaffCase:staydownMatches */
    SELECT requested.notice_id AS copyright_notice_id, match.id, match.image_id,
      match.registered_image_id, match.uploaded_by_id, match.match_kind,
      match.hamming_distance, match.matched_at, uploader.username AS uploaded_by_username,
      COALESCE(post_candidate.placement_id, surface_candidate.placement_id) AS candidate_placement_id
    FROM unnest(${noticeIds}::uuid[]) AS requested(notice_id)
    CROSS JOIN LATERAL (
      SELECT staydown_match.id, staydown_match.image_id,
        entry.image_id AS registered_image_id,
        staydown_match.uploaded_by_id, staydown_match.match_kind,
        staydown_match.hamming_distance, staydown_match.created_at AS matched_at
      FROM copyright_staydown_matches staydown_match
      JOIN copyright_staydown_entries entry ON entry.id = staydown_match.copyright_staydown_entry_id
      JOIN copyright_restrictions restriction ON restriction.id = entry.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = requested.notice_id
        AND staydown_match.reviewed_at IS NULL
      ORDER BY staydown_match.id
      LIMIT ${MATCHES_PER_CASE + 1}
    ) AS match
    LEFT JOIN images uploaded_image ON uploaded_image.id = match.image_id
    LEFT JOIN users uploader ON uploader.id = match.uploaded_by_id AND uploader.deleted_at IS NULL
    -- Probe each image-indexed locator once before checking the chosen placement's policy.
    -- A denied candidate gives no preview rather than scanning every placement of reused bytes.
    LEFT JOIN LATERAL (
      SELECT binding.placement_id FROM image_placements binding
      WHERE binding.image_id = match.image_id
      LIMIT 1
    ) post_candidate ON uploaded_image.upload_completed_at IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT surface.placement_id FROM image_surface_placements surface
      WHERE surface.image_id = match.image_id
      LIMIT 1
    ) surface_candidate ON uploaded_image.upload_completed_at IS NOT NULL
  `)
  const placements = await getImagePlacementsForCopyright(
    [
      ...new Set(
        rows.flatMap(row => (row.candidate_placement_id ? [row.candidate_placement_id] : [])),
      ),
    ],
    { query },
  )
  const grouped = groupByNotice(
    rows.map(({ candidate_placement_id, ...match }) => {
      const placement = candidate_placement_id ? placements.get(candidate_placement_id) : null
      return {
        ...match,
        image_placement:
          placement &&
          placement.imageId === match.image_id &&
          !placement.deleted &&
          !placement.withheld &&
          !placement.safetyBlocked
            ? { placement_id: placement.placementId, placement_revision: placement.revision }
            : null,
      }
    }),
  )
  return new Map(
    [...grouped].map(([noticeId, matches]) => [
      noticeId,
      { matches: matches.slice(0, MATCHES_PER_CASE), hasMore: matches.length > MATCHES_PER_CASE },
    ]),
  )
}
