import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center card-pharma p-10">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            background: 'linear-gradient(180deg, hsl(210 20% 96%) 0%, hsl(210 20% 88%) 100%)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.06)',
            border: '1px solid hsl(214 20% 82%)',
          }}
        >
          <span className="text-4xl font-heading font-bold text-muted-foreground text-emboss">404</span>
        </div>
        <p className="mb-6 text-lg text-muted-foreground">Oops! Page not found</p>
        <Button asChild>
          <a href="/">Return to Home</a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
