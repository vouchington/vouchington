import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageWithAside } from '@/components/page-with-aside'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getOAuthAuthorizationRequest } from '@/lib/api/server/oauth-authorization'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ConsentActions } from './consent-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Authorize access')

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

  return (
    <PageWithAside showFooter={false}>
      <Card
        className='mx-auto max-w-xl'
        data-pw='oauth-consent-card'
      >
        <CardHeader>
          <CardTitle data-pw='oauth-consent-title'>
            {request.client_name} wants access to Voucha
          </CardTitle>
          <CardDescription>Review the requested permissions before continuing.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <section aria-labelledby='oauth-resource-heading'>
            <h2
              id='oauth-resource-heading'
              className='text-sm font-medium'
            >
              Resource
            </h2>
            <p
              className='mt-1 break-all text-sm text-muted-foreground'
              data-pw='oauth-consent-resource'
            >
              {request.resource}
            </p>
          </section>
          <section aria-labelledby='oauth-permissions-heading'>
            <h2
              id='oauth-permissions-heading'
              className='text-sm font-medium'
            >
              Requested permissions
            </h2>
            <ul
              className='mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground'
              data-pw='oauth-consent-scopes'
            >
              {request.scopes.map(scope => (
                <li key={scope}>
                  <code>{scope}</code>
                </li>
              ))}
            </ul>
          </section>
          <p className='text-sm text-muted-foreground'>
            This app never receives your Voucha password.
          </p>
          <ConsentActions requestId={request.id} />
        </CardContent>
      </Card>
    </PageWithAside>
  )
}
