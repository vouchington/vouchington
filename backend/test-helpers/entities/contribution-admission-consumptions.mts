import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getContributionAdmissionConsumptionModeForTest(input: {
  actorId: string
  idempotencyKey: string
}): Promise<string | null> {
  const { rows } = await write<{
    consumption_mode: string
  }>(sql`/* getContributionAdmissionConsumptionModeForTest */
    SELECT c.consumption_mode
    FROM post_admission_quota_consumptions c
    INNER JOIN post_admission_reservations r ON r.id = c.reservation_id
    WHERE r.actor_id = ${input.actorId} AND r.idempotency_key = ${input.idempotencyKey}`)
  return rows[0]?.consumption_mode ?? null
}

export async function insertLegacyContributionAdmissionConsumptionForTest(input: {
  actorId: string
  source: string
}): Promise<void> {
  await write(sql`/* insertLegacyContributionAdmissionConsumptionForTest */
    INSERT INTO post_admission_quota_consumptions (reservation_id, actor_id, source)
    VALUES (${crypto.randomUUID()}, ${input.actorId}, ${input.source})`)
}
