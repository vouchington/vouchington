/* oxlint-disable max-lines */
import { randomUUID } from 'node:crypto'
import sql from 'sql-template-strings'
import { read, write } from '@data-stores/psql'

export type MembershipPurchaseIntentFixture = {
  applicationId: string
  mappingId: string
  productId: string
  requestFingerprint: string
  userId: string
}

type WriteResult = { rowCount: number | null }

export async function createPriceOptionalProviderProduct(suffix: string): Promise<WriteResult> {
  const productId = await getPlusMonthlyProductId()
  return write(sql`/* createPriceOptionalProviderProduct */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id
    ) VALUES (
      ${productId}, 'apple_app_store', 'test', ${`price-optional-${suffix}`}, ${`product-${suffix}`}
    )`)
}

export async function createPartialPriceProviderProduct(suffix: string): Promise<WriteResult> {
  const productId = await getPlusMonthlyProductId()
  return write(sql`/* rejectPartialProviderProductPrice */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units
    ) VALUES (
      ${productId}, 'google_play', 'test', ${`partial-price-${suffix}`}, ${`product-${suffix}`}, 100
    )`)
}

export async function createMembershipPurchaseIntentFixture(
  prefix: string,
  fixtureUserId?: string,
): Promise<MembershipPurchaseIntentFixture> {
  const suffix = randomUUID()
  const applicationId = `schema-${prefix}-${suffix}`
  const { rows: userRows } = await read<{ id: string }>(sql`/* getMembershipSchemaFixtureUser */
    SELECT id FROM users ORDER BY id LIMIT 1`)
  const productId = await getPlusMonthlyProductId()
  const { rows: mappingRows } = await write<{
    id: string
  }>(sql`/* createMembershipSchemaFixtureMapping */
    INSERT INTO membership_provider_products (
      membership_product_id, provider, environment, application_id, provider_product_id, price_minor_units, currency_code
    ) VALUES (${productId}, 'stripe', 'test', ${applicationId}, ${`price-${suffix}`}, 100, 'usd') RETURNING id`)
  return {
    applicationId,
    mappingId: mappingRows[0]!.id,
    productId,
    requestFingerprint: suffix.replaceAll('-', '').padEnd(64, 'a'),
    userId: fixtureUserId ?? userRows[0]!.id,
  }
}

export async function createMembershipPurchaseIntent(
  fixture: MembershipPurchaseIntentFixture,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipPurchaseIntent */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, provider_checkout_id, provider_checkout_url, launched_at
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, ${`checkout-${randomUUID()}`}, 'https://checkout.stripe.com/test', CURRENT_TIMESTAMP)
    RETURNING id`)
  return rows[0]!.id
}

export function createPartialPurchaseIntentCheckout(
  fixture: MembershipPurchaseIntentFixture,
): Promise<WriteResult> {
  return write(sql`/* rejectPartialMembershipPurchaseIntentCheckout */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, provider_checkout_id
    ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, ${`checkout-${randomUUID()}`})`)
}

export function createFailedPurchaseIntentWithoutCode(
  fixture: MembershipPurchaseIntentFixture,
): Promise<WriteResult> {
  return write(sql`/* rejectMembershipPurchaseIntentFailedWithoutCode */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, failed_at
    ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, CURRENT_TIMESTAMP)`)
}

export function createExpiredPurchaseIntent(
  fixture: MembershipPurchaseIntentFixture,
): Promise<WriteResult> {
  return write(sql`/* rejectExpiredMembershipPurchaseIntentWindow */
    INSERT INTO membership_purchase_intents (
      user_id, idempotency_key, request_fingerprint, membership_provider_product_id, membership_product_id,
      provider, environment, application_id, expires_at
    ) VALUES (${fixture.userId}, ${randomUUID()}, ${fixture.requestFingerprint}, ${fixture.mappingId}, ${fixture.productId},
      'stripe', 'test', ${fixture.applicationId}, '2000-01-01T00:00:00.000Z')`)
}

export async function createMembershipProviderEvidence(
  fixture: MembershipPurchaseIntentFixture,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipVerificationEvidence */
    INSERT INTO membership_provider_evidence_records (
      provider, environment, application_id, evidence_lookup_sha256, encrypted_evidence
    ) VALUES ('stripe', 'test', ${fixture.applicationId},
      ${randomUUID().replaceAll('-', '').padEnd(64, 'b')}, '\x01'::bytea) RETURNING id`)
  return rows[0]!.id
}

export async function createMembershipVerification(
  fixture: MembershipPurchaseIntentFixture,
  intentId: string,
  evidenceId: string,
  idempotencyKey: string,
): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`/* createMembershipVerification */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_id, provider, environment, application_id
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${intentId}, ${evidenceId},
      'stripe', 'test', ${fixture.applicationId}) RETURNING id`)
  return rows[0]!.id
}

export function createDuplicateMembershipVerification(
  fixture: MembershipPurchaseIntentFixture,
  evidenceId: string,
  idempotencyKey: string,
): Promise<WriteResult> {
  return write(sql`/* rejectDuplicateMembershipVerificationIdempotencyKey */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_provider_evidence_id,
      provider, environment, application_id
    ) VALUES (${fixture.userId}, ${idempotencyKey}, ${fixture.requestFingerprint}, ${evidenceId},
      'stripe', 'test', ${fixture.applicationId})`)
}

export function completeMembershipVerificationWithoutResult(
  verificationId: string,
): Promise<WriteResult> {
  return write(sql`/* rejectMembershipVerificationTerminalWithoutResultCode */
    UPDATE membership_verifications SET verified_at = CURRENT_TIMESTAMP, next_processing_at = NULL WHERE id = ${verificationId}`)
}

export function completeMembershipVerification(verificationId: string): Promise<WriteResult> {
  return write(sql`/* completeMembershipVerification */
    UPDATE membership_verifications
    SET verified_at = CURRENT_TIMESTAMP, result_code = 'verified', next_processing_at = NULL
    WHERE id = ${verificationId}`)
}

export function setUnstableMembershipVerificationResult(
  verificationId: string,
): Promise<WriteResult> {
  return write(sql`/* rejectUnstableMembershipVerificationResultCode */
    UPDATE membership_verifications SET result_code = 'temporary_provider_wording' WHERE id = ${verificationId}`)
}

export function claimCompletedMembershipVerification(verificationId: string): Promise<WriteResult> {
  return write(sql`/* rejectCompletedMembershipVerificationClaim */
    UPDATE membership_verifications
    SET processing_claim_token = ${randomUUID()}, processing_claimed_at = CURRENT_TIMESTAMP
    WHERE id = ${verificationId}`)
}

export function createCrossOwnerMembershipVerification(
  fixture: MembershipPurchaseIntentFixture,
  intentId: string,
  evidenceId: string,
): Promise<WriteResult> {
  return write(sql`/* rejectMembershipVerificationCrossOwnerIntent */
    INSERT INTO membership_verifications (
      user_id, idempotency_key, request_fingerprint, membership_purchase_intent_id,
      membership_provider_evidence_id, provider, environment, application_id
    ) VALUES (
      (SELECT id FROM users WHERE id <> ${fixture.userId} ORDER BY id LIMIT 1), ${randomUUID()},
      ${fixture.requestFingerprint}, ${intentId}, ${evidenceId}, 'stripe', 'test', ${fixture.applicationId})`)
}

export async function createMembershipAuditUser(): Promise<string> {
  const { rows } = await write<{ id: string }>(sql`INSERT INTO users DEFAULT VALUES RETURNING id`)
  return rows[0]!.id
}

export function deleteMembershipAuditUser(userId: string): Promise<WriteResult> {
  return write(sql`DELETE FROM users WHERE id = ${userId}`)
}

export async function getMembershipAuditOwnership(
  intentId: string,
  verificationId: string,
): Promise<
  | {
      intent_user_id: string | null
      verification_user_id: string | null
    }
  | undefined
> {
  const { rows } = await read<{
    intent_user_id: string | null
    verification_user_id: string | null
  }>(sql`
    SELECT intent.user_id AS intent_user_id, verification.user_id AS verification_user_id
    FROM membership_purchase_intents intent
    INNER JOIN membership_verifications verification ON verification.id = ${verificationId}
    WHERE intent.id = ${intentId}`)
  return rows[0]
}

async function getPlusMonthlyProductId(): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* getMembershipSchemaFixtureProduct */
    SELECT id FROM membership_products WHERE plan = 'plus' AND billing_interval = 'monthly'`)
  return rows[0]!.id
}
