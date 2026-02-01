import { en } from './languages/en'
import { es } from './languages/es'
import { fr } from './languages/fr'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Import language resources

i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  resources: {
    en,
    es,
    fr,
  },
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
