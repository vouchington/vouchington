import type { ReactNode } from 'react'

export function PageAside({ children }: { children?: ReactNode; showFooter?: boolean }) {
  // showFooter is accepted for call-site compatibility (gates empty-aside column rendering in
  // AsideColumn/AsideDrawer callers). The footer now lives in the app sidebar, not here.
  if (!children) return null
  return children
}
