export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { UnsubscribeForm } from './unsubscribe-form'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Unsubscribe')

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  return (
    <main className='mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12'>
      <div className='space-y-2'>
        <h1 className='text-2xl font-semibold'>Unsubscribe</h1>
        <p className='text-muted-foreground'>Stop receiving this email category.</p>
      </div>
      <UnsubscribeForm token={token} />
    </main>
  )
}
