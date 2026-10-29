import { describe, expect, it } from 'vitest'
import {
  dynamicConfigPrimaryValkeyClient,
  sessionValkeyClient,
  upsertValkeyClientByUrl,
} from './clients.mts'
import { config } from '@data-stores/valkey-core/config'

describe('valkey clients facade', () => {
  it('uses a primary Valkey client for sessions', async () => {
    await expect(
      upsertValkeyClientByUrl(config.session_url, { readFrom: 'primary' }),
    ).resolves.toBe(sessionValkeyClient)
  })

  it('uses an isolated primary Valkey client for strongly consistent dynamic-config reads', async () => {
    await expect(
      upsertValkeyClientByUrl(config.dynamic_config_url, {
        name: 'dynamic-config-primary',
        readFrom: 'primary',
      }),
    ).resolves.toBe(dynamicConfigPrimaryValkeyClient)
  })
})
