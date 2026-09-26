import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UploadImagePreview } from './upload-image-preview'

describe('local upload preview', () => {
  const create = vi.fn<(file: Blob) => string>()
  const revoke = vi.fn<(url: string) => void>()
  beforeEach(() => {
    create.mockReset().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    revoke.mockReset()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create
        static revokeObjectURL = revoke
      },
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('replaces and revokes selected-file object URLs on replacement and unmount', () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' })
    const second = new File(['second'], 'second.png', { type: 'image/png' })
    const { rerender, unmount } = render(
      <UploadImagePreview
        file={first}
        alt='Draft image'
      />,
    )
    expect(create).toHaveBeenCalledWith(first)
    expect(screen.getByAltText('Draft image')).toHaveAttribute('src', 'blob:first')
    rerender(
      <UploadImagePreview
        file={second}
        alt='Draft image'
      />,
    )
    expect(revoke).toHaveBeenCalledWith('blob:first')
    expect(create).toHaveBeenCalledWith(second)
    expect(screen.getByAltText('Draft image')).toHaveAttribute('src', 'blob:second')
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:second')
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it('shows an accessible fallback and revokes undecodable local bytes without public delivery', () => {
    const file = new File(['heic'], 'camera.heic', { type: 'image/heic' })
    render(
      <UploadImagePreview
        file={file}
        alt='Draft image'
      />,
    )
    fireEvent.error(screen.getByAltText('Draft image'))
    expect(screen.queryByAltText('Draft image')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Image uploaded. Preview unavailable.')
    expect(revoke).toHaveBeenCalledWith('blob:first')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('recovers from failed decoding when a different selected file replaces it', () => {
    const first = new File(['heic'], 'camera.heic', { type: 'image/heic' })
    const second = new File(['png'], 'second.png', { type: 'image/png' })
    const { rerender } = render(
      <UploadImagePreview
        file={first}
        alt='Draft image'
      />,
    )
    fireEvent.error(screen.getByAltText('Draft image'))
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(
      <UploadImagePreview
        file={second}
        alt='Draft image'
      />,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByAltText('Draft image')).toHaveAttribute('src', 'blob:second')
    expect(create).toHaveBeenCalledWith(second)
    expect(revoke).toHaveBeenCalledWith('blob:first')
  })
})
