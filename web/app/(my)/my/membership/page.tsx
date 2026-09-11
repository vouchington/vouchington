export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import Link from 'next/link'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getMembership } from '@/lib/api/server'
import { MembershipStatus } from '@/components/memberships/membership-status'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Membership')

export default async function MembershipPage() {
  const t = await getTranslations()
  const { membership, management } = await getMembership().catch(() => ({
    membership: null,
    management: null,
  }))

  return (
    <div className='space-y-6'>
      <SettingsPageHeader
        title={t('extracted.membership.page.membership_9feceb93')}
        description={t('extracted.membership.page.manageYourMembershipPlanAndBilling_2b3c4d5e')}
      />
      {membership ? (
        <MembershipStatus
          membership={membership}
          management={management}
        />
      ) : (
        <Card className='p-4'>
          <p className='mb-4 text-muted-foreground'>
            {t('extracted.membership.page.youDonTHaveAnActive_06226256')}
          </p>
          <Button asChild>
            <Link
              href='/plans'
              prefetch={false}
            >
              {t('extracted.membership.page.viewPlans_a865d424')}
            </Link>
          </Button>
        </Card>
      )}
    </div>
  )
}
