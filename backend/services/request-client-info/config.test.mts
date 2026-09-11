import { afterEach, describe, expect, it, vi } from 'vitest'
import { isRequestClientInfoEnforced, requestClientInfoConfig } from './config.mts'

describe('request client information dynamic config', () => {
  afterEach(() => vi.restoreAllMocks())

  it('defaults enforcement off and exposes the expected field type', () => {
    expect(requestClientInfoConfig.defaultFields).toEqual({ enforcement_enabled: false })
    expect(requestClientInfoConfig.fieldTypes).toEqual({ enforcement_enabled: 'boolean' })
    expect(isRequestClientInfoEnforced()).toBe(false)
  })

  it('enables enforcement only for the literal true value', () => {
    vi.spyOn(requestClientInfoConfig, 'getFields').mockReturnValue({ enforcement_enabled: true })
    expect(isRequestClientInfoEnforced()).toBe(true)
  })
})
