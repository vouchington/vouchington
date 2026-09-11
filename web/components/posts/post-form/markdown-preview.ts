import { useState } from 'react'
import { previewMarkdown } from '@/lib/api/client/markdown'

interface PreviewState {
  html: string
  loading: boolean
}

export function useMarkdownPreview(markdown: string) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')
  const [state, setState] = useState<PreviewState>({ html: '', loading: false })

  const selectTab = (tab: 'write' | 'preview') => {
    setActiveTab(tab)
    if (tab !== 'preview') return
    if (!markdown.trim()) {
      setState({ html: '', loading: false })
      return
    }

    setState({ html: '', loading: true })
    previewMarkdown(markdown)
      .then(({ html }) => setState({ html, loading: false }))
      .catch(() =>
        setState({
          html: '<p class="text-sm text-muted-foreground">Preview unavailable. Try again.</p>',
          loading: false,
        }),
      )
  }

  return {
    activeTab,
    previewHtml: state.html,
    previewLoading: state.loading,
    setActiveTab: selectTab,
  }
}
