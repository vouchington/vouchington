'use client'

import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  disabled: boolean
  onFile: (file: File) => void
}

export function SourceFileInput({ disabled, onFile }: Props) {
  const t = useTranslations()
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Button
        variant='outline'
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        data-pw='upload-sources-file-button'
      >
        <Upload className='mr-2 h-4 w-4' />
        {t('extracted.importExport.sourceFileInput.uploadFile_26465336')}
      </Button>
      <Input
        ref={fileInputRef}
        type='file'
        accept='.opml,.xml,.csv'
        className='hidden'
        onChange={e => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (!file) return
          onFile(file)
          ;(e.target as HTMLInputElement).value = ''
        }}
      />
    </>
  )
}
