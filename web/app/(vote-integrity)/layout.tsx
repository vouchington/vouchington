import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'

export default async function VoteIntegrityAdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return children
}
