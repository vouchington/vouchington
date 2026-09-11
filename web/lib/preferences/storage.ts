'use client'

export function getPreference(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

export function setPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore unavailable storage in restricted browser contexts.
  }
}
