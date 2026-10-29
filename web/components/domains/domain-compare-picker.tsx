'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'
import { Button } from '@/components/ui/button'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { fetchHostnames } from '@/lib/api/client/hostnames'
import type { Hostname } from '@/types/hostnames'

export function DomainComparePicker({ initialHostnames }: { initialHostnames: string[] }) {
  const router = useRouter()
  const t = useTranslations()
  const [hostnames, setHostnames] = useState(initialHostnames)

  return (
    <div className='space-y-2'>
      <EntityAutocomplete<Hostname>
        ariaLabel={t('extracted.domains.domainComparePicker.addHostnameToComparison')}
        emptyText={t('extracted.domains.domainComparePicker.noHostnamesFound')}
        getKey={hostname => hostname.id}
        onSelect={(hostname, { setQuery }) => {
          setHostnames(previous => [...new Set([...previous, hostname.hostname])].slice(0, 10))
          setQuery('')
        }}
        placeholder={t('extracted.domains.domainComparePicker.searchHostnames')}
        renderItem={hostname => hostname.hostname}
        search={async (query, signal) =>
          Object.values((await fetchHostnames({ q: query, limit: 10, signal })).hostnames)
        }
      />
      {hostnames.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {hostnames.map(hostname => (
            <Button
              key={hostname}
              type='button'
              variant='outline'
              onClick={() => setHostnames(previous => previous.filter(item => item !== hostname))}
            >
              {hostname} ×
            </Button>
          ))}
        </div>
      )}
      <Button
        type='button'
        disabled={hostnames.length === 0}
        onClick={() =>
          router.push(`/domains/compare?hostnames=${encodeURIComponent(hostnames.join(','))}`)
        }
      >
        {t('extracted.domains.domainComparePicker.compareHostnames')}
      </Button>
    </div>
  )
}
