import type { ComponentProps, ElementType, ReactNode } from 'react'

type DataPwProps<T extends ElementType> = {
  as?: T
  dataPw?: string
  children?: ReactNode
} & Omit<ComponentProps<T>, 'as' | 'children'>

// Renders the host element with the caller's test id. The literal default is
// the selector form this parameter must have. An omitted id stays off the host.
export function DataPw<T extends ElementType = 'span'>(props: DataPwProps<T>): ReactNode {
  const { as, dataPw = 'data-pw', children, ...rest } = props
  const Tag = (as ?? 'span') as ElementType
  if (props.dataPw === undefined) {
    return <Tag {...(rest as object)}>{children}</Tag>
  }
  return (
    <Tag
      {...(rest as object)}
      data-pw={dataPw}
    >
      {children}
    </Tag>
  )
}
