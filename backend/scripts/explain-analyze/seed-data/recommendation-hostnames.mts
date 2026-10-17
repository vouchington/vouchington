import { write } from '@data-stores/psql'
import { seedUuid } from './common.mts'

export async function seedRecommendationHostnames(): Promise<void> {
  await write(
    `/* seedRecommendationHostnames */ INSERT INTO relation__topic__landing_page__url
      (subject_id, object_id, created_by_id)
      SELECT subject_id, object_id, $3
      FROM unnest($1::uuid[], $2::uuid[]) AS input(subject_id, object_id)
      ON CONFLICT DO NOTHING`,
    [
      [seedUuid(0, '04'), seedUuid(1, '04')],
      [seedUuid(0, '03'), seedUuid(1, '03')],
      seedUuid(0, '01'),
    ],
  )
}
