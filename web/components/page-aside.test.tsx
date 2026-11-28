import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PageAside } from './page-aside'

describe('PageAside', () => {
  it('renders nothing when no children', () => {
    const { container } = render(<PageAside />)
    expect(container.firstChild).toBeNull()
  })
})
