import type { ReactNode } from 'react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SettingsNav } from './settings-nav'
import type { EntityMenubarItem } from '@/components/shared/entity-menubar-nav'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

let mockPathname = '/my/identity'
let mockPreserveScrollOnNavigation: boolean | undefined

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

vi.mock(import('@/components/shared/entity-menubar-nav'), () => ({
  EntityMenubarNav: ({
    items,
    ariaLabel,
    preserveScrollOnNavigation,
  }: {
    items: EntityMenubarItem[]
    ariaLabel: string
    preserveScrollOnNavigation?: boolean
  }) => {
    mockPreserveScrollOnNavigation = preserveScrollOnNavigation
    return (
      <div
        role='menubar'
        aria-label={ariaLabel}
      >
        {items.map(item => (
          <div
            key={item.key}
            data-active={item.active ? 'true' : 'false'}
            data-key={item.key}
          >
            {item.content}
            {item.dropdownItems?.map(di => (
              <div
                key={di.key}
                data-dropdown-item
                data-active={di.active ? 'true' : 'false'}
              >
                {di.content}
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  },
}))

function getActiveGroup(container: HTMLElement): string | null {
  const active = container.querySelector('[data-active="true"][data-key]')
  return active?.getAttribute('data-key') ?? null
}

describe('SettingsNav', () => {
  beforeEach(() => {
    mockPreserveScrollOnNavigation = undefined
  })

  it('renders five menubar items: Account, Profile, Preferences, Advanced, Moderation', () => {
    mockPathname = '/my/identity'
    render(<SettingsNav />)
    const menubar = screen.getByRole('menubar')
    expect(menubar).toBeDefined()
    const items = menubar.querySelectorAll('[data-key]')
    expect(items).toHaveLength(5)
    const triggers = menubar.querySelectorAll('[data-pw$="-tab"]')
    expect([...triggers].map(t => t.textContent?.trim())).toEqual([
      'Account',
      'Profile',
      'Preferences',
      'Moderation',
      'Advanced',
    ])
  })

  it('activates Account group for /my/identity', () => {
    mockPathname = '/my/identity'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('account')
  })

  it('activates Account group for /my/privacy', () => {
    mockPathname = '/my/privacy'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('account')
  })

  it('activates Profile group for /my/profile (About Me moved to Profile)', () => {
    mockPathname = '/my/profile'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('profile')
  })

  it('activates Profile group for /my/cards', () => {
    mockPathname = '/my/cards'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('profile')
  })

  it('activates Preferences group for /my/preferences', () => {
    mockPathname = '/my/preferences'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('preferences')
  })

  it('activates Preferences group for /my/news-preferences', () => {
    mockPathname = '/my/news-preferences'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('preferences')
  })

  it('activates Preferences group for /my/notification-settings', () => {
    mockPathname = '/my/notification-settings'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('preferences')
  })

  it('returns null for /my/import-export (route removed, no longer in nav)', () => {
    mockPathname = '/my/import-export'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBeNull()
  })

  it('activates Advanced group for /my/api-keys', () => {
    mockPathname = '/my/api-keys'
    const { container } = render(<SettingsNav />)
    expect(getActiveGroup(container)).toBe('advanced')
  })

  it('returns null for paths outside tab groups', () => {
    mockPathname = '/my/notifications'
    const { container } = render(<SettingsNav />)
    expect(container.querySelector('nav')).toBeNull()
  })

  it('does not opt settings navigation into preserved scroll', () => {
    mockPathname = '/my/identity'
    render(<SettingsNav />)

    expect(mockPreserveScrollOnNavigation).toBeUndefined()
  })

  it('returns null for /my/landing-pages', () => {
    mockPathname = '/my/landing-pages'
    const { container } = render(<SettingsNav />)
    expect(container.querySelector('nav')).toBeNull()
  })

  it('returns null for /my/referrals', () => {
    mockPathname = '/my/referrals'
    const { container } = render(<SettingsNav />)
    expect(container.querySelector('nav')).toBeNull()
  })

  it('does not include About Me in Account group', () => {
    mockPathname = '/my/identity'
    render(<SettingsNav />)
    const accountGroup = screen.getByRole('menubar').querySelector('[data-key="account"]')
    const links = accountGroup?.querySelectorAll('a')
    const hrefs = [...(links ?? [])].map(a => a.getAttribute('href'))
    expect(hrefs).not.toContain('/my/profile')
  })

  it('Account dropdown contains Identity, Privacy, Membership, ID Verification', () => {
    mockPathname = '/my/identity'
    render(<SettingsNav />)
    const accountGroup = screen.getByRole('menubar').querySelector('[data-key="account"]')
    const links = accountGroup?.querySelectorAll('a')
    const hrefs = [...(links ?? [])].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/my/identity')
    expect(hrefs).toContain('/my/privacy')
    expect(hrefs).toContain('/my/membership')
    expect(hrefs).toContain('/my/identity-verification')
  })

  it('Moderation dropdown contains the moderation transparency page', () => {
    mockPathname = '/moderation-transparency'
    render(<SettingsNav />)

    const moderationGroup = screen.getByRole('menubar').querySelector('[data-key="moderation"]')
    expect(moderationGroup?.querySelector('a[href="/moderation-transparency"]')).toBeDefined()
    expect(getActiveGroup(screen.getByRole('menubar'))).toBe('moderation')
  })

  it('Profile dropdown contains About Me and card items', () => {
    mockPathname = '/my/cards'
    render(<SettingsNav />)
    const profileGroup = screen.getByRole('menubar').querySelector('[data-key="profile"]')
    const links = profileGroup?.querySelectorAll('a')
    const hrefs = [...(links ?? [])].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/my/profile')
    expect(hrefs).toContain('/my/cards')
    expect(hrefs).toContain('/my/household')
  })

  it('Preferences dropdown contains Display, Language, News, Notifications', () => {
    mockPathname = '/my/preferences'
    render(<SettingsNav />)
    const prefsGroup = screen.getByRole('menubar').querySelector('[data-key="preferences"]')
    const links = prefsGroup?.querySelectorAll('a')
    const hrefs = [...(links ?? [])].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/my/preferences')
    expect(hrefs).toContain('/my/news-preferences')
    expect(hrefs).toContain('/my/notification-settings')
    expect(hrefs).not.toContain('/my/import-export')
  })

  it('Advanced dropdown contains API Keys, Your Data', () => {
    mockPathname = '/my/api-keys'
    render(<SettingsNav />)
    const advancedGroup = screen.getByRole('menubar').querySelector('[data-key="advanced"]')
    const links = advancedGroup?.querySelectorAll('a')
    const hrefs = [...(links ?? [])].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('/my/api-keys')
    expect(hrefs).not.toContain('/my/friend-recommendations')
    expect(hrefs).toContain('/my/data')
  })

  it('group triggers are spans with data-pw, not links', () => {
    mockPathname = '/my/identity'
    const { container } = render(<SettingsNav />)
    const triggers = container.querySelectorAll('[data-pw$="-tab"]')
    expect(triggers.length).toBe(5)
    for (const trigger of triggers) {
      expect(trigger.tagName.toLowerCase()).toBe('span')
    }
  })

  it('group items have correct data-pw attributes', () => {
    mockPathname = '/my/identity'
    const { container } = render(<SettingsNav />)
    expect(container.querySelector('[data-pw="settings-nav-account-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-profile-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-preferences-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-advanced-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-moderation-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-statuses"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-display"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-language"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-news"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-notifications"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-import-export"]')).toBeNull()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-api-keys"]')).toBeTruthy()
    expect(container.querySelector('[data-pw="settings-nav-dropdown-find-friends"]')).toBeNull()
  })

  it('renders using menubar not tablist', () => {
    mockPathname = '/my/identity'
    render(<SettingsNav />)
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('menubar')).toBeTruthy()
  })

  it('no second-row pill links rendered', () => {
    mockPathname = '/my/identity'
    const { container } = render(<SettingsNav />)
    // All links should be inside the menubar, not in a sibling pill row
    const nav = container.querySelector('nav')
    const menubar = nav?.querySelector('[role="menubar"]')
    const linksOutsideMenubar = [...(nav?.querySelectorAll('a') ?? [])].filter(
      a => !menubar?.contains(a),
    )
    expect(linksOutsideMenubar).toHaveLength(0)
  })
})
