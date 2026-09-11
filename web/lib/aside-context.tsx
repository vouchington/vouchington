'use client'

import { createContext, use } from 'react'

export interface AsideContextType {
  desktopAsideOpen: boolean
  setDesktopAsideOpen: (open: boolean) => void
  mobileSheetOpen: boolean
  setMobileSheetOpen: (open: boolean) => void
  toggleAside: () => void
}

export const AsideContext = createContext<AsideContextType>({
  desktopAsideOpen: true,
  setDesktopAsideOpen: () => {},
  mobileSheetOpen: false,
  setMobileSheetOpen: () => {},
  toggleAside: () => {},
})

export function useDesktopAsideOpen() {
  return use(AsideContext).desktopAsideOpen
}

export function useMobileSheetOpen() {
  return use(AsideContext).mobileSheetOpen
}

export function useSetMobileSheetOpen() {
  return use(AsideContext).setMobileSheetOpen
}

export function useToggleAside() {
  return use(AsideContext).toggleAside
}
