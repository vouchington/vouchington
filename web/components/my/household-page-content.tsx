'use client'

import { useState } from 'react'
import { HouseholdManager } from './household-manager'
import { HouseholdInvitations } from './household-invitations'
import type { HouseholdSection, HouseholdSectionListItem } from '@/types/my'
import type { HouseholdInvitationPage } from '@/types/household-invitations'
import type { ListResponse } from '@/types/api-responses'

interface Props {
  initialOwnedSection: HouseholdSection | null
  initialSharedPage: ListResponse<HouseholdSectionListItem>
  ownedProbeSucceeded: boolean
  sharedLoadError: boolean
  sentInvitations: HouseholdInvitationPage | null
  receivedInvitations: HouseholdInvitationPage
}

const EMPTY_INVITATIONS: HouseholdInvitationPage = {
  invitations: [],
  pageInfo: { has_next_page: false, start_cursor: null, end_cursor: null },
  loadError: false,
}

export function HouseholdPageContent(props: Props) {
  const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null)
  const householdId = createdHouseholdId ?? props.initialOwnedSection?.household.id
  // The manager owns cursor history. A server refresh after acceptance supplies a new first page.
  const [version, setVersion] = useState({ source: props.initialSharedPage, value: 0 })
  let managerKey = version.value
  if (version.source !== props.initialSharedPage) {
    managerKey++
    setVersion({ source: props.initialSharedPage, value: managerKey })
  }
  return (
    <>
      <HouseholdManager
        key={managerKey}
        initialOwnedSection={props.initialOwnedSection}
        initialSharedPage={props.initialSharedPage}
        ownedProbeSucceeded={props.ownedProbeSucceeded}
        sharedLoadError={props.sharedLoadError}
        onHouseholdCreated={household => setCreatedHouseholdId(household.id)}
      />
      {householdId && (
        <HouseholdInvitations
          key={householdId}
          kind='sent'
          householdId={householdId}
          initialPage={props.sentInvitations ?? EMPTY_INVITATIONS}
        />
      )}
      <HouseholdInvitations
        kind='received'
        initialPage={props.receivedInvitations}
      />
    </>
  )
}
