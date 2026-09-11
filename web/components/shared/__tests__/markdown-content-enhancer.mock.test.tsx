import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MarkdownContentEnhancer } from '../markdown-content-enhancer'
import { sanitizeHtmlFragment, type SafeHtmlFragment } from '@/lib/html/safe-html-fragment'

const mockImage = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/image'),
  () =>
    ({
      default: mockImage,
    }) as unknown as typeof import('next/image'),
)

vi.mock(import('../markdown-code-block-highlighter'), () => ({
  highlightCodeBlocks: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

vi.mock(
  import('shiki'),
  () =>
    ({
      bundledLanguages: {},
      getSingletonHighlighter: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('shiki'),
)

function getImageCalls(mock: Mock) {
  return mock.mock.calls.map((args: unknown[]) => {
    const props = args[0] as { src: string; priority?: boolean; loading?: string }
    return {
      src: props.src,
      priority: props.priority ?? false,
      loading: props.loading ?? null,
    }
  })
}

const safe = sanitizeHtmlFragment

describe('MarkdownContentEnhancer', () => {
  beforeEach(() => {
    mockImage.mockClear()
  })

  describe('utm', () => {
    it('rewrites external anchors when utm is true', async () => {
      render(
        <MarkdownContentEnhancer
          html={safe('<a href="https://example.com/path?x=1">External</a>')}
          features={{ utm: true }}
        />,
      )

      const link = screen.getByRole('link', { name: 'External' })
      await waitFor(() => {
        expect(link).toHaveAttribute(
          'href',
          'https://example.com/path?x=1&utm_source=voucha.ai&utm_medium=referral',
        )
      })
    })

    it('does not rewrite external anchors when utm is false', async () => {
      render(
        <MarkdownContentEnhancer
          html={safe('<a href="https://example.com/path">External</a>')}
          features={{ utm: false }}
        />,
      )

      const link = screen.getByRole('link', { name: 'External' })
      await waitFor(() => {
        expect(link).toHaveAttribute('href', 'https://example.com/path')
      })
    })

    it('keeps data-no-utm anchors unchanged when utm is true', async () => {
      render(
        <MarkdownContentEnhancer
          html={safe('<a href="https://example.com/path" data-no-utm>External</a>')}
          features={{ utm: true }}
        />,
      )

      const link = screen.getByRole('link', { name: 'External' })
      await waitFor(() => {
        expect(link).toHaveAttribute('href', 'https://example.com/path')
      })
    })
  })

  describe('eagerFirstImage', () => {
    it('restores hidden images and removes portal targets during cleanup', async () => {
      mockImage.mockReturnValue(null)
      const { unmount, container } = render(
        <MarkdownContentEnhancer
          html={safe('<img src="/images/img-1?w=640" alt="First" />')}
          features={{ images: true }}
        />,
      )
      const original = container.querySelector('img')!

      await waitFor(() => expect(original.style.display).toBe('none'))
      const parent = original.parentElement!
      expect(parent.childElementCount).toBe(2)
      unmount()

      expect(original.style.display).toBe('')
      expect(parent.childElementCount).toBe(1)
    })

    it('rediscovers image portals when html changes', async () => {
      mockImage.mockReturnValue(null)
      const { rerender } = render(
        <MarkdownContentEnhancer
          html={safe('<img src="/images/a" alt="A" />')}
          features={{ images: true }}
        />,
      )
      await waitFor(() => expect(mockImage).toHaveBeenCalled())
      mockImage.mockClear()

      rerender(
        <MarkdownContentEnhancer
          html={safe('<img src="/images/b" alt="B" />')}
          features={{ images: true }}
        />,
      )

      await waitFor(() => expect(getImageCalls(mockImage).at(-1)?.src).toBe('/images/b'))
    })

    it('restores the prior display style when image enhancement is disabled', async () => {
      mockImage.mockReturnValue(null)
      const html =
        '<img src="/images/a" alt="A" style="display: inline-block" />' as SafeHtmlFragment
      const { rerender, container } = render(
        <MarkdownContentEnhancer
          html={html}
          features={{ images: true }}
        />,
      )
      await waitFor(() => expect(container.querySelector('img')?.style.display).toBe('none'))

      rerender(
        <MarkdownContentEnhancer
          html={html}
          features={{ images: false }}
        />,
      )

      await waitFor(() =>
        expect(container.querySelector('img')?.style.display).toBe('inline-block'),
      )
    })

    it('first image is eager and second is lazy when eagerFirstImage=true', async () => {
      mockImage.mockReturnValue(null)
      const html =
        '<img src="/images/img-1?w=640" alt="First" /><img src="/images/img-2?w=640" alt="Second" />'

      render(
        <MarkdownContentEnhancer
          html={safe(html)}
          features={{ images: true, eagerFirstImage: true }}
        />,
      )

      await waitFor(() => {
        // useEffect fires after first render; portals re-render the images via next/image mock
        expect(mockImage).toHaveBeenCalled()
      })

      const calls = getImageCalls(mockImage)
      expect(calls[0]?.priority).toBe(true)
      expect(calls[0]?.loading).toBeNull()
      expect(calls[1]?.priority).toBe(false)
      expect(calls[1]?.loading).toBe('lazy')
    })

    it('appends w= to /sideload/ URLs without an existing w param', async () => {
      mockImage.mockReturnValue(null)
      const html = '<img src="/sideload/abc" width="800" height="600" alt="sideload" />'

      render(
        <MarkdownContentEnhancer
          html={safe(html)}
          features={{ images: true }}
        />,
      )

      await waitFor(() => {
        expect(mockImage).toHaveBeenCalled()
      })

      const calls = getImageCalls(mockImage)
      expect(calls[0]?.src).toBe('/sideload/abc?w=800')
    })

    it('preserves an existing w= on /sideload/ URLs instead of appending a second', async () => {
      mockImage.mockReturnValue(null)
      const html =
        '<img src="/sideload/abc?w=1200&sig=xyz" width="800" height="600" alt="sideload" />'

      render(
        <MarkdownContentEnhancer
          html={safe(html)}
          features={{ images: true }}
        />,
      )

      await waitFor(() => {
        expect(mockImage).toHaveBeenCalled()
      })

      const calls = getImageCalls(mockImage)
      expect(calls[0]?.src).toBe('/sideload/abc?w=1200&sig=xyz')
    })

    it('appends w= to an absolute image-origin sideload URL', async () => {
      mockImage.mockReturnValue(null)
      window.__IMAGE_ORIGIN__ = 'https://images.example.com'
      const html =
        '<img src="https://images.example.com/sideload/abc?sig=xyz" width="800" height="600" alt="sideload" />'

      render(
        <MarkdownContentEnhancer
          html={safe(html)}
          features={{ images: true }}
        />,
      )

      await waitFor(() => {
        expect(mockImage).toHaveBeenCalled()
      })

      const calls = getImageCalls(mockImage)
      expect(calls[0]?.src).toBe('https://images.example.com/sideload/abc?sig=xyz&w=800')
      delete window.__IMAGE_ORIGIN__
    })

    it('all images are lazy when eagerFirstImage is not set', async () => {
      mockImage.mockReturnValue(null)
      const html =
        '<img src="/images/img-1?w=640" alt="First" /><img src="/images/img-2?w=640" alt="Second" />'

      render(
        <MarkdownContentEnhancer
          html={safe(html)}
          features={{ images: true }}
        />,
      )

      await waitFor(() => {
        expect(mockImage).toHaveBeenCalled()
      })

      const calls = getImageCalls(mockImage)
      expect(calls[0]?.priority).toBe(false)
      expect(calls[0]?.loading).toBe('lazy')
      expect(calls[1]?.loading).toBe('lazy')
    })
  })
})
