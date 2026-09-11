import { describe, expect, it } from 'vitest'
import { getStartDiscussionActionProps } from '../get-start-discussion-action-props'

describe('getStartDiscussionActionProps', () => {
  const BASE = { isLoggedIn: true }

  it('returns urlId object when logged in and relatedUrlId is set', () => {
    expect(getStartDiscussionActionProps({ ...BASE, relatedUrlId: 'url-1' })).toEqual({
      urlId: 'url-1',
    })
  })

  it('returns null when relatedUrlId is absent', () => {
    expect(getStartDiscussionActionProps(BASE)).toBeNull()
  })

  it('returns null when not logged in', () => {
    expect(
      getStartDiscussionActionProps({ ...BASE, isLoggedIn: false, relatedUrlId: 'url-1' }),
    ).toBeNull()
  })

  it('returns urlId when related posts exist (no longer gates on relatedPosts)', () => {
    expect(getStartDiscussionActionProps({ ...BASE, relatedUrlId: 'url-1' })).toEqual({
      urlId: 'url-1',
    })
  })

  it('returns null when a story post exists for the cluster', () => {
    expect(
      getStartDiscussionActionProps({ ...BASE, relatedUrlId: 'url-1', hasStoryPost: true }),
    ).toBeNull()
  })
})
