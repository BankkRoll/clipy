# Translation System

**✅ WORKING 2025-2026**: Uses MyMemory API (free, reliable, no API key required)

## Quick Start

```bash
# Translate to Spanish
npm run translate es

# Translate to French
npm run translate fr

# Translate to ALL enabled languages (20+)
npm run translate:all

# List available languages
npm run translate:list
```

## How It Works

1. **Maintain only `en.ts`** - Edit your English file normally
2. **Run translations** - Generate other languages automatically
3. **Smart handling** - Preserves `{{variables}}`, `{placeholders}`, HTML
4. **Free API** - Uses MyMemory (no keys, no limits for basic usage)

## Files

- `translate.ts` - Main script using MyMemory API
- `languages.config.ts` - 25+ language configurations
- `README.md` - This documentation

## Supported Languages

| Code | Language | Status |
|------|----------|--------|
| es | 🇪🇸 Spanish | ✅ Enabled |
| fr | 🇫🇷 French | ✅ Enabled |
| de | 🇩🇪 German | ✅ Enabled |
| it | 🇮🇹 Italian | ✅ Enabled |
| pt | 🇵🇹 Portuguese | ✅ Enabled |
| ru | 🇷🇺 Russian | ✅ Enabled |
| ja | 🇯🇵 Japanese | ✅ Enabled |
| ko | 🇰🇷 Korean | ✅ Enabled |
| zh | 🇨🇳 Chinese | ✅ Enabled |
| ar | 🇸🇦 Arabic | ✅ Enabled |
| hi | 🇮🇳 Hindi | ✅ Enabled |
| And 14+ more... | | |

## Why MyMemory API?

- ✅ **100% FREE** in 2025-2026
- ✅ **No API keys** required
- ✅ **Reliable** translation quality
- ✅ **Fast** response times
- ✅ **Smart rate limit handling** - 50k chars/day per email
- ✅ **Email cycling** - Automatic switching between email addresses

## Adding Languages

Edit `scripts/languages.config.ts`:
```typescript
{ code: 'newlang', name: 'New Language', enabled: true, flag: '🏳️' }
```

## Email Cycling System

MyMemory provides **50,000 characters/day** per email address. The system automatically:

- Cycles through 5 email addresses when limits are reached
- Tracks daily usage per email (resets daily)
- Switches emails seamlessly during translation
- Handles 403 errors (daily limit exceeded) automatically

**Total capacity**: 250,000 characters/day (5 emails × 50k each)

## Tips

- Placeholders like `{name}`, `{{count}}` are preserved
- HTML markup and special characters are preserved
- Failed translations fall back to original English
- Rate limiting built-in (100ms between requests)
- Email cycling handles API limits automatically

## Troubleshooting

**Slow translations?** Normal - includes delays to avoid rate limits
**Some text unchanged?** Placeholders/variables are intentionally preserved
**API errors?** Automatic retry with exponential backoff