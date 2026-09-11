import { StatusPage } from '@/components/shared/status-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function Forbidden() {
  const t = await getTranslations()
  return (
    <StatusPage
      status={403}
      title={t('extracted.app.forbidden.accessDenied_cc11d415')}
      description={t('extracted.app.forbidden.thisPageIsPrivateIfYou_656c5324')}
      t={t}
    />
  )
}
