import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

describe('membership grant clock schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('rejects source lifecycle timestamps before their effective clock or in parallel states', async () => {
    const userId = randomUUID()
    const { rows: productRows } = await read<{ id: string }>(`/* getGrantClockTestProduct */
      SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
    const { rows: sourceRows } = await write<{ id: string }>(sql`
      /* createGrantClockTestSource */
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${userId}, 'admin_grant') RETURNING id`)
    const sourceId = sourceRows[0]!.id
    const productId = productRows[0]!.id

    await expect(
      write(sql`/* rejectPreEffectiveMembershipSourceExpiry */
        INSERT INTO membership_source_states (
          membership_source_id, source_kind, membership_product_id, effective_at, expires_at
        ) VALUES (
          ${sourceId}, 'admin_grant', ${productId},
          '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )`),
    ).rejects.toMatchObject({ code: '23514' })

    await write(sql`/* createGrantClockTestSourceState */
      INSERT INTO membership_source_states (
        membership_source_id, source_kind, membership_product_id, effective_at
      ) VALUES (${sourceId}, 'admin_grant', ${productId}, '2026-01-01T00:00:00.000Z')`)
    await expect(
      write(sql`/* rejectParallelMembershipSourceStates */
        UPDATE membership_source_states
        SET cancelled_at = '2026-01-02T00:00:00.000Z', paused_at = '2026-01-02T00:00:00.000Z'
        WHERE membership_source_id = ${sourceId}`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('subtracts persisted activation periods from a grant duration', async () => {
    const userId = randomUUID()
    const { rows: productRows } = await read<{ id: string }>(`/* getGrantDurationTestProduct */
      SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
    const { rows: sourceRows } = await write<{ id: string }>(sql`
      /* createGrantDurationTestSource */
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${userId}, 'admin_grant') RETURNING id`)
    const { rows: grantRows } = await write<{ id: string }>(sql`
      /* createGrantDurationTestGrant */
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id, calendar_days, issuer_snapshot
      ) VALUES (${sourceRows[0]!.id}, ${userId}, ${productRows[0]!.id}, 10, 'schema test')
      RETURNING id`)
    const grantId = grantRows[0]!.id
    await write(sql`/* createGrantDurationTestActivation */
      INSERT INTO membership_grant_activation_periods (
        membership_grant_id, user_id, started_at, ended_at
      ) VALUES (
        ${grantId}, ${userId}, '2026-01-01T00:00:00.000Z', '2026-01-04T00:00:00.000Z'
      )`)

    const { rows } = await read<{ remaining_seconds: string }>(sql`
      /* getGrantDurationTestRemainingSeconds */
      SELECT EXTRACT(EPOCH FROM membership_grant_remaining_duration(${grantId}))::bigint
        AS remaining_seconds`)

    expect(rows).toEqual([{ remaining_seconds: '604800' }])
  })
})
