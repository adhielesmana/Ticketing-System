import { useState } from "react";
import { useTickets, useDeleteTicket, useUpdateTicket } from "@/hooks/use-tickets";
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
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTicketSchema, TicketTypeValues, TicketPriorityValues, TicketStatusValues, UserRole } from "@shared/schema";
import { z } from "zod";
import { format } from "date-fns";
import { Search, Eye, Pencil, Trash2, UserPlus } from "lucide-react";
import { useAssignTicket } from "@/hooks/use-tickets";

const priorityColors: Record<string, string> = {
  low: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  waiting_assignment: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  assigned: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
  in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  closed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
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
  const canCreate = canManage || user?.role === UserRole.HELPDESK;

  const editForm = useForm({
    resolver: zodResolver(insertTicketSchema.partial()),
    defaultValues: {},
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
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">All Tickets</h1>
          <p className="text-muted-foreground">Manage and track all support tickets</p>
        </div>
        {canCreate && <CreateTicketDialog />}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
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
          <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : tickets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No tickets found
                  </TableCell>
                </TableRow>
              ) : (
                tickets?.map((ticket: any) => (
                  <TableRow key={ticket.id} data-testid={`row-ticket-${ticket.id}`}>
                    <TableCell className="font-mono text-sm">{ticket.ticketNumber}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{ticket.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {ticket.type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${priorityColors[ticket.priority] || ""} capitalize text-xs`}>
                        {ticket.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[ticket.status] || ""} capitalize text-xs`}>
                        {ticket.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{ticket.customerName}</TableCell>
                    <TableCell className="text-sm">
                      {ticket.assignee ? (
                        <span>{ticket.assignee.name}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Unassigned</span>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(ticket.createdAt), "MMM d, HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/tickets/${ticket.id}`}>
                          <Button size="icon" variant="ghost" data-testid={`button-view-ticket-${ticket.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        {canManage && !ticket.assignee && ticket.status === "open" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setAssignDialogTicket(ticket)}
                            data-testid={`button-assign-ticket-${ticket.id}`}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(ticket)}
                            data-testid={`button-edit-ticket-${ticket.id}`}
                          >
                            <Pencil className="w-4 h-4" />
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
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTicket} onOpenChange={(open) => !open && setEditTicket(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Ticket {editTicket?.ticketNumber}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TicketTypeValues.map((t) => (
                            <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TicketPriorityValues.map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea className="min-h-[80px]" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="customerPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Phone</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditTicket(null)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={!!assignDialogTicket} onOpenChange={(open) => !open && setAssignDialogTicket(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Ticket {assignDialogTicket?.ticketNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Label>Select Technician</Label>
            {technicians?.map((tech: any) => (
              <Button
                key={tech.id}
                variant="outline"
                className="w-full justify-start gap-3"
                onClick={() => handleAssign(tech.id)}
                data-testid={`button-assign-to-${tech.id}`}
              >
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                  {tech.name.charAt(0)}
                </div>
                <div className="text-left">
                  <p className="font-medium">{tech.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tech.isBackboneSpecialist ? "Backbone Specialist" : "General Technician"}
                  </p>
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ticket</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this ticket? This action cannot be undone.
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
