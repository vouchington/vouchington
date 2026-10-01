import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import issued from '../../../../api-fixtures/v1/responses/native.my.api-keys.create.json'
import { ActiveApiKeysList } from '../api-keys-manager/api-key-lists'
import { CreateApiKeyForm } from '../api-keys-manager/create-api-key-form'
import type { ApiKeyScopeSelection } from '../api-keys-manager/use-api-key-scope-selection'

let translate: ReturnType<typeof createTranslator>
vi.mock(import('@/lib/i18n/use-translations'), () => ({ useTranslations: () => translate }))

describe('API key lifetime controls', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })
  const selection: ApiKeyScopeSelection = {
    keyType: 'rss',
    permissions: ['rss:read'],
    mcpScopes: [],
    rows: [],
    handleKeyTypeChange: () => {},
    handleScopeToggle: () => {},
  }
  it('restricts administrator choices and sends selected lifetime', () => {
    const setLifetimeDays = vi.fn<(days: 30 | 90 | 365 | null) => void>()
    const result = render(
      <CreateApiKeyForm
        label='Reader'
        selection={selection}
        submitting={false}
        isAdministrator
        lifetimeDays={30}
        setLifetimeDays={setLifetimeDays}
        onCancel={() => {}}
        onCreate={() => {}}
        setLabel={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'No expiry' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(setLifetimeDays).toHaveBeenCalledWith(90)
    result.rerender(
      <CreateApiKeyForm
        label='Reader'
        selection={selection}
        submitting={false}
        isAdministrator={false}
        lifetimeDays={90}
        setLifetimeDays={setLifetimeDays}
        onCancel={() => {}}
        onCreate={() => {}}
        setLabel={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: '1 year' })).toBeVisible()
    fireEvent.click(screen.getByRole('radio', { name: 'No expiry' }))
    expect(setLifetimeDays).toHaveBeenCalledWith(null)
  })
  it('shows invalid administrator guidance and rotates an unlimited key', () => {
    const rotate = vi.fn<(id: string) => void>()
    render(
      <ActiveApiKeysList
        keys={[{ ...issued.api_key, expires_at: null }]}
        isAdministrator
        rotatingIds={new Set()}
        onRotate={rotate}
        confirmingRevokeId={null}
        revokingIds={new Set()}
        onCancelRevoke={() => {}}
        onConfirmRevoke={() => {}}
        onStartRevoke={() => {}}
      />,
    )
    expect(screen.getByText('No expiry')).toBeVisible()
    expect(screen.getByText(/Rotate or revoke it/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(rotate).toHaveBeenCalledWith(issued.api_key.id)
  })
  it('labels expired and replaced keys and prevents another rotation', () => {
    render(
      <ActiveApiKeysList
        keys={[
          {
            ...issued.api_key,
            expires_at: '2020-01-01T00:00:00Z',
            replaced_by_api_key_id: 'replacement',
          },
        ]}
        isAdministrator={false}
        rotatingIds={new Set()}
        onRotate={() => {}}
        confirmingRevokeId={null}
        revokingIds={new Set()}
        onCancelRevoke={() => {}}
        onConfirmRevoke={() => {}}
        onStartRevoke={() => {}}
      />,
    )
    expect(screen.getByText('Expired')).toBeVisible()
    expect(screen.getByText('Replaced')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Rotate' })).toBeNull()
  })
})
