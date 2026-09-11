import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { StructuredDataValue } from '@/lib/seo/structured-data'
import { headers } from 'next/headers'
import { StructuredDataScript } from './structured-data-script'

interface AnonymousStructuredDataScriptProps {
  data: StructuredDataValue
}

export async function AnonymousStructuredDataScript({ data }: AnonymousStructuredDataScriptProps) {
  const currentUser = await getCurrentUser()

  if (currentUser) {
    return null
  }

  const headersList = await headers()

  return (
    <StructuredDataScript
      data={data}
      nonce={headersList.get('x-nonce') ?? undefined}
    />
  )
}
