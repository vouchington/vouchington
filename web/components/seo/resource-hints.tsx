'use client'

import { preconnect } from 'react-dom'
import { getPreconnectOrigin } from '@/lib/seo/navigation-performance'

interface ResourceHintsProps {
  assetPrefix?: string
  imageOrigin?: string
}

export function ResourceHints({ assetPrefix, imageOrigin }: ResourceHintsProps) {
  for (const origin of [getPreconnectOrigin(assetPrefix), getPreconnectOrigin(imageOrigin)]) {
    if (!origin) continue
    if (typeof window !== 'undefined' && origin === window.location.origin) continue
    preconnect(origin, { crossOrigin: '' })
  }

  return null
}
