import type { ReactNode } from 'react'
import { AsideSkeleton } from './aside-skeleton'
import { SequentialSuspense } from '@/components/sequential-suspense'

interface Props {
  children: ReactNode
}

/**
 * Wraps RSC aside children in nested Suspense boundaries for sequential loading.
 *
 * - The first loading RSC aside shows a skeleton fallback.
 * - All subsequent loading asides render nothing (fallback={null}).
 * - Asides resolve in order: later asides cannot appear before earlier ones.
 *
 * This avoids layout jank by ensuring at most one skeleton is visible at a time.
 */
export function SequentialAsideSuspense({ children }: Props) {
  return <SequentialSuspense fallback={<AsideSkeleton />}>{children}</SequentialSuspense>
}
