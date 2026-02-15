import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTickets, useTechnicianPerformance, useAutoAssignTicket, useFreeTechnicians, useTechnicianBonusTotal } from "@/hooks/use-tickets";
import { TicketCard } from "@/components/TicketCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  History,
  MapPin,
  CheckCircle2,
  Zap,
  TrendingUp,
  Clock,
  AlertTriangle,
  Loader2,
  Users,
  UserPlus,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserRole } from "@shared/schema";
import { Redirect } from "wouter";

export default function TechnicianDashboard() {
  const { user } = useAuth();
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  if (user && user.role !== UserRole.TECHNICIAN) {
    return <Redirect to="/dashboard/admin" />;
  }

  const { data: tickets, isLoading } = useTickets({ assignedTo: user?.id });
  const { data: performance } = useTechnicianPerformance();
  const { data: bonusTotal } = useTechnicianBonusTotal();
  const { mutate: autoAssign, isPending: isAutoAssigning } = useAutoAssignTicket();
  const { data: freeTechnicians, isLoading: loadingFreeTechs } = useFreeTechnicians(user?.id);

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const activeTickets = (tickets?.filter((t: any) =>
    ['assigned', 'in_progress'].includes(t.status)
  ) || []).sort((a: any, b: any) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99));

  const historyTickets = (tickets?.filter((t: any) =>
    ['closed'].includes(t.status)
  ) || []).sort((a: any, b: any) => new Date(b.closedAt || b.updatedAt || 0).getTime() - new Date(a.closedAt || a.updatedAt || 0).getTime());

  const hasActiveTicket = activeTickets.length > 0;

  const handleGetTicketClick = () => {
    setSelectedPartnerId("");
    setShowPartnerDialog(true);
  };

  const handleConfirmGetTicket = () => {
    if (!selectedPartnerId) return;
    autoAssign(Number(selectedPartnerId), {
      onSuccess: () => {
        setShowPartnerDialog(false);
        setSelectedPartnerId("");
      },
    });
  };

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

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-white/10 backdrop-blur-sm rounded-md p-3 border border-white/15">
            <div className="text-2xl font-bold" data-testid="text-active-count">{activeTickets.length}</div>
            <div className="text-xs opacity-70 mt-0.5">Active</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-md p-3 border border-white/15">
            <div className="text-2xl font-bold" data-testid="text-completed-count">{performance?.totalCompleted ?? historyTickets.length}</div>
            <div className="text-xs opacity-70 mt-0.5">Completed</div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-md p-3 border border-white/15">
            <div className="text-lg font-bold" data-testid="text-bonus-total">
              ${(bonusTotal?.totalBonus ?? 0).toLocaleString()}
            </div>
            <div className="text-xs opacity-70 mt-0.5">Bonus</div>
          </div>
        </div>

        <Button
          onClick={handleGetTicketClick}
          disabled={isAutoAssigning || hasActiveTicket}
          className="w-full mt-4 bg-white/20 border border-white/20 text-primary-foreground gap-2"
          data-testid="button-get-ticket"
        >
          {isAutoAssigning ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Assigning...</>
          ) : hasActiveTicket ? (
            <>Complete current ticket first</>
          ) : (
            <><Zap className="w-4 h-4" /> Get Ticket</>
          )}
        </Button>
      </div>

      <div className="px-4">
        {performance && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-card border border-border rounded-md p-3 text-center">
              <TrendingUp className="w-4 h-4 mx-auto text-emerald-600 dark:text-emerald-400 mb-1" />
              <div className="text-lg font-bold" data-testid="text-sla-rate">{performance.slaComplianceRate}%</div>
              <div className="text-[10px] text-muted-foreground">SLA Rate</div>
            </div>
            <div className="bg-card border border-border rounded-md p-3 text-center">
              <Clock className="w-4 h-4 mx-auto text-blue-600 dark:text-blue-400 mb-1" />
              <div className="text-lg font-bold" data-testid="text-avg-time">
                {performance.avgResolutionMinutes > 60
                  ? `${Math.round(performance.avgResolutionMinutes / 60)}h`
                  : `${performance.avgResolutionMinutes}m`}
              </div>
              <div className="text-[10px] text-muted-foreground">Avg Time</div>
            </div>
            <div className="bg-card border border-border rounded-md p-3 text-center">
              <AlertTriangle className="w-4 h-4 mx-auto text-amber-600 dark:text-amber-400 mb-1" />
              <div className="text-lg font-bold" data-testid="text-overdue-count">{performance.totalOverdue}</div>
              <div className="text-[10px] text-muted-foreground">Overdue</div>
            </div>
          </div>
        )}

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
                <p className="text-sm mt-1">Press "Get Ticket" to receive a new task.</p>
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

      <Dialog open={showPartnerDialog} onOpenChange={setShowPartnerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Select Partner
            </DialogTitle>
            <DialogDescription>
              Choose a partner technician to work with. Only technicians without active tickets are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger data-testid="select-partner">
                <SelectValue placeholder="Choose a partner..." />
              </SelectTrigger>
              <SelectContent>
                {loadingFreeTechs ? (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                    Loading...
                  </div>
                ) : freeTechnicians && freeTechnicians.length > 0 ? (
                  freeTechnicians.map((tech: any) => (
                    <SelectItem key={tech.id} value={String(tech.id)} data-testid={`option-partner-${tech.id}`}>
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{tech.name}</span>
                        {tech.isBackboneSpecialist && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 rounded-full font-medium">
                            Backbone
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-3 text-center text-sm text-muted-foreground">
                    No available partners
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPartnerDialog(false)} data-testid="button-cancel-partner">
              Cancel
            </Button>
            <Button
              onClick={handleConfirmGetTicket}
              disabled={!selectedPartnerId || isAutoAssigning}
              className="gap-2"
              data-testid="button-confirm-get-ticket"
            >
              {isAutoAssigning ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Assigning...</>
              ) : (
                <><Zap className="w-4 h-4" /> Get Ticket</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
