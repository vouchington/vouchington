import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PostImage } from '../post-image'

const mockImage = vi.hoisted(() => vi.fn<VitestLooseMock>().mockReturnValue(null))

vi.mock(import('../proxied-image'), () => ({ ProxiedImage: mockImage }))

describe('PostImage', () => {
  it('preloads a priority image and does not preload by default', () => {
    const placement = { id: 'placement-1', revision: 1 }
    const { rerender } = render(
      <PostImage
        imageId='image-1'
        width={640}
        placement={placement}
        priority
      />,
    )

    expect(mockImage.mock.calls.at(-1)?.[0]).toMatchObject({ preload: true })

    rerender(
      <PostImage
        imageId='image-1'
        width={640}
        placement={placement}
      />,
    )

    expect(mockImage.mock.calls.at(-1)?.[0]).toMatchObject({ preload: undefined })
  })
})
