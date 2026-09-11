import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResolutionBadge } from './vote-integrity-resolution-badge'

describe('ResolutionBadge', () => {
  it.each([
    ['dismissed', 'Dismissed', 'bg-gray-100'],
    ['penalized', 'Penalized', 'bg-orange-100'],
    ['suspended', 'Suspended', 'bg-red-100'],
  ] as const)('renders the %s resolution', (resolution, label, className) => {
    render(<ResolutionBadge resolution={resolution} />)
    expect(screen.getByText(label)).toHaveClass(className)
  })
})
