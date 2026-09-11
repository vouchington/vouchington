import { StatusPage } from '@/components/shared/status-page'
import { getTranslations } from '@/lib/i18n/get-translations'

export default async function NotFound() {
  const t = await getTranslations()
  return (
    <StatusPage
      status={404}
      title={t('extracted.app.notFound.pageNotFound_a469ab4c')}
      description={t('extracted.app.notFound.weCouldnTFindThatPage_bb532e11')}
      t={t}
    />
  )
}
