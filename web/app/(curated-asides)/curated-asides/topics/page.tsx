import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import CuratedAsidesClient from '../curated-asides-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Curated Aside Topics | Admin')

export default function CuratedAsideTopicsPage() {
  return <CuratedAsidesClient activeAsideType='topic' />
}
