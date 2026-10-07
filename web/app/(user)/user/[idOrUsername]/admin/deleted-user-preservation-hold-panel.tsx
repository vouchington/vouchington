import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getTranslations } from '@/lib/i18n/get-translations'
import { UserPreservationHoldCard } from './user-preservation-hold-card'

export async function DeletedUserPreservationHoldPanel({ userId }: { userId: string }) {
  const t = await getTranslations()
  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>
            {t('extracted.admin.deletedUserPreservationHoldPanel.deletedAccount_2dad535a')}
          </CardTitle>
          <CardDescription>
            {t(
              'extracted.admin.deletedUserPreservationHoldPanel.onlyPreservationHoldControlsAre_3cf98d22',
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-sm font-medium'>
            {t('extracted.admin.deletedUserPreservationHoldPanel.accountId_f2657bba')}
          </p>
          <p className='break-all font-mono text-sm'>{userId}</p>
        </CardContent>
      </Card>
      <UserPreservationHoldCard userId={userId} />
    </div>
  )
}
