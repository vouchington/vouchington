import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NO_VARY_SEARCH_HEADER } from '@/lib/seo/navigation-performance'
import { SpeculationRulesScript } from './speculation-rules-script'

describe('SpeculationRulesScript', () => {
  it('renders nonce-bearing speculation rules JSON', () => {
    const { container } = render(<SpeculationRulesScript nonce='nonce-1' />)
    const script = container.querySelector<HTMLScriptElement>('#navigation-speculation-rules')

    expect(script?.type).toBe('speculationrules')
    expect(script?.nonce).toBe('nonce-1')
    const rules = JSON.parse(script?.textContent ?? '') as {
      prefetch: Array<{ expects_no_vary_search: string }>
    }
    expect(rules.prefetch[0]?.expects_no_vary_search).toBe(NO_VARY_SEARCH_HEADER)
  })
})
