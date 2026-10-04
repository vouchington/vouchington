import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestCopyrightSurfaceRetainedEvidence = {
  target_id: string
  placement_id: string
  placement_revision: number
  surface_activation_revision: number | null
  surface_owner_user_id: string | null
  activation_placement_id: string | null
  activation_revision: number | null
  bound_by_user_id: string | null
  uploaded_by_user_id: string | null
  bound_by_administrator: boolean | null
}

export async function readTestCopyrightSurfaceRetainedEvidence(
  targetId: string,
): Promise<TestCopyrightSurfaceRetainedEvidence | null> {
  const { rows } = await read<TestCopyrightSurfaceRetainedEvidence>(sql`
    /* readTestCopyrightSurfaceRetainedEvidence */
    SELECT target.id AS target_id, target.placement_id,
      target.placement_revision, target.surface_activation_revision,
      target.surface_owner_user_id, activation.placement_id AS activation_placement_id,
      activation.placement_revision AS activation_revision,
      activation.bound_by_user_id, activation.uploaded_by_user_id,
      activation.bound_by_administrator
    FROM copyright_notice_targets target
    LEFT JOIN image_surface_placement_activations activation
      ON activation.placement_id = target.placement_id
      AND activation.placement_revision = target.surface_activation_revision
    WHERE target.id = ${targetId}
  `)
  return rows[0] ?? null
}
