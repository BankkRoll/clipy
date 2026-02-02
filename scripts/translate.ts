#!/usr/bin/env ts-node

import { ENABLED_LANGUAGES, LANGUAGES, LanguageConfig } from './languages.config'

import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const SOURCE_FILE = path.join(__dirname, '../src/localization/languages/en.ts')
const OUTPUT_DIR = path.join(__dirname, '../src/localization/languages')

// Email pool for API rate limit cycling (MyMemory allows 50k chars/day per email)
const EMAIL_POOL = [
  'user2@clipy-app.com',
  'user3@clipy-app.com',
  'user4@clipy-app.com',
  'user5@clipy-app.com',
  'support@clipy-app.com',
  'contact@clipy-app.com',
  'dev@clipy-app.com',
  'translations@clipy-app.com',
]

let currentEmailIndex = 0
let dailyCharCount = 0
const MAX_CHARS_PER_EMAIL = 45000 // Leave some buffer below 50k limit
let lastResetDate = new Date().toDateString()

// Get current email for API calls
function getCurrentEmail(): string {
  // Reset counter daily
  const today = new Date().toDateString()
  if (today !== lastResetDate) {
    dailyCharCount = 0
    lastResetDate = today
  }

  // Switch to next email if approaching limit
  if (dailyCharCount >= MAX_CHARS_PER_EMAIL) {
    currentEmailIndex = (currentEmailIndex + 1) % EMAIL_POOL.length
    dailyCharCount = 0
    console.log(`🔄 Switched to email: ${EMAIL_POOL[currentEmailIndex]}`)
  }

  return EMAIL_POOL[currentEmailIndex]
}

interface TranslationObject {
  [key: string]: string | TranslationObject
}

// Check if text contains placeholders that should not be translated
function hasPlaceholders(text: string): boolean {
  return /\{\{[^}]+\}\}|\{[^}]+\}|\$[a-zA-Z_][a-zA-Z0-9_]*|\{\d+\}/g.test(text)
}

// Check if text contains HTML or special markup
function hasMarkup(text: string): boolean {
  return /<[^>]*>/g.test(text) || /&[a-zA-Z0-9#]+;/g.test(text)
}

// Sleep function for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Translate a single string
async function translateText(text: string, targetLang: string, retries = 5): Promise<string> {
  // Skip translation for placeholders, markup, or very short strings
  if (hasPlaceholders(text) || hasMarkup(text) || text.length < 2) {
    return text
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const currentEmail = getCurrentEmail()
      const response = await axios.get('https://api.mymemory.translated.net/get', {
        params: {
          q: text,
          langpair: `en|${targetLang}`,
          de: currentEmail, // Cycle through emails for higher limits (50k chars/day each)
          mt: 1, // Enable machine translation
        },
        timeout: 15000, // 15 second timeout
      })

      // Track character usage
      dailyCharCount += text.length

      // Check if translation was successful
      if (response.data.responseStatus === 200 && response.data.responseData) {
        const translatedText = response.data.responseData.translatedText
        if (typeof translatedText === 'string' && translatedText.trim()) {
          return translatedText
        }
      }

      // Handle specific API responses
      if (response.data.responseStatus === 429) {
        throw new Error('RATE_LIMIT_EXCEEDED')
      } else if (response.data.responseStatus === 403) {
        // Daily limit exceeded, switch to next email
        currentEmailIndex = (currentEmailIndex + 1) % EMAIL_POOL.length
        dailyCharCount = 0
        console.log(`🚫 Daily limit reached, switched to email: ${EMAIL_POOL[currentEmailIndex]}`)
        throw new Error('EMAIL_LIMIT_EXCEEDED')
      } else if (response.data.responseStatus !== 200) {
        throw new Error(
          `API returned status ${response.data.responseStatus}: ${response.data.responseDetails || 'Unknown error'}`,
        )
      }

      throw new Error('Invalid response format')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('RATE_LIMIT_EXCEEDED') || errorMessage.includes('429')) {
        const waitTime = Math.min(30000, 2000 * attempt * attempt) // Exponential backoff, max 30s
        console.warn(
          `🚦 Rate limit hit for "${text.slice(0, 30)}..." → waiting ${waitTime / 1000}s before retry ${attempt}/${retries}`,
        )
        await sleep(waitTime)
        continue
      }

      if (errorMessage.includes('EMAIL_LIMIT_EXCEEDED') || errorMessage.includes('403')) {
        // Email limit exceeded, switch email and retry immediately
        console.warn(`📧 Email limit exceeded, switching email and retrying...`)
        continue
      }

      console.warn(
        `⚠️ Translation attempt ${attempt}/${retries} failed for "${text.slice(0, 50)}..." to ${targetLang}:`,
        errorMessage,
      )

      if (attempt === retries) {
        console.warn(`❌ Failed to translate after ${retries} attempts, keeping original: "${text.slice(0, 50)}..."`)
        return text
      }

      // Wait with exponential backoff for other errors too
      const waitTime = Math.min(10000, 1000 * attempt)
      await sleep(waitTime)
    }
  }

  return text
}

// Recursively translate an object
async function translateObject(obj: TranslationObject, targetLang: string): Promise<TranslationObject> {
  const result: TranslationObject = {}
  const entries = Object.entries(obj)
  let processed = 0

  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      const translated = await translateText(value, targetLang)
      result[key] = translated
      processed++

      // Show progress for root level keys only
      if (!key.includes('.') && !key.startsWith('_')) {
        const progress = ((processed / entries.length) * 100).toFixed(1)
        console.log(`  📝 ${progress}% - ${key}: "${translated.slice(0, 35)}..."`)
      }
    } else if (typeof value === 'object' && value !== null) {
      result[key] = await translateObject(value, targetLang)
      processed++
    } else {
      result[key] = value
      processed++
    }

    // Very small delay to be respectful to the API
    await sleep(50)
  }

  return result
}

// Generate language file content
function generateLanguageFile(languageCode: string, translations: TranslationObject): string {
  // Custom stringify to use single quotes instead of double quotes
  function stringifyWithSingleQuotes(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent)
    const nextSpaces = '  '.repeat(indent + 1)

    if (typeof obj === 'string') {
      return `'${obj.replace(/'/g, "\\'")}'`
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]'
      const items = obj.map(item => stringifyWithSingleQuotes(item, indent + 1))
      return `[\n${nextSpaces}${items.join(`,\n${nextSpaces}`)}\n${spaces}]`
    }

    if (typeof obj === 'object' && obj !== null) {
      const entries = Object.entries(obj)
      if (entries.length === 0) return '{}'

      const items = entries.map(([key, value]) => {
        return `${nextSpaces}${key}: ${stringifyWithSingleQuotes(value, indent + 1)}`
      })

      return `{\n${items.join(',\n')}\n${spaces}}`
    }

    return JSON.stringify(obj)
  }

  const content = stringifyWithSingleQuotes(translations, 1)
  return `export const ${languageCode} = {\n  translation: ${content}\n};\n`
}

// Main translation function
async function translateLanguage(language: LanguageConfig): Promise<void> {
  console.log(`\n🚀 Translating to ${language.name} (${language.code}) ${language.flag || ''}`)
  console.log(`📧 Using email: ${getCurrentEmail()} (${dailyCharCount}/${MAX_CHARS_PER_EMAIL} chars used)`)
  const startTime = Date.now()

  try {
    // Import the English translations
    const enModule = await import(pathToFileURL(SOURCE_FILE).href)
    const enTranslations = enModule.en.translation

    console.log(`📖 Loaded ${Object.keys(enTranslations).length} translation keys from en.ts`)

    // Check if output file already exists
    const outputPath = path.join(OUTPUT_DIR, `${language.code}.ts`)
    if (fs.existsSync(outputPath)) {
      console.log(`📝 File ${language.code}.ts already exists, will be updated...`)
    }

    // Translate the content
    console.log(`🔄 Starting translation process...`)
    const translatedContent = await translateObject(enTranslations, language.code)

    // Generate the file content
    const fileContent = generateLanguageFile(language.code, translatedContent)

    // Write to file
    fs.writeFileSync(outputPath, fileContent, 'utf8')

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`✅ Generated ${outputPath} (${duration}s)`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`❌ Failed to translate ${language.code}: ${errorMessage}`)
  }
}

// Main script execution
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('🌍 Clipy Translation Generator')
    console.log('Usage:')
    console.log('  npm run translate:all          - Translate to all enabled languages')
    console.log('  npm run translate <lang>       - Translate to specific language (e.g., es, fr)')
    console.log('  npm run translate:list         - List all available languages')
    console.log('  npm run translate:status       - Check translation status')
    console.log('')
    console.log('Available languages:')
    LANGUAGES.forEach(lang => {
      const status = lang.enabled ? '(enabled)' : '(disabled)'
      const flag = lang.flag || ''
      console.log(`  ${lang.code.padEnd(3)} - ${flag} ${lang.name} ${status}`)
    })
    return
  }

  const command = args[0]

  if (command === 'list') {
    console.log('Available languages:')
    LANGUAGES.forEach(lang => {
      const flag = lang.flag || ''
      const status = lang.enabled ? '(enabled)' : '(disabled)'
      console.log(`  ${lang.code.padEnd(3)} - ${flag} ${lang.name} ${status}`)
    })
    return
  }

  if (command === 'status') {
    console.log('Translation Status:')
    let existingCount = 0
    let missingCount = 0

    ENABLED_LANGUAGES.forEach(lang => {
      const filePath = path.join(OUTPUT_DIR, `${lang.code}.ts`)
      const exists = fs.existsSync(filePath)
      const flag = lang.flag || ''
      const status = exists ? '✅' : '❌'

      console.log(`  ${status} ${lang.code} - ${flag} ${lang.name}`)

      if (exists) existingCount++
      else missingCount++
    })

    console.log(`\n📊 Summary: ${existingCount} generated, ${missingCount} missing`)
    console.log(`📧 Current email: ${getCurrentEmail()} (${dailyCharCount}/${MAX_CHARS_PER_EMAIL} chars used today)`)
    console.log(`🔄 Email pool: ${EMAIL_POOL.length} available`)
    return
  }

  if (command === 'all') {
    console.log(`🎯 Translating to ${ENABLED_LANGUAGES.length} languages...`)
    console.log(`💡 This may take 30-60 minutes. Rate limits will be handled automatically.`)
    console.log(`💡 Progress will be shown for each language.\n`)

    const totalLanguages = ENABLED_LANGUAGES.length
    let completed = 0
    const startTime = Date.now()

    for (const language of ENABLED_LANGUAGES) {
      try {
        await translateLanguage(language)
        completed++

        const progress = ((completed / totalLanguages) * 100).toFixed(1)
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
        console.log(`📊 Progress: ${completed}/${totalLanguages} languages (${progress}%) - ${elapsed}min elapsed`)

        // Longer delay between languages to be respectful to the API
        if (completed < totalLanguages) {
          console.log(`⏳ Waiting 5 seconds before next language...\n`)
          await sleep(5000)
        }
      } catch (error) {
        console.error(`💥 Critical error processing ${language.code}, continuing with next language...`)
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
    console.log(
      `\n🎉 Translation complete! Generated ${completed}/${totalLanguages} language files in ${totalTime} minutes.`,
    )
    console.log(`📁 Check src/localization/languages/ for the generated files.`)
    return
  }

  // Translate specific language
  const targetLanguage = LANGUAGES.find(
    lang => lang.code === command || lang.name.toLowerCase() === command.toLowerCase(),
  )
  if (!targetLanguage) {
    console.error(`❌ Language '${command}' not found. Use 'npm run translate:list' to see available languages.`)
    process.exit(1)
  }

  await translateLanguage(targetLanguage)
  console.log(`\n🎉 Translation complete for ${targetLanguage.name}!`)
}

// Handle errors
main().catch(error => {
  console.error('❌ Translation script failed:', error)
  process.exit(1)
})
