import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { DeletedUserPreservationHoldPanel } from '../deleted-user-preservation-hold-panel'

let translate!: (key: MessageKey, params?: Record<string, unknown>) => string

vi.mock(import('@/lib/i18n/get-translations'), () => ({
  getTranslations: () => Promise.resolve(translate),
}))

vi.mock(import('../user-preservation-hold-card'), () => ({
  UserPreservationHoldCard: ({
    userId,
    isAccountDeleted,
  }: {
    userId: string
    isAccountDeleted?: boolean
  }) => (
    <div
      data-testid='preservation-hold-card'
      data-user-id={userId}
      data-account-deleted={isAccountDeleted}
    />
  ),
}))

describe('DeletedUserPreservationHoldPanel', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })

  it('shows the account id and only the preservation hold card', async () => {
    const userId = '018f47a0-25cb-7a45-8b54-304f77ce64c0'

    render(await DeletedUserPreservationHoldPanel({ userId }))

    expect(screen.getByText('Deleted account')).toBeInTheDocument()
    expect(screen.getByText('Account ID')).toBeInTheDocument()
    expect(screen.getByText(userId)).toBeInTheDocument()
    expect(screen.getByTestId('preservation-hold-card')).toHaveAttribute('data-user-id', userId)
    expect(screen.getByTestId('preservation-hold-card')).toHaveAttribute(
      'data-account-deleted',
      'true',
    )
  })
})
