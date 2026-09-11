import { write } from '../../backend/data-stores/psql/clients.mts'
import { insertTestTopic } from './insert-test-topic.mts'

interface TestReferralProgram {
  referralProgramTopicId: string
  referralProgramTopicSlug: string
  validationId: string
  validationSlug: string
  validationId2: string
  validationSlug2: string
  ruleId: string
  hostname: string
  pathname: string
  hostnameId: string
  urlId: string
  url: string
  urlPath: string
}

/**
 * Insert an enabled referral program with a single matching rule, plus a
 * `urls` row whose hostname/pathname satisfies the rule. Used by Playwright
 * specs that exercise the referral-link rejection path in
 * `upsertEntityRelation` (and the related-URL tag UI).
 *
 * Idempotent against a dirty database: callers must pass a unique `suffix`.
 */
export async function insertTestReferralProgram(suffix: string): Promise<TestReferralProgram> {
  const hostname = `pw-ref-${suffix}.example.com`
  const pathname = '/ref/%'
  const urlPath = `/ref/pw-${suffix}`
  const url = `https://${hostname}${urlPath}`

  const topicSlug = `playwright-referral-program-${suffix}`
  const topic = await insertTestTopic(
    `Playwright Referral Program ${suffix}`,
    topicSlug,
    'referral_program',
  )

  await write(
    `INSERT INTO topics__referral_programs (topic_id, enabled_at)
     VALUES ($1, CURRENT_TIMESTAMP)
     ON CONFLICT (topic_id) DO UPDATE
     SET enabled_at = CURRENT_TIMESTAMP, disabled_at = NULL`,
    [topic.id],
  )

  const validationSlug = `pw_validation_${suffix.replaceAll('-', '_')}`
  const validationResult = await write(
    `INSERT INTO referral_program_link_validations (slug, user_help_text)
     VALUES ($1, $2)
     RETURNING id`,
    [validationSlug, 'playwright referral validation'],
  )
  const validationId = validationResult.rows[0].id as string

  const ruleResult = await write(
    `INSERT INTO referral_program_link_validations_rules (
       referral_program_link_validation_id, hostname, pathname, is_referral_link_url
     ) VALUES ($1, $2, $3, TRUE)
     RETURNING id`,
    [validationId, hostname, pathname],
  )
  const ruleId = ruleResult.rows[0].id as string

  await write(
    `INSERT INTO topics__referral_program_link_validations (
       referral_program_id, referral_program_link_validation_id
     ) VALUES ($1, $2)
     ON CONFLICT (referral_program_id, referral_program_link_validation_id) DO NOTHING`,
    [topic.id, validationId],
  )

  // Second validation set — NOT linked to the referral program (used for link/unlink flow tests)
  const validationSlug2 = `pw_validation2_${suffix.replaceAll('-', '_')}`
  const validationResult2 = await write(
    `INSERT INTO referral_program_link_validations (slug, user_help_text)
     VALUES ($1, $2)
     RETURNING id`,
    [validationSlug2, 'playwright referral validation 2'],
  )
  const validationId2 = validationResult2.rows[0].id as string

  const hostnameResult = await write(
    `INSERT INTO url_hostnames (hostname)
     VALUES ($1)
     ON CONFLICT (hostname) DO UPDATE SET hostname = EXCLUDED.hostname
     RETURNING id`,
    [hostname],
  )
  const hostnameId = hostnameResult.rows[0].id as string

  const urlResult = await write(
    `INSERT INTO urls (url, hostname_id, pathname, search_params)
     VALUES ($1, $2, $3, '{}'::JSONB)
     ON CONFLICT (url) DO UPDATE SET hostname_id = EXCLUDED.hostname_id
     RETURNING id`,
    [url, hostnameId, urlPath],
  )
  const urlId = urlResult.rows[0].id as string

  return {
    referralProgramTopicId: topic.id,
    referralProgramTopicSlug: topicSlug,
    validationId,
    validationSlug,
    validationId2,
    validationSlug2,
    ruleId,
    hostname,
    pathname,
    hostnameId,
    urlId,
    url,
    urlPath,
  }
}

/**
 * Insert an enabled referral program topic with NO linked validations.
 * Used to test the empty-state UI on the settings/validations page.
 *
 * Idempotent against a dirty database: callers must pass a unique `suffix`.
 */
export async function insertTestEmptyReferralProgram(suffix: string): Promise<{ topicId: string }> {
  const topic = await insertTestTopic(
    `Playwright Referral Program Empty ${suffix}`,
    `playwright-referral-program-empty-${suffix}`,
    'referral_program',
  )
  await write(
    `INSERT INTO topics__referral_programs (topic_id, enabled_at)
     VALUES ($1, CURRENT_TIMESTAMP)
     ON CONFLICT (topic_id) DO UPDATE
     SET enabled_at = CURRENT_TIMESTAMP, disabled_at = NULL`,
    [topic.id],
  )
  return { topicId: topic.id }
}
