import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/shared/title-route-dropdown'), () => ({
  TitleRouteDropdown: ({ label }: { label: string }) => <span>{label}</span>,
}))

import { PostListTopSection } from './post-list-top-section'

const mockConfig = {
  title: 'extracted.lib.routeConfigs.discussions_60157cfc' as const,
  description:
    'extracted.lib.routeConfigs.joinDiscussionsAboutProductsServicesAnd_5e82b04a' as const,
  postTypes: ['discussion' as const],
  pluralPath: 'discussions',
  singularPath: 'discussion',
}

describe('PostListTopSection', () => {
  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('renders the title for unauthenticated users', () => {
    render(
      <PostListTopSection
        config={mockConfig}
        filters={<div>filters</div>}
        viewToggle={<div>toggle</div>}
        isAuthenticated={false}
      />,
    )
    expect(screen.getByText(t(mockConfig.title))).toBeDefined()
  })

  it('renders the title for authenticated users', () => {
    render(
      <PostListTopSection
        config={mockConfig}
        filters={<div>filters</div>}
        viewToggle={<div>toggle</div>}
        isAuthenticated
        userRoles={[]}
      />,
    )
    expect(screen.getByText(t(mockConfig.title))).toBeDefined()
  })
})
