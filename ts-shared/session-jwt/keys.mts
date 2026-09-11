import * as jose from 'jose'
import { ContentAndIdentityCache } from './key-set-identity-cache.mts'
import testPrivateKey from './test-jwt-private-key.mts'
import {
  SESSION_JWT_PRIVATE_KEYS_ENV,
  SESSION_JWT_PUBLIC_KEYS_ENV,
  type JwtRuntimeMode,
  type SessionJwtEnvironment,
  type JwtRuntimeOptions,
} from './types.mts'
export const SESSION_JWT_ALGORITHM = 'RS512'
export type ManagedJwk = jose.JWK & { alg: typeof SESSION_JWT_ALGORITHM; kid: string }
type ImportedKey = {
  cryptoKey: Promise<jose.CryptoKey>
  jwk: ManagedJwk
}
export type ResolvedKeySet = {
  privateKeys: ImportedKey[]
  publicKeys: ImportedKey[]
}
type BufferLike = {
  from(
    value: string,
    encoding: string,
  ): {
    toString(encoding: string): string
  }
}
type ProcessLike = {
  env?: Record<string, string | undefined>
}
function getBuffer(): BufferLike | undefined {
  return (globalThis as typeof globalThis & { Buffer?: BufferLike }).Buffer
}
function getProcessEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as typeof globalThis & { process?: ProcessLike }).process?.env
}
export function derivePublicJwk(privateJwk: jose.JWK): jose.JWK {
  const {
    d: _d,
    p: _p,
    q: _q,
    dp: _dp,
    dq: _dq,
    qi: _qi,
    ...rest
  } = privateJwk as jose.JWK & {
    p?: unknown
    q?: unknown
    dp?: unknown
    dq?: unknown
    qi?: unknown
  }
  const { oth: _oth, ...publicJwk } = rest as typeof rest & { oth?: unknown }
  return publicJwk as jose.JWK
}
const keySetCache = new ContentAndIdentityCache<
  SessionJwtEnvironment,
  JwtRuntimeMode,
  Promise<ResolvedKeySet>
>()
function getDefaultMode(): JwtRuntimeMode {
  const env = getProcessEnv()
  if (!env) {
    return 'development'
  }
  if (env.NODE_ENV === 'production') {
    return 'production'
  }
  if (env.NODE_ENV === 'test') {
    return 'test'
  }
  return 'development'
}
function decodeBase64Json(rawValue: string, envName: string): unknown {
  try {
    const buffer = getBuffer()
    if (buffer) {
      return JSON.parse(buffer.from(rawValue, 'base64').toString('utf-8')) as unknown
    }
    const atobFn = (globalThis as typeof globalThis & { atob?: (value: string) => string }).atob
    if (!atobFn) {
      throw new Error('base64 decoding is unavailable in this runtime')
    }
    return JSON.parse(atobFn(rawValue)) as unknown
  } catch (error) {
    throw new Error(
      `${envName} must be valid base64-encoded JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error },
    )
  }
}
function normalizeJwkSet(rawValue: string, envName: string): ManagedJwk[] {
  const parsed = decodeBase64Json(rawValue, envName)
  const keys = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' &&
        parsed !== null &&
        Array.isArray((parsed as { keys?: unknown }).keys)
      ? (parsed as { keys: unknown[] }).keys
      : [parsed]
  if (keys.length === 0) {
    throw new Error(`${envName} must contain at least one JWK`)
  }
  const seenKids = new Set<string>()
  return keys.map((key, index) => {
    if (typeof key !== 'object' || key === null) {
      throw new Error(`${envName}[${index}] must be a JSON object`)
    }
    const jwk = key as jose.JWK
    if (jwk.kty !== 'RSA') {
      throw new Error(`${envName}[${index}] must be an RSA JWK`)
    }
    if (jwk.alg !== SESSION_JWT_ALGORITHM) {
      throw new Error(`${envName}[${index}] must use ${SESSION_JWT_ALGORITHM}`)
    }
    if (jwk.use !== undefined && jwk.use !== 'sig') {
      throw new Error(`${envName}[${index}] must be a signature key`)
    }
    if (typeof jwk.kid !== 'string' || jwk.kid.length === 0) {
      throw new Error(`${envName}[${index}] is missing kid`)
    }
    if (seenKids.has(jwk.kid)) {
      throw new Error(`${envName} contains duplicate kid values: ${jwk.kid}`)
    }
    seenKids.add(jwk.kid)
    return jwk as ManagedJwk
  })
}
function getConfiguredEnv(
  env?: SessionJwtEnvironment,
): Required<
  Pick<
    SessionJwtEnvironment,
    'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64' | 'VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64'
  >
> {
  const processEnv = getProcessEnv()
  return {
    VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64:
      env?.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 ??
      processEnv?.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 ??
      '',
    VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64:
      env?.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64 ??
      processEnv?.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64 ??
      '',
  }
}
function importKeys(jwks: ManagedJwk[]): ImportedKey[] {
  return jwks.map(jwk => ({
    jwk,
    cryptoKey: jose.importJWK(jwk, jwk.alg) as Promise<jose.CryptoKey>,
  }))
}
function buildResolvedKeySet(options?: JwtRuntimeOptions): ResolvedKeySet {
  const mode = options?.mode ?? getDefaultMode()
  const env = getConfiguredEnv(options?.env)
  const privateKeys =
    env.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64.length > 0
      ? normalizeJwkSet(env.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64, SESSION_JWT_PRIVATE_KEYS_ENV)
      : []
  const publicKeys =
    env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64.length > 0
      ? normalizeJwkSet(env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64, SESSION_JWT_PUBLIC_KEYS_ENV)
      : []
  if (privateKeys.length === 0 && publicKeys.length === 0) {
    if (mode === 'production') {
      throw new Error(
        `${SESSION_JWT_PRIVATE_KEYS_ENV} or ${SESSION_JWT_PUBLIC_KEYS_ENV} must be configured in production`,
      )
    }
    const fallbackPrivateKey = testPrivateKey as ManagedJwk
    return {
      privateKeys: importKeys([fallbackPrivateKey]),
      publicKeys: importKeys([derivePublicJwk(fallbackPrivateKey) as ManagedJwk]),
    }
  }
  return {
    privateKeys: importKeys(privateKeys),
    publicKeys: importKeys(
      publicKeys.length > 0
        ? publicKeys
        : privateKeys.map(key => derivePublicJwk(key) as ManagedJwk),
    ),
  }
}
export function getResolvedKeySet(options?: JwtRuntimeOptions): Promise<ResolvedKeySet> {
  const mode = options?.mode ?? getDefaultMode()
  const envObject = options?.env
  const getCacheKey = () => {
    const env = getConfiguredEnv(envObject)
    return `${mode}\u0000${env.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64}\u0000${env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64}`
  }
  return keySetCache.getOrCompute(envObject, mode, getCacheKey, () =>
    Promise.resolve(buildResolvedKeySet(options)),
  )
}
