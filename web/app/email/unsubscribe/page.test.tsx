import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UnsubscribePage, { dynamic, metadata } from './page'

describe('UnsubscribePage', () => {
  it('renders the public unsubscribe form with the query token', async () => {
    render(await UnsubscribePage({ searchParams: Promise.resolve({ token: 'signed-token' }) }))

    expect(screen.getByRole('heading', { name: 'Unsubscribe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled()
    expect(dynamic).toBe('force-dynamic')
    expect(metadata).toBeDefined()
  })

  it('disables the form when the token is missing', async () => {
    render(await UnsubscribePage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDisabled()
  })
})
