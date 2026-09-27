/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi, type Mock } from 'vitest'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'

type ManagerKeyboardSubmitOptions = {
  renderManager: () => ReturnType<typeof render>
  prepareMocks: () => void
  autocompleteValue: string
  valueLabel: string
  addValue: string
  editValue: string
  onCreate: Mock
  onUpdate: Mock
}

export function registerManagerKeyboardTests(options: ManagerKeyboardSubmitOptions): void {
  const {
    renderManager,
    prepareMocks,
    autocompleteValue,
    valueLabel,
    addValue,
    editValue,
    onCreate,
    onUpdate,
  } = options

  function fillAddForm() {
    fireEvent.change(screen.getByTestId('mock-topic-autocomplete-input'), {
      target: { value: autocompleteValue },
    })
    return screen.getByLabelText(valueLabel)
  }

  beforeEach(() => {
    vi.resetAllMocks()
    prepareMocks()
  })

  test('Enter on the value input submits the add form', () => {
    renderManager()
    const valueInput = fillAddForm() as HTMLInputElement
    fireEvent.change(valueInput, { target: { value: addValue } })
    void expectInputEnterSubmits({ input: valueInput, onSubmit: onCreate })
  })

  test('Cmd+Enter on add form note textarea submits', () => {
    renderManager()
    fireEvent.change(fillAddForm(), { target: { value: addValue } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    onCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', metaKey: true })
    expect(onCreate).toHaveBeenCalled()
  })

  test('Ctrl+Enter on add form note textarea submits', () => {
    renderManager()
    fireEvent.change(fillAddForm(), { target: { value: addValue } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    onCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', ctrlKey: true })
    expect(onCreate).toHaveBeenCalled()
  })

  test('plain Enter on add form note textarea does not submit', () => {
    renderManager()
    fireEvent.change(fillAddForm(), { target: { value: addValue } })
    const noteTextarea = screen.getByLabelText('Note (optional)') as HTMLTextAreaElement
    onCreate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter' })
    expect(onCreate).not.toHaveBeenCalled()
  })

  test('edit form has a submit button wired to the save handler', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))
    const valueInput = screen.getAllByLabelText(valueLabel)[0] as HTMLInputElement
    fireEvent.change(valueInput, { target: { value: editValue } })
    const saveButton = screen.getByRole('button', { name: /Save/i })
    expect(saveButton).toHaveAttribute('type', 'submit')
    const editForm = saveButton.closest('form')!
    onUpdate.mockClear()
    fireEvent.submit(editForm)
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
  })

  test('Cmd+Enter on the edit note textarea submits the edit form', async () => {
    renderManager()
    fireEvent.click(screen.getByRole('button', { name: /Edit/i }))
    const valueInput = screen.getAllByLabelText(valueLabel)[0] as HTMLInputElement
    fireEvent.change(valueInput, { target: { value: editValue } })
    const noteTextarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    onUpdate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter' })
    expect(onUpdate).not.toHaveBeenCalled()
    onUpdate.mockClear()
    fireEvent.keyDown(noteTextarea, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
  })
}
