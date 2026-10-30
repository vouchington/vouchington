import { describe, expect, it } from 'vitest'
import { getValkeyClientByUrl } from 'valkyries'
import { dynamicConfigPrimaryValkeyClient, sessionValkeyClient } from './clients.mts'
import { config } from '@data-stores/valkey-core/config'

describe('valkey clients facade', () => {
  it('uses a primary Valkey client for sessions', () => {
    expect(getValkeyClientByUrl(config.session_url, { readFrom: 'primary' })).toBe(
      sessionValkeyClient,
    )
  })

  it('uses an isolated primary Valkey client for strongly consistent dynamic-config reads', () => {
    expect(
      getValkeyClientByUrl(config.dynamic_config_url, {
        name: 'dynamic-config-primary',
        readFrom: 'primary',
      }),
    ).toBe(dynamicConfigPrimaryValkeyClient)
  })
})
