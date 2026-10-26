interface PageViewEvent {
  event: 'page_view'
  page_path: string
}

interface SignUpEvent {
  event: 'sign_up'
  method?: string
}

interface LoginEvent {
  event: 'login'
  method?: string
}

type GtmEvent = PageViewEvent | SignUpEvent | LoginEvent

export type DataLayerEntry = GtmEvent | Record<string, unknown>
