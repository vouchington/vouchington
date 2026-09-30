/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, test, type Mock } from 'vitest'

export const createPostPageUser = { id: 'user-1', roles: [] as string[] }

const createPostPageAllowedStatus = {
  contribution_status: { allowed: true },
  admission: { allowed: true },
}

export const createPostPageEmptySearchParams: Promise<Record<string, string>> = Promise.resolve({})

const gatedStatus = {
  contribution_status: { allowed: false, reason: 'account_too_new' },
  admission: { allowed: true },
}

type CreatePage = (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>

export function registerCreatePostPageCases(options: {
  Page: CreatePage
  postType: string
  actionNoun: string
  community: { id: string; name: string; slug: string }
  mockGetCurrentUser: Mock
  mockGetMyContributionStatus: Mock
  mockGetEligibleCommunityPostOptions: Mock
  mockPostForm: Mock
}): void {
  const {
    Page,
    postType,
    actionNoun,
    community,
    mockGetCurrentUser,
    mockGetMyContributionStatus,
    mockGetEligibleCommunityPostOptions,
    mockPostForm,
  } = options

  test('redirects to /login when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetMyContributionStatus.mockResolvedValue(createPostPageAllowedStatus)
    await expect(Page({ searchParams: createPostPageEmptySearchParams })).rejects.toThrow(
      'redirect:/login',
    )
  })

  test('renders post form when contribution is allowed', async () => {
    mockGetCurrentUser.mockResolvedValue(createPostPageUser)
    mockGetMyContributionStatus.mockResolvedValue(createPostPageAllowedStatus)
    const result = await Page({ searchParams: createPostPageEmptySearchParams })
    render(result)
    expect(screen.getByTestId('post-form')).toBeDefined()
    expect(screen.queryByTestId('contribution-gated-cta')).toBeNull()
  })

  test('passes eligible community options and initial community slug to the post form', async () => {
    mockGetCurrentUser.mockResolvedValue(createPostPageUser)
    mockGetMyContributionStatus.mockResolvedValue(createPostPageAllowedStatus)
    mockGetEligibleCommunityPostOptions.mockResolvedValue({
      communityOptions: [community],
      initialCommunitySlug: community.slug,
    })
    const result = await Page({
      searchParams: Promise.resolve({ community: community.slug }),
    })
    render(result)

    expect(mockGetEligibleCommunityPostOptions).toHaveBeenCalledWith(postType, community.slug)
    expect(mockPostForm).toHaveBeenCalledWith(
      expect.objectContaining({
        postType,
        communityOptions: [community],
        initialCommunitySlug: community.slug,
      }),
      undefined,
    )
  })

  test('renders CTA and hides form when account_too_new', async () => {
    mockGetCurrentUser.mockResolvedValue(createPostPageUser)
    mockGetMyContributionStatus.mockResolvedValue(gatedStatus)
    const result = await Page({ searchParams: createPostPageEmptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
    expect(screen.getByText(actionNoun)).toBeDefined()
  })

  test('renders CTA and hides form when email_verification_required', async () => {
    mockGetCurrentUser.mockResolvedValue(createPostPageUser)
    mockGetMyContributionStatus.mockResolvedValue({
      contribution_status: { allowed: false, reason: 'email_verification_required' },
      admission: { allowed: true },
    })
    const result = await Page({ searchParams: createPostPageEmptySearchParams })
    render(result)
    expect(screen.getByTestId('contribution-gated-cta')).toBeDefined()
    expect(screen.queryByTestId('post-form')).toBeNull()
  })

  test('renders form when getMyContributionStatus fails', async () => {
    mockGetCurrentUser.mockResolvedValue(createPostPageUser)
    mockGetMyContributionStatus.mockRejectedValue(new Error('API error'))
    const result = await Page({ searchParams: createPostPageEmptySearchParams })
    render(result)
    expect(screen.getByTestId('post-form')).toBeDefined()
    expect(screen.queryByTestId('contribution-gated-cta')).toBeNull()
  })
}
