export interface PageViewEvent {
  event: 'page_view'
  page_path: string
}

export interface SignUpEvent {
  event: 'sign_up'
  method?: string
}

export interface LoginEvent {
  event: 'login'
  method?: string
}

export type GtmEvent = PageViewEvent | SignUpEvent | LoginEvent

export type DataLayerEntry = GtmEvent | Record<string, unknown>
