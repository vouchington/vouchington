'use client'

import { useLayoutEffect, useRef } from 'react'

export function useMeasuredHeight<T extends HTMLElement>(
  onHeightChange?: (height: number) => void,
) {
  const elementRef = useRef<T | null>(null)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return

    const updateHeight = () => onHeightChange?.(Math.ceil(element.getBoundingClientRect().height))
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [onHeightChange])

  return elementRef
}
