import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Tasks from "./pages/Tasks";
import Infrastructure from "./pages/Infrastructure";
import Secrets from "./pages/Secrets";
import Logs from "./pages/Logs";
import NewProject from "./pages/NewProject";
import Settings from "./pages/Settings";
import Audits from "./pages/Audits";
import Marketing from "./pages/Marketing";
import SandboxList from "./pages/SandboxList";
import SandboxNew from "./pages/SandboxNew";
import SandboxDetail from "./pages/SandboxDetail";
import MetaAds from "./pages/MetaAds";
import DashboardLayout from "./components/DashboardLayout";
import AuthCallback from "./pages/AuthCallback";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Redirect to="/login" />;
  if (adminOnly && user.role !== "admin") return <Redirect to="/" />;

  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/auth/callback" component={AuthCallback} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/agents" component={() => <ProtectedRoute component={Agents} />} />
      <Route path="/tasks" component={() => <ProtectedRoute component={Tasks} />} />
      <Route path="/infrastructure" component={() => <ProtectedRoute component={Infrastructure} />} />
      <Route path="/secrets" component={() => <ProtectedRoute component={Secrets} adminOnly />} />
      <Route path="/logs" component={() => <ProtectedRoute component={Logs} />} />
      <Route path="/projects/new" component={() => <ProtectedRoute component={NewProject} adminOnly />} />
      <Route path="/audits" component={() => <ProtectedRoute component={Audits} />} />
      <Route path="/marketing" component={() => <ProtectedRoute component={Marketing} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/sandbox" component={() => <ProtectedRoute component={SandboxList} />} />
      <Route path="/sandbox/new" component={() => <ProtectedRoute component={SandboxNew} />} />
      <Route path="/sandbox/:id" component={() => <ProtectedRoute component={SandboxDetail} />} />
      <Route path="/meta-ads" component={() => <ProtectedRoute component={MetaAds} />} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
