import { useAuth } from "@/hooks/use-auth";
import { useTickets } from "@/hooks/use-tickets";
import { TicketCard } from "@/components/TicketCard";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ClipboardList, 
  History, 
  MapPin, 
  Trophy 
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserRole } from "@shared/schema";
import { Redirect } from "wouter";

export default function TechnicianDashboard() {
  const { user } = useAuth();

  // Redirect if not technician
  if (user && user.role !== UserRole.TECHNICIAN) {
    return <Redirect to="/dashboard/admin" />;
  }

  const { data: tickets, isLoading } = useTickets({ assignedTo: user?.id });

  const activeTickets = tickets?.filter(t => 
    ['assigned', 'in_progress'].includes(t.status)
  ) || [];

  const historyTickets = tickets?.filter(t => 
    ['closed'].includes(t.status)
  ) || [];

  return (
    <div className="container mx-auto max-w-lg pb-20">
      <div className="bg-primary px-6 pt-8 pb-12 rounded-b-[2.5rem] shadow-xl shadow-primary/20 mb-6 text-primary-foreground">
        <h1 className="text-2xl font-bold font-display">Hello, {user?.name.split(' ')[0]}</h1>
        <p className="opacity-90 mt-1 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Ready for assignments
        </p>
        
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="text-3xl font-bold">{activeTickets.length}</div>
            <div className="text-sm opacity-80">Active Tasks</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
            <div className="text-3xl font-bold">95%</div>
            <div className="text-sm opacity-80">SLA Score</div>
          </div>
        </div>
      </div>

      <div className="px-4">
        <Tabs defaultValue="active" className="space-y-4">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="active" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              My Tasks
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4 animate-in fade-in-50">
            {isLoading ? (
              [1, 2].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)
            ) : activeTickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <h3 className="font-semibold text-lg">All caught up!</h3>
                <p>No active tickets assigned to you.</p>
              </div>
            ) : (
              activeTickets.map(ticket => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-4 animate-in fade-in-50">
            {historyTickets.map(ticket => (
              <TicketCard key={ticket.id} ticket={ticket} compact />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
