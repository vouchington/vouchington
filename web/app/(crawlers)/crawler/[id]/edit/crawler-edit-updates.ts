export function buildCrawlerUpdates(formData: FormData, crawlerType: string) {
  return {
    description: formData.get('description'),
    crawler_type: crawlerType,
    priority: Number(formData.get('priority')),
    css_selectors_to_remove: formLines(formData, 'css_selectors_to_remove'),
    link_text_content_to_remove: formLines(formData, 'link_text_content_to_remove'),
    link_hrefs_to_remove: formLines(formData, 'link_hrefs_to_remove'),
  }
}

function formLines(formData: FormData, name: string) {
  return formData
    .get(name)
    ?.toString()
    .split('\n')
    .filter((line: string) => line.trim())
}
