import { makeSettings } from '@/test-helpers/components/my/privacy-form.mock-support'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ActivityVisibilitySection,
  MessagingSection,
  ProfileVisibilitySection,
} from '../visibility-sections'

describe('MessagingSection', () => {
  it('renders the direct-messages-audience-select', () => {
    const { container } = render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/who can send you direct messages/i)).toBeInTheDocument()
    expect(container.querySelector('[data-pw="direct-messages-audience-select"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="direct-messages-audience-option-nobody"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-pw="direct-messages-audience-option-mutual-followers"]'),
    ).not.toBeNull()
  })

  it('renders the Messaging heading', () => {
    render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Messaging' })).toBeInTheDocument()
  })

  it('renders the explanatory paragraph text', () => {
    render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(
      screen.getByText(/control who can start a direct message conversation with you/i),
    ).toBeInTheDocument()
  })

  it('calls onChange with direct_messages_audience when select fires', () => {
    const onChange = vi.fn<VitestLooseMock>()
    const { container } = render(
      <MessagingSection
        pending={new Set()}
        settings={makeSettings()}
        onChange={onChange}
      />,
    )

    fireEvent.click(container.querySelector('[data-testid="select"]')!)

    expect(onChange).toHaveBeenCalledWith('direct_messages_audience', 'followers')
  })
})

describe('ActivityVisibilitySection', () => {
  it('renders the Activity Visibility heading', () => {
    render(
      <ActivityVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Activity Visibility' })).toBeInTheDocument()
  })

  it('renders the follows_visibility select label', () => {
    const { container } = render(
      <ActivityVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/who can see your followed users/i)).toBeInTheDocument()
    expect(container.querySelector('[data-pw="follows-visibility-select"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="follows-visibility-option-users"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="follows-visibility-option-mutual-followers"]'),
    ).not.toBeNull()
  })
})

describe('ProfileVisibilitySection', () => {
  it('renders the Profile Visibility heading', () => {
    render(
      <ProfileVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Profile Visibility' })).toBeInTheDocument()
  })

  it('renders the cards_visibility select label', () => {
    render(
      <ProfileVisibilitySection
        pending={new Set()}
        settings={makeSettings()}
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText(/who can see your cards/i)).toBeInTheDocument()
  })
})
