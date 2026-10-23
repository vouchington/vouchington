export const DBSC_REGISTRATION_PATH = '/api/v1/auth/device-bound-sessions'
export const DBSC_REFRESH_PATH = '/api/v1/auth/device-bound-sessions/refreshes'

/** Chrome owns these background requests; their routes still require device and key proofs. */
export function isDbscCeremonyRequest(method: string | undefined, path: string): boolean {
  return method === 'POST' && (path === DBSC_REGISTRATION_PATH || path === DBSC_REFRESH_PATH)
}
