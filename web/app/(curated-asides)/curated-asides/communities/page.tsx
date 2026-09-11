import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import CuratedAsidesClient from '../curated-asides-client'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Curated Aside Communities | Admin')

export default function CuratedAsideCommunitiesPage() {
  return <CuratedAsidesClient activeAsideType='community' />
}
