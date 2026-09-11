import type { Metadata } from 'next'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AppealDialog } from '@/components/appeals/appeal-dialog'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Account Status')

export default async function AccountStatusPage() {
  const t = await getTranslations()
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-account-status-page'
    >
      <SettingsPageHeader
        title={t('extracted.accountStatus.page.accountStatus_dafb01ab')}
        description={t('extracted.accountStatus.page.theCurrentStatusOfYourAccount_5e6f7a8b')}
      />
      {currentUser.suspended_at ? (
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>
            {t('extracted.accountStatus.page.yourAccountHasBeenSuspended_b51655b9')}
          </AlertTitle>
          <AlertDescription className='space-y-2'>
            <p>
              {currentUser.suspended_reason ??
                t('extracted.accountStatus.page.yourAccountAccessHasBeenRestricted_9c0d1e2f')}
            </p>
            <AppealDialog suspension />
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CheckCircle className='h-4 w-4' />
          <AlertTitle>
            {t('extracted.accountStatus.page.yourAccountIsInGoodStanding_67a5c900')}
          </AlertTitle>
          <AlertDescription>
            {t('extracted.accountStatus.page.thereAreNoActiveRestrictionsOn_f182965b')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
