/**
 * LanguageSelector - Language preference settings
 * Clean radio button list of available languages with i18n integration.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import langs from '@/localization/languages'
import { useTranslation } from 'react-i18next'

export default function LanguageSelector() {
  const { i18n, t } = useTranslation()
  const currentLang = i18n.language

  function setAppLanguage(langKey: string, i18n: any) {
    i18n.changeLanguage(langKey)
    localStorage.setItem('i18nextLng', langKey)
  }

  function onLanguageChange(langKey: string) {
    setAppLanguage(langKey, i18n)
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t('settingsLanguageTitle')}</CardTitle>
        <CardDescription>{t('settingsLanguageDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={currentLang}
          onValueChange={onLanguageChange}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {langs.map(lang => (
            <Label
              key={lang.key}
              htmlFor={lang.key}
              className={`border-border/50 hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
                currentLang === lang.key ? 'border-primary bg-primary/5' : 'bg-muted/20'
              }`}
            >
              <RadioGroupItem value={lang.key} id={lang.key} />
              <span className="text-2xl">{lang.prefix}</span>
              <div className="flex-1">
                <p className="text-foreground font-medium">{lang.nativeName}</p>
                <p className="text-muted-foreground text-xs uppercase">{lang.key}</p>
              </div>
              {currentLang === lang.key && (
                <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                  {t('settingsActive')}
                </Badge>
              )}
            </Label>
          ))}
        </RadioGroup>

        <p className="text-muted-foreground mt-6 text-sm">{t('settingsLanguagePackDescription')}</p>
      </CardContent>
    </Card>
  )
}
