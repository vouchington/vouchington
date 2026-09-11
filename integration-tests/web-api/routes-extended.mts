/**
 * Shared helpers for routes-extended-tests/*.test.mts.
 * Server creation and fetch patching are handled inline in each test file's
 * beforeAll because they rely on module-level state. This module exports
 * types used by those tests.
 */

/** Cookie header shape used for authenticated test requests. */
export type CookieHeader = Record<string, string>
