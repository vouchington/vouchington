import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownContent } from '../markdown-content'
import { renderHtmlFragment } from '../html-fragment'
import type { SafeHtmlFragment } from '@/lib/html/safe-html-fragment'

vi.mock(
  import('shiki'),
  () =>
    ({
      bundledLanguages: {},
      getSingletonHighlighter: vi.fn<VitestLooseMock>(),
    }) as unknown as typeof import('shiki'),
)

vi.mock(import('../markdown-content-enhancer'), () => ({
  MarkdownContentEnhancer: ({
    html,
    features,
  }: {
    html: SafeHtmlFragment
    features: { code?: boolean; images?: boolean; eagerFirstImage?: boolean; utm?: boolean }
  }) => (
    <div
      data-testid='enhancer'
      data-code={String(features.code ?? false)}
      data-images={String(features.images ?? false)}
      data-eager-first-image={String(features.eagerFirstImage ?? false)}
      data-utm={String(features.utm ?? false)}
    >
      {renderHtmlFragment(html)}
    </div>
  ),
}))

describe('MarkdownContent', () => {
  it('renders HTML content via parsed React nodes when html prop is provided', () => {
    render(<MarkdownContent html='<p>Hello <strong>world</strong></p>' />)
    expect(screen.getByText('world')).toBeInTheDocument()
  })

  it('renders safe HTML attributes without inline styles or event handlers', () => {
    const { container } = render(
      <MarkdownContent html='<p class="body" data-kind="post" style="color:red" onclick="alert(1)"><a href="javascript:alert(1)">Hello</a><img src="data:image/png;base64,abc" alt="bad"></p>' />,
    )

    const paragraph = container.querySelector('p')
    const link = container.querySelector('a')
    const image = container.querySelector('img')
    expect(paragraph).toHaveClass('body')
    expect(paragraph).toHaveAttribute('data-kind', 'post')
    expect(paragraph).not.toHaveAttribute('style')
    expect(paragraph).not.toHaveAttribute('onclick')
    expect(link).not.toHaveAttribute('href')
    expect(image).not.toHaveAttribute('src')
    expect(image).toHaveAttribute('alt', 'bad')
  })

  it('renders raw markdown text in pre element when only markdown is provided', () => {
    const { container } = render(<MarkdownContent markdown='# Hello\n**bold**' />)
    const pre = container.querySelector('pre')
    expect(pre).toBeInTheDocument()
    expect(pre?.textContent).toContain('# Hello')
    expect(pre?.textContent).toContain('**bold**')
  })

  it('renders nothing when neither html nor markdown is provided', () => {
    const { container } = render(<MarkdownContent />)
    expect(container.firstChild).toBeNull()
  })

  it('markdown fallback does not inject HTML or execute scripts (XSS safety)', () => {
    const { container } = render(<MarkdownContent markdown='<script>alert("xss")</script>' />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
  })

  it('prefers html over markdown when both are provided', () => {
    const { container } = render(
      <MarkdownContent
        html='<p>HTML</p>'
        markdown='markdown text'
      />,
    )
    expect(container.querySelector('div')).toBeInTheDocument()
    expect(container.querySelector('pre')).toBeNull()
  })

  it('applies className to rendered element', () => {
    const { container } = render(
      <MarkdownContent
        html='<p>test</p>'
        className='my-class'
      />,
    )
    expect(container.firstChild).toHaveClass('my-class')
  })

  it('renders MarkdownContentEnhancer when features.code is true', () => {
    render(
      <MarkdownContent
        html='<pre><code class="language-ts">const x = 1</code></pre>'
        features={{ code: true }}
      />,
    )
    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer).toBeInTheDocument()
    expect(enhancer).toHaveAttribute('data-code', 'true')
    expect(enhancer).toHaveAttribute('data-images', 'false')
  })

  it('renders MarkdownContentEnhancer when features.images is true', () => {
    render(
      <MarkdownContent
        html='<img src="/sideload/example" alt="test" />'
        features={{ images: true }}
      />,
    )
    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer).toBeInTheDocument()
    expect(enhancer).toHaveAttribute('data-code', 'false')
    expect(enhancer).toHaveAttribute('data-images', 'true')
  })

  it('renders MarkdownContentEnhancer with both features when both are true', () => {
    render(
      <MarkdownContent
        html='<p>content</p>'
        features={{ code: true, images: true }}
      />,
    )
    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer).toHaveAttribute('data-code', 'true')
    expect(enhancer).toHaveAttribute('data-images', 'true')
  })

  it('renders MarkdownContentEnhancer when features.utm is true', () => {
    render(
      <MarkdownContent
        html='<p><a href="https://example.com">external</a></p>'
        features={{ utm: true }}
      />,
    )
    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer).toBeInTheDocument()
    expect(enhancer).toHaveAttribute('data-code', 'false')
    expect(enhancer).toHaveAttribute('data-images', 'false')
    expect(enhancer).toHaveAttribute('data-utm', 'true')
  })

  it('passes sanitized HTML to MarkdownContentEnhancer', () => {
    render(
      <MarkdownContent
        html='<p onclick="alert(1)"><a href="javascript:alert(1)">External</a><script>alert(1)</script></p>'
        features={{ utm: true }}
      />,
    )

    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer.querySelector('p')).not.toHaveAttribute('onclick')
    expect(enhancer.querySelector('a')).not.toHaveAttribute('href')
    expect(enhancer.querySelector('script')).toBeNull()
    expect(enhancer.textContent).toBe('External')
  })

  it('does not render MarkdownContentEnhancer when features are absent', () => {
    render(<MarkdownContent html='<p>test</p>' />)
    expect(screen.queryByTestId('enhancer')).toBeNull()
  })

  it('does not render MarkdownContentEnhancer when features are all false', () => {
    render(
      <MarkdownContent
        html='<p>test</p>'
        features={{ code: false, images: false, utm: false }}
      />,
    )
    expect(screen.queryByTestId('enhancer')).toBeNull()
  })

  it('renders MarkdownContentEnhancer when features.eagerFirstImage is true', () => {
    render(
      <MarkdownContent
        html='<img src="/sideload/example" alt="test" />'
        features={{ eagerFirstImage: true }}
      />,
    )
    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer).toBeInTheDocument()
    expect(enhancer).toHaveAttribute('data-eager-first-image', 'true')
  })

  it('demotes headings in preview HTML before enhancement', () => {
    render(
      <MarkdownContent
        html='<h1 class="title">Top</h1><p data-example="<h1>">Attr</p><h2>Nested</h2>'
        features={{ utm: true }}
        preview
      />,
    )

    const enhancer = screen.getByTestId('enhancer')
    expect(enhancer.querySelector('h1')).toBeNull()
    expect(enhancer.querySelector('h3')?.textContent).toBe('Top')
    expect(enhancer.querySelector('h3')).toHaveClass('title')
    expect(enhancer.querySelector('p')?.getAttribute('data-example')).toBe('<h1>')
    expect(enhancer.querySelector('h4')?.textContent).toBe('Nested')
  })
})
