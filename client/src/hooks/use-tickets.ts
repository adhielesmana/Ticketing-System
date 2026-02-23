import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, ticketFilterSchema } from "@shared/routes";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

type TicketFilters = z.infer<typeof ticketFilterSchema>;
type CreateTicketInput = z.infer<typeof api.tickets.create.input>;
type UpdateTicketInput = z.infer<typeof api.tickets.update.input>;
type CloseTicketInput = z.infer<typeof api.tickets.close.input>;

type UseTicketsOptions = {
  enabled?: boolean;
  refetchInterval?: number;
};

export function useTickets(filters?: TicketFilters, options?: UseTicketsOptions) {
  const queryKey = [api.tickets.list.path, filters];
  const { enabled = true, refetchInterval = 10000 } = options ?? {};
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      const url = filters 
        ? `${api.tickets.list.path}?${new URLSearchParams(filters as any)}`
        : api.tickets.list.path;
      
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    refetchInterval,
    enabled,
  });
}

export function useTicket(id: number) {
  return useQuery({
    queryKey: [api.tickets.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.tickets.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateTicketInput) => {
      const res = await fetch(api.tickets.create.path, {
        method: api.tickets.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      toast({ title: "Success", description: "Ticket created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & UpdateTicketInput) => {
      const url = buildUrl(api.tickets.update.path, { id });
      const res = await fetch(url, {
        method: api.tickets.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      toast({ title: "Success", description: "Ticket updated" });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.tickets.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete ticket");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      toast({ title: "Deleted", description: "Ticket deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useAssignTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: number; userId?: number }) => {
      const url = buildUrl(api.tickets.assign.path, { id });
      const res = await fetch(url, {
        method: api.tickets.assign.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to assign ticket");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/free"] });
      toast({ title: "Success", description: "Ticket assigned" });
    },
    onError: (error) => {
      toast({ title: "Assignment Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useReassignTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, technicianIds }: { id: number; technicianIds: number[] }) => {
      const res = await fetch(`/api/tickets/${id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianIds }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to reassign ticket");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/free"] });
      toast({ title: "Success", description: "Ticket reassigned successfully" });
    },
    onError: (error) => {
      toast({ title: "Reassign Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useUnassignTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const res = await fetch(`/api/tickets/${id}/unassign`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to unassign ticket");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/free"] });
      toast({ title: "Success", description: "Ticket unassigned and set back to open" });
    },
    onError: (error) => {
      toast({ title: "Unassign Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useAutoAssignTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (partnerId: number) => {
      const res = await fetch(api.tickets.autoAssign.path, {
        method: api.tickets.autoAssign.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId }),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to auto-assign");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.performance.me.path] });
      toast({ title: "Ticket Assigned", description: "A new ticket has been assigned to you and your partner" });
    },
    onError: (error) => {
      toast({ title: "Cannot Get Ticket", description: error.message, variant: "destructive" });
    },
  });
}

export function useFreeTechnicians(excludeUserId?: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ["/api/technicians/free", excludeUserId],
    queryFn: async () => {
      const url = excludeUserId
        ? `/api/technicians/free?excludeUserId=${excludeUserId}`
        : "/api/technicians/free";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch free technicians");
      return res.json();
    },
    enabled,
  });
}

export function useStartTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.tickets.start.path, { id });
      const res = await fetch(url, {
        method: api.tickets.start.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      toast({ title: "Started", description: "Ticket is now in progress" });
    },
  });
}

export function useCloseTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number } & CloseTicketInput) => {
      const url = buildUrl(api.tickets.close.path, { id });
      const res = await fetch(url, {
        method: api.tickets.close.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to close ticket");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.performance.me.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/technician/bonus-total"] });
      toast({ title: "Closed", description: "Ticket closed successfully" });
    },
  });
}

export function useNoResponseTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, rejectionReason }: { id: number; rejectionReason: string }) => {
      const url = buildUrl(api.tickets.noResponse.path, { id });
      const res = await fetch(url, {
        method: api.tickets.noResponse.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message || "Failed to report no response");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, variables.id] });
      toast({ title: "Reported", description: "Ticket sent for admin review" });
    },
  });
}

export function useRejectTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const url = buildUrl(api.tickets.reject.path, { id });
      const res = await fetch(url, {
        method: api.tickets.reject.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message || "Failed to reject ticket");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      toast({ title: "Rejected", description: "Ticket has been rejected and closed" });
    },
  });
}

export function useCancelReject() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.tickets.cancelReject.path, { id });
      const res = await fetch(url, {
        method: api.tickets.cancelReject.method,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message || "Failed to cancel rejection");
      }
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      toast({ title: "Reopened", description: "Ticket has been reopened and assigned back to technician" });
    },
  });
}

export function useCloseByHelpdesk() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const url = buildUrl(api.tickets.closeByHelpdesk.path, { id });
      const res = await fetch(url, {
        method: api.tickets.closeByHelpdesk.method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message || "Failed to close ticket");
      }
      return res.json();
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      toast({ title: "Closed", description: "Ticket has been closed by helpdesk" });
    },
  });
}

export function useReopenTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, reason, technicianIds }: { id: number; reason: string; technicianIds: number[] }) => {
      const url = buildUrl(api.tickets.reopen.path, { id });
      const res = await fetch(url, {
        method: api.tickets.reopen.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, technicianIds }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message || "Failed to reopen ticket");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/free"] });
      toast({ title: "Reopened", description: "Ticket has been reopened and reassigned" });
    },
    onError: (error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useReopenRejectedTicket() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, reason, assignmentMode }: { id: number; reason: string; assignmentMode: "current" | "auto" }) => {
      const url = buildUrl(api.tickets.reopenRejected.path, { id });
      const res = await fetch(url, {
        method: api.tickets.reopenRejected.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, assignmentMode }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed" }));
        throw new Error(err.message || "Failed to reopen rejected ticket");
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.tickets.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.tickets.get.path, variables.id] });
      queryClient.invalidateQueries({ queryKey: [api.dashboard.stats.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/technicians/free"] });
      const description = data?.status === "open"
        ? "Rejected ticket reopened as open and unassigned (auto assignment ready)"
        : "Rejected ticket reopened with current assignment";
      toast({ title: "Reopened", description });
    },
    onError: (error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: [api.dashboard.stats.path],
    queryFn: async () => {
      const res = await fetch(api.dashboard.stats.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });
}

export function useTechnicianPerformance() {
  return useQuery({
    queryKey: [api.performance.me.path],
    queryFn: async () => {
      const res = await fetch(api.performance.me.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch performance");
      return res.json();
    },
  });
}

export function useTechnicianBonusTotal() {
  return useQuery({
    queryKey: ["/api/technician/bonus-total"],
    queryFn: async () => {
      const res = await fetch("/api/technician/bonus-total", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bonus total");
      return res.json() as Promise<{ totalBonus: number; ticketCount: number }>;
    },
  });
}

export function useTicketsReport(
  filters?: { dateFrom?: string; dateTo?: string; type?: string; status?: string },
  page: number = 1,
  perPage: number = 20,
) {
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.status) params.set("status", filters.status);
  params.set("page", page.toString());
  params.set("perPage", perPage.toString());
  const qs = params.toString();

  return useQuery({
    queryKey: ["/api/reports/tickets", filters, page, perPage],
    queryFn: async () => {
      const url = qs ? `/api/reports/tickets?${qs}` : "/api/reports/tickets";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
  });
}

export function useBonusSummary(filters?: { dateFrom?: string; dateTo?: string }) {
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  const qs = params.toString();

  return useQuery({
    queryKey: ["/api/reports/bonus-summary", filters],
    queryFn: async () => {
      const url = qs ? `/api/reports/bonus-summary?${qs}` : "/api/reports/bonus-summary";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bonus summary");
      return res.json();
    },
  });
}

export function usePerformanceSummary(filters?: { dateFrom?: string; dateTo?: string }) {
  const params = new URLSearchParams();
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  const qs = params.toString();

  return useQuery({
    queryKey: ["/api/reports/performance-summary", filters],
    queryFn: async () => {
      const url = qs ? `/api/reports/performance-summary?${qs}` : "/api/reports/performance-summary";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch performance summary");
      return res.json();
    },
  });
}

export function useTechnicianPeriodPerformance() {
  return useQuery({
    queryKey: ["/api/reports/technician-period"],
    queryFn: async () => {
      const res = await fetch("/api/reports/technician-period", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch technician period data");
      return res.json();
    },
  });
}

export function useUploadImages() {
  return useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));
      const res = await fetch("/api/upload/multiple", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<{ urls: string[] }>;
    },
  });
}

export function useUploadFile() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json() as Promise<{ url: string }>;
    },
  });
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: [api.settings.get.path, key],
    queryFn: async () => {
      const url = buildUrl(api.settings.get.path, { key });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch setting");
      return res.json();
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string | null }) => {
      const res = await fetch(api.settings.set.path, {
        method: api.settings.set.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update setting");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.settings.get.path, variables.key] });
    },
  });
}
