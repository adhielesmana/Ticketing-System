import { useState, useEffect, useCallback } from "react";
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
  Radar,
  Wifi,
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

const SCAN_MESSAGES = [
  "Scanning nearby area...",
  "Checking SLA priorities...",
  "Calculating distances...",
  "Analyzing workload balance...",
  "Matching ticket type...",
  "Evaluating proximity...",
  "Finding optimal route...",
  "Locking best match...",
];

function TicketScanOverlay({ onFound, onError }: { onFound: () => void; onError: (msg: string) => void }) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState<Array<{ id: number; x: number; y: number; delay: number; size: number }>>([]);
  const [phase, setPhase] = useState<"scanning" | "found" | "error">("scanning");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const generated = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60,
      delay: Math.random() * 2,
      size: 4 + Math.random() * 6,
    }));
    setDots(generated);
  }, []);

  useEffect(() => {
    if (phase !== "scanning") return;
    const interval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % SCAN_MESSAGES.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [phase]);

  const triggerFound = useCallback(() => {
    setPhase("found");
    setTimeout(onFound, 1200);
  }, [onFound]);

  const triggerError = useCallback((msg: string) => {
    setPhase("error");
    setErrorMsg(msg);
    setTimeout(() => onError(msg), 2000);
  }, [onError]);

  useEffect(() => {
    (window as any).__scanOverlayFound = triggerFound;
    (window as any).__scanOverlayError = triggerError;
    return () => {
      delete (window as any).__scanOverlayFound;
      delete (window as any).__scanOverlayError;
    };
  }, [triggerFound, triggerError]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="relative w-64 h-64 mb-8">
        <div className="absolute inset-0 rounded-full border border-primary/20" />
        <div className="absolute inset-8 rounded-full border border-primary/15" />
        <div className="absolute inset-16 rounded-full border border-primary/10" />

        {phase === "scanning" && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary) / 0.3) 40deg, transparent 80deg)",
              animation: "spin 2s linear infinite",
            }}
          />
        )}

        {phase === "found" && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, hsl(142 76% 36% / 0.3) 0%, transparent 70%)",
              animation: "pulse 0.6s ease-in-out infinite",
            }}
          />
        )}

        {phase === "error" && (
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle, hsl(0 84% 60% / 0.2) 0%, transparent 70%)",
              animation: "pulse 0.8s ease-in-out infinite",
            }}
          />
        )}

        {dots.map(dot => (
          <div
            key={dot.id}
            className="absolute rounded-full"
            style={{
              left: `${dot.x}%`,
              top: `${dot.y}%`,
              width: dot.size,
              height: dot.size,
              backgroundColor:
                phase === "found"
                  ? "hsl(142 76% 36% / 0.8)"
                  : phase === "error"
                    ? "hsl(0 84% 60% / 0.5)"
                    : "hsl(var(--primary) / 0.6)",
              animation: phase === "scanning"
                ? `ticketDotPulse 2s ease-in-out ${dot.delay}s infinite`
                : phase === "found"
                  ? "ticketDotFound 0.5s ease-out forwards"
                  : "ticketDotFade 0.5s ease-out forwards",
              transition: "background-color 0.5s ease",
            }}
          />
        ))}

        <div className="absolute inset-0 flex items-center justify-center">
          {phase === "scanning" && (
            <div className="relative">
              <Radar className="w-10 h-10 text-primary" style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
              <Wifi
                className="w-5 h-5 text-primary/60 absolute -top-2 -right-2"
                style={{ animation: "ticketDotPulse 1s ease-in-out infinite" }}
              />
            </div>
          )}
          {phase === "found" && (
            <CheckCircle2
              className="w-12 h-12 text-emerald-500"
              style={{ animation: "ticketFoundPop 0.4s ease-out" }}
            />
          )}
          {phase === "error" && (
            <AlertTriangle
              className="w-12 h-12 text-red-500"
              style={{ animation: "ticketFoundPop 0.4s ease-out" }}
            />
          )}
        </div>
      </div>

      <div className="text-center space-y-2">
        {phase === "scanning" && (
          <>
            <p className="text-lg font-semibold text-foreground" style={{ animation: "fadeInUp 0.3s ease-out" }}>
              {SCAN_MESSAGES[messageIndex]}
            </p>
            <p className="text-sm text-muted-foreground">Looking for the best ticket nearby</p>
          </>
        )}
        {phase === "found" && (
          <>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400" style={{ animation: "fadeInUp 0.3s ease-out" }}>
              Ticket Found!
            </p>
            <p className="text-sm text-muted-foreground">Assigning to you now...</p>
          </>
        )}
        {phase === "error" && (
          <>
            <p className="text-lg font-semibold text-red-600 dark:text-red-400" style={{ animation: "fadeInUp 0.3s ease-out" }}>
              No Tickets Available
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">{errorMsg || "No matching tickets found right now"}</p>
          </>
        )}
      </div>

      <style>{`
        @keyframes ticketDotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes ticketDotFound {
          0% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.8); }
          100% { opacity: 0; transform: scale(0.5); }
        }
        @keyframes ticketDotFade {
          0% { opacity: 0.6; }
          100% { opacity: 0.1; }
        }
        @keyframes ticketFoundPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeInUp {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function TechnicianDashboard() {
  const { user } = useAuth();
  const [showPartnerDialog, setShowPartnerDialog] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [showScanOverlay, setShowScanOverlay] = useState(false);

  if (user && user.role !== UserRole.TECHNICIAN) {
    return <Redirect to="/dashboard/admin" />;
  }

  const { data: tickets, isLoading } = useTickets({ assignedTo: user?.id });
  const { data: performance } = useTechnicianPerformance();
  const { data: bonusTotal } = useTechnicianBonusTotal();
  const { mutate: autoAssign, isPending: isAutoAssigning } = useAutoAssignTicket();
  const { data: freeTechnicians, isLoading: loadingFreeTechs } = useFreeTechnicians(user?.id);

  const activeTickets = (tickets?.filter((t: any) =>
    ['assigned', 'in_progress', 'pending_rejection'].includes(t.status)
  ) || []).sort((a: any, b: any) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return aTime - bTime;
  });

  const historyTickets = (tickets?.filter((t: any) =>
    ['closed', 'rejected'].includes(t.status)
  ) || []).sort((a: any, b: any) => new Date(b.closedAt || b.updatedAt || 0).getTime() - new Date(a.closedAt || a.updatedAt || 0).getTime());

  const hasActiveTicket = activeTickets.length > 0;

  const handleGetTicketClick = () => {
    setSelectedPartnerId("");
    setShowPartnerDialog(true);
  };

  const handleConfirmGetTicket = () => {
    if (!selectedPartnerId) return;
    setShowPartnerDialog(false);
    setShowScanOverlay(true);

    const minScanTime = 2500;
    const startTime = Date.now();

    autoAssign(Number(selectedPartnerId), {
      onSuccess: () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minScanTime - elapsed);
        setTimeout(() => {
          if ((window as any).__scanOverlayFound) {
            (window as any).__scanOverlayFound();
          }
        }, remaining);
      },
      onError: (error: any) => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minScanTime - elapsed);
        setTimeout(() => {
          if ((window as any).__scanOverlayError) {
            (window as any).__scanOverlayError(error?.message || "Could not find a matching ticket");
          }
        }, remaining);
      },
    });
  };

  const handleScanComplete = () => {
    setShowScanOverlay(false);
    setSelectedPartnerId("");
  };

  return (
    <div className="container mx-auto max-w-lg pb-20">
      {showScanOverlay && (
        <TicketScanOverlay
          onFound={handleScanComplete}
          onError={handleScanComplete}
        />
      )}

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
              Rp{(bonusTotal?.totalBonus ?? 0).toLocaleString('id-ID')}
            </div>
            <div className="text-xs opacity-70 mt-0.5">Bonus</div>
          </div>
        </div>

        <Button
          onClick={handleGetTicketClick}
          disabled={isAutoAssigning || hasActiveTicket || showScanOverlay}
          className="w-full mt-4 bg-white/20 border border-white/20 text-primary-foreground gap-2"
          data-testid="button-get-ticket"
        >
          {isAutoAssigning || showScanOverlay ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
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
              <Zap className="w-4 h-4" /> Get Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
