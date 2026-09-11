import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewsCommunityDiscussionDialog } from '../news-community-discussion-dialog'
import type { NewsCommunityDiscussionTarget } from '../community-discussion-types'

vi.mock(import('@/components/shared/turnstile-field'), () => ({
  TurnstileField: () => <div data-testid='turnstile-field' />,
}))

const rewards: NewsCommunityDiscussionTarget = {
  id: 'community-1',
  name: 'Rewards',
  slug: 'rewards',
  visibility: 'public',
}

const turnstile = { token: 'turnstile-token', alwaysApprove: false } as ReturnType<
  typeof import('@/hooks/use-turnstile-token').useTurnstileToken
>

describe('NewsCommunityDiscussionDialog', () => {
  it('renders fixed community title and submit state', () => {
    render(
      <NewsCommunityDiscussionDialog
        fixedCommunity={rewards}
        open
        communities={[rewards]}
        hasLoadedCommunities
        communitySlug='rewards'
        isLoadingCommunities={false}
        isSubmitting
        turnstile={turnstile}
        onOpenChange={vi.fn<VitestLooseMock>()}
        onCommunitySlugChange={vi.fn<VitestLooseMock>()}
        onSubmit={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByText('Discuss in Rewards')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Posting...' })).toBeDisabled()
  })

  it('renders empty selectable community state and calls submit', () => {
    const onSubmit = vi.fn<VitestLooseMock>()
    render(
      <NewsCommunityDiscussionDialog
        open
        communities={[]}
        hasLoadedCommunities
        communitySlug=''
        isLoadingCommunities={false}
        isSubmitting={false}
        turnstile={turnstile}
        onOpenChange={vi.fn<VitestLooseMock>()}
        onCommunitySlugChange={vi.fn<VitestLooseMock>()}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('No available communities found.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Start discussion' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
