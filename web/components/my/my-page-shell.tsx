'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { SettingsNav } from './settings-nav'
import { isSettingsRoute } from './settings-routes'

export function MyPageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isSettings = isSettingsRoute(pathname)

  return (
    <div className={cn('space-y-4', isSettings && 'mx-auto max-w-4xl')}>
      <SettingsNav />
      <div className='min-w-0'>{children}</div>
    </div>
  )
}
