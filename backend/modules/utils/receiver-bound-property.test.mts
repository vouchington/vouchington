import { describe, expect, it } from 'vitest'
import { getReceiverBoundProperty } from './receiver-bound-property.mts'

describe('getReceiverBoundProperty', () => {
  it('returns data properties unchanged', () => {
    const target = { region: 'us-east-1' }
    expect(getReceiverBoundProperty(target, 'region')).toBe('us-east-1')
  })

  it('calls methods with the source object as this', () => {
    const target = {
      marker: 'client',
      read(this: { marker: string }, extra: string) {
        return `${this.marker}:${extra}`
      },
    }
    const read = getReceiverBoundProperty(target, 'read') as (extra: string) => string

    expect(read('ok')).toBe('client:ok')
  })
})
