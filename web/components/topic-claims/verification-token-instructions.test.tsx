import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DnsInstructions, WellKnownInstructions } from './verification-token-instructions'

const token = {
  dns_instructions: { hostname: '_voucha.example.com', value: 'tok-abc' },
  well_known_instructions: {
    url: 'https://example.com/.well-known/voucha',
    file_content: 'tok-abc',
  },
}

describe('DnsInstructions', () => {
  it('renders hostname and value', () => {
    render(
      <DnsInstructions
        token={token}
        copied={false}
        loadingVerify={false}
        onCopy={vi.fn<() => void>()}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByText('_voucha.example.com')).toBeInTheDocument()
    expect(screen.getByText('tok-abc')).toBeInTheDocument()
  })

  it('renders Copy value button', () => {
    render(
      <DnsInstructions
        token={token}
        copied={false}
        loadingVerify={false}
        onCopy={vi.fn<() => void>()}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByRole('button', { name: /copy value/i })).toBeInTheDocument()
  })

  it('shows Copied! when copied is true', () => {
    render(
      <DnsInstructions
        token={token}
        copied
        loadingVerify={false}
        onCopy={vi.fn<() => void>()}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByRole('button', { name: /copied!/i })).toBeInTheDocument()
  })

  it('calls onCopy with the dns value when clicked', () => {
    const onCopy = vi.fn<() => void>()
    render(
      <DnsInstructions
        token={token}
        copied={false}
        loadingVerify={false}
        onCopy={onCopy}
        onVerify={vi.fn<() => void>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /copy value/i }))
    expect(onCopy).toHaveBeenCalledWith('tok-abc')
  })

  it('calls onVerify when Verify now is clicked', () => {
    const onVerify = vi.fn<() => void>()
    render(
      <DnsInstructions
        token={token}
        copied={false}
        loadingVerify={false}
        onCopy={vi.fn<() => void>()}
        onVerify={onVerify}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /verify now/i }))
    expect(onVerify).toHaveBeenCalled()
  })

  it('shows Checking... when loadingVerify is true', () => {
    render(
      <DnsInstructions
        token={token}
        copied={false}
        loadingVerify
        onCopy={vi.fn<() => void>()}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()
  })

  it('has data-pw on verify button', () => {
    const { container } = render(
      <DnsInstructions
        token={token}
        copied={false}
        loadingVerify={false}
        onCopy={vi.fn<() => void>()}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(container.querySelector('[data-pw="verify-domain"]')).not.toBeNull()
  })
})

describe('WellKnownInstructions', () => {
  it('renders the well-known URL', () => {
    render(
      <WellKnownInstructions
        token={token}
        loadingVerify={false}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByText('https://example.com/.well-known/voucha')).toBeInTheDocument()
  })

  it('renders the file content', () => {
    render(
      <WellKnownInstructions
        token={token}
        loadingVerify={false}
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByText('tok-abc')).toBeInTheDocument()
  })

  it('calls onVerify when Verify now is clicked', () => {
    const onVerify = vi.fn<() => void>()
    render(
      <WellKnownInstructions
        token={token}
        loadingVerify={false}
        onVerify={onVerify}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /verify now/i }))
    expect(onVerify).toHaveBeenCalled()
  })

  it('shows Checking... when loadingVerify is true', () => {
    render(
      <WellKnownInstructions
        token={token}
        loadingVerify
        onVerify={vi.fn<() => void>()}
      />,
    )
    expect(screen.getByRole('button', { name: /checking/i })).toBeDisabled()
  })
})
