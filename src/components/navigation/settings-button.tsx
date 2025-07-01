import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { Link } from "@tanstack/react-router";
import React from "react";

export default function SettingsButton() {
  const [mounted, setMounted] = React.useState(false);

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
    <Link to="/settings">
      <Button variant="outline" size="icon" className="h-8 w-8">
        <Settings className="h-4 w-4" />
      </Button>
    </Link>
  );
}
