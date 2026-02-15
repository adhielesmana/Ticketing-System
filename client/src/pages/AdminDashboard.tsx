import { useDashboardStats } from "@/hooks/use-tickets";
import { useTickets } from "@/hooks/use-tickets";
import { TicketCard } from "@/components/TicketCard";
import { CreateTicketDialog } from "@/components/CreateTicketDialog";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Ticket as TicketIcon,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  TrendingUp,
  PhoneOff,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentTickets, isLoading: ticketsLoading } = useTickets();

  const chartData = [
    { name: 'Open', value: stats?.totalOpen || 0, fill: 'hsl(221 83% 53%)' },
    { name: 'Assigned', value: stats?.totalAssigned || 0, fill: 'hsl(199 89% 48%)' },
    { name: 'No Response', value: stats?.pendingRejection || 0, fill: 'hsl(25 95% 53%)' },
    { name: 'Closed', value: stats?.totalClosed || 0, fill: 'hsl(142 76% 36%)' },
  ];

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm text-muted-foreground">System performance and ticket overview</p>
        </div>
        <CreateTicketDialog />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Open Tickets"
          value={stats?.totalOpen}
          icon={<TicketIcon className="w-4 h-4" />}
          loading={statsLoading}
          color="text-blue-600 dark:text-blue-400"
          bgColor="bg-blue-50 dark:bg-blue-950/50"
        />
        <StatCard
          title="Assigned"
          value={stats?.totalAssigned}
          icon={<UserCheck className="w-4 h-4" />}
          loading={statsLoading}
          color="text-violet-600 dark:text-violet-400"
          bgColor="bg-violet-50 dark:bg-violet-950/50"
        />
        <StatCard
          title="No Response"
          value={stats?.pendingRejection}
          icon={<PhoneOff className="w-4 h-4" />}
          loading={statsLoading}
          color="text-orange-600 dark:text-orange-400"
          bgColor="bg-orange-50 dark:bg-orange-950/50"
          alert={true}
          alertColor="text-orange-600 dark:text-orange-400"
          dotColor="bg-orange-500"
        />
        <StatCard
          title="SLA Breaches"
          value={stats?.slaBreachCount}
          icon={<AlertTriangle className="w-4 h-4" />}
          loading={statsLoading}
          color="text-red-600 dark:text-red-400"
          bgColor="bg-red-50 dark:bg-red-950/50"
          alert={true}
          dotColor="bg-red-500"
        />
        <StatCard
          title="Resolved"
          value={stats?.totalClosed}
          icon={<CheckCircle2 className="w-4 h-4" />}
          loading={statsLoading}
          color="text-emerald-600 dark:text-emerald-400"
          bgColor="bg-emerald-50 dark:bg-emerald-950/50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Ticket Distribution</CardTitle>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="w-3 h-3" />
                <span>Overview</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '6px',
                      border: '1px solid hsl(var(--border))',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      background: 'hsl(var(--card))',
                      color: 'hsl(var(--card-foreground))',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-[300px] px-4">
              <div className="space-y-3 py-4">
                {ticketsLoading ? (
                  [1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)
                ) : recentTickets?.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No tickets yet
                  </div>
                ) : (
                  recentTickets?.slice(0, 6).map((ticket: any) => (
                    <TicketCard key={ticket.id} ticket={ticket} compact />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, loading, color, bgColor, alert, alertColor, dotColor }: any) {
  const alertClass = alert && value > 0 ? (alertColor || 'text-red-600 dark:text-red-400') : '';
  const showDot = alert && value > 0;
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              {showDot && (
                <span className={`inline-block w-2 h-2 rounded-full ${dotColor || 'bg-red-500'} attention-dot`} />
              )}
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-14 mt-1" />
            ) : (
              <p className={`text-2xl font-bold tabular-nums ${alertClass}`}>
                {value ?? 0}
              </p>
            )}
          </div>
          <div className={`p-2 rounded-md ${bgColor}`}>
            <div className={color}>{icon}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
