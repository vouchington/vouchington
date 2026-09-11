import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { appendUtm, isHttpHref, OUTBOUND_UTM } from '@/lib/url/utm'
import type { FediverseProvider, FediverseSearchBucket } from '@/types/fediverse-search'

export function ProviderBucket({ bucket }: { bucket: FediverseSearchBucket }) {
  return (
    <section className='space-y-2'>
      <div className='flex items-center justify-between gap-3 border-b pb-2'>
        <h2 className='text-base font-semibold'>{formatProvider(bucket.provider)}</h2>
        {bucket.status !== 'ok' ? (
          <span className='text-xs text-muted-foreground'>{bucket.status}</span>
        ) : null}
      </div>
      {bucket.items.length > 0 ? (
        <div className='grid gap-2'>
          {bucket.items.map(item => {
            const resultHref = isHttpHref(item.external_url)
              ? appendUtm(item.external_url, OUTBOUND_UTM)
              : null
            return (
              <article
                key={`${item.provider}:${item.external_url}`}
                className='rounded-md border bg-background p-3'
              >
                {resultHref ? (
                  <Link
                    href={resultHref}
                    className='inline-flex items-center gap-1 font-medium hover:underline'
                    target='_blank'
                    rel='noreferrer'
                  >
                    {item.title}
                    <ExternalLink className='size-3.5' />
                  </Link>
                ) : (
                  <span className='font-medium'>{item.title}</span>
                )}
                <div className='mt-1 text-xs text-muted-foreground'>
                  {item.result_type} · {item.source_hostname}
                </div>
                {item.summary ? (
                  <p className='mt-2 text-sm text-muted-foreground'>{item.summary}</p>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>No results from this provider.</p>
      )}
    </section>
  )
}

function formatProvider(provider: FediverseProvider): string {
  switch (provider) {
    case 'peertube':
      return 'PeerTube'
    case 'mastodon':
      return 'Mastodon'
    case 'lemmy':
      return 'Lemmy'
    case 'bluesky':
      return 'Bluesky'
  }
}
