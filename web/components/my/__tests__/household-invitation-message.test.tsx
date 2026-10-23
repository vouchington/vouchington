import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { esMessages } from '@ts-shared/ui-messages/locale-catalogs'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { seedMessages } from '@/lib/i18n/use-translations'
import { makeHouseholdInvitation } from '@/test-helpers/api-responses/household-invitations'
import { HouseholdInvitationsView } from '../household-invitations-view'

describe('localized household invitation messages', () => {
  it('links translated usernames and localizes the identity fallback without showing ids', () => {
    seedMessages('es', esMessages)
    const linkedInvitation = makeHouseholdInvitation({
      invited_by_id: '00000000-0000-7000-8000-000000000203',
      invited_by: { id: '00000000-0000-7000-8000-000000000203', username: 'helper' },
      household_owner: { id: '00000000-0000-7000-8000-000000000205', username: 'parent' },
    })
    const fallbackInvitation = makeHouseholdInvitation({
      id: '00000000-0000-7000-8000-000000000302',
      invited_by_id: '00000000-0000-7000-8000-000000000204',
      invited_by: { id: '00000000-0000-7000-8000-000000000204', username: null },
      household_owner: { id: '00000000-0000-7000-8000-000000000206', username: 'parent' },
    })

    render(
      <UiLocaleProvider uiLocale='es'>
        <HouseholdInvitationsView
          kind='received'
          invitations={[linkedInvitation, fallbackInvitation]}
          pending={false}
          loadError={false}
          hasMore={false}
          loadingMore={false}
          pageError={false}
          selectedUserId={null}
          relationship=''
          onSelectUser={() => {}}
          onRelationshipChange={() => {}}
          onInvite={() => {}}
          onResolve={() => {}}
          onRetry={() => {}}
          onLoadMore={() => {}}
        />
      </UiLocaleProvider>,
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]!.textContent).toContain('Invitación de @helper para el hogar de @parent')
    expect(rows[1]!.textContent).toContain(
      'Invitación de Un miembro de Voucha para el hogar de @parent',
    )
    expect(screen.getByRole('link', { name: '@helper' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })
})
