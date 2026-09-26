import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { useUnpublishFromCommunity } from '../use-unpublish-from-community'

const { mockRefresh, mockUnpublish, mockToastError } = vi.hoisted(() => ({
  mockRefresh: vi.fn<VitestLooseMock>(),
  mockUnpublish: vi.fn<VitestLooseMock>(),
  mockToastError: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/communities'), () => ({
  unpublishCommunityPost: mockUnpublish,
}))

vi.mock(
  import('sonner'),
  () => ({ toast: { error: mockToastError } }) as unknown as typeof import('sonner'),
)

function Harness() {
  const { handleUnpublish } = useUnpublishFromCommunity({
    communityId: 'community-1',
    postId: 'post-1',
  })
  const [result, setResult] = useState('idle')
  return (
    <button
      type='button'
      onClick={() => {
        void handleUnpublish().then(ok => setResult(String(ok)))
      }}
    >
      {result}
    </button>
  )
}

describe('useUnpublishFromCommunity', () => {
  it('returns true after the community post is unpublished', async () => {
    mockUnpublish.mockResolvedValueOnce(undefined)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('button', { name: 'true' })).toBeDefined()
    expect(mockUnpublish).toHaveBeenCalledWith('community-1', 'post-1')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('returns false and reports the failure', async () => {
    mockUnpublish.mockRejectedValueOnce(new Error('unavailable'))
    render(<Harness />)
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('button', { name: 'false' })).toBeDefined()
    expect(mockToastError).toHaveBeenCalledWith('Failed to unpublish post. Please try again.')
  })
})
