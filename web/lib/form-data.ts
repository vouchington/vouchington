export function getFormText(formData: FormData, name: string): string | null {
  const value = formData.get(name)
  return typeof value === 'string' ? value : null
}
