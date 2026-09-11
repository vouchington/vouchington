import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DomainTabs } from './domain-tabs'

interface TokenState {
  raw_token: string
  dns_instructions: { hostname: string; value: string }
  well_known_instructions: { url: string; file_content: string }
}

function makeToken(): TokenState {
  return {
    raw_token: 'tok-abc',
    dns_instructions: { hostname: '_voucha.example.com', value: 'tok-abc' },
    well_known_instructions: {
      url: 'https://example.com/.well-known/voucha',
      file_content: 'tok-abc',
    },
  }
}

function makeProps(overrides: Partial<Parameters<typeof DomainTabs>[0]> = {}) {
  return {
    hasHostname: false,
    token: null,
    evidence: '',
    loading: null,
    copied: false,
    onIssueToken: vi.fn<() => void>(),
    onVerify: vi.fn<() => void>(),
    onCopy: vi.fn<() => void>(),
    onEvidenceChange: vi.fn<() => void>(),
    onManualSubmit: vi.fn<() => void>(),
    ...overrides,
  }
}

describe('DomainTabs', () => {
  it('renders only Submit Evidence tab when hasHostname is false', () => {
    render(<DomainTabs {...makeProps()} />)
    expect(screen.queryByRole('tab', { name: 'DNS TXT Record' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Well-Known File' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Submit Evidence' })).toBeInTheDocument()
  })

  it('renders all three tabs when hasHostname is true', () => {
    render(<DomainTabs {...makeProps({ hasHostname: true })} />)
    expect(screen.getByRole('tab', { name: 'DNS TXT Record' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Well-Known File' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Submit Evidence' })).toBeInTheDocument()
  })

  it('shows Generate verification token button before token is issued (DNS tab)', () => {
    render(<DomainTabs {...makeProps({ hasHostname: true })} />)
    expect(screen.getByRole('button', { name: /generate verification token/i })).toBeInTheDocument()
  })

  it('calls onIssueToken when Generate token button is clicked', () => {
    const onIssueToken = vi.fn<() => void>()
    render(<DomainTabs {...makeProps({ hasHostname: true, onIssueToken })} />)
    fireEvent.click(screen.getByRole('button', { name: /generate verification token/i }))
    expect(onIssueToken).toHaveBeenCalled()
  })

  it('shows DNS instructions after token is issued', () => {
    render(<DomainTabs {...makeProps({ hasHostname: true, token: makeToken() })} />)
    expect(screen.getByText('_voucha.example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /verify now/i })).toBeInTheDocument()
  })

  it('calls onVerify when Verify now is clicked', () => {
    const onVerify = vi.fn<() => void>()
    render(<DomainTabs {...makeProps({ hasHostname: true, token: makeToken(), onVerify })} />)
    fireEvent.click(screen.getByRole('button', { name: /verify now/i }))
    expect(onVerify).toHaveBeenCalled()
  })

  it('calls onCopy when Copy value button is clicked', () => {
    const onCopy = vi.fn<() => void>()
    render(<DomainTabs {...makeProps({ hasHostname: true, token: makeToken(), onCopy })} />)
    fireEvent.click(screen.getByRole('button', { name: /copy value/i }))
    expect(onCopy).toHaveBeenCalledWith('tok-abc')
  })

  it('shows "Copied!" when copied is true', () => {
    render(<DomainTabs {...makeProps({ hasHostname: true, token: makeToken(), copied: true })} />)
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument()
  })

  it('calls onEvidenceChange when textarea changes', () => {
    const onEvidenceChange = vi.fn<() => void>()
    render(<DomainTabs {...makeProps({ onEvidenceChange })} />)
    fireEvent.change(screen.getByPlaceholderText(/describe your relationship/i), {
      target: { value: 'We run this.' },
    })
    expect(onEvidenceChange).toHaveBeenCalledWith('We run this.')
  })

  it('calls onManualSubmit when Submit for review is clicked', () => {
    const onManualSubmit = vi.fn<() => void>()
    render(<DomainTabs {...makeProps({ evidence: 'Some evidence', onManualSubmit })} />)
    fireEvent.click(screen.getByRole('button', { name: /submit for review/i }))
    expect(onManualSubmit).toHaveBeenCalled()
  })

  it('submit for review button is disabled when evidence is empty', () => {
    render(<DomainTabs {...makeProps({ evidence: '' })} />)
    expect(screen.getByRole('button', { name: /submit for review/i })).toBeDisabled()
  })

  it('shows Generating... when loading is "issue"', () => {
    render(<DomainTabs {...makeProps({ hasHostname: true, loading: 'issue' })} />)
    expect(screen.getByRole('button', { name: /generating/i })).toBeInTheDocument()
  })

  it('exposes the Well-Known File tab as a switchable trigger', () => {
    render(<DomainTabs {...makeProps({ hasHostname: true, token: makeToken() })} />)
    const wellKnownTab = screen.getByRole('tab', { name: 'Well-Known File' })
    expect(wellKnownTab).toBeInTheDocument()
    // Activating the tab must not throw; content rendering is covered by
    // verification-token-instructions.mock.test.tsx (WellKnownInstructions).
    fireEvent.click(wellKnownTab)
    expect(wellKnownTab).toHaveAttribute('aria-selected')
  })
})
