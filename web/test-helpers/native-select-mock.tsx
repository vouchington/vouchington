import { isValidElement, type ReactElement, type ReactNode } from 'react'

/** Native select adapter for tests of the caller's selection state. */
export function nativeSelectMock() {
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string
      onValueChange: (value: string) => void
      children: ReactNode
    }) => {
      const trigger = (Array.isArray(children) ? children : [children]).find(
        child => isValidElement(child) && (child.props as { id?: string }).id,
      ) as ReactElement<{ id: string }> | undefined
      return (
        <select
          id={trigger?.props.id}
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          {children}
        </select>
      )
    },
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => children as ReactElement,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  } as unknown as typeof import('@/components/ui/select')
}
