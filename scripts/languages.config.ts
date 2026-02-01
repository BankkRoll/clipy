export interface LanguageConfig {
  code: string
  name: string
  enabled: boolean
  flag?: string
}

export const LANGUAGES: LanguageConfig[] = [
  { code: 'es', name: 'Spanish', enabled: true, flag: '🇪🇸' },
  { code: 'fr', name: 'French', enabled: true, flag: '🇫🇷' },
  { code: 'de', name: 'German', enabled: false, flag: '🇩🇪' },
  { code: 'it', name: 'Italian', enabled: false, flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', enabled: false, flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', enabled: false, flag: '🇷🇺' },
  { code: 'ja', name: 'Japanese', enabled: false, flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', enabled: false, flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese (Simplified)', enabled: false, flag: '🇨🇳' },
  { code: 'ar', name: 'Arabic', enabled: false, flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', enabled: false, flag: '🇮🇳' },
  { code: 'nl', name: 'Dutch', enabled: false, flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', enabled: false, flag: '🇸🇪' },
  { code: 'pl', name: 'Polish', enabled: false, flag: '🇵🇱' },
  { code: 'da', name: 'Danish', enabled: false, flag: '🇩🇰' },
  { code: 'no', name: 'Norwegian', enabled: false, flag: '🇳🇴' },
  { code: 'fi', name: 'Finnish', enabled: false, flag: '🇫🇮' },
  { code: 'tr', name: 'Turkish', enabled: false, flag: '🇹🇷' },
  { code: 'cs', name: 'Czech', enabled: false, flag: '🇨🇿' },
  { code: 'hu', name: 'Hungarian', enabled: false, flag: '🇭🇺' },
  { code: 'th', name: 'Thai', enabled: false, flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', enabled: false, flag: '🇻🇳' },
  { code: 'he', name: 'Hebrew', enabled: false, flag: '🇮🇱' },
  { code: 'uk', name: 'Ukrainian', enabled: false, flag: '🇺🇦' },
  { code: 'ro', name: 'Romanian', enabled: false, flag: '🇷🇴' },
]

export const ENABLED_LANGUAGES = LANGUAGES.filter(lang => lang.enabled)

export default LANGUAGES
