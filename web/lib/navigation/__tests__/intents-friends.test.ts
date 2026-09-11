// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { getActiveIntent } from '../intents'

describe('getActiveIntent friends intent', () => {
  it('resolves /users to friends', () => {
    expect(getActiveIntent('/users')).toBe('friends')
  })

  it('resolves /user/:id to friends (public profile)', () => {
    expect(getActiveIntent('/user/jong')).toBe('friends')
    expect(getActiveIntent('/user/jong/posts')).toBe('friends')
  })

  it('resolves /my/friend-recommendations to friends (prefix covers sub-routes)', () => {
    expect(getActiveIntent('/my/friend-recommendations')).toBe('friends')
    expect(getActiveIntent('/my/friend-recommendations/dismissed')).toBe('friends')
  })
})
