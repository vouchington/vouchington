import { serializeStructuredData } from '@/lib/seo/structured-data'

interface StructuredDataScriptProps {
  data: Record<string, unknown>
  nonce?: string
}

export function StructuredDataScript({ data, nonce }: StructuredDataScriptProps) {
  const type = String(data['@type'] ?? 'json').replace(/[^a-zA-Z0-9]/g, '-')
  return (
    <script
      data-pw='structured-data-script'
      id={`ld-${type}`}
      type='application/ld+json'
      nonce={nonce}
      suppressHydrationWarning
      // oxlint-disable-next-line react/no-danger -- JSON-LD requires inline script content. serializeStructuredData escapes < characters.
      dangerouslySetInnerHTML={{ __html: serializeStructuredData(data) }}
    />
  )
}
