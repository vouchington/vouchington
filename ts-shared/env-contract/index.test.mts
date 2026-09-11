import { describe, expect, it } from 'vitest'

import {
  ENV_VAR_CONTRACT,
  collectTypedEnvContractEntries,
  collectTypedEnvVarConstants,
  envContractsByName,
  envNamesForSurface,
  knownPublicEnvNames,
  knownSecretEnvNames,
} from './index.mts'

describe('environment contract', () => {
  it('exposes a normalized entry for every surface assignment', () => {
    expect(ENV_VAR_CONTRACT).toContainEqual(
      expect.objectContaining({
        name: 'DATABASE_URL',
        sensitivity: 'secret',
        sourceOfTruth: 'vouchington-infra',
        surfaces: ['ecs-backend-secret', 'ecs-worker-secret'],
      }),
    )
    expect(envNamesForSurface('ecs-web-environment')).toEqual(
      expect.arrayContaining(['NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY']),
    )
    expect(envNamesForSurface('ecs-worker-environment')).toEqual(
      expect.arrayContaining([
        'BEDROCK_BATCH_SQS_QUEUE_URL',
        'APPLE_APP_STORE_SERVER_API_ISSUER_ID',
        'APPLE_APP_STORE_SERVER_API_KEY_ID',
        'DATABASE_HOST',
        'LIGHTPANDA_CDP_URL',
        'SES_BOUNCE_SQS_QUEUE_URL',
        'SES_INBOUND_SQS_QUEUE_URL',
        'STRIPE_EVENTS_SQS_QUEUE_URL',
      ]),
    )
    expect(envNamesForSurface('ecs-backend-rollout-secret')).toEqual([
      'VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64',
    ])
    expect(envNamesForSurface('ecs-worker-rollout-secret')).toEqual(
      expect.arrayContaining(['LIGHTPANDA_TOKEN']),
    )
    expect(envNamesForSurface('ecs-worker-secret')).toContain(
      'APPLE_APP_STORE_SERVER_API_PRIVATE_KEY',
    )
    expect(envNamesForSurface('ecs-backend-secret')).not.toContain(
      'APPLE_APP_STORE_SERVER_API_PRIVATE_KEY',
    )
  })

  it('keeps public identifiers out of the secret sensitivity set', () => {
    expect(knownPublicEnvNames()).toEqual(expect.arrayContaining(['GOOGLE_CLIENT_ID']))
    expect(knownPublicEnvNames()).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY',
        'NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH',
      ]),
    )
    expect(knownSecretEnvNames()).not.toContain('GOOGLE_CLIENT_ID')
    expect(knownSecretEnvNames()).not.toContain('NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY')
    expect(knownSecretEnvNames()).toContain('VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64')
    expect(knownSecretEnvNames()).toContain('APPLE_APP_STORE_SERVER_API_PRIVATE_KEY')
    expect(knownSecretEnvNames()).toContain('LIGHTPANDA_TOKEN')
  })

  it('preserves locale-sorted sensitivity-name ordering', () => {
    for (const [sensitivity, actual] of [
      ['public', knownPublicEnvNames()],
      ['secret', knownSecretEnvNames()],
    ] as const) {
      const expected = [
        ...new Set(
          ENV_VAR_CONTRACT.filter(entry => entry.sensitivity === sensitivity).map(
            entry => entry.name,
          ),
        ),
      ].toSorted((a, b) => a.localeCompare(b))
      expect(actual).toEqual(expected)
    }
  })

  it('groups repeated names by contract entry', () => {
    const byName = envContractsByName()

    expect(byName.get('CF_WORKER_SECRET')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surfaces: ['local-worktree'] }),
        expect.objectContaining({ surfaces: ['local-web'] }),
        expect.objectContaining({ surfaces: ['ecs-backend-secret', 'ecs-worker-secret'] }),
        expect.objectContaining({ surfaces: ['ecs-web-secret'] }),
      ]),
    )
    expect(byName.get('CF_WORKER_ROUTE')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ surfaces: ['local-worktree'] }),
        expect.objectContaining({ surfaces: ['ecs-worker-environment'] }),
      ]),
    )
    expect(byName.get('ENVIRONMENT')).toEqual(
      expect.arrayContaining([expect.objectContaining({ surfaces: ['local-worktree'] })]),
    )
  })

  it('exposes config-inventory compatibility collectors', () => {
    expect(collectTypedEnvContractEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contractKey: 'vouchington-infra:ecs-backend-secret+ecs-worker-secret:STRIPE_SECRET_KEY',
          name: 'STRIPE_SECRET_KEY',
          runtimeSurfaces: ['ecs-backend-secret', 'ecs-worker-secret'],
        }),
      ]),
    )
    expect(collectTypedEnvVarConstants()).toMatchObject({
      HASH_ENV: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
      SIDELOAD_SIGNING_KEYS_ENV: 'VOUCHA_SIDELOAD_SIGNING_KEYS',
    })
  })
})
