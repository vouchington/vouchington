import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HealthzPage from './page'

describe('HealthzPage', () => {
  it('renders an ok marker', () => {
    render(<HealthzPage />)

    expect(screen.getByText('ok')).toBeDefined()
  })
})
