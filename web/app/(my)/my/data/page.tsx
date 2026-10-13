import { Separator } from '@/components/ui/separator'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { DeleteAccountDialog } from './delete-account-dialog'
import { DataRequestSection } from './data-request-section'
import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata: Metadata = createNoIndexMetadata('Your Data')

export const dynamic = 'force-dynamic'

export default async function DataPage() {
  const t = await getTranslations()
  const currentUser = await requireCurrentUser()

  return (
    <div className='space-y-6'>
      <SettingsPageHeader title={t('extracted.my.settingsRoutes.yourData_0fdcada4')} />

      <section className='space-y-4'>
        <DataRequestSection userId={currentUser.id} />
      </section>

      <Separator />

      <section className='space-y-4'>
        <div>
          <h2
            className='text-base font-medium text-destructive'
            data-pw='delete-account-section-heading'
          >
            {t('extracted.data.page.deleteAccount_c031bf99')}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {t('extracted.data.page.permanentlyDeleteYourAccountAndRemove_d5db5587')}
          </p>
        </div>
        <DeleteAccountDialog userId={currentUser.id} />
      </section>
    </div>
  )
}
