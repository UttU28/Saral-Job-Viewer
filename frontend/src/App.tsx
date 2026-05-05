import { Switch, Route } from "wouter";
import { AppNav } from "@/components/AppNav";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        <AppNav />
        <main className="flex-1 w-full min-w-0 min-h-0 flex flex-col overflow-hidden">
          <Router />
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
