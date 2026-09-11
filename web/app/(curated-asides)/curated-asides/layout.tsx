import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Curated Asides | Admin')

export default async function Layout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return <div>{children}</div>
}
