import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = createNoIndexMetadata('Health')

export default function HealthzPage() {
  return <span>ok</span>
}
