import { beforeEach, describe, expect, it } from 'vitest'

import { renderSidebar, setMockPathname } from '@/test-helpers/components/app-sidebar-test-helpers'
import type { User } from '@/types/user'

function hrefsByLabel(container: HTMLElement, labels: readonly string[]) {
  const links = new Map(
    [...container.querySelectorAll('a')].map(link => [link.textContent?.trim() ?? '', link]),
  )
  return Object.fromEntries(labels.map(label => [label, links.get(label)?.getAttribute('href')]))
}

describe('AppSidebar link stability rule', () => {
  beforeEach(() => setMockPathname('/'))

  it.each([
    ['/', ['All News', 'All News Sources']],
    ['/posts', ['Discussions', 'Reviews', 'Data Points']],
  ] as const)(
    'keeps %s intent hrefs identical across authentication states',
    (pathname, labels) => {
      setMockPathname(pathname)
      const unauthHrefs = hrefsByLabel(renderSidebar().container, labels)
      const authHrefs = hrefsByLabel(
        renderSidebar({ id: 'u1', roles: ['user'] } as User).container,
        labels,
      )

      expect(Object.values(unauthHrefs).every(Boolean)).toBe(true)
      expect(authHrefs).toEqual(unauthHrefs)
    },
  )
})
