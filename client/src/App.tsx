import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";

import Login from "@/pages/Login";
import AdminDashboard from "@/pages/AdminDashboard";
import TechnicianDashboard from "@/pages/TechnicianDashboard";
import TicketDetail from "@/pages/TicketDetail";
import TicketsPage from "@/pages/TicketsPage";
import UsersPage from "@/pages/UsersPage";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, ...rest }: any) {
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

  return (
    <>
      <Navigation />
      <Component {...rest} />
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        {() => <Redirect to="/dashboard/admin" />}
      </Route>

      <Route path="/dashboard/admin">
        {() => <ProtectedRoute component={AdminDashboard} />}
      </Route>
      
      <Route path="/dashboard/helpdesk">
        {() => <ProtectedRoute component={AdminDashboard} />}
      </Route>

      <Route path="/dashboard/technician">
        {() => <ProtectedRoute component={TechnicianDashboard} />}
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
