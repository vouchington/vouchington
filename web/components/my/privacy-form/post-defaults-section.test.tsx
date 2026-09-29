import { makeSettings } from '@/test-helpers/components/my/privacy-form.mock-support'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PostDefaultsSection } from './post-defaults-section'

describe('PostDefaultsSection', () => {
  it('renders the Post Defaults heading', () => {
    render(
      <PostDefaultsSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Post Defaults' })).toBeInTheDocument()
  })

  it('renders the default_post_broadcast label', () => {
    const { container } = render(
      <PostDefaultsSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/default post audience/i)).toBeInTheDocument()
    expect(container.querySelector('[data-pw="default-post-broadcast-select"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="default-post-broadcast-option-mutual-followers"]'),
    ).not.toBeNull()
    expect(container.querySelector('[data-pw="default-post-privacy-select"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="default-post-privacy-option-private"]'),
    ).not.toBeNull()
  })
})
