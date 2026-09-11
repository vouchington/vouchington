import { cache } from 'react'
import { headers } from 'next/headers'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { resolveUiLocale } from './resolve-ui-locale'

export const getResolvedUiLocale = cache(async () => {
  const user = await getCurrentUser()

  // Mirrors getCurrentUser()'s cookies() fallback: outside a real Next.js request (e.g. a
  // Server Component rendered directly in a unit test without the request-store machinery),
  // headers() throws. Treat that the same as "no Accept-Language available".
  let acceptLanguage: string | null = null
  try {
    const headersList = await headers()
    acceptLanguage = headersList.get('accept-language')
  } catch {
    acceptLanguage = null
  }

  // The Cloudflare Worker partitions the anonymous edge cache by resolved UI locale
  // (cloudflare-worker/src/edge-ui-locale.mts, issue #6994), so an anonymous request's
  // Accept-Language is safe to resolve here: the origin always renders into the same
  // locale partition the Worker cached it under.
  return resolveUiLocale({
    preferredUiLocale: user?.ui_locale,
    // The session `uil` claim is not read here; the Worker already folds it into the
    // cache-partition key before this origin request is dispatched.
    sessionUiLocale: null,
    acceptLanguage,
  })
})
