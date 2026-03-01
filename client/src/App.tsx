import { Switch, Route, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

const Login = lazy(() => import("@/pages/Login"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const TechnicianDashboard = lazy(() => import("@/pages/TechnicianDashboard"));
const TechnicianTicketsMonitor = lazy(() => import("@/pages/TechnicianTicketsMonitor"));
const TicketDetail = lazy(() => import("@/pages/TicketDetail"));
const TicketsPage = lazy(() => import("@/pages/TicketsPage"));
const OpenTicketsPage = lazy(() => import("@/pages/OpenTicketsPage"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

function RouteLoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-svh w-full overflow-hidden">
        <AppSidebar />
        <div className="flex min-h-0 flex-1 min-w-0 flex-col">
          <header className="sticky top-0 z-50 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur supports-[padding:max(0px)]:pl-[max(0.5rem,env(safe-area-inset-left))] supports-[padding:max(0px)]:pr-[max(0.5rem,env(safe-area-inset-right))]" data-testid="navigation-header">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function ProtectedRoute({ component: Component, ...rest }: any) {
  return (
    <ProtectedLayout>
      <Component {...rest} />
    </ProtectedLayout>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/login" component={Login} />

        <Route path="/dashboard/admin">
          {() => <ProtectedRoute component={AdminDashboard} />}
        </Route>
        
        <Route path="/dashboard/helpdesk">
          {() => <ProtectedRoute component={AdminDashboard} />}
        </Route>

        <Route path="/dashboard/technician">
          {() => <ProtectedRoute component={TechnicianDashboard} />}
        </Route>

        <Route path="/tickets/open">
          {() => <ProtectedRoute component={OpenTicketsPage} />}
        </Route>

        <Route path="/tickets/monitor">
          {() => <ProtectedRoute component={TechnicianTicketsMonitor} />}
        </Route>

        <Route path="/tickets/:id">
          {() => <ProtectedRoute component={TicketDetail} />}
        </Route>

        <Route path="/tickets">
          {() => <ProtectedRoute component={TicketsPage} />}
        </Route>

        <Route path="/users">
          {() => <ProtectedRoute component={UsersPage} />}
        </Route>

        <Route path="/settings">
          {() => <ProtectedRoute component={SettingsPage} />}
        </Route>

        <Route path="/reports">
          {() => <ProtectedRoute component={ReportsPage} />}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
