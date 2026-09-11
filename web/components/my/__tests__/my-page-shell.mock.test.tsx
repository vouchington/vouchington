import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock(import('next/navigation'), () => ({
  usePathname: vi.fn<() => string>(() => '/my/identity'),
}))

vi.mock(import('../settings-nav'), () => ({
  SettingsNav: () => <div data-testid='settings-nav' />,
}))

import { MyPageShell } from '../my-page-shell'
import { usePathname } from 'next/navigation'

const mockUsePathname = vi.mocked(usePathname)

describe('MyPageShell', () => {
  it('applies max-w-4xl cap on a settings route', () => {
    mockUsePathname.mockReturnValue('/my/identity')
    const { container } = render(
      <MyPageShell>
        <div>content</div>
      </MyPageShell>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).toContain('max-w-4xl')
  })

  it('does not apply max-w-4xl cap on a content route', () => {
    mockUsePathname.mockReturnValue('/my/notifications')
    const { container } = render(
      <MyPageShell>
        <div>content</div>
      </MyPageShell>,
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.className).not.toContain('max-w-4xl')
  })
})
