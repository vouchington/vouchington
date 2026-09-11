import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DomainDetailTabs } from '../domain-detail-tabs'

const overviewContent = <div>overview content</div>
const moderationContent = <div>moderation content</div>
const crawlersContent = <div>crawlers content</div>

describe('DomainDetailTabs', () => {
  it('renders overview content and no tab elements when only overview is provided', () => {
    render(<DomainDetailTabs>{overviewContent}</DomainDetailTabs>)

    expect(screen.getByText('overview content')).toBeDefined()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
  })

  it('renders Overview and Moderation tabs when two children are provided', () => {
    render(
      <DomainDetailTabs>
        {overviewContent}
        {moderationContent}
      </DomainDetailTabs>,
    )

    expect(screen.getByRole('menuitem', { name: 'Overview' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Moderation' })).toBeDefined()
    expect(screen.queryByRole('menuitem', { name: 'Crawlers' })).toBeNull()
  })

  it('renders all three tabs when three children are provided', () => {
    render(
      <DomainDetailTabs>
        {overviewContent}
        {moderationContent}
        {crawlersContent}
      </DomainDetailTabs>,
    )

    expect(screen.getByRole('menuitem', { name: 'Overview' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Moderation' })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: 'Crawlers' })).toBeDefined()
  })

  it('shows overview content by default', () => {
    render(
      <DomainDetailTabs>
        {overviewContent}
        {moderationContent}
        {crawlersContent}
      </DomainDetailTabs>,
    )

    expect(screen.getByText('overview content')).toBeDefined()
  })

  it('initial active item is Overview', () => {
    render(
      <DomainDetailTabs>
        {overviewContent}
        {moderationContent}
        {crawlersContent}
      </DomainDetailTabs>,
    )

    expect(screen.getByRole('menuitem', { name: 'Overview' }).getAttribute('data-active')).toBe(
      'true',
    )
    expect(screen.getByRole('menuitem', { name: 'Overview' }).getAttribute('aria-current')).toBe(
      'page',
    )
    expect(screen.getByRole('menuitem', { name: 'Moderation' }).getAttribute('data-active')).toBe(
      'false',
    )
    expect(screen.getByRole('menuitem', { name: 'Crawlers' }).getAttribute('data-active')).toBe(
      'false',
    )
  })
})
