import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StructuredDataScript } from './structured-data-script'

describe('StructuredDataScript', () => {
  it('renders JSON-LD with its nonce and data-pw', () => {
    const { container } = render(
      <StructuredDataScript
        data={{ '@type': 'Thing', name: '<script>unsafe</script>' }}
        nonce='nonce-123'
      />,
    )

    const script = container.querySelector<HTMLScriptElement>('[data-pw="structured-data-script"]')
    expect(script).not.toBeNull()
    expect(script?.id).toBe('ld-Thing')
    expect(script?.nonce).toBe('nonce-123')
    expect(JSON.parse(script?.textContent ?? '')).toEqual({
      '@type': 'Thing',
      name: '<script>unsafe</script>',
    })
  })

  it('uses string-array types in the DOM id without changing JSON-LD', () => {
    const { container } = render(<StructuredDataScript data={{ '@type': ['Thing', 'Person'] }} />)
    const script = container.querySelector<HTMLScriptElement>('script[data-pw]')

    expect(script?.id).toBe('ld-Thing-Person')
    expect(JSON.parse(script?.textContent ?? '')).toEqual({ '@type': ['Thing', 'Person'] })
  })

  it('falls back to a stable DOM id for unsupported type values', () => {
    const { container } = render(<StructuredDataScript data={{ '@type': { name: 'Thing' } }} />)
    expect(container.querySelector<HTMLScriptElement>('script[data-pw]')?.id).toBe('ld-json')
  })
})
