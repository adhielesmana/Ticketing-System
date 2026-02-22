import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import AdminDashboard from "@/pages/AdminDashboard";
import TechnicianDashboard from "@/pages/TechnicianDashboard";
import TicketDetail from "@/pages/TicketDetail";
import TicketsPage from "@/pages/TicketsPage";
import OpenTicketsPage from "@/pages/OpenTicketsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import ReportsPage from "@/pages/ReportsPage";
import NotFound from "@/pages/not-found";

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
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-2 p-2 border-b border-border sticky top-0 z-50 bg-background" data-testid="navigation-header">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </header>
          <main className="flex-1 overflow-auto">
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
