import { isApiTestServerStarted } from '../../backend/test-helpers/api/server-global.mts'

/**
 * Playwright loads every spec in the runner before reporters begin. A spec that reaches
 * backend/test-helpers/api/server.mts leaves a [::1] listener on a random port in this process,
 * which can shadow the IPv4-only worker port from Chromium (#5846).
 */
export default class ApiTestServerGuardReporter {
  onBegin(): void {
    if (isApiTestServerStarted()) {
      throw new Error(
        'A Playwright spec imports backend/test-helpers/api/server.mts, which binds a [::1] listener in the runner. Import service-level helpers instead.',
      )
    }
  }
}
