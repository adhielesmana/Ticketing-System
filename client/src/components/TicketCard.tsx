import { TicketWithAssignment } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, MapPin, User, AlertCircle, CheckCircle2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useStartTicket } from "@/hooks/use-tickets";
import { Link } from "wouter";

interface TicketCardProps {
  ticket: TicketWithAssignment;
  onAction?: () => void;
  compact?: boolean;
}

export function TicketCard({ ticket, compact = false }: TicketCardProps) {
  const { mutate: startTicket, isPending: isStarting } = useStartTicket();

  const priorityColors = {
    low: "bg-blue-100 text-blue-800 border-blue-200",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
    high: "bg-orange-100 text-orange-800 border-orange-200",
    critical: "bg-red-100 text-red-800 border-red-200 animate-pulse",
  };

  const statusColors = {
    open: "bg-gray-100 text-gray-800",
    waiting_assignment: "bg-purple-100 text-purple-800",
    assigned: "bg-blue-100 text-blue-800",
    in_progress: "bg-amber-100 text-amber-800",
    closed: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
  };

  const isAssignedToMe = true; // Simplified for this component, logic handled in parent usually
  const slaDate = new Date(ticket.slaDeadline);
  const now = new Date();
  const isOverdue = now > slaDate && ticket.status !== 'closed';
  
  return (
    <Card className={`group hover:shadow-md transition-all duration-200 border-l-4 ${
      isOverdue ? 'border-l-red-500' : 'border-l-primary'
    }`}>
      <CardHeader className="p-4 pb-2 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                #{ticket.ticketNumber}
              </span>
              <Badge variant="outline" className={priorityColors[ticket.priority as keyof typeof priorityColors]}>
                {ticket.priority.toUpperCase()}
              </Badge>
            </div>
            <Link href={`/tickets/${ticket.id}`} className="font-bold text-lg leading-tight hover:text-primary transition-colors">
              {ticket.title}
            </Link>
          </div>
          <Badge variant="secondary" className={statusColors[ticket.status as keyof typeof statusColors]}>
            {ticket.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 space-y-3">
        {!compact && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {ticket.description}
          </p>
        )}
        
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 shrink-0" />
            <span className="truncate">{ticket.customerName}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 shrink-0" />
            <a 
              href={ticket.customerLocationUrl} 
              target="_blank" 
              rel="noreferrer"
              className="hover:underline hover:text-primary truncate"
              onClick={(e) => e.stopPropagation()}
            >
              Open Location
            </a>
          </div>
          <div className={`flex items-center gap-2 font-medium ${isOverdue ? "text-red-600" : ""}`}>
            <Clock className="w-4 h-4 shrink-0" />
            <span>Due {formatDistanceToNow(slaDate, { addSuffix: true })}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-4 pt-0 flex justify-between items-center gap-2">
        {ticket.assignee && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
              {ticket.assignee.name.charAt(0)}
            </div>
            <span>{ticket.assignee.name}</span>
          </div>
        )}
        
        <div className="ml-auto flex gap-2">
          <Link href={`/tickets/${ticket.id}`}>
            <Button variant="outline" size="sm">Details</Button>
          </Link>
          {ticket.status === 'assigned' && (
            <Button 
              size="sm" 
              onClick={() => startTicket(ticket.id)}
              disabled={isStarting}
            >
              Start
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
