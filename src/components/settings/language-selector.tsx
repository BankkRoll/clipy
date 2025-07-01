import { setAppLanguage } from "@/helpers/language_helpers";
import langs from "@/localization/langs";
import { Globe, Languages } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const currentLang = i18n.language;

  function onLanguageChange(langKey: string) {
    setAppLanguage(langKey, i18n);
  }

  return (
    <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">{t("settingsLanguageTitle")}</CardTitle>
            <CardDescription className="text-base text-muted-foreground mt-1">
              {t("settingsLanguageDescription")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <RadioGroup 
          value={currentLang} 
          onValueChange={onLanguageChange}
          className="space-y-4"
        >
          {langs.map((lang) => (
            <div key={lang.key} className="flex items-center space-x-4">
              <RadioGroupItem 
                value={lang.key} 
                id={lang.key}
                className="mt-0.5"
              />
              <Label 
                htmlFor={lang.key} 
                className="flex-1 cursor-pointer p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">{lang.prefix}</span>
                    <div>
                      <p className="font-semibold text-foreground">{lang.nativeName}</p>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                        {lang.key}
                      </p>
                    </div>
                  </div>
                  {currentLang === lang.key && (
                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                      {t("settingsActive")}
                    </Badge>
                  )}
                </div>
              </Label>
            </div>
          ))}
        </RadioGroup>
        
        <div className="mt-8 p-5 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Languages className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm">
              <p className="font-semibold text-foreground mb-2">{t("settingsLanguagePackInfo")}</p>
              <p className="text-muted-foreground leading-relaxed">
                {t("settingsLanguagePackDescription")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

