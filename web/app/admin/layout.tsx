import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { canAccessDynamicConfig } from '@/lib/auth/dynamic-config-access'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Admin')

/**
 * Top-level admin gate. Allows administrators and dynamic-config viewer roles through.
 * Every subroute that is NOT dynamic-config must call requireAdmin() in its own
 * layout or page to re-establish the administrator-only gate.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser()

  if (!currentUser || !canAccessDynamicConfig(currentUser.roles)) {
    redirect('/')
  }

  return <PageWithAside showFooter={false}>{children}</PageWithAside>
}
