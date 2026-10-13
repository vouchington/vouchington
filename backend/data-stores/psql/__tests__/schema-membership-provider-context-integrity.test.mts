import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown, write } from '../index.mts'
import sql from 'sql-template-strings'
import {
  createTestMembershipProviderContext,
  deleteTestMembershipProviderContext,
  rejectTestGoogleRowsOnStripeContext,
  rejectTestMicrosoftCredentialOnStripeContext,
  updateTestMembershipProviderContext,
} from '../../../test-helpers/entities/membership-provider-context-integrity.mts'
import { createTestUser } from '@voucha/test-helpers'

describe('membership provider context integrity', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('keeps a referenced provider identity immutable', async () => {
    const contextId = await createTestMembershipProviderContext()
    await expect(updateTestMembershipProviderContext(contextId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(deleteTestMembershipProviderContext(contextId)).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects Google tokens and acknowledgments on a Stripe context', async () => {
    const contextId = await createTestMembershipProviderContext()
    const invalidWrites = await rejectTestGoogleRowsOnStripeContext(contextId)
    await expect(invalidWrites.token()).rejects.toMatchObject({ code: '23514' })
    await expect(invalidWrites.acknowledgment()).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects Microsoft Store credentials on a Stripe context', async () => {
    const [contextId, user] = await Promise.all([
      createTestMembershipProviderContext(),
      createTestUser(),
    ])
    await expect(
      rejectTestMicrosoftCredentialOnStripeContext(contextId, user.id),
    ).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects Stripe customer deletion work for a Google Play lineage', async () => {
    const { rows } = await write<{ request_id: string; lineage_id: string }>(sql`
      /* createNonStripeDeletionWorkFixture */
      WITH owner AS (INSERT INTO users DEFAULT VALUES RETURNING id),
      deletion_request AS (
        INSERT INTO user_deletion_requests (user_id)
        SELECT id FROM owner RETURNING id
      ), lineage AS (
        INSERT INTO membership_provider_lineages (
          membership_provider_context_id, provider_lineage_id
        ) VALUES (
          fn_upsert_membership_provider_context_id('google_play', 'test', ${`play-${randomUUID()}`}),
          ${`lineage-${randomUUID()}`}
        ) RETURNING id
      )
      SELECT deletion_request.id AS request_id, lineage.id AS lineage_id
      FROM deletion_request CROSS JOIN lineage`)
    const { request_id: requestId, lineage_id: lineageId } = rows[0]!

    await expect(
      write(sql`/* rejectNonStripeDeletionWork */
        INSERT INTO user_deletion_external_works (
          request_id, work_kind, membership_provider_lineage_id
        ) VALUES (${requestId}, 'stripe-customer', ${lineageId})`),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
