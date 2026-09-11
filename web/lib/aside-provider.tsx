'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AsideContext } from './aside-context'

export function AsideProvider({ children }: { children: ReactNode }) {
  const [desktopAsideOpen, setDesktopAsideOpen] = useState(true)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const toggleAside = useCallback(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) setDesktopAsideOpen(prev => !prev)
    else setMobileSheetOpen(prev => !prev)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '\\' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleAside()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleAside])

  const value = useMemo(
    () => ({
      desktopAsideOpen,
      setDesktopAsideOpen,
      mobileSheetOpen,
      setMobileSheetOpen,
      toggleAside,
    }),
    [desktopAsideOpen, mobileSheetOpen, toggleAside],
  )
  return <AsideContext.Provider value={value}>{children}</AsideContext.Provider>
}
