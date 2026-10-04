import { configure, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import { CopyrightNoticeTargetPicker } from './copyright-notice-target-picker'

configure({ testIdAttribute: 'data-pw' })
vi.mock(import('@/lib/api/client/copyright-notice-targets'), async importOriginal => ({
  ...(await importOriginal()),
  resolveCopyrightNoticeTargets: vi.fn<typeof resolveCopyrightNoticeTargets>(),
}))
const mockResolve = vi.mocked(resolveCopyrightNoticeTargets)

describe('staff post-image target selection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seeds the notifier URL, hides the US hint, and offers only post images', async () => {
    const post: CopyrightNoticeResolvedTarget = {
      surface: 'post-image',
      post_id: 'post-1',
      image_id: 'image-1',
      target_url: 'https://voucha.ai/discussion/post-1',
      order_index: 0,
      caption: 'Photograph',
    }
    const profile: CopyrightNoticeResolvedTarget = {
      surface: 'user-profile-image',
      user_id: 'user-1',
      image_id: 'image-profile',
      target_url: 'https://voucha.ai/users/user-1',
      order_index: 1,
      caption: 'Avatar',
    }
    mockResolve.mockResolvedValueOnce([profile, post])
    render(
      <CopyrightNoticeTargetPicker
        hint={null}
        initialUrl={post.target_url}
        legend='Post images named in the notice'
        onChange={vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()}
        postImagesOnly
        targets={[]}
      />,
    )
    expect(
      screen.getByRole('group', { name: 'Post images named in the notice' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Hosted use URL')).toHaveValue(post.target_url)
    expect(screen.queryByTestId('copyright-designated-agent-hint')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    expect(await screen.findByLabelText('Hosted image 1: Photograph')).toBeInTheDocument()
    expect(screen.queryByText('Avatar')).not.toBeInTheDocument()
  })

  it('explains when the URL resolves only unsupported image surfaces', async () => {
    mockResolve.mockResolvedValueOnce([
      {
        surface: 'topic-logo-image',
        topic_id: 'topic-1',
        image_id: 'image-1',
        target_url: 'https://voucha.ai/topic/one',
        order_index: 0,
        caption: 'Topic logo',
      },
    ])
    render(
      <CopyrightNoticeTargetPicker
        hint={null}
        initialUrl='https://voucha.ai/topic/one'
        onChange={vi.fn<(targets: CopyrightNoticeResolvedTarget[]) => void>()}
        postImagesOnly
        targets={[]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Find hosted material' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No hosted post images')
    expect(screen.queryByRole('link', { name: 'designated agent' })).not.toBeInTheDocument()
  })
})
