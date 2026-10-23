import {
  createJwtKeySet,
  parseBase64JwkSet,
  parseJwkSet,
  type JwtKeySet,
} from '@vouchington/session-jwt'
import testPrivateKey from './test-jwt-private-key.mts'
import {
  SESSION_JWT_PRIVATE_KEYS_ENV,
  SESSION_JWT_PUBLIC_KEYS_ENV,
  type JwtRuntimeMode,
  type SessionJwtEnvironment,
  type JwtRuntimeOptions,
} from './types.mts'

type ProcessLike = {
  env?: Record<string, string | undefined>
}
function getProcessEnv(): Record<string, string | undefined> | undefined {
  return (globalThis as typeof globalThis & { process?: ProcessLike }).process?.env
}
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

// Product bindings are stable per isolate; mode separates production from development keys.
const configuredKeys = new Map<string, Promise<JwtKeySet>>()
export function getResolvedKeySet(options?: JwtRuntimeOptions): Promise<JwtKeySet> {
  const mode = options?.mode ?? getDefaultMode()
  const env = getConfiguredEnv(options?.env)
  const privateValue = env.VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64
  const publicValue = env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64
  const cacheKey = `${mode}\u0000${privateValue}\u0000${publicValue}`
  const cached = configuredKeys.get(cacheKey)
  if (cached) return cached
  if (!privateValue && !publicValue && mode === 'production') {
    throw new Error(
      `${SESSION_JWT_PRIVATE_KEYS_ENV} or ${SESSION_JWT_PUBLIC_KEYS_ENV} must be configured in production`,
    )
  }
  const configured = resolveConfiguredKeys(privateValue, publicValue)
  configuredKeys.set(cacheKey, configured)
  void configured.catch(() => {
    if (configuredKeys.get(cacheKey) === configured) configuredKeys.delete(cacheKey)
  })
  return configured
}

async function resolveConfiguredKeys(
  privateValue: string,
  publicValue: string,
): Promise<JwtKeySet> {
  const signing: JwtKeySet =
    publicValue && !privateValue
      ? { privateKeys: [], publicKeys: [] }
      : await createJwtKeySet({
          ...(privateValue
            ? { privateJwks: parseBase64JwkSet(privateValue, SESSION_JWT_PRIVATE_KEYS_ENV) }
            : {}),

          ...(!privateValue && !publicValue ? { privateJwks: [testPrivateKey] } : {}),
        })
  if (!publicValue) return signing
  // Rotation must keep healthy verification keys usable if an unrelated candidate is corrupt.
  const decoded: unknown = JSON.parse(atob(publicValue))
  const values = Array.isArray(decoded)
    ? decoded
    : typeof decoded === 'object' && decoded !== null && 'keys' in decoded
      ? decoded.keys
      : [decoded]
  if (!Array.isArray(values) || !values.length)
    throw new Error(`${SESSION_JWT_PUBLIC_KEYS_ENV} must contain at least one JWK`)
  const results = await Promise.allSettled(
    values.map(async value => {
      const publicJwks = parseJwkSet(value, SESSION_JWT_PUBLIC_KEYS_ENV)
      return createJwtKeySet({ publicJwks })
    }),
  )
  return {
    privateKeys: signing.privateKeys,
    publicKeys: results.flatMap(result =>
      result.status === 'fulfilled' ? [...result.value.publicKeys] : [],
    ),
  }
}
