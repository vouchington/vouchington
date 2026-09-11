import onError, { onSuccess } from '@/lib/on-error'
import { updateTopic } from '@/lib/api/client/topics'
import type { TopicEditState } from './topic-edit-model'

type Action = Partial<TopicEditState>
type Dispatch = (action: Action) => void

export function useTopicImageActions({
  dispatch,
  id,
  state,
}: {
  dispatch: Dispatch
  id: string
  state: TopicEditState
}) {
  const updateImage = async (
    field: 'hero_image_id' | 'logo_image_id',
    imageId: string | null,
    verb = 'updated',
  ) => {
    const savingField = field === 'logo_image_id' ? 'logoSaving' : 'heroSaving'
    dispatch({ [savingField]: true })
    try {
      const { topic: updated } = await updateTopic(id, { [field]: imageId })
      dispatch({ topic: { ...state.topic!, ...updated } })
      onSuccess(`${field === 'logo_image_id' ? 'Logo' : 'Hero image'} ${verb}`)
    } catch (error) {
      const action = imageId === null ? 'remove' : 'update'
      onError(error, {
        fallback: `Failed to ${action} image`,
        tags: { form: 'admin-topic-images' },
      })
    } finally {
      dispatch({ [savingField]: false })
    }
  }

  return {
    handleHeroRemoved: () => updateImage('hero_image_id', null, 'removed'),
    handleHeroUploaded: (imageId: string) => updateImage('hero_image_id', imageId),
    handleLogoRemoved: () => updateImage('logo_image_id', null, 'removed'),
    handleLogoUploaded: (imageId: string) => updateImage('logo_image_id', imageId),
  }
}
