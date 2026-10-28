import { toast } from 'sonner'

interface OnSuccessOptions {
  description?: string
}

export function onSuccess(message: string, options?: OnSuccessOptions): void {
  if (options?.description) {
    toast.success(message, { description: options.description })
    return
  }
  toast.success(message)
}
