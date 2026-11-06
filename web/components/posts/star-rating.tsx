'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Star } from 'lucide-react'
import { useId, type KeyboardEvent } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

export function StarRating({
  rating,
  onChange,
  label,
}: {
  rating: number
  onChange: (r: number) => void
  label?: string
}) {
  const t = useTranslations()
  const ratingName = useId()
  const inputId = (star: number) => `${ratingName}-${star}`

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, star: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = star < 5 ? star + 1 : 1
      onChange(next)
      document.getElementById(inputId(next))?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = star > 1 ? star - 1 : 5
      onChange(prev)
      document.getElementById(inputId(prev))?.focus()
    }
  }

  const selected = rating > 0 ? rating : 1

  return (
    <div
      role='radiogroup'
      aria-label={
        label
          ? t('extracted.posts.starRating.ratingForLabel_7d29cc27', { label })
          : t('extracted.posts.starRating.rating_9f295304')
      }
      className='flex gap-1'
    >
      {[1, 2, 3, 4, 5].map(star => (
        <div
          key={star}
          className='relative h-6 w-6'
        >
          <Input
            id={inputId(star)}
            type='radio'
            name={ratingName}
            value={String(star)}
            checked={star === rating}
            onChange={() => onChange(star)}
            onKeyDown={e => handleKeyDown(e, star)}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
            className='peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0'
            tabIndex={star === selected ? 0 : -1}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
            data-pw={`star-rating-${star}`}
          />
          <Label
            htmlFor={inputId(star)}
            className='pointer-events-none absolute inset-0 z-0 flex h-full w-full cursor-pointer items-center justify-center rounded p-0 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2'
          >
            <Star
              className={`h-6 w-6 ${
                star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
              }`}
            />
          </Label>
        </div>
      ))}
    </div>
  )
}
