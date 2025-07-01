import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/helpers/theme_helpers";
import { Moon, Sun } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

export default function ToggleTheme() {
  const [mounted, setMounted] = React.useState(false);
  const { t } = useTranslation();

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" className="h-8 w-8">
        <div className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button 
      onClick={toggleTheme}
      variant="outline" 
      size="icon" 
      className="h-8 w-8 hover:bg-accent transition-colors"
      aria-label={t("toggleTheme")}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}
