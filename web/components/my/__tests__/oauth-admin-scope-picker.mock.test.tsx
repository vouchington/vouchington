import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTranslator, type MessageKey } from '@ts-shared/ui-messages'
import { enMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { ScopePicker } from '../api-keys-manager/scope-picker'
import { scopeResourceGroups } from '../api-keys-manager/scope-selection'
import type { ScopeCatalogEntry, ScopeCatalogResponse } from '@/types/scopes'
import catalogFixture from '../../../../api-fixtures/v1/responses/shared.scopes.catalog.json'

let translate!: (key: MessageKey, params?: Record<string, unknown>) => string
vi.mock(import('@/lib/i18n/use-translations'), () => ({ useTranslations: () => translate }))

describe('OAuth administrator scope picker', () => {
  beforeAll(() => {
    translate = createTranslator('en', enMessages)
  })
  it('offers every administrator grant and sends each exact capability to selection', () => {
    const catalog = (catalogFixture as ScopeCatalogResponse).scopes
    const scopes = catalog.filter(
      entry => entry.audience === 'admin' && entry.surfaces.includes('oauth'),
    )
    const onToggle = vi.fn<(scope: string, checked: boolean) => void>()
    render(
      <ScopePicker
        idPrefix='admin-oauth'
        groups={scopeResourceGroups(catalog, 'oauth', ['admin'])}
        selected={[]}
        onToggle={onToggle}
      />,
    )
    expect(screen.getAllByRole('checkbox')).toHaveLength(scopes.length)
    for (const entry of scopes) {
      const label = `${entry.scope.replace(/:(read|write)$/, '')} ${entry.action === 'read' ? 'Read' : 'Write'}`
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('checkbox', { name: 'moderation:approve Write' }))
    expect(onToggle).toHaveBeenLastCalledWith('moderation:approve', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'site-operations:config Write' }))
    expect(onToggle).toHaveBeenLastCalledWith('site-operations:config', true)
  })

  it('includes adjacent permission helper text in the checkbox target and description', () => {
    const entry: ScopeCatalogEntry = {
      scope: 'financial-profile:read',
      resource: 'financial-profile',
      action: 'read',
      audience: 'user',
      description_key: 'financial_profile_read',
      requires: null,
      surfaces: ['api-key'],
    }
    const onToggle = vi.fn<(scope: string, checked: boolean) => void>()
    const helperText =
      'Read your credit score range, stated income range, total credit limit and years of credit history.'
    render(
      <ScopePicker
        idPrefix='api-key'
        groups={scopeResourceGroups([entry], 'api-key', ['user'])}
        selected={[]}
        onToggle={onToggle}
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'financial-profile Read' })
    expect(checkbox).toHaveAccessibleDescription(helperText)
    fireEvent.click(screen.getByText(helperText))
    expect(onToggle).toHaveBeenCalledWith('financial-profile:read', true)
  })
})
