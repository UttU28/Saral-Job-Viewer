import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { AppNav } from "@/components/AppNav";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import AuthHome from "@/pages/AuthHome";
import Admin from "@/pages/Admin";
import Profile from "@/pages/Profile";

function Router() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={AuthHome} />
        <Route path="/register" component={AuthHome} />
        <Route component={AuthHome} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/profile" component={Profile} />
      <Route path="/admin" component={Admin} />
      <Route path="/change-password" component={Profile} />
      <Route path="/login" component={Home} />
      <Route path="/register" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { isAuthenticated, isHydrating } = useAuth();

  if (isHydrating) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        {isAuthenticated ? <AppNav /> : null}
        <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
          <Router />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
