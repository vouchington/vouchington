import type { Env } from './types.mts'

let cfWorkerSecretEmptyLogged = false
let cfWorkerSecretTooShortLogged = false

export function warnIfWorkerSecretMisconfigured(env: Env): void {
  if (!env.CF_WORKER_SECRET && !cfWorkerSecretEmptyLogged) {
    console.error(
      'CF_WORKER_SECRET is not set or empty — backend requests will be rejected with 403 if the backend has the secret configured',
    )
    cfWorkerSecretEmptyLogged = true
    return
  }

  if (env.CF_WORKER_SECRET && env.CF_WORKER_SECRET.length < 32 && !cfWorkerSecretTooShortLogged) {
    console.error(
      'CF_WORKER_SECRET is too short (minimum 32 characters) — backend will reject requests if it enforces the length check; generate with: openssl rand -hex 32',
    )
    cfWorkerSecretTooShortLogged = true
  }
}
