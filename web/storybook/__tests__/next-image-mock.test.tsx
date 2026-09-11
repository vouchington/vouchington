import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Image from '../mocks/next-image'

describe('next/image Storybook browser mock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('omits Next-only props from the rendered img element', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const html = renderToStaticMarkup(
      <Image
        src='/topic.png'
        alt='Topic logo'
        width={32}
        height={32}
        unoptimized
      />,
    )

    expect(html).toContain('alt="Topic logo"')
    expect(html).not.toContain('unoptimized')
    expect(consoleError).not.toHaveBeenCalled()
  })
})
