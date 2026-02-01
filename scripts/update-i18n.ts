#!/usr/bin/env ts-node

import { LANGUAGES } from './languages.config'
import fs from 'fs'
import path from 'path'

const LANG_DIR = path.join(__dirname, '../src/localization/languages')
const I18N_FILE = path.join(__dirname, '../src/localization/i18n.ts')
const LANG_CONFIG_FILE = path.join(__dirname, '../src/localization/languages.ts')

// Get all existing language files
function getExistingLanguages(): string[] {
  try {
    const files = fs.readdirSync(LANG_DIR)
    return files.filter(file => file.endsWith('.ts') && file !== 'en.ts').map(file => file.replace('.ts', ''))
  } catch (error) {
    console.error('Error reading languages directory:', error)
    return []
  }
}

// Update i18n.ts file
function updateI18nFile(existingLanguages: string[]): void {
  console.log('🔄 Updating i18n.ts...')

  // Generate imports
  let imports = "import { en } from './languages/en'\n"
  existingLanguages.forEach(lang => {
    imports += `import { ${lang} } from './languages/${lang}'\n`
  })
  imports += "import i18n from 'i18next'\nimport { initReactI18next } from 'react-i18next'\n\n"

  // Generate resources object
  let resources = '  resources: {\n    en,\n'
  existingLanguages.forEach(lang => {
    resources += `    ${lang},\n`
  })
  resources += '  },\n'

  const content = `${imports}// Import language resources

i18n.use(initReactI18next).init({
  fallbackLng: 'en',
${resources}  interpolation: {
    escapeValue: false,
  },
})

export default i18n
`

  fs.writeFileSync(I18N_FILE, content, 'utf8')
  console.log('✅ Updated i18n.ts')
}

// Update languages.ts file
function updateLanguagesFile(existingLanguages: string[]): void {
  console.log('🔄 Updating languages.ts...')

  const languageEntries = existingLanguages
    .map(langCode => {
      const langConfig = LANGUAGES.find(l => l.code === langCode)
      if (!langConfig) return null

      return `  {
    key: "${langConfig.code}",
    nativeName: "${langConfig.name}",
    prefix: "${langConfig.flag || ''}",
  }`
    })
    .filter(Boolean)

  const content = `export interface Language {
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
${languageEntries.join(',\n')},
] satisfies Language[]
`

  fs.writeFileSync(LANG_CONFIG_FILE, content, 'utf8')
  console.log('✅ Updated languages.ts')
}

// Main function
function main(): void {
  console.log('🌍 Updating i18n configuration...')

  const existingLanguages = getExistingLanguages()
  console.log(`📁 Found language files: ${existingLanguages.join(', ')}`)

  if (existingLanguages.length === 0) {
    console.log('⚠️  No language files found besides English')
    return
  }

  try {
    updateI18nFile(existingLanguages)
    updateLanguagesFile(existingLanguages)

    console.log('🎉 i18n configuration updated successfully!')
    console.log(`📊 ${existingLanguages.length} languages now available in your app`)
  } catch (error) {
    console.error('❌ Error updating i18n configuration:', error)
    process.exit(1)
  }
}

main()
