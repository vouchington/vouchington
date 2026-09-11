import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

describe('membership purchase intent and verification schema constraints', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('allows provider mappings without a price but rejects partial money values', async () => {
    const suffix = randomUUID()
    const { rows: productRows } = await read<{ id: string }>(sql`/* getPriceOptionalProduct */
      SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
    const productId = productRows[0]!.id
    await expect(
      write(sql`/* createPriceOptionalProviderProduct */
        INSERT INTO membership_provider_products (
          membership_product_id, provider, environment, application_id, provider_product_id
        ) VALUES (
          ${productId}, 'apple_app_store', 'test', ${`price-optional-${suffix}`},
          ${`product-${suffix}`}
        )`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`/* rejectPartialProviderProductPrice */
        INSERT INTO membership_provider_products (
          membership_product_id, provider, environment, application_id, provider_product_id,
          price_minor_units
        ) VALUES (
          ${productId}, 'google_play', 'test', ${`partial-price-${suffix}`},
          ${`product-${suffix}`}, 100
        )`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('enforces owner-scoped idempotency and launch lifecycle constraints', async () => {
    const fixture = await createFixture('intent')
    const idempotencyKey = randomUUID()
    await expect(createPurchaseIntent(fixture, idempotencyKey)).resolves.toEqual(expect.any(String))
    await expect(createPurchaseIntent(fixture, idempotencyKey)).rejects.toMatchObject({
      code: '23505',
    })
    await expect(
      write(sql`/* rejectPartialMembershipPurchaseIntentCheckout */
        INSERT INTO membership_purchase_intents (
          user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
          membership_product_id, provider, environment, application_id, provider_checkout_id
        ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint},
          ${fixture.mappingId}, ${fixture.productId}, 'stripe', 'test', ${fixture.applicationId},
          ${`checkout-${randomUUID()}`})`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`/* rejectMembershipPurchaseIntentFailedWithoutCode */
        INSERT INTO membership_purchase_intents (
          user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
          membership_product_id, provider, environment, application_id, failed_at
        ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint},
          ${fixture.mappingId}, ${fixture.productId}, 'stripe', 'test', ${fixture.applicationId}, CURRENT_TIMESTAMP)`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`/* rejectExpiredMembershipPurchaseIntentWindow */
        INSERT INTO membership_purchase_intents (
          user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
          membership_product_id, provider, environment, application_id, expires_at
        ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint},
          ${fixture.mappingId}, ${fixture.productId}, 'stripe', 'test', ${fixture.applicationId},
          '2000-01-01T00:00:00.000Z')`),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('enforces verification ownership, provider context, and timestamp-derived results', async () => {
    const fixture = await createFixture('verification')
    const intentId = await createPurchaseIntent(fixture, randomUUID())
    const evidenceId = await createEvidence(fixture)
    const idempotencyKey = randomUUID()
    const { rows } = await write<{ id: string }>(sql`/* createMembershipVerification */
      INSERT INTO membership_verifications (
        user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
        membership_provider_evidence_id, provider, environment, application_id
      ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${intentId},
        ${evidenceId}, 'stripe', 'test', ${fixture.applicationId}) RETURNING id`)
    const verificationId = rows[0]!.id

    await expect(
      write(sql`/* rejectDuplicateMembershipVerificationIdempotencyKey */
        INSERT INTO membership_verifications (
          user_id, idempotency_key, request_fingerprint, membership_provider_evidence_id,
          provider, environment, application_id
        ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${evidenceId},
          'stripe', 'test', ${fixture.applicationId})`),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      write(sql`/* rejectMembershipVerificationTerminalWithoutResultCode */
        UPDATE membership_verifications SET verified_at = CURRENT_TIMESTAMP, next_processing_at = NULL
        WHERE id = ${verificationId}`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`/* completeMembershipVerification */
        UPDATE membership_verifications
        SET verified_at = CURRENT_TIMESTAMP, result_code = 'verified', next_processing_at = NULL
        WHERE id = ${verificationId}`),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      write(sql`/* rejectUnstableMembershipVerificationResultCode */
        UPDATE membership_verifications SET result_code = 'temporary_provider_wording'
        WHERE id = ${verificationId}`),
    ).rejects.toMatchObject({ code: '22P02' })
    await expect(
      write(sql`/* rejectCompletedMembershipVerificationClaim */
        UPDATE membership_verifications
        SET processing_claim_token = ${randomUUID()}, processing_claimed_at = CURRENT_TIMESTAMP
        WHERE id = ${verificationId}`),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      write(sql`/* rejectMembershipVerificationCrossOwnerIntent */
        INSERT INTO membership_verifications (
          user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
          membership_provider_evidence_id, provider, environment, application_id
        ) VALUES (
          (SELECT id FROM users WHERE id <> ${fixture.userId} ORDER BY id LIMIT 1), ${randomUUID()},
          ${fixture.requestFingerprint}, ${intentId}, ${evidenceId}, 'stripe', 'test', ${fixture.applicationId})`),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('retains purchase and verification audit rows after an account is hard-deleted', async () => {
    const { rows: userRows } = await write<{ id: string }>(sql`
      INSERT INTO users DEFAULT VALUES RETURNING id`)
    const userId = userRows[0]!.id
    const fixture = await createFixture('hard-delete', userId)
    const intentId = await createPurchaseIntent(fixture, randomUUID())
    const evidenceId = await createEvidence(fixture)
    const { rows: verificationRows } = await write<{ id: string }>(sql`
      INSERT INTO membership_verifications (
        user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
        membership_provider_evidence_id, provider, environment, application_id
      ) VALUES (${userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${intentId},
        ${evidenceId}, 'stripe', 'test', ${fixture.applicationId}) RETURNING id`)

    await expect(write(sql`DELETE FROM users WHERE id = ${userId}`)).resolves.toMatchObject({
      rowCount: 1,
    })
    const { rows } = await read<{
      intent_user_id: string | null
      verification_user_id: string | null
    }>(sql`
      SELECT intent.user_id AS intent_user_id, verification.user_id AS verification_user_id
      FROM membership_purchase_intents intent
      INNER JOIN membership_verifications verification
        ON verification.id = ${verificationRows[0]!.id}
      WHERE intent.id = ${intentId}`)
    expect(rows[0]).toEqual({ intent_user_id: null, verification_user_id: null })
  })
})

type MembershipFixture = {
  applicationId: string
  mappingId: string
  productId: string
  requestFingerprint: string
  userId: string
}

async function createFixture(prefix: string, fixtureUserId?: string): Promise<MembershipFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-${prefix}-${suffix}`
  const { rows: userRows } = await read<{ id: string }>(sql`/* getMembershipSchemaFixtureUser */
    SELECT id FROM users ORDER BY id LIMIT 1`)
  const { rows: productRows } = await read<{
    id: string
  }>(sql`/* getMembershipSchemaFixtureProduct */
    SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
  const { rows: mappingRows } = await write<{
    id: string
  }>(sql`/* createMembershipSchemaFixtureMapping */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id,
      provider_product_id, price_minor_units, currency_code
    ) VALUES (${productRows[0]!.id}, 'stripe', 'test', ${applicationId},
      ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
  return {
    applicationId,
    mappingId: mappingRows[0]!.id,
    productId: productRows[0]!.id,
    requestFingerprint: suffix.replaceAll('-', '').padEnd(64, 'a'),
    userId: fixtureUserId ?? userRows[0]!.id,
  }
}

async function createPurchaseIntent(
  fixture: MembershipFixture,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipPurchaseIntent */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id,
      membership_product_id, provider, environment, application_id, provider_checkout_id,
      provider_checkout_url, launched_at
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint},
      ${fixture.mappingId}, ${fixture.productId}, 'stripe', 'test', ${fixture.applicationId},
      ${`checkout-${randomUUID()}`}, 'https://checkout.stripe.com/test', CURRENT_TIMESTAMP)
    RETURNING id`)
  return rows[0]!.id
}

async function createEvidence(fixture: MembershipFixture): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipVerificationEvidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES ('stripe', 'test', ${fixture.applicationId},
      ${randomUUID().replaceAll('-', '').padEnd(64, 'b')}, '\x01'::bytea) RETURNING id`)
  return rows[0]!.id
}
