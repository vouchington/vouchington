import { createElement, isValidElement, type ElementType, type ReactNode } from 'react'
import { AsideColumn } from '@/components/aside-column'
import { AsideDrawer } from '@/components/aside-drawer'
import { ContentContainer } from '@/components/layout/content-container'

const componentObjectTypes = new Set([
  Symbol.for('react.forward_ref'),
  Symbol.for('react.lazy'),
  Symbol.for('react.memo'),
])

function isComponentObject(value: object): boolean {
  const componentType = (value as { $$typeof?: symbol }).$$typeof
  return componentType !== undefined && componentObjectTypes.has(componentType)
}

export function PageWithAside({
  children,
  aside,
  showFooter = true,
  mobileHidden = false,
}: {
  children: ReactNode
  aside?: ElementType | ReactNode
  showFooter?: boolean
  /** When true, the aside column is hidden on mobile (AsideDrawer still handles mobile access). */
  mobileHidden?: boolean
}) {
  const asideContent =
    aside &&
    (typeof aside === 'function' ||
      (typeof aside === 'object' && !isValidElement(aside) && isComponentObject(aside)))
      ? createElement(aside as ElementType)
      : aside

  return (
    <>
      {asideContent && <AsideDrawer showFooter={showFooter}>{asideContent}</AsideDrawer>}
      <ContentContainer
        className={asideContent ? 'flex flex-col lg:flex-row' : undefined}
        data-pw='page-content-wrapper'
      >
        <div className={asideContent ? 'min-w-0 flex-1' : 'min-w-0'}>{children}</div>
        {asideContent && (
          <AsideColumn
            showFooter={showFooter}
            mobileHidden={mobileHidden}
          >
            {asideContent}
          </AsideColumn>
        )}
      </ContentContainer>
    </>
  )
}
