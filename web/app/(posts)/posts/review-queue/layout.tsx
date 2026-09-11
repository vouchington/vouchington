import type { ReactNode } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'

export default async function ReviewQueueAdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return children
}
