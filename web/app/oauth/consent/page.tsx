import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageWithAside } from '@/components/page-with-aside'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOAuthAuthorizationRequest } from '@/lib/api/server/oauth-authorization'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getScopeCatalog } from '@/lib/api/server/scopes'
import { scopeDescriptionMessageKey } from '@/components/my/api-keys-manager/scope-description'
import { ConsentActions } from './consent-actions'

export const dynamic = 'force-dynamic'

const OWN_PRIVATE_POST_RELATIONS_WRITE_SCOPE = 'post-relations.owned-private:write'

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
  const descriptions = new Map(catalog.scopes.map(entry => [entry.scope, entry.description_key]))
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
          {request.client_hostname && (
            <p className='break-all text-sm text-muted-foreground'>{request.client_hostname}</p>
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
          {[false, true].map(sensitive => {
            const scopes = request.scopes.filter(
              scope => request.sensitive_scopes.includes(scope) === sensitive,
            )
            if (scopes.length === 0) return null
            const heading = sensitive
              ? 'oauth-sensitive-permissions-heading'
              : 'oauth-permissions-heading'
            return (
              <section
                key={heading}
                aria-labelledby={heading}
              >
                <h2
                  id={heading}
                  className='text-sm font-medium'
                >
                  {t(
                    sensitive
                      ? 'shared.oauth.consent.sensitivePermissionsHeading'
                      : 'shared.oauth.consent.permissionsHeading',
                  )}
                </h2>
                <ul
                  className='mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground'
                  // oxlint-disable-next-line no-mistakes/playwright-literals -- both static section identifiers are selected by the sensitivity group
                  data-pw={sensitive ? 'oauth-consent-sensitive-scopes' : 'oauth-consent-scopes'}
                >
                  {scopes.map(scope => {
                    const descriptionKey = descriptions.get(scope)
                    return (
                      <li key={scope}>
                        <code>{scope}</code>
                        {descriptionKey && <p>{t(scopeDescriptionMessageKey(descriptionKey))}</p>}
                        {scope === OWN_PRIVATE_POST_RELATIONS_WRITE_SCOPE && (
                          <p data-pw='oauth-consent-private-post-relations-permission'>
                            {t(
                              'extracted.apiKeysManager.scopePicker.allowOwnPrivatePostRelationsAndTags_1c840aa0',
                            )}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          <p className='text-sm text-muted-foreground'>
            {t('shared.oauth.consent.passwordNotice')}
          </p>
          <ConsentActions requestId={request.id} />
        </CardContent>
      </Card>
    </PageWithAside>
  )
}
