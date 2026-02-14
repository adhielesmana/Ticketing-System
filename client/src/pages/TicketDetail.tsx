import { useTicket, useCloseTicket, useStartTicket, useAssignTicket } from "@/hooks/use-tickets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { useParams, Link } from "wouter";
import { SLAIndicator } from "@/components/SLAIndicator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  User,
  AlertOctagon,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const priorityColors: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  waiting_assignment: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export default function TicketDetail() {
  const { id } = useParams();
  const ticketId = Number(id);
  const { user } = useAuth();
  const { data: ticket, isLoading } = useTicket(ticketId);
  const { data: technicians } = useUsers("technician");

  const { mutate: assignTicket } = useAssignTicket();
  const { mutate: startTicket } = useStartTicket();
  const { mutate: closeTicket } = useCloseTicket();

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeData, setCloseData] = useState({
    actionDescription: "",
    speedtestResult: "",
    proofImageUrl: "",
    closedNote: ""
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 lg:p-6 max-w-4xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-64 md:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="container mx-auto p-4 lg:p-6 max-w-4xl">
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-medium">Ticket not found</p>
          <Link href="/tickets">
            <Button variant="outline" className="mt-4 gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Tickets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleClose = () => {
    closeTicket({
      id: ticketId,
      ...closeData
    }, {
      onSuccess: () => setCloseDialogOpen(false)
    });
  };

  const isAssignedToMe = ticket.assignee?.id === user?.id;
  const canManage = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'helpdesk';

  return (
    <div className="container mx-auto p-4 lg:p-6 max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tickets">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-muted-foreground">#{ticket.ticketNumber}</span>
            <Badge className={`${priorityColors[ticket.priority] || ""} text-[10px] capitalize`}>
              {ticket.priority}
            </Badge>
            <Badge className={`${statusColors[ticket.status] || ""} text-[10px] capitalize`}>
              {ticket.status.replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className="text-[10px] capitalize">
              {ticket.type.replace(/_/g, ' ')}
            </Badge>
          </div>
          <h1 className="text-xl font-bold font-display mt-1" data-testid="text-ticket-title">{ticket.title}</h1>
        </div>
      </div>

      {ticket.status !== 'closed' && (
        <div className="max-w-xs">
          <SLAIndicator
            deadline={ticket.slaDeadline as unknown as string}
            createdAt={ticket.createdAt as unknown as string}
            status={ticket.status}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground">{ticket.description}</p>
            </CardContent>
          </Card>

          {ticket.status === 'closed' && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <CardTitle className="text-base">Resolution</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ticket.actionDescription && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Action Taken</p>
                    <p className="text-sm">{ticket.actionDescription}</p>
                  </div>
                )}
                {ticket.speedtestResult && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Speedtest</p>
                    <p className="text-sm font-mono">{ticket.speedtestResult}</p>
                  </div>
                )}
                {ticket.proofImageUrl && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Proof</p>
                    <a
                      href={ticket.proofImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      View Image
                    </a>
                  </div>
                )}
                {ticket.closedNote && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                    <p className="text-sm">{ticket.closedNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            {canManage && ticket.status === 'open' && (
              <div className="flex items-center gap-2 bg-card border border-border p-2 rounded-md">
                <span className="text-xs font-medium px-2 text-muted-foreground">Assign to:</span>
                <Select onValueChange={(val) => assignTicket({ id: ticketId, userId: Number(val) })}>
                  <SelectTrigger className="w-[180px]" data-testid="select-assign-technician">
                    <SelectValue placeholder="Select Technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians?.map((tech: any) => (
                      <SelectItem key={tech.id} value={String(tech.id)}>{tech.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAssignedToMe && ticket.status === 'assigned' && (
              <Button onClick={() => startTicket(ticketId)} data-testid="button-start-work">
                Start Work
              </Button>
            )}

            {isAssignedToMe && ticket.status === 'in_progress' && (
              <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-complete-close">
                    Complete & Close
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Close Ticket</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label>Action Taken</Label>
                      <Textarea
                        placeholder="What did you do to resolve this?"
                        value={closeData.actionDescription}
                        onChange={e => setCloseData({...closeData, actionDescription: e.target.value})}
                        data-testid="textarea-action"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Speedtest Result</Label>
                      <Input
                        placeholder="https://speedtest.net/..."
                        value={closeData.speedtestResult}
                        onChange={e => setCloseData({...closeData, speedtestResult: e.target.value})}
                        data-testid="input-speedtest"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Proof Image URL</Label>
                      <Input
                        placeholder="https://..."
                        value={closeData.proofImageUrl}
                        onChange={e => setCloseData({...closeData, proofImageUrl: e.target.value})}
                        data-testid="input-proof"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Closing Notes</Label>
                      <Textarea
                        placeholder="Any additional notes..."
                        value={closeData.closedNote}
                        onChange={e => setCloseData({...closeData, closedNote: e.target.value})}
                        data-testid="textarea-notes"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleClose} data-testid="button-submit-close">Submit</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{ticket.customerName}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`tel:${ticket.customerPhone}`} className="text-sm">{ticket.customerPhone}</a>
              </div>
              {ticket.customerEmail && (
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${ticket.customerEmail}`} className="text-sm truncate">{ticket.customerEmail}</a>
                </div>
              )}
              {ticket.customerLocationUrl && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a
                    href={ticket.customerLocationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open in Maps
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assignment</CardTitle>
            </CardHeader>
            <CardContent>
              {ticket.assignee ? (
                <div className="flex items-center gap-2.5">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                      {ticket.assignee.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{ticket.assignee.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{ticket.assignee.role}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 p-2.5 rounded-md">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">Unassigned</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span>{format(new Date(ticket.createdAt), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Time</span>
                <span>{format(new Date(ticket.createdAt), 'HH:mm')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SLA Deadline</span>
                <span>{format(new Date(ticket.slaDeadline), 'MMM d, HH:mm')}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
