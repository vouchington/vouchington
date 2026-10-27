'use client'

import { useEffect, useState } from 'react'
import { getReAuthMethods, type ReAuthMethods } from '@/lib/api/client'

export function useReAuthMethods(open: boolean) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    attempt: number
    methods?: ReAuthMethods
    error?: Error
  }>({ attempt: 0 })
  useEffect(() => {
    if (!open) return
    let current = true
    void getReAuthMethods().then(
      methods => {
        if (current) setResult({ attempt, methods })
      },
      err => {
        if (current)
          setResult({ attempt, error: err instanceof Error ? err : new Error(String(err)) })
      },
    )
    return () => {
      current = false
    }
  }, [open, attempt])
  const current = result.attempt === attempt ? result : undefined
  return {
    methods: current?.methods,
    error: current?.error,
    retry: () => setAttempt(previous => previous + 1),
  }
}
