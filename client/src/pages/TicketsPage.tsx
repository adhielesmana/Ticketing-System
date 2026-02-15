import { useState } from "react";
import { useTickets, useDeleteTicket, useUpdateTicket, useAssignTicket } from "@/hooks/use-tickets";
import { useUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import { CreateTicketDialog } from "@/components/CreateTicketDialog";
import { SLAIndicator } from "@/components/SLAIndicator";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { insertTicketSchema, TicketTypeValues, TicketPriorityValues, TicketStatusValues, UserRole } from "@shared/schema";
import { format } from "date-fns";
import { Search, Eye, Pencil, Trash2, UserPlus, Ticket } from "lucide-react";

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

export default function TicketsPage() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { data: tickets, isLoading } = useTickets(
    Object.fromEntries(
      Object.entries({
        search: searchTerm || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
      }).filter(([_, v]) => v !== undefined)
    )
  );
  const { data: technicians } = useUsers("technician");
  const { mutate: deleteTicket } = useDeleteTicket();
  const { mutate: updateTicket } = useUpdateTicket();
  const { mutate: assignTicket } = useAssignTicket();

  const [editTicket, setEditTicket] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [assignDialogTicket, setAssignDialogTicket] = useState<any>(null);

  const canManage = user?.role === UserRole.SUPERADMIN || user?.role === UserRole.ADMIN;
  const canAssign = canManage || user?.role === UserRole.HELPDESK;
  const canCreate = canManage || user?.role === UserRole.HELPDESK;

  const editForm = useForm({
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      type: "home_maintenance",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerLocationUrl: "",
    },
  });

  function openEdit(ticket: any) {
    setEditTicket(ticket);
    editForm.reset({
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      type: ticket.type,
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      customerEmail: ticket.customerEmail || "",
      customerLocationUrl: ticket.customerLocationUrl,
    });
  }

  function handleEditSubmit(values: any) {
    updateTicket(
      { id: editTicket.id, ...values },
      { onSuccess: () => setEditTicket(null) }
    );
  }

  function handleDelete() {
    if (deleteId) {
      deleteTicket(deleteId, { onSuccess: () => setDeleteId(null) });
    }
  }

  function handleAssign(userId: number) {
    if (assignDialogTicket) {
      assignTicket(
        { id: assignDialogTicket.id, userId },
        { onSuccess: () => setAssignDialogTicket(null) }
      );
    }
  }

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-5">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display" data-testid="text-page-title">Tickets</h1>
          <p className="text-sm text-muted-foreground">Manage and track all support tickets</p>
        </div>
        {canCreate && <CreateTicketDialog />}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, customer, or ticket number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {TicketStatusValues.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[170px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TicketTypeValues.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
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
                  <TableHead>Assignee</TableHead>
                  <TableHead className="w-[140px]">SLA</TableHead>
                  <TableHead className="w-[100px]">Created</TableHead>
                  <TableHead className="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : tickets?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Ticket className="w-8 h-8 opacity-30" />
                        <p className="text-sm font-medium">No tickets found</p>
                        <p className="text-xs">Try adjusting your filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets?.map((ticket: any) => (
                    <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`} className="group">
                      <TableCell className="font-mono text-xs text-muted-foreground">{ticket.ticketNumber}</TableCell>
                      <TableCell>
                        <Link href={`/tickets/${ticket.id}`}>
                          <span className="text-sm font-medium cursor-pointer">{ticket.title}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-[10px] font-normal">
                          {ticket.type.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${priorityColors[ticket.priority] || ""} capitalize text-[10px]`}>
                          {ticket.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColors[ticket.status] || ""} capitalize text-[10px]`}>
                          {ticket.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{ticket.customerName}</TableCell>
                      <TableCell>
                        {ticket.assignee ? (
                          <div className="flex items-center gap-1.5">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[9px] bg-muted font-medium">
                                {ticket.assignee.name.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{ticket.assignee.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ticket.status !== "closed" && (
                          <SLAIndicator
                            deadline={ticket.slaDeadline}
                            createdAt={ticket.createdAt}
                            status={ticket.status}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(ticket.createdAt), "MMM d")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Link href={`/tickets/${ticket.id}`}>
                            <Button size="icon" variant="ghost" data-testid={`button-view-ticket-${ticket.id}`}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                          {canAssign && !ticket.assignee && (ticket.status === "open" || ticket.status === "waiting_assignment") && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setAssignDialogTicket(ticket)}
                              data-testid={`button-assign-ticket-${ticket.id}`}
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {canManage && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(ticket)}
                              data-testid={`button-edit-ticket-${ticket.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {user?.role === UserRole.SUPERADMIN && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setDeleteId(ticket.id)}
                              data-testid={`button-delete-ticket-${ticket.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editTicket} onOpenChange={(open) => !open && setEditTicket(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Ticket {editTicket?.ticketNumber}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={editForm.watch("type")} onValueChange={(v) => editForm.setValue("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TicketTypeValues.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Priority</label>
                <Select value={editForm.watch("priority")} onValueChange={(v) => editForm.setValue("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TicketPriorityValues.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input {...editForm.register("title")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea className="min-h-[80px]" {...editForm.register("description")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Customer Name</label>
                <Input {...editForm.register("customerName")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Customer Phone</label>
                <Input {...editForm.register("customerPhone")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTicket(null)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!assignDialogTicket} onOpenChange={(open) => !open && setAssignDialogTicket(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {technicians?.map((tech: any) => (
              <Button
                key={tech.id}
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={() => handleAssign(tech.id)}
                data-testid={`button-assign-to-${tech.id}`}
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-muted font-medium">
                    {tech.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <p className="text-sm font-medium">{tech.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tech.isBackboneSpecialist ? "Backbone Specialist" : "General Technician"}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
