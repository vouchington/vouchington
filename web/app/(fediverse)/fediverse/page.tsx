import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getFediverseSearch } from '@/lib/api/server/fediverse'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEffectiveServerFeatureFlag } from '@/lib/feature-flags/server'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { PageWithAside } from '@/components/page-with-aside'
import { createPageMetadata } from '@/lib/seo/metadata'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FEDIVERSE_PROVIDERS, type FediverseProvider } from '@/types/fediverse-search'
import { ProviderBucket } from './provider-bucket'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createPageMetadata({
  title: 'Fediverse',
  description: 'Search Fediverse posts, profiles, videos, and instances.',
  path: '/fediverse',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const PROVIDERS: { value: FediverseProvider; label: string }[] = [
  { value: 'peertube', label: 'PeerTube' },
  { value: 'mastodon', label: 'Mastodon' },
  { value: 'lemmy', label: 'Lemmy' },
  { value: 'bluesky', label: 'Bluesky' },
]

export default async function FediversePage({ searchParams }: PageProps) {
  const currentUser = await getCurrentUser()
  if (!(await getEffectiveServerFeatureFlag('fediverse'))) notFound()

  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.trim() : ''
  const providerParam = typeof params.provider === 'string' ? params.provider : undefined
  const providers = getSelectedProviders(providerParam)
  const data = q
    ? await getFediverseSearch({ q, providers, limit: 10 }).catch(() => ({ buckets: [] }))
    : { buckets: [] }
  const breadcrumbItems = buildBreadcrumbsForPath('/fediverse', {
    isAuthenticated: currentUser != null,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Fediverse', path: '/fediverse' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-5'>
        <Breadcrumbs items={breadcrumbItems} />
        <header>
          <h1 className='text-2xl font-semibold tracking-tight'>Fediverse</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Search PeerTube, Mastodon, Lemmy, and Bluesky.
          </p>
        </header>
        <form
          action='/fediverse'
          className='flex flex-col gap-2 sm:flex-row'
        >
          <Input
            type='search'
            name='q'
            defaultValue={q}
            placeholder='Search posts, profiles, videos, and instances'
            aria-label='Search Fediverse'
            className='min-h-10'
          />
          {providerParam ? (
            <Input
              type='hidden'
              name='provider'
              value={providerParam}
            />
          ) : null}
          <Button type='submit'>Search</Button>
        </form>
        <nav
          className='flex flex-wrap gap-2'
          aria-label='Fediverse providers'
        >
          <ProviderLink
            q={q}
            label='All'
          />
          {PROVIDERS.map(provider => (
            <ProviderLink
              key={provider.value}
              q={q}
              provider={provider.value}
              label={provider.label}
              active={providerParam === provider.value}
            />
          ))}
        </nav>
        <div className='space-y-4'>
          {q ? (
            data.buckets.length > 0 ? (
              data.buckets.map(bucket => (
                <ProviderBucket
                  key={bucket.provider}
                  bucket={bucket}
                />
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>No Fediverse results found.</p>
            )
          ) : (
            <p className='text-sm text-muted-foreground'>Enter a search term to start.</p>
          )}
        </div>
      </div>
    </PageWithAside>
  )
}

function ProviderLink({
  q,
  provider,
  label,
  active = false,
}: {
  q: string
  provider?: FediverseProvider
  label: string
  active?: boolean
}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (provider) params.set('provider', provider)
  const href = `/fediverse${params.size > 0 ? `?${params.toString()}` : ''}`
  return (
    <Button
      asChild
      variant={active ? 'default' : 'outline'}
      size='sm'
    >
      <Link href={href}>{label}</Link>
    </Button>
  )
}

function getSelectedProviders(provider: string | undefined): FediverseProvider[] | undefined {
  if (isFediverseProvider(provider)) {
    return [provider]
  }
  return undefined
}

function isFediverseProvider(provider: string | undefined): provider is FediverseProvider {
  return FEDIVERSE_PROVIDERS.includes(provider as FediverseProvider)
}
