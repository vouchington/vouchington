import type { OAuthProvider } from '@/types/user'

export const providerButtonClassNames: Record<OAuthProvider, string> = {
  google: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
  facebook: 'bg-[#166FE5] text-white border-[#166FE5] hover:bg-[#145ECC] hover:text-white',
  apple: 'bg-black text-white border-black hover:bg-gray-900 hover:text-white',
  microsoft: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
  linkedin: 'bg-[#0A66C2] text-white border-[#0A66C2] hover:bg-[#004182] hover:text-white',
  x: 'bg-black text-white border-black hover:bg-gray-900 hover:text-white',
  github: 'bg-gray-900 text-white border-gray-900 hover:bg-gray-800 hover:text-white',
}
