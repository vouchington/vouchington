export const API_TEST_SERVER_STATE_KEY = '__vouchaApiTestServerState'

/** True once this process has imported the shared API test server and bound its listener. */
export function isApiTestServerStarted(): boolean {
  return (globalThis as Record<string, unknown>)[API_TEST_SERVER_STATE_KEY] !== undefined
}
