import { StatusPage } from '@/components/shared/status-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function Unauthorized() {
  const t = await getTranslations()
  return (
    <StatusPage
      status={401}
      title={t('extracted.app.unauthorized.signInRequired_255346f2')}
      description={t('extracted.app.unauthorized.signInToPickUpRight_72b6525d')}
      t={t}
    />
  )
}
