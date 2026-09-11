export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Household')
import { getHouseholdMemberships, getHouseholds } from '@/lib/api/server'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { HouseholdManager } from '@/components/my/household-manager'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import type { Household, HouseholdSection, HouseholdSectionListItem } from '@/types/my'
import type { ListResponse, PageInfo } from '@/types/api-responses'
import { getTranslations } from '@/lib/i18n/get-translations'

const PAGE_LIMIT = 25
const TERMINAL_PAGE_INFO: PageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

async function sectionFor(household: Household, isOwner: boolean): Promise<HouseholdSection> {
  try {
    const page = await getHouseholdMemberships(household.id, { limit: PAGE_LIMIT })
    return {
      household,
      isOwner,
      memberships: page.results,
      membershipPageInfo: page.page_info,
      membershipLoadError: false,
    }
  } catch {
    return {
      household,
      isOwner,
      memberships: [],
      membershipPageInfo: TERMINAL_PAGE_INFO,
      membershipLoadError: true,
    }
  }
}

export default async function HouseholdPage() {
  const [t] = await Promise.all([getTranslations(), requireCurrentUser()])
  const [ownedResult, sharedResult] = await Promise.allSettled([
    getHouseholds({ access: 'owned', limit: 1 }),
    getHouseholds({ access: 'member', limit: PAGE_LIMIT }),
  ])
  const ownedHousehold =
    ownedResult.status === 'fulfilled' ? ownedResult.value.results[0] : undefined
  const ownedSection = ownedHousehold ? await sectionFor(ownedHousehold, true) : null
  let sharedPage: ListResponse<HouseholdSectionListItem> = {
    results: [],
    page_info: TERMINAL_PAGE_INFO,
  }
  if (sharedResult.status === 'fulfilled') {
    const sections = await Promise.all(
      sharedResult.value.results.map(household => sectionFor(household, false)),
    )
    sharedPage = {
      results: sections.map(section => ({ id: section.household.id, section })),
      page_info: sharedResult.value.page_info,
    }
  }

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.household.page.household_a1c6c97f')}
        description={t('extracted.household.page.manageYourHouseholdAndMembers_de370f9e')}
      />
      <HouseholdManager
        initialOwnedSection={ownedSection}
        initialSharedPage={sharedPage}
        ownedProbeSucceeded={ownedResult.status === 'fulfilled'}
        sharedLoadError={sharedResult.status === 'rejected'}
      />
    </div>
  )
}
