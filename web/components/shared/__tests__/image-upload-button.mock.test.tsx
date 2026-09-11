import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { ImageUploadButton } from '../image-upload-button'

vi.mock(import('@/lib/api/client/images'), () => {
  class ImageBlockedError extends Error {}
  class ImageProcessingTimeoutError extends Error {}
  return {
    uploadImageFile: vi.fn<VitestLooseMock>(),
    ImageBlockedError,
    ImageProcessingTimeoutError,
  } as unknown as typeof import('@/lib/api/client/images')
})

vi.mock(import('@/lib/utils/image-types'), () => ({
  SUPPORTED_IMAGE_ACCEPT: 'image/*',
  validateImageFile: vi.fn<VitestLooseMock>(() => null),
}))

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError, success: mockToastSuccess },
    }) as unknown as typeof import('sonner'),
)

import { uploadImageFile } from '@/lib/api/client/images'
import { validateImageFile } from '@/lib/utils/image-types'

const mockUploadImageFile = vi.mocked(uploadImageFile)
const mockValidateImageFile = vi.mocked(validateImageFile)

function makeFile(name: string, type = 'image/jpeg') {
  return new File(['content'], name, { type })
}

function getFileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

describe('ImageUploadButton', () => {
  beforeEach(() => {
    mockUploadImageFile.mockClear()
    mockValidateImageFile.mockClear()
    mockToastError.mockClear()
    mockValidateImageFile.mockReturnValue(null)
  })

  describe('single-file mode (default)', () => {
    it('renders default data-pw attributes for the trigger and input', () => {
      const { container } = render(<ImageUploadButton onUploaded={vi.fn<VitestLooseMock>()} />)

      expect(container.querySelector('[data-pw="image-upload-button-trigger"]')).not.toBeNull()
      expect(container.querySelector('[data-pw="image-upload-button"]')).not.toBeNull()
    })

    it('uploads a single file and calls onUploaded', async () => {
      mockUploadImageFile.mockResolvedValue('img-1')
      const onUploaded = vi.fn<VitestLooseMock>()
      render(<ImageUploadButton onUploaded={onUploaded} />)

      const file = makeFile('photo.jpg')
      fireEvent.change(getFileInput(), { target: { files: [file] } })

      await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('img-1'))
    })

    it('does not set multiple attribute when multiple prop is not set', () => {
      render(<ImageUploadButton onUploaded={vi.fn<VitestLooseMock>()} />)
      expect(getFileInput().multiple).toBe(false)
    })

    it('shows validation error and does not upload', async () => {
      mockValidateImageFile.mockReturnValue('Unsupported format')
      const onUploaded = vi.fn<VitestLooseMock>()
      render(<ImageUploadButton onUploaded={onUploaded} />)

      fireEvent.change(getFileInput(), {
        target: { files: [makeFile('doc.pdf', 'application/pdf')] },
      })

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Unsupported format'))
      expect(mockUploadImageFile).not.toHaveBeenCalled()
      expect(onUploaded).not.toHaveBeenCalled()
    })

    it('shows error toast when upload fails', async () => {
      mockUploadImageFile.mockRejectedValue(new Error('Network error'))
      const onUploaded = vi.fn<VitestLooseMock>()
      render(<ImageUploadButton onUploaded={onUploaded} />)

      fireEvent.change(getFileInput(), { target: { files: [makeFile('photo.jpg')] } })

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to upload image. Please try again.'),
      )
      expect(onUploaded).not.toHaveBeenCalled()
    })
  })

  describe('multiple-file mode', () => {
    it('sets multiple attribute on the input', () => {
      render(
        <ImageUploadButton
          onUploaded={vi.fn<VitestLooseMock>()}
          multiple
        />,
      )
      expect(getFileInput().multiple).toBe(true)
    })

    it('uploads multiple files in parallel and calls onUploaded for each', async () => {
      mockUploadImageFile
        .mockResolvedValueOnce('img-1')
        .mockResolvedValueOnce('img-2')
        .mockResolvedValueOnce('img-3')
      const onUploaded = vi.fn<VitestLooseMock>()

      render(
        <ImageUploadButton
          onUploaded={onUploaded}
          multiple
        />,
      )

      const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]
      fireEvent.change(getFileInput(), { target: { files } })

      await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(3))
      expect(onUploaded).toHaveBeenCalledWith('img-1')
      expect(onUploaded).toHaveBeenCalledWith('img-2')
      expect(onUploaded).toHaveBeenCalledWith('img-3')
      expect(mockUploadImageFile).toHaveBeenCalledTimes(3)
    })

    it('slices to maxFiles and shows a warning toast', async () => {
      mockUploadImageFile.mockResolvedValue('img-x')
      const onUploaded = vi.fn<VitestLooseMock>()

      render(
        <ImageUploadButton
          onUploaded={onUploaded}
          multiple
          maxFiles={2}
        />,
      )

      const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]
      fireEvent.change(getFileInput(), { target: { files } })

      await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2))
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('2 more image'))
      expect(mockUploadImageFile).toHaveBeenCalledTimes(2)
    })

    it('skips invalid files but uploads valid ones', async () => {
      mockValidateImageFile.mockImplementation((file: File) =>
        file.name.endsWith('.pdf') ? 'Unsupported format' : null,
      )
      mockUploadImageFile.mockResolvedValue('img-valid')
      const onUploaded = vi.fn<VitestLooseMock>()

      render(
        <ImageUploadButton
          onUploaded={onUploaded}
          multiple
        />,
      )

      const files = [makeFile('good.jpg'), makeFile('bad.pdf', 'application/pdf')]
      fireEvent.change(getFileInput(), { target: { files } })

      await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('img-valid'))
      expect(mockUploadImageFile).toHaveBeenCalledTimes(1)
      expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('bad.pdf'))
    })

    it('shows aggregated error toast when some uploads fail', async () => {
      mockUploadImageFile
        .mockResolvedValueOnce('img-1')
        .mockRejectedValueOnce(new Error('Network error'))
      const onUploaded = vi.fn<VitestLooseMock>()

      render(
        <ImageUploadButton
          onUploaded={onUploaded}
          multiple
        />,
      )

      const files = [makeFile('a.jpg'), makeFile('b.jpg')]
      fireEvent.change(getFileInput(), { target: { files } })

      await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1))
      expect(mockToastError).toHaveBeenCalledWith('1 of 2 images failed to upload or process.')
    })

    it('shows a generic error toast when all uploads fail', async () => {
      mockUploadImageFile.mockRejectedValue(new Error('Network error'))
      const onUploaded = vi.fn<VitestLooseMock>()

      render(
        <ImageUploadButton
          onUploaded={onUploaded}
          multiple
        />,
      )

      fireEvent.change(getFileInput(), { target: { files: [makeFile('a.jpg')] } })

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to upload image. Please try again.'),
      )
      expect(onUploaded).not.toHaveBeenCalled()
    })
  })
})
