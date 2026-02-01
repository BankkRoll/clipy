import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Globe, Languages } from 'lucide-react'
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
    <Card className="border-border/50 bg-card/50 border shadow-lg backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
            <Globe className="text-primary h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-foreground text-2xl font-bold">{t('settingsLanguageTitle')}</CardTitle>
            <CardDescription className="text-muted-foreground mt-1 text-base">
              {t('settingsLanguageDescription')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <RadioGroup value={currentLang} onValueChange={onLanguageChange} className="space-y-4">
          {langs.map(lang => (
            <div key={lang.key} className="flex items-center space-x-4">
              <RadioGroupItem value={lang.key} id={lang.key} className="mt-0.5" />
              <Label
                htmlFor={lang.key}
                className="bg-muted/30 border-border/50 hover:bg-muted/50 flex-1 cursor-pointer rounded-lg border p-4 transition-colors"
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{lang.prefix}</span>
                    <div>
                      <p className="text-foreground font-semibold">{lang.nativeName}</p>
                      <p className="text-muted-foreground mt-1 text-xs tracking-wider uppercase">{lang.key}</p>
                    </div>
                  </div>
                  {currentLang === lang.key && (
                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                      {t('settingsActive')}
                    </Badge>
                  )}
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <div className="from-primary/5 to-primary/10 border-primary/20 mt-8 rounded-xl border bg-gradient-to-r p-5">
          <div className="flex items-start gap-4">
            <div className="bg-primary/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
              <Languages className="text-primary h-4 w-4" />
            </div>
            <div className="text-sm">
              <p className="text-foreground mb-2 font-semibold">{t('settingsLanguagePackInfo')}</p>
              <p className="text-muted-foreground leading-relaxed">{t('settingsLanguagePackDescription')}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
