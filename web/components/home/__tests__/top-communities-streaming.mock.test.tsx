import { Suspense } from 'react'
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TopCommunitiesStreaming } from '../top-communities-streaming'
import type { TopCommunitiesViewModel } from '@/lib/view-models/homepage-view-models'

vi.mock(import('../top-communities'), () => ({
  TopCommunities: ({ data }: { data: TopCommunitiesViewModel | null }) => (
    <div data-testid='top-communities'>{data?.length ?? 0}</div>
  ),
}))

describe('TopCommunitiesStreaming', () => {
  it('unwraps the data promise and renders TopCommunities', async () => {
    const resolvedData: TopCommunitiesViewModel = [
      { id: 'c-1', name: 'Community', href: '/communities/community', memberCount: 1 },
    ]
    const dataPromise = Promise.resolve(resolvedData)

    await act(async () => {
      render(
        <Suspense fallback={<div>Loading</div>}>
          <TopCommunitiesStreaming dataPromise={dataPromise} />
        </Suspense>,
      )
      await dataPromise
    })

    expect(screen.getByTestId('top-communities')).toHaveTextContent('1')
  })
})
