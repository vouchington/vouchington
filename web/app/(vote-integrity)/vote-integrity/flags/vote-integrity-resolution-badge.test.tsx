import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResolutionBadge } from './vote-integrity-resolution-badge'

describe('ResolutionBadge', () => {
  it.each([
    ['dismissed', 'Dismissed'],
    ['penalized', 'Penalized'],
    ['suspended', 'Suspended'],
  ] as const)('renders the %s resolution', (resolution, label) => {
    render(<ResolutionBadge resolution={resolution} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
