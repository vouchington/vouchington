import { describe, expect, it } from 'vitest'
import { getFormText } from './form-data'

describe('getFormText', () => {
  it('returns text fields without coercion', () => {
    const formData = new FormData()
    formData.set('title', 'Hello')

    expect(getFormText(formData, 'title')).toBe('Hello')
  })

  it('distinguishes absent and file fields from text', () => {
    const formData = new FormData()
    formData.set('upload', new File(['payload'], 'payload.txt'))

    expect(getFormText(formData, 'missing')).toBeNull()
    expect(getFormText(formData, 'upload')).toBeNull()
  })
})
