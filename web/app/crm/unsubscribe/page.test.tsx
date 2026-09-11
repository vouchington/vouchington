import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CrmUnsubscribePage, { dynamic, metadata } from './page'

describe('CrmUnsubscribePage', () => {
  it('renders the public unsubscribe form with the query token', async () => {
    render(await CrmUnsubscribePage({ searchParams: Promise.resolve({ token: 'signed-token' }) }))

    expect(screen.getByRole('heading', { name: 'Unsubscribe' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled()
    expect(dynamic).toBe('force-dynamic')
    expect(metadata).toBeDefined()
  })

  it('disables the form when the token is missing', async () => {
    render(await CrmUnsubscribePage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeDisabled()
  })
})
