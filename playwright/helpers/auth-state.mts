import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Path to the saved authenticated storageState for the shared seeded test user.
 *
 * Written once per run by `playwright/setup/auth.setup.mts` (the 'setup' project)
 * via the real /login UI, then consumed by any spec that adds:
 *
 *   test.use({ storageState: AUTH_STATE })
 *
 * Use this for the ~134 specs that use loginAsTestUser / loginAsAdmin (the single
 * shared seeded user `019f0000-…-000`). Keep calling `loginAsUser(page, freshId)`
 * directly for specs that create fresh users at runtime.
 */
export const AUTH_STATE = join(__dirname, '../.auth/test-user.json')
