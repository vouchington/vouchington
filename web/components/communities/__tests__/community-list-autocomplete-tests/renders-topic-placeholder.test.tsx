import '@/test-helpers/components/communities/community-list-autocomplete.mock-support'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { render, screen } from '@testing-library/react'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'

import { CommunityListAutocomplete } from '../../community-list-autocomplete'

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders topic placeholder', () => {
    render(
      <CommunityListAutocomplete
        itemType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search topics...')).toBeDefined()
  })

  it('renders rss_feed placeholder', () => {
    expect(communityListItemTypeCatalog.rss_feed.searchLabel).toBe('sources')
    render(
      <CommunityListAutocomplete
        itemType='rss_feed'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search sources...')).toBeDefined()
  })

  it('renders post placeholder', () => {
    render(
      <CommunityListAutocomplete
        itemType='post'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search posts...')).toBeDefined()
  })

  it('renders url_hostname placeholder', () => {
    render(
      <CommunityListAutocomplete
        itemType='url_hostname'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search domains...')).toBeDefined()
  })

  it('renders url placeholder', () => {
    render(
      <CommunityListAutocomplete
        itemType='url'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search URLs...')).toBeDefined()
  })
})
