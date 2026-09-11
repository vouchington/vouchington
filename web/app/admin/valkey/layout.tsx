import { requireAdmin } from '@/lib/auth/require-admin'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const metadata: Metadata = createNoIndexMetadata('Valkey | Admin')

export default async function Layout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return <div>{children}</div>
}
