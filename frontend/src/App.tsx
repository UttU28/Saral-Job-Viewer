import { Route, Switch } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { AppNav } from "@/components/AppNav";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChangePassword from "@/pages/ChangePassword";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Settings from "@/pages/Settings";

function Router() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route component={Login} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/settings" component={Settings} />
      <Route path="/change-password" component={ChangePassword} />
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
      <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        {isAuthenticated ? <AppNav /> : null}
        <main className="flex-1 w-full min-w-0 min-h-0 flex flex-col overflow-hidden">
          <Router />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
