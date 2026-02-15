import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, User, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useStartTicket } from "@/hooks/use-tickets";
import { Link } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TicketCardProps {
  ticket: any;
  onAction?: () => void;
  compact?: boolean;
}

const priorityVariant: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const statusVariant: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  waiting_assignment: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function TicketCard({ ticket, compact = false }: TicketCardProps) {
  const { mutate: startTicket, isPending: isStarting } = useStartTicket();

  const slaDate = new Date(ticket.slaDeadline);
  const now = new Date();
  const isOverdue = now > slaDate && ticket.status !== 'closed';

  if (compact) {
    return (
      <Link href={`/tickets/${ticket.id}`}>
        <div className="flex items-start gap-3 p-3 rounded-md hover-elevate active-elevate-2 cursor-pointer" data-testid={`card-ticket-compact-${ticket.id}`}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs text-muted-foreground">#{ticket.ticketIdCustom || ticket.ticketNumber}</span>
              <Badge variant="outline" className={`${priorityVariant[ticket.priority] || ""} text-[10px] px-1.5 py-0`}>
                {ticket.priority}
              </Badge>
            </div>
            <p className="text-sm font-medium truncate">{ticket.title}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{ticket.customerName}</span>
              <span className={isOverdue ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                {formatDistanceToNow(slaDate, { addSuffix: true })}
              </span>
            </div>
          </div>
          <Badge className={`${statusVariant[ticket.status] || ""} text-[10px] shrink-0`}>
            {ticket.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </Link>
    );
  }

  return (
    <Card className="hover-elevate" data-testid={`card-ticket-${ticket.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground">#{ticket.ticketIdCustom || ticket.ticketNumber}</span>
              <Badge variant="outline" className={`${priorityVariant[ticket.priority] || ""} text-[10px]`}>
                {ticket.priority}
              </Badge>
            </div>
            <Link href={`/tickets/${ticket.id}`}>
              <span className="font-semibold text-base leading-tight cursor-pointer">{ticket.title}</span>
            </Link>
          </div>
          <Badge className={`${statusVariant[ticket.status] || ""} text-[10px] shrink-0`}>
            {ticket.status.replace(/_/g, ' ')}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2">{ticket.description}</p>

        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{ticket.customerName}</span>
          </div>
          {ticket.customerLocationUrl && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <a
                href={ticket.customerLocationUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-primary text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                Open Location
              </a>
            </div>
          )}
          <div className={`flex items-center gap-2 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs">Due {formatDistanceToNow(slaDate, { addSuffix: true })}</span>
          </div>
        </div>

        <div className="flex justify-between items-center pt-1 border-t border-border">
          {ticket.assignee ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px] bg-muted font-medium">
                  {ticket.assignee.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">{ticket.assignee.name}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">Unassigned</span>
          )}

          <div className="flex gap-1.5">
            <Link href={`/tickets/${ticket.id}`}>
              <Button variant="outline" size="sm" data-testid={`button-details-${ticket.id}`}>
                <ExternalLink className="w-3 h-3 mr-1" />
                Details
              </Button>
            </Link>
            {ticket.status === 'assigned' && (
              <Button
                size="sm"
                onClick={() => startTicket(ticket.id)}
                disabled={isStarting}
                data-testid={`button-start-${ticket.id}`}
              >
                Start
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
