// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AutocompleteShowcase } from '../design-system/autocomplete-showcase'
import {
  createAutocompleteFetch,
  storybookAutocompleteResponse,
} from '../design-system/autocomplete-fixtures'

describe('design system autocomplete fixtures', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  })

  it('returns deterministic fixture bodies for every autocomplete endpoint', () => {
    expect(storybookAutocompleteResponse('/api/v1/topics')).toMatchObject({
      topics: {
        'topic-1': { id: 'topic-1', name: 'Chase Sapphire Reserve' },
      },
    })
    expect(storybookAutocompleteResponse('/api/v1/posts')).toMatchObject({
      posts: {
        'post-1': { id: 'post-1', title: 'My First Post', post_type: 'review' },
      },
    })
    const users = storybookAutocompleteResponse('/api/v1/users')
    expect(users?.results).toContainEqual(
      expect.objectContaining({ id: 'user-1', username: 'alice' }),
    )
    const urls = storybookAutocompleteResponse('/api/v1/urls')
    expect(urls?.results).toContainEqual(
      expect.objectContaining({ id: 'url-1', url: 'https://example.com/card-guide' }),
    )
  })

  it('intercepts autocomplete fetches without falling through to the original fetch', async () => {
    const originalFetch = vi.fn<typeof fetch>()
    const fetch = createAutocompleteFetch(originalFetch)

    const response = await fetch('/api/v1/topics?q=card')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      topics: {
        'topic-1': { name: 'Chase Sapphire Reserve' },
      },
    })
    expect(originalFetch).not.toHaveBeenCalled()

    const urlResponse = await fetch(new URL('/api/v1/posts?q=post', window.location.origin))
    expect(await urlResponse.json()).toMatchObject({
      posts: {
        'post-1': { title: 'My First Post' },
      },
    })
  })

  it('delegates unknown requests to the original fetch', async () => {
    const originalResponse = new Response('{}', { status: 200 })
    const originalFetch = vi.fn<typeof fetch>().mockResolvedValue(originalResponse)
    const fetch = createAutocompleteFetch(originalFetch)

    const response = await fetch('/api/v1/other')

    expect(response).toBe(originalResponse)
    expect(originalFetch).toHaveBeenCalledWith('/api/v1/other', undefined)
  })

  it('renders fixture-backed autocomplete stories and handles selections', async () => {
    render(<AutocompleteShowcase />)

    const [topicInput, tagTopicInput] = screen.getAllByLabelText('Search topics')
    fireEvent.change(topicInput!, { target: { value: 'card' } })
    fireEvent.click(await screen.findByText('Chase Sapphire Reserve'))

    expect(screen.getByText('Selected: Chase Sapphire Reserve (topic-1)')).toBeDefined()

    fireEvent.change(tagTopicInput!, { target: { value: 'lounge' } })
    fireEvent.click(await screen.findByText('Airport Lounges'))

    expect(screen.getByText('Selected tags: topic-2')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'alice' } })
    fireEvent.click(await screen.findByText('alice'))

    expect(screen.getByText('Selected: alice (user-1)')).toBeDefined()

    fireEvent.change(screen.getAllByLabelText('Search posts')[1]!, { target: { value: 'first' } })
    fireEvent.click(await screen.findByText('My First Post'))

    expect(screen.getByText('Selected: My First Post (post-1)')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Search urls'), { target: { value: 'ex' } })
    expect(await screen.findByText('Type at least 3 characters to search.')).toBeDefined()

    fireEvent.change(screen.getByLabelText('Search urls'), { target: { value: 'example' } })
    fireEvent.click(await screen.findByText('example.com/card-guide'))

    await waitFor(() => expect(screen.getByText('Selected tags: topic-2, url-1')).toBeDefined())
  })
})
