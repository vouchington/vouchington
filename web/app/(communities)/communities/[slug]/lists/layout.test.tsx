import { describe, expect, it } from 'vitest'
import CommunityListsLayout from './layout'

describe('CommunityListsLayout', () => {
  it('renders children inside the list page wrapper', () => {
    const result = CommunityListsLayout({ children: <div data-pw='child'>child</div> })

    expect(result.props.className).toBe('space-y-4')
    expect(result.props.children.props['data-pw']).toBe('child')
  })
})
