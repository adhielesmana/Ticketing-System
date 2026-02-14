import { useAuth } from "@/hooks/use-auth";
import { useTickets } from "@/hooks/use-tickets";
import { TicketCard } from "@/components/TicketCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardList,
  History,
  MapPin,
  CheckCircle2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserRole } from "@shared/schema";
import { Redirect } from "wouter";

export default function TechnicianDashboard() {
  const { user } = useAuth();

  if (user && user.role !== UserRole.TECHNICIAN) {
    return <Redirect to="/dashboard/admin" />;
  }

  const { data: tickets, isLoading } = useTickets({ assignedTo: user?.id });

  const activeTickets = tickets?.filter((t: any) =>
    ['assigned', 'in_progress'].includes(t.status)
  ) || [];

  const historyTickets = tickets?.filter((t: any) =>
    ['closed'].includes(t.status)
  ) || [];

  return (
    <div className="container mx-auto max-w-lg pb-20">
      <div className="bg-primary px-5 pt-6 pb-10 rounded-b-[2rem] mb-5 text-primary-foreground">
        <h1 className="text-xl font-bold font-display" data-testid="text-tech-greeting">
          Hello, {user?.name.split(' ')[0]}
        </h1>
        <p className="opacity-80 mt-0.5 flex items-center gap-1.5 text-sm">
          <MapPin className="w-3.5 h-3.5" />
          Ready for assignments
        </p>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-sm rounded-md p-3 border border-white/15">
            <div className="text-2xl font-bold" data-testid="text-active-count">{activeTickets.length}</div>
            <div className="text-xs opacity-70 mt-0.5">Active Tasks</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-md p-3 border border-white/15">
            <div className="text-2xl font-bold" data-testid="text-completed-count">{historyTickets.length}</div>
            <div className="text-xs opacity-70 mt-0.5">Completed</div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="active" className="gap-1.5 text-sm" data-testid="tab-active">
              <ClipboardList className="w-3.5 h-3.5" />
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-sm" data-testid="tab-history">
              <History className="w-3.5 h-3.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3">
            {isLoading ? (
              [1, 2].map(i => <Skeleton key={i} className="h-40 w-full rounded-md" />)
            ) : activeTickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <h3 className="font-semibold text-base">All caught up</h3>
                <p className="text-sm mt-1">No active tickets assigned to you.</p>
              </div>
            ) : (
              activeTickets.map((ticket: any) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {historyTickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No completed tickets yet</p>
              </div>
            ) : (
              historyTickets.map((ticket: any) => (
                <TicketCard key={ticket.id} ticket={ticket} compact />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
