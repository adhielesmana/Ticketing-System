import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useTicketsReport, useBonusSummary, usePerformanceSummary } from "@/hooks/use-tickets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Redirect } from "wouter";
import { UserRole, TicketStatus, TicketType } from "@shared/schema";
import {
  FileText,
  DollarSign,
  BarChart3,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  Truck,
  Ticket,
} from "lucide-react";
import { format } from "date-fns";

const TICKETS_PER_PAGE = 20;

const statusColors: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  waiting_assignment: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  overdue: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num || 0);
}

export default function ReportsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("tickets");

  const today = new Date().toISOString().split("T")[0];

  const [ticketFilters, setTicketFilters] = useState({
    dateFrom: "",
    dateTo: "",
    type: "",
    status: "",
  });
  const [ticketPage, setTicketPage] = useState(1);
  const [bonusFilters, setBonusFilters] = useState({
    dateFrom: today,
    dateTo: today,
  });
  const [perfFilters, setPerfFilters] = useState({
    dateFrom: today,
    dateTo: today,
  });

  const updateTicketFilters = (updates: Partial<typeof ticketFilters>) => {
    setTicketFilters((prev) => ({ ...prev, ...updates }));
    setTicketPage(1);
  };

  const cleanTicketFilters = Object.fromEntries(
    Object.entries(ticketFilters).filter(([_, v]) => v !== "")
  ) as any;
  const cleanBonusFilters = Object.fromEntries(
    Object.entries(bonusFilters).filter(([_, v]) => v !== "")
  ) as any;
  const cleanPerfFilters = Object.fromEntries(
    Object.entries(perfFilters).filter(([_, v]) => v !== "")
  ) as any;

  const { data: ticketsData, isLoading: ticketsLoading } = useTicketsReport(cleanTicketFilters, ticketPage, TICKETS_PER_PAGE);
  const { data: bonusData, isLoading: bonusLoading } = useBonusSummary(cleanBonusFilters);
  const { data: perfData, isLoading: perfLoading } = usePerformanceSummary(cleanPerfFilters);

  const tickets = ticketsData?.tickets ?? [];
  const totalTickets = ticketsData?.total ?? 0;
  const ticketTotalPages = Math.max(1, Math.ceil(totalTickets / TICKETS_PER_PAGE));
  const ticketRangeStart = totalTickets === 0 ? 0 : (ticketPage - 1) * TICKETS_PER_PAGE + 1;
  const ticketRangeEnd = Math.min(totalTickets, ticketPage * TICKETS_PER_PAGE);

  useEffect(() => {
    if (ticketPage > ticketTotalPages) {
      setTicketPage(ticketTotalPages);
    }
  }, [ticketPage, ticketTotalPages]);

  if (!user) return null;
  if (user.role === UserRole.TECHNICIAN) {
    return <Redirect to="/dashboard/technician" />;
  }

  const totalBonusPaid = bonusData?.reduce((sum: number, row: any) => sum + parseFloat(row.bonus || "0"), 0) || 0;
  const uniqueTickets = new Set(bonusData?.map((r: any) => r.ticketId) || []);
  const totalTicketsClosed = uniqueTickets.size;
  const overdueRows = bonusData?.filter((r: any) => r.performStatus === "not_perform") || [];
  const uniqueOverdueTickets = new Set(overdueRows.map((r: any) => r.ticketId));
  const overdueTickets = uniqueOverdueTickets.size;

  const techBonusSummary: Record<number, { name: string; ticketFee: number; transportFee: number; totalBonus: number; ticketCount: number }> = {};
  bonusData?.forEach((row: any) => {
    if (!techBonusSummary[row.technicianId]) {
      techBonusSummary[row.technicianId] = { name: row.technicianName, ticketFee: 0, transportFee: 0, totalBonus: 0, ticketCount: 0 };
    }
    techBonusSummary[row.technicianId].ticketFee += parseFloat(row.ticketFee || "0");
    techBonusSummary[row.technicianId].transportFee += parseFloat(row.transportFee || "0");
    techBonusSummary[row.technicianId].totalBonus += parseFloat(row.bonus || "0");
    techBonusSummary[row.technicianId].ticketCount += 1;
  });

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
          <FileText className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display" data-testid="text-reports-title">Reports</h1>
          <p className="text-sm text-muted-foreground">Generate and view detailed reports</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="tickets" className="gap-1.5 text-sm" data-testid="tab-tickets-report">
            <FileText className="w-3.5 h-3.5" />
            Tickets
          </TabsTrigger>
          <TabsTrigger value="bonus" className="gap-1.5 text-sm" data-testid="tab-bonus-report">
            <DollarSign className="w-3.5 h-3.5" />
            Bonus
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-1.5 text-sm" data-testid="tab-performance-report">
            <BarChart3 className="w-3.5 h-3.5" />
            Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
                <Filter className="w-4 h-4" />
                Filters
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">From Date</Label>
                  <Input
                    type="date"
                    value={ticketFilters.dateFrom}
                    onChange={(e) => updateTicketFilters({ dateFrom: e.target.value })}
                    data-testid="input-ticket-date-from"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To Date</Label>
                  <Input
                    type="date"
                    value={ticketFilters.dateTo}
                    onChange={(e) => updateTicketFilters({ dateTo: e.target.value })}
                    data-testid="input-ticket-date-to"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={ticketFilters.type}
                    onValueChange={(v) => updateTicketFilters({ type: v === "all" ? "" : v })}
                  >
                    <SelectTrigger className="capitalize" data-testid="select-ticket-type-filter">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="home_maintenance">Home Maintenance</SelectItem>
                      <SelectItem value="backbone_maintenance">Backbone Maintenance</SelectItem>
                      <SelectItem value="installation">Installation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={ticketFilters.status}
                    onValueChange={(v) => updateTicketFilters({ status: v === "all" ? "" : v })}
                  >
                    <SelectTrigger className="capitalize" data-testid="select-ticket-status-filter">
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="assigned">Assigned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {ticketsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Ticket Report ({totalTickets} tickets)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-tickets-report">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Ticket</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Type</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Status</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Customer</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Assignees</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Ticket Fee</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Transport</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Bonus/Tech</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((ticket: any) => (
                        <tr key={ticket.id} className="border-b border-border last:border-0" data-testid={`row-ticket-${ticket.id}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-mono text-xs">{ticket.ticketIdCustom || ticket.ticketNumber}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">{ticket.title}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs capitalize">{ticket.type.replace(/_/g, ' ')}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge className={`${statusColors[ticket.status] || ""} text-[10px] capitalize`}>
                              {ticket.status.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs">{ticket.customerName}</td>
                          <td className="px-4 py-2.5 text-xs">
                            {ticket.assignees?.map((a: any) => a.name).join(', ') || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {formatCurrency(ticket.ticketFee || 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {formatCurrency(ticket.transportFee || 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                            {formatCurrency(ticket.bonus || 0)}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {format(new Date(ticket.createdAt), 'MMM d, yyyy')}
                          </td>
                        </tr>
                      ))}
                      {(tickets.length === 0) && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No tickets found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-2 px-4 py-3 border-t border-border bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {totalTickets === 0
                      ? "No tickets to display"
                      : `Showing ${ticketRangeStart}-${ticketRangeEnd} of ${totalTickets}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTicketPage((prev) => Math.max(1, prev - 1))}
                      disabled={ticketPage <= 1}
                    >
                      Previous
                    </Button>
                    <span className="text-xs font-medium text-muted-foreground">
                      Page {ticketPage} of {ticketTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTicketPage((prev) => Math.min(ticketTotalPages, prev + 1))}
                      disabled={ticketPage >= ticketTotalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bonus" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
                <Calendar className="w-4 h-4" />
                Date Range
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                <div className="space-y-1">
                  <Label className="text-xs">From Date</Label>
                  <Input
                    type="date"
                    value={bonusFilters.dateFrom}
                    onChange={(e) => setBonusFilters(p => ({ ...p, dateFrom: e.target.value }))}
                    data-testid="input-bonus-date-from"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To Date</Label>
                  <Input
                    type="date"
                    value={bonusFilters.dateTo}
                    onChange={(e) => setBonusFilters(p => ({ ...p, dateTo: e.target.value }))}
                    data-testid="input-bonus-date-to"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <DollarSign className="w-5 h-5 mx-auto text-emerald-600 dark:text-emerald-400" />
                <p className="text-2xl font-bold font-display" data-testid="text-total-bonus">{formatCurrency(totalBonusPaid)}</p>
                <p className="text-xs text-muted-foreground">Total Bonus Paid</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <CheckCircle2 className="w-5 h-5 mx-auto text-blue-600 dark:text-blue-400" />
                <p className="text-2xl font-bold font-display" data-testid="text-total-closed">{totalTicketsClosed}</p>
                <p className="text-xs text-muted-foreground">Tickets Closed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <AlertTriangle className="w-5 h-5 mx-auto text-red-600 dark:text-red-400" />
                <p className="text-2xl font-bold font-display" data-testid="text-overdue-count">{overdueTickets}</p>
                <p className="text-xs text-muted-foreground">Overdue (Bonus = 0)</p>
              </CardContent>
            </Card>
          </div>

          {Object.keys(techBonusSummary).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Per Technician Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-tech-bonus-summary">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Technician</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs">Tickets</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Ticket Fee</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Transport Fee</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Total Bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(techBonusSummary).map(([id, tech]) => (
                        <tr key={id} className="border-b border-border last:border-0" data-testid={`row-tech-summary-${id}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{tech.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold">{tech.ticketCount}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCurrency(tech.ticketFee)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">{formatCurrency(tech.transportFee)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(tech.totalBonus)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {bonusLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Bonus Details (Per Technician)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-bonus-report">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Ticket</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Type</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">SLA</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Technician</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Ticket Fee</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Transport</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Total</th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonusData?.map((row: any, idx: number) => (
                        <tr key={`${row.ticketId}-${row.technicianId}-${idx}`} className="border-b border-border last:border-0" data-testid={`row-bonus-${row.ticketId}-${row.technicianId}`}>
                          <td className="px-4 py-2.5">
                            <p className="font-mono text-xs">{row.ticketIdCustom || row.ticketNumber}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">{row.title}</p>
                          </td>
                          <td className="px-4 py-2.5 text-xs capitalize">{row.type.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2.5">
                            <Badge className={`text-[10px] ${row.performStatus === 'perform' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'}`}>
                              {row.performStatus === 'perform' ? 'On Time' : 'Overdue'}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-xs font-medium">{row.technicianName}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            <span className={parseFloat(row.ticketFee || "0") === 0 ? "text-muted-foreground" : ""}>
                              {formatCurrency(row.ticketFee)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            <span className={parseFloat(row.transportFee || "0") === 0 ? "text-muted-foreground" : ""}>
                              {formatCurrency(row.transportFee)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">
                            <span className={parseFloat(row.bonus || "0") === 0 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"}>
                              {formatCurrency(row.bonus)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {row.closedAt ? format(new Date(row.closedAt), 'MMM d, yyyy') : '-'}
                          </td>
                        </tr>
                      ))}
                      {(!bonusData || bonusData.length === 0) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No closed tickets found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
                <Calendar className="w-4 h-4" />
                Date Range
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
                <div className="space-y-1">
                  <Label className="text-xs">From Date</Label>
                  <Input
                    type="date"
                    value={perfFilters.dateFrom}
                    onChange={(e) => setPerfFilters(p => ({ ...p, dateFrom: e.target.value }))}
                    data-testid="input-perf-date-from"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To Date</Label>
                  <Input
                    type="date"
                    value={perfFilters.dateTo}
                    onChange={(e) => setPerfFilters(p => ({ ...p, dateTo: e.target.value }))}
                    data-testid="input-perf-date-to"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {perfLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-md" />)}
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Technician Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-performance-report">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Technician</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs">Completed</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs">SLA Rate</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs">Avg Time</th>
                        <th className="px-4 py-2.5 text-center font-medium text-muted-foreground text-xs">Overdue</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Ticket Fee</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Transport</th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Total Bonus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perfData?.map((tech: any) => (
                        <tr key={tech.technicianId} className="border-b border-border last:border-0" data-testid={`row-perf-${tech.technicianId}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-muted-foreground" />
                              <span className="font-medium text-sm">{tech.technicianName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="font-bold">{tech.totalCompleted}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`font-bold ${tech.slaComplianceRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : tech.slaComplianceRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                              {tech.slaComplianceRate}%
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center text-xs">
                            {tech.avgResolutionMinutes > 60
                              ? `${Math.round(tech.avgResolutionMinutes / 60)}h ${tech.avgResolutionMinutes % 60}m`
                              : `${tech.avgResolutionMinutes}m`}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={tech.totalOverdue > 0 ? "text-red-600 dark:text-red-400 font-bold" : "text-muted-foreground"}>
                              {tech.totalOverdue}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {formatCurrency(tech.totalTicketFee || 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {formatCurrency(tech.totalTransportFee || 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(tech.totalBonus)}
                          </td>
                        </tr>
                      ))}
                      {(!perfData || perfData.length === 0) && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">
                            No performance data found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
