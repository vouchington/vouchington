import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
    expect(rules.prefetch[0]?.expects_no_vary_search).toBe(
      'params=("utm_source" "utm_medium" "utm_campaign" "utm_term" "utm_content" "gclid" "gbraid" "wbraid" "dclid" "fbclid" "msclkid" "ttclid" "twclid" "srsltid" "igshid" "igsh" "_gl" "mc_cid" "mc_eid"), key-order',
    )
  })
})
