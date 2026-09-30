export function IntegrityFlagsBreadcrumbsDouble() {
  return <nav data-pw='integrity-flags-page-breadcrumbs' />
}

export function IntegrityFlagsClientDouble({ initialStatus }: { initialStatus: string }) {
  return <div data-pw='integrity-flags-page-client'>{initialStatus}</div>
}
