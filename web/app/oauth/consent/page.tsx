import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageWithAside } from '@/components/page-with-aside'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOAuthAuthorizationRequest } from '@/lib/api/server/oauth-authorization'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getScopeCatalog } from '@/lib/api/server/scopes'
import { ConsentActions } from './consent-actions'
import { ConsentScopeSections } from './consent-scope-sections'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return createNoIndexMetadata(t('shared.oauth.consent.metadataTitle'))
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request_id?: string }>
}) {
  const { request_id: requestId } = await searchParams
  if (!requestId) notFound()
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    const next = `/oauth/consent?request_id=${encodeURIComponent(requestId)}`
    redirect(`/login?next=${encodeURIComponent(next)}`)
  }
  const response = await getOAuthAuthorizationRequest(requestId)
  if (!response) notFound()
  const request = response.authorization_request
  const catalog = await getScopeCatalog()
  const t = await getTranslations()

  return (
    <PageWithAside showFooter={false}>
      <Card
        className='mx-auto max-w-xl'
        data-pw='oauth-consent-card'
      >
        <CardHeader>
          <CardTitle data-pw='oauth-consent-title'>
            {t('shared.oauth.consent.title', { clientName: request.client_name })}
          </CardTitle>
          <CardDescription>{t('shared.oauth.consent.description')}</CardDescription>
          {request.client_is_unverified && (
            <p
              className='text-sm font-medium'
              data-pw='oauth-consent-unverified'
            >
              {t('shared.oauth.consent.unverifiedApp')}
            </p>
          )}
          {request.client_hostname && (
            <p
              className='break-all text-sm text-muted-foreground'
              data-pw='oauth-consent-client-hostname'
            >
              {request.client_hostname}
            </p>
          )}
        </CardHeader>
        <CardContent className='space-y-5'>
          <section aria-labelledby='oauth-resource-heading'>
            <h2
              id='oauth-resource-heading'
              className='text-sm font-medium'
            >
              {t('shared.oauth.consent.resourceHeading')}
            </h2>
            <p
              className='mt-1 break-all text-sm text-muted-foreground'
              data-pw='oauth-consent-resource'
            >
              {request.resource}
            </p>
          </section>
          <ConsentScopeSections
            catalog={catalog}
            scopes={request.scopes}
            sensitiveScopes={request.sensitive_scopes}
          />
          <p className='text-sm text-muted-foreground'>
            {t('shared.oauth.consent.passwordNotice')}
          </p>
          <ConsentActions requestId={request.id} />
        </CardContent>
      </Card>
    </PageWithAside>
  )
}
