import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'
import { createLocalTestUser } from '../test-helpers/users.mts'

describe('membership lifecycle history immutability', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('fills a notification-first lineage account token once without changing lineage identity', async () => {
    const { rows } = await write<{ id: string }>(sql`/* createNotificationFirstLineage */
      INSERT INTO membership_provider_lineages (
        provider, environment, application_id, provider_lineage_id
      ) VALUES (
        'apple_app_store', 'test', ${`lineage-immutability-${randomUUID()}`},
        ${`transaction-${randomUUID()}`}
      ) RETURNING id`)
    const lineageId = rows[0]!.id

    await expect(
      write(sql`UPDATE membership_provider_lineages
        SET provider_account_id = 'account-token-one'
        WHERE id = ${lineageId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_provider_lineages
        SET provider_account_id = 'account-token-two'
        WHERE id = ${lineageId}`),
    ).rejects.toThrow('membership provider lineages are immutable')
    await expect(
      write(sql`UPDATE membership_provider_lineages
        SET provider_lineage_id = ${`rewritten-${randomUUID()}`}
        WHERE id = ${lineageId}`),
    ).rejects.toThrow('membership provider lineages are immutable')
  })

  it('freezes lineage binding facts and permits release followed by final purge', async () => {
    const user = await createLocalTestUser()
    const { rows } = await write<{ bound_at: Date; id: string }>(
      sql`/* createImmutableTestLineageBinding */
      WITH lineage AS (
        INSERT INTO membership_provider_lineages (
          provider, environment, application_id, provider_lineage_id
        ) VALUES (
          'stripe', 'test', 'binding-immutability', ${`lineage-${randomUUID()}`}
        )
        RETURNING id
      )
      INSERT INTO membership_lineage_bindings (membership_provider_lineage_id, user_id)
      SELECT id, ${user.id} FROM lineage
      RETURNING id, bound_at`,
    )
    const bindingId = rows[0]!.id

    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET bound_at = bound_at - INTERVAL '1 second'
        WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET user_id = ${randomUUID()}
        WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET membership_provider_lineage_id = ${randomUUID()}
        WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET source_kind = 'family'
        WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      write(sql`DELETE FROM membership_lineage_bindings WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings cannot be deleted')

    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET released_at = CURRENT_TIMESTAMP, release_reason = 'account_hard_deleted'
        WHERE id = ${bindingId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET release_reason = 'rewritten'
        WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(
      write(sql`UPDATE membership_lineage_bindings SET user_id = NULL WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
    await expect(write(sql`DELETE FROM users WHERE id = ${user.id}`)).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(
      read<{
        bound_at: Date
        release_reason: string
        released_at: Date
        user_id: string | null
      }>(
        sql`SELECT bound_at, released_at, release_reason, user_id
          FROM membership_lineage_bindings WHERE id = ${bindingId}`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          bound_at: rows[0]!.bound_at,
          release_reason: 'account_hard_deleted',
          released_at: expect.any(Date),
          user_id: null,
        },
      ],
    })
    await expect(
      write(sql`UPDATE membership_lineage_bindings
        SET released_at = released_at + INTERVAL '1 second'
        WHERE id = ${bindingId}`),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
  })

  it('freezes activation facts and permits one open-to-ended transition', async () => {
    const activationId = await createGrantActivationPeriod()

    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET started_at = started_at - INTERVAL '1 second'
        WHERE id = ${activationId}`),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET user_id = ${randomUUID()}
        WHERE id = ${activationId}`),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET membership_grant_id = ${randomUUID()}
        WHERE id = ${activationId}`),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(
      write(sql`DELETE FROM membership_grant_activation_periods WHERE id = ${activationId}`),
    ).rejects.toThrow('membership grant activation periods cannot be deleted')
    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET ended_at = started_at - INTERVAL '1 second'
        WHERE id = ${activationId}`),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET ended_at = started_at + INTERVAL '1 second'
        WHERE id = ${activationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET ended_at = NULL
        WHERE id = ${activationId}`),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
    await expect(
      write(sql`UPDATE membership_grant_activation_periods
        SET ended_at = ended_at + INTERVAL '1 second'
        WHERE id = ${activationId}`),
    ).rejects.toThrow(
      'membership grant activation periods only allow an open-to-ended lifecycle transition',
    )
  })
})

async function createGrantActivationPeriod(): Promise<string> {
  const { rows: productRows } = await read<{ id: string }>(
    `SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`,
  )
  const userId = randomUUID()
  const { rows } = await write<{ id: string }>(sql`/* createImmutableTestGrantActivation */
    WITH source AS (
      INSERT INTO membership_sources (user_id, source_kind)
      VALUES (${userId}, 'admin_grant')
      RETURNING id, user_id
    ), grant_row AS (
      INSERT INTO membership_grants (
        membership_source_id, user_id, membership_product_id,
        calendar_days, issuer_snapshot
      )
      SELECT id, user_id, ${productRows[0]!.id}, 30, 'Test issuer' FROM source
      RETURNING id, user_id
    )
    INSERT INTO membership_grant_activation_periods (
      membership_grant_id, user_id, started_at
    )
    SELECT id, user_id, CURRENT_TIMESTAMP FROM grant_row
    RETURNING id`)
  return rows[0]!.id
}
