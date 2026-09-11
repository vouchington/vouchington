'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Returns a ref to attach to a textarea that auto-resizes to fit content on each value change. */
export function useTextareaAutoResize(value: string): RefObject<HTMLTextAreaElement | null> {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [value])
  return textareaRef
}
