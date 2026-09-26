'use client'

import { useCallback, useRef } from 'react'

export function useSearchInputFocus() {
  const inputRef = useRef<HTMLInputElement>(null)
  const focusReplacement = useRef(false)
  const setInputNode = useCallback((node: HTMLInputElement | null) => {
    if (!node) {
      focusReplacement.current =
        inputRef.current !== null && document.activeElement === inputRef.current
      inputRef.current = null
      return
    }
    inputRef.current = node
    if (!focusReplacement.current) return
    node.focus()
    focusReplacement.current = false
  }, [])
  return { inputRef, setInputNode }
}
