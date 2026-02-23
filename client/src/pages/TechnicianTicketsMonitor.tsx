import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useTickets } from "@/hooks/use-tickets";
import { useUsers } from "@/hooks/use-users";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SLAIndicator } from "@/components/SLAIndicator";
import { Eye, Ticket } from "lucide-react";
import { isTechnicianUser } from "@/utils/manualAssignment";
import { AttentionDot, priorityColors, statusColors, statusLabels, toCapName, toTitleCase } from "@/lib/ticketTableHelpers";


export default function TechnicianTicketsMonitor() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: users, isLoading: techLoading } = useUsers();
  const technicians = useMemo(() => (users || []).filter(isTechnicianUser), [users]);
  const [selectedTechId, setSelectedTechId] = useState<string>("");
  const technicianId = selectedTechId ? Number(selectedTechId) : undefined;

  const { data: tickets, isLoading: ticketsLoading } = useTickets(
    technicianId ? { assignedTo: technicianId } : undefined,
    { enabled: Boolean(technicianId) }
  );

  const activeTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets
      .filter((ticket: any) => ["assigned", "in_progress", "pending_rejection"].includes(ticket.status))
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [tickets]);

  const technicianName = technicians?.find((tech: any) => tech.id === technicianId)?.name;

  if (!user) return null;

  const handleRowClick = (id: number) => {
    setLocation(`/tickets/${id}`);
  };

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, id: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setLocation(`/tickets/${id}`);
    }
  };

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

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Ticket</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[110px]">Type</TableHead>
                  <TableHead className="w-[90px]">Priority</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="w-[120px]">Area</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead className="w-[85px]">SLA</TableHead>
                  <TableHead className="w-[140px]">Time</TableHead>
                  <TableHead className="w-[100px]">Created</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ticketsLoading ? (
                  Array.from({ length: 5 }).map((_, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {Array.from({ length: 12 }).map((_, cellIndex) => (
                        <TableCell key={cellIndex}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !technicianId ? (
                  <TableRow data-testid="row-ticket-placeholder">
                    <TableCell colSpan={12} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Ticket className="w-8 h-8 opacity-30" />
                        <p className="text-sm font-medium">Select a technician to load tickets</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : activeTickets.length === 0 ? (
                  <TableRow data-testid="row-ticket-none">
                    <TableCell colSpan={12} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Ticket className="w-8 h-8 opacity-30" />
                        <p className="text-sm font-medium">No active assigned tickets for {technicianName}.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  activeTickets.map((ticket: any) => {
                    const slaOverdue = !["closed", "rejected"].includes(ticket.status) && new Date(ticket.slaDeadline) < new Date();
                    return (
                      <TableRow
                        key={ticket.id}
                        className="group cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => handleRowClick(ticket.id)}
                        onKeyDown={(event) => handleRowKeyDown(event, ticket.id)}
                        tabIndex={0}
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          #{ticket.ticketIdCustom || ticket.ticketNumber}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Link href={`/tickets/${ticket.id}`}>
                            <span className="text-sm font-normal cursor-pointer" title={toTitleCase(ticket.title)}>
                              {toTitleCase(ticket.title).length > 30 ? `${toTitleCase(ticket.title).slice(0, 30)}…` : toTitleCase(ticket.title)}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="capitalize text-[10px] font-normal">
                            {ticket.type.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge className={`${priorityColors[ticket.priority] || ""} capitalize text-[10px]`}>
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <AttentionDot status={ticket.status} slaOverdue={slaOverdue} />
                            <Badge className={`${statusColors[ticket.status] || ""} capitalize text-[10px]`}>
                              {statusLabels[ticket.status] || ticket.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-normal whitespace-nowrap" title={toCapName(ticket.customerName)}>
                          {toCapName(ticket.customerName, 30)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {ticket.area || "—"}
                        </TableCell>
                        <TableCell>
                          {ticket.assignees && ticket.assignees.length > 0 ? (
                            <div className="space-y-1">
                              {ticket.assignees.map((assignee: any) => (
                                <div key={assignee.id} className="flex items-center gap-1.5">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[9px] bg-muted font-medium">
                                      {assignee.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm font-normal whitespace-nowrap" title={toCapName(assignee.name)}>
                                    {toCapName(assignee.name, 30)}
                                  </span>
                                </div>
                              ))}
                              {ticket.assignmentType && (
                                <Badge className={`text-[9px] ${ticket.assignmentType === "auto" ? "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300" : "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300"}`}>
                                  {ticket.assignmentType === "auto" ? "Auto" : "Manual"}
                                  {ticket.assignedAt ? ` · ${format(new Date(ticket.assignedAt), "MMM d, HH:mm")}` : ""}
                                </Badge>
                              )}
                            </div>
                          ) : ticket.assignee ? (
                            <div className="flex items-center gap-1.5">
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[9px] bg-muted font-medium">
                                  {ticket.assignee.name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-normal whitespace-nowrap" title={toCapName(ticket.assignee.name)}>
                                {toCapName(ticket.assignee.name, 30)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {!["closed", "rejected"].includes(ticket.status) ? (
                            slaOverdue ? (
                              <Badge className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 text-[10px]">
                                Overdue
                              </Badge>
                            ) : (
                              <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
                                On Time
                              </Badge>
                            )
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {!["closed", "rejected"].includes(ticket.status) && (
                            <SLAIndicator
                              deadline={ticket.slaDeadline}
                              createdAt={ticket.createdAt}
                              status={ticket.status}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(ticket.createdAt), "MMM d")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Link href={`/tickets/${ticket.id}`}>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(event) => event.stopPropagation()}
                                data-testid={`button-view-ticket-${ticket.id}`}
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
