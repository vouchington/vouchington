import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { validateUUID } from '@modules/utils'
import type { UserReferralLink } from './types.mts'

const MAX_ERROR_LENGTH = 1000

/**
 * Unfurl-intent state mutations on `user_referral_program_links`, kept here rather than in
 * `@services/referral-link-unfurl` because writes to this table stay within its owning
 * service (see services/CLAUDE.md § Scoped invariants). Called from
 * `requestReferralLinkUnfurl` (request side) and `runReferralLinkUnfurl` (processor side).
 */

/** Persists unfurl intent before enqueue, so the dispatcher can self-heal a lost enqueue. */
export async function markReferralLinkUnfurlRequested(
  linkId: string,
  options?: QueryOptions,
): Promise<UserReferralLink | null> {
  validateUUID(linkId)

  const { rows } = await write(
    sql`/* markReferralLinkUnfurlRequested */
      UPDATE user_referral_program_links
      SET unfurl_requested_at = CURRENT_TIMESTAMP,
          unfurl_completed_at = NULL,
          unfurl_failed_at = NULL,
          unfurl_last_error = NULL
      WHERE id = ${linkId}
        AND deleted_at IS NULL
      RETURNING
        id,
        user_id,
        referral_program_id,
        url_id,
        label,
        activated_at,
        deactivated_at,
        created_at,
        updated_at,
        deleted_at,
        consecutive_crawl_failures,
        last_crawl_failure_at,
        last_crawl_success_at,
        last_crawl_id,
        parent_link_id,
        unfurl_requested_at,
        unfurl_completed_at,
        unfurl_failed_at,
        unfurl_last_error
    `,
    options,
  )

  return rows[0] ?? null
}

export async function markReferralLinkUnfurlCompleted(
  linkId: string,
  options?: QueryOptions,
): Promise<void> {
  validateUUID(linkId)

  await write(
    sql`/* markReferralLinkUnfurlCompleted */
      UPDATE user_referral_program_links
      SET unfurl_completed_at = CURRENT_TIMESTAMP,
          unfurl_failed_at = NULL,
          unfurl_last_error = NULL
      WHERE id = ${linkId}
        AND deleted_at IS NULL
    `,
    options,
  )
}

export async function markReferralLinkUnfurlFailed(
  linkId: string,
  errorMessage: string,
  options?: QueryOptions,
): Promise<void> {
  validateUUID(linkId)
  const truncated =
    errorMessage.length > MAX_ERROR_LENGTH ? errorMessage.slice(0, MAX_ERROR_LENGTH) : errorMessage

  await write(
    sql`/* markReferralLinkUnfurlFailed */
      UPDATE user_referral_program_links
      SET unfurl_failed_at = CURRENT_TIMESTAMP,
          unfurl_last_error = ${truncated}
      WHERE id = ${linkId}
        AND deleted_at IS NULL
    `,
    options,
  )
}
