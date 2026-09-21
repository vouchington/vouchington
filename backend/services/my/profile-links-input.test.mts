import { describe, expect, it } from 'vitest'
import { validateProfileUrl } from './profile-links-input.mts'

describe('validateProfileUrl', () => {
  it('rejects a string that is not a URL', () => {
    expect(() => validateProfileUrl('not a url')).toThrow('url must be a valid URL')
  })
})
