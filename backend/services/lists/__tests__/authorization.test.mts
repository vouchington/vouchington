import { describe, it, expect } from 'vitest'
import { currentUserCanManageList, currentUserCanViewList } from '../authorization.mts'

describe('currentUserCanManageList', () => {
  it('returns false for non-owner', () => {
    expect(
      currentUserCanManageList('other-id', { owner_user_id: 'owner-id', removed_at: null }),
    ).toBe(false)
  })

  it('returns true for list owner', () => {
    expect(
      currentUserCanManageList('owner-id', { owner_user_id: 'owner-id', removed_at: null }),
    ).toBe(true)
  })

  it('returns false for soft-deleted list', () => {
    expect(
      currentUserCanManageList('owner-id', {
        owner_user_id: 'owner-id',
        removed_at: new Date(),
      }),
    ).toBe(false)
  })
})

describe('currentUserCanViewList', () => {
  it('returns true for public lists without auth', () => {
    expect(
      currentUserCanViewList(null, {
        owner_user_id: 'owner-id',
        removed_at: null,
        visibility: 'public',
      }),
    ).toBe(true)
  })

  it('returns true for unlisted lists without auth', () => {
    expect(
      currentUserCanViewList(null, {
        owner_user_id: 'owner-id',
        removed_at: null,
        visibility: 'unlisted',
      }),
    ).toBe(true)
  })

  it('returns false for private lists without auth', () => {
    expect(
      currentUserCanViewList(null, {
        owner_user_id: 'owner-id',
        removed_at: null,
        visibility: 'private',
      }),
    ).toBe(false)
  })

  it('returns true for private list owner', () => {
    expect(
      currentUserCanViewList('owner-id', {
        owner_user_id: 'owner-id',
        removed_at: null,
        visibility: 'private',
      }),
    ).toBe(true)
  })

  it('returns false for private list non-owner', () => {
    expect(
      currentUserCanViewList('other-id', {
        owner_user_id: 'owner-id',
        removed_at: null,
        visibility: 'private',
      }),
    ).toBe(false)
  })

  it('returns false for soft-deleted list regardless of visibility', () => {
    expect(
      currentUserCanViewList('owner-id', {
        owner_user_id: 'owner-id',
        removed_at: new Date(),
        visibility: 'public',
      }),
    ).toBe(false)
  })
})
