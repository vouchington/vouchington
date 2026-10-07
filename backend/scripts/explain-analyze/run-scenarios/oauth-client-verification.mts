import { read } from '@data-stores/psql'
import { listOAuthClientsForVerification } from '@services/oauth-authorization-server'
import {
  OAUTH_CLIENT_VERIFICATION_TOTAL_SEED_COUNT,
  OAUTH_CLIENT_VERIFICATION_UNVERIFIED_SEED_COUNT,
  OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_COUNT,
  OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_STRIDE,
  oauthClientVerificationSeedId,
} from '../seed-data/oauth-client-verification.mts'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'

const OAUTH_CLIENT_VERIFICATION_PAGE_LIMIT = 50
const OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_REMAINING_VERIFIED_COUNT =
  OAUTH_CLIENT_VERIFICATION_PAGE_LIMIT * 2 + 2
const OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_INDEX =
  OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_STRIDE *
  OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_REMAINING_VERIFIED_COUNT

export async function runOAuthClientVerificationScenarios(): Promise<void> {
  await assertOAuthClientVerificationSeed()
  registerScenarioContract('oauth-client-verification-verified-page', {
    expectations: [{ kind: 'custom', name: 'paginationSpecial' }],
  })
  await runAndCapture('oauth-client-verification-verified-page', async () => {
    const page = await listOAuthClientsForVerification({
      verification: 'verified',
      limit: OAUTH_CLIENT_VERIFICATION_PAGE_LIMIT,
      afterId: oauthClientVerificationSeedId(OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_INDEX),
    })
    if (page.results.length !== OAUTH_CLIENT_VERIFICATION_PAGE_LIMIT || !page.hasNextPage) {
      throw new Error(
        'Expected a full verified OAuth client page with lookahead after the late cursor',
      )
    }
  })
}

async function assertOAuthClientVerificationSeed(): Promise<void> {
  const { rows } = await read<{
    verified_count: string
    unverified_count: string
    late_cursor_verified_count: string
  }>(
    `/* assertOAuthClientVerificationSeed */ SELECT
       COUNT(*) FILTER (WHERE verified_at IS NOT NULL)::text AS verified_count,
       COUNT(*) FILTER (WHERE verified_at IS NULL)::text AS unverified_count,
       COUNT(*) FILTER (WHERE verified_at IS NOT NULL AND id < $3::uuid)::text
         AS late_cursor_verified_count
     FROM oauth_clients
     WHERE id BETWEEN $1::uuid AND $2::uuid`,
    [
      oauthClientVerificationSeedId(0),
      oauthClientVerificationSeedId(OAUTH_CLIENT_VERIFICATION_TOTAL_SEED_COUNT - 1),
      oauthClientVerificationSeedId(OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_INDEX),
    ],
  )
  if (
    rows[0]?.verified_count !== String(OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_COUNT) ||
    rows[0]?.unverified_count !== String(OAUTH_CLIENT_VERIFICATION_UNVERIFIED_SEED_COUNT) ||
    rows[0]?.late_cursor_verified_count !==
      String(OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_REMAINING_VERIFIED_COUNT)
  ) {
    throw new Error(
      `Expected ${OAUTH_CLIENT_VERIFICATION_VERIFIED_SEED_COUNT} verified, ${OAUTH_CLIENT_VERIFICATION_UNVERIFIED_SEED_COUNT} unverified, and ${OAUTH_CLIENT_VERIFICATION_LATE_CURSOR_REMAINING_VERIFIED_COUNT} verified rows after the OAuth client cursor`,
    )
  }
}
