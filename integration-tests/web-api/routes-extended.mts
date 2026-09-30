/**
 * Shared types for routes-extended web API tests.
 * Suites that share this fixture call installRoutesExtendedHarness. Other suites
 * still start the in-process server in their own beforeAll.
 */

/** Cookie header shape used for authenticated test requests. */
export type CookieHeader = Record<string, string>
