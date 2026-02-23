import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTickets } from "@/hooks/use-tickets";
import { useUsers } from "@/hooks/use-users";
import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const priorityColors: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  pending_rejection: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
};

const statusLabels: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  pending_rejection: "Pending Rejection",
};

export default function TechnicianTicketsMonitor() {
  const { user } = useAuth();
  const { data: technicians, isLoading: techLoading } = useUsers("technician");
  const [selectedTechId, setSelectedTechId] = useState<string>("");
  const technicianId = selectedTechId ? Number(selectedTechId) : undefined;

  const { data: tickets, isLoading: ticketsLoading } = useTickets(
    technicianId ? { assignedTo: technicianId } : undefined,
    { enabled: Boolean(technicianId) }
  );

  const activeTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets
      .filter((ticket: any) => ['assigned', 'in_progress', 'pending_rejection'].includes(ticket.status))
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [tickets]);

  const technicianName = technicians?.find((tech: any) => tech.id === technicianId)?.name;

  if (!user) return null;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold font-display">Technician Assignment Monitor</h1>
        <p className="text-sm text-muted-foreground">Select a technician to see their active assigned tickets (oldest on top).</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Technician</span>
              <Select value={selectedTechId} onValueChange={setSelectedTechId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose technician" />
                </SelectTrigger>
                <SelectContent>
                  {techLoading ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
                  ) : technicians && technicians.length > 0 ? (
                    technicians.map((tech: any) => (
                      <SelectItem key={tech.id} value={String(tech.id)}>
                        {tech.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No technicians found</div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Active technician</span>
              <p className="text-sm font-medium">{technicianName || "None"}</p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Tickets tracked</span>
              <p className="text-sm font-medium">{technicianId ? activeTickets.length : 0}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {ticketsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : !technicianId ? (
            <p className="text-sm text-muted-foreground">Select a technician above to load their active tickets.</p>
          ) : activeTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active assigned tickets for {technicianName}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTickets.map((ticket: any) => (
                  <TableRow key={ticket.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">#{ticket.ticketIdCustom || ticket.ticketNumber}</TableCell>
                    <TableCell>
                      <p className="font-medium truncate">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground">{ticket.customerName}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[ticket.status] || ""} text-[10px]`}>{statusLabels[ticket.status] || ticket.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${priorityColors[ticket.priority] || ""} text-[10px]`}>{ticket.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-muted-foreground">{format(new Date(ticket.createdAt), "dd MMM yyyy HH:mm")}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
