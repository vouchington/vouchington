import {
  createElement,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react'
import {
  getContentLanguageDir,
  getEffectiveContentLanguage,
} from '@ts-shared/languages/content-languages'

export interface PostContentTextValue {
  text: string | null | undefined
  declared_language?: string | null
  lingua_rs_detected_language?: string | null
}

type PostContentTextProps<T extends ElementType> = {
  as: T
  content: PostContentTextValue | null
  fallback?: ReactNode
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'content' | 'dir' | 'lang'>

/** Renders one plain-text post-content value through its semantic host without a wrapper. */
export function PostContentText<T extends ElementType>({
  as,
  content,
  fallback,
  ...props
}: PostContentTextProps<T>) {
  const authoredContent = content?.text?.trim() ? content : null
  const language = authoredContent
    ? getEffectiveContentLanguage({
        declaredLanguage: authoredContent.declared_language,
        detectedLanguage: authoredContent.lingua_rs_detected_language,
      })
    : undefined

  return createElement(
    as,
    {
      ...props,
      lang: language,
      dir: authoredContent ? getContentLanguageDir(language) : undefined,
    },
    authoredContent ? authoredContent.text : fallback,
  )
}
