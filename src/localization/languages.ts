/**
 * Supported Languages
 * List of available language options for the language selector.
 */

export interface Language {
  key: string
  nativeName: string
  prefix: string
}

export default [
  {
    key: 'en',
    nativeName: 'English',
    prefix: '🇺🇸',
  },
  {
    key: 'es',
    nativeName: 'Español',
    prefix: '🇪🇸',
  },
  {
    key: 'fr',
    nativeName: 'Français',
    prefix: '🇫🇷',
  },

  // More languages will be added automatically when generated
] satisfies Language[]
