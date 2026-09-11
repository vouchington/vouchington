import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Curated Asides | Admin')

export default function CuratedAsidesPage() {
  redirect('/curated-asides/topics')
}
