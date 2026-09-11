/**
 * Shared helpers for crm.test.mts.
 * Server creation and cookie patching are handled inline in the test file's
 * beforeAll. This module exports types used by those tests.
 */

/** Filter options for CRM contact list queries. */
export type CrmContactSearchParams = {
  q?: string
  status?: string
  vertical?: string
  after?: string
  limit?: number
}
