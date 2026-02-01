import eslintPluginPrettierRecommended from 'eslint-config-prettier'
import { fileURLToPath } from 'node:url'
import globals from 'globals'
import { includeIgnoreFile } from '@eslint/compat'
import path from 'node:path'
import pluginJs from '@eslint/js'
import pluginReact from 'eslint-plugin-react'
import reactCompiler from 'eslint-plugin-react-compiler'
import tseslint from 'typescript-eslint'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const prettierIgnorePath = path.resolve(__dirname, '.prettierignore')

/** @type {import('eslint').Linter.Config[]} */
export default [
  includeIgnoreFile(prettierIgnorePath),
  {
    languageOptions: { globals: globals.browser },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
  eslintPluginPrettierRecommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: {
      'react-compiler': reactCompiler,
    },
    rules: {
      // Disable all strict rules to allow 'any' and be less strict
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',

      // React rules - disable React import requirement for JSX
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off', // Already disabled but being explicit
      'react/jsx-uses-react': 'off', // Disable React usage detection
      'react/jsx-uses-vars': 'error', // Ensure JSX variables are used
      'react/jsx-no-undef': 'error', // Ensure JSX components are defined

      'react-compiler/react-compiler': 'off',
      'no-console': 'off',
      'no-debugger': 'off',
      'no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },
]
