import { useEffect, useReducer, useRef } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import {
  updateSpendingCategoryAttributes,
  updateTopic,
  updateTopicTypeAttributes,
} from '@/lib/api/client/topics'
import { topicManagementHref } from '@/lib/links/entity-href'
import { getTopicTypeSlug } from '@/types/topics'
import { loadTopicEditState } from './load-topic-edit-state'
import {
  initialTopicEditState,
  type TopicEditState,
  type TypeAttributes,
  validTopicTypeSlugs,
} from './topic-edit-model'
import { useTopicImageActions } from './use-topic-image-actions'

interface Router {
  replace: (href: string) => void
}
type Action = Partial<TopicEditState> | ((state: TopicEditState) => Partial<TopicEditState>)

function reducer(state: TopicEditState, action: Action): TopicEditState {
  return { ...state, ...(typeof action === 'function' ? action(state) : action) }
}

export function useTopicEditPage(
  id: string,
  topicType: string,
  router: Router,
  initialData?: Partial<TopicEditState>,
) {
  const [state, dispatch] = useReducer(reducer, { ...initialTopicEditState, ...initialData })
  const initialIdRef = useRef(id)
  const hasInitialDataRef = useRef(initialData !== undefined)
  const hasLeftInitialIdRef = useRef(false)
  const isValidTopicType = validTopicTypeSlugs.has(topicType)
  const imageActions = useTopicImageActions({ dispatch, id, state })

  useEffect(() => {
    queueMicrotask(() => dispatch({ typeSaving: false }))
  }, [id, topicType])

  useEffect(() => {
    if (id !== initialIdRef.current) hasLeftInitialIdRef.current = true
    if (hasInitialDataRef.current && !hasLeftInitialIdRef.current) return
    if (!isValidTopicType) return
    let active = true
    void loadTopicEditState(id).then(nextState => {
      if (active) dispatch(nextState)
    })
    return () => {
      active = false
    }
  }, [id, isValidTopicType])

  const handleBasicSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    dispatch({ basicSaving: true })
    try {
      const formData = new FormData(e.currentTarget)
      const { topic: updated } = await updateTopic(id, {
        name: formData.get('name') as string,
        markdown: formData.get('markdown') as string,
      })
      dispatch({ topic: { ...state.topic!, ...updated } })
      onSuccess('Basic info updated')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update basic info',
        tags: { form: 'admin-topic-basic' },
      })
    } finally {
      dispatch({ basicSaving: false })
    }
  }

  const handleTypeSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    dispatch({ typeSaving: true })
    let keepSavingThroughNavigation = false
    try {
      const { topic: updated } = await updateTopic(id, {
        topic_type: state.topicTypeValue || undefined,
      })
      const mergedTopic = { ...state.topic!, ...updated }
      dispatch({ topic: mergedTopic })
      onSuccess('Topic type updated')
      const updatedTypeSlug = getTopicTypeSlug(updated.topic_type ?? 'topic')
      if (updatedTypeSlug !== topicType) {
        keepSavingThroughNavigation = true
        router.replace(topicManagementHref(mergedTopic, 'settings'))
      }
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update topic type',
        tags: { form: 'admin-topic-type' },
      })
    } finally {
      if (!keepSavingThroughNavigation) dispatch({ typeSaving: false })
    }
  }

  const handleTypeAttrSubmit = async (data: Record<string, unknown>) => {
    dispatch({ typeAttrSaving: true })
    try {
      const currentType = state.topic?.topic_type
      if (!currentType || currentType === 'topic') return
      const updated = await updateTopicTypeAttributes<TypeAttributes>(
        id,
        getTopicTypeSlug(currentType),
        data,
      )
      dispatch({ typeAttributes: updated })
      onSuccess('Type attributes updated')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update type attributes',
        tags: { form: 'admin-topic-attrs' },
      })
    } finally {
      dispatch({ typeAttrSaving: false })
    }
  }

  const handleSpendingSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    dispatch({ spendingSaving: true })
    try {
      const data: Record<string, unknown> = { is_foreign_transaction: state.isForeignTransaction }
      if (state.spendingFrequency) data.default_spending_frequency = state.spendingFrequency
      await updateSpendingCategoryAttributes(id, data)
      onSuccess('Spending category updated')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update spending category',
        tags: { form: 'admin-topic-spending' },
      })
    } finally {
      dispatch({ spendingSaving: false })
    }
  }

  const handleFlagsSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!state.topic) return
    dispatch({ flagsSaving: true })
    try {
      const { topic: updated } = await updateTopic(id, {
        noindex: state.topic.noindex,
        allow_reviews: state.topic.allow_reviews,
      })
      dispatch({ topic: { ...state.topic, ...updated } })
      onSuccess('Visibility settings updated')
    } catch (error) {
      onError(error, {
        fallback: 'Failed to update visibility settings',
        tags: { form: 'admin-topic-flags' },
      })
    } finally {
      dispatch({ flagsSaving: false })
    }
  }

  const setNoindex = (noindex: boolean) =>
    dispatch(s => (s.topic ? { topic: { ...s.topic, noindex } } : {}))
  const setAllowReviews = (allow_reviews: boolean) =>
    dispatch(s => (s.topic ? { topic: { ...s.topic, allow_reviews } } : {}))

  const setLogoSaving = (logoSaving: boolean) => dispatch({ logoSaving })
  const setHeroSaving = (heroSaving: boolean) => dispatch({ heroSaving })
  const setTopicTypeValue = (topicTypeValue: string) => dispatch({ topicTypeValue })
  const setSpendingFrequency = (spendingFrequency: string) => dispatch({ spendingFrequency })
  const setIsForeignTransaction = (isForeignTransaction: boolean) =>
    dispatch({ isForeignTransaction })

  return {
    handlers: {
      handleBasicSubmit,
      handleFlagsSubmit,
      handleSpendingSubmit,
      handleTypeAttrSubmit,
      handleTypeSubmit,
      ...imageActions,
      setAllowReviews,
      setHeroSaving,
      setIsForeignTransaction,
      setLogoSaving,
      setNoindex,
      setSpendingFrequency,
      setTopicTypeValue,
    },
    isValidTopicType,
    state,
  }
}
