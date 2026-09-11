import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

type SelectedTopic = { id: string; name: string } | null

export function TopHashtagLinkForm({
  onCancel,
  onLink,
  onSelect,
  selectedTopic,
}: {
  onCancel: () => void
  onLink: () => void
  onSelect: (topic: SelectedTopic) => void
  selectedTopic: SelectedTopic
}) {
  const t = useTranslations()
  return (
    <div className='flex flex-col gap-2 rounded-md border p-3'>
      <TopicAutocomplete
        value={selectedTopic?.id ?? null}
        label={selectedTopic?.name ?? ''}
        clearOnTextEdit
        onChange={(id, name) => onSelect(id ? { id, name } : null)}
      />
      <div className='flex gap-2'>
        <Button
          type='button'
          disabled={!selectedTopic}
          onClick={onLink}
        >
          {t('extracted.topicRecommendations.topHashtags.linkTopic_4d3e8c3d')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
        >
          {t('extracted.topicRecommendations.topicRecommendationForm.cancel_19766ed6')}
        </Button>
      </div>
    </div>
  )
}
