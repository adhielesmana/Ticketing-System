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
  Users, 
  Ticket as TicketIcon, 
  AlertTriangle, 
  CheckCircle2 
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentTickets, isLoading: ticketsLoading } = useTickets();

  const chartData = [
    { name: 'Open', value: stats?.totalOpen || 0 },
    { name: 'Assigned', value: stats?.totalAssigned || 0 },
    { name: 'Closed', value: stats?.totalClosed || 0 },
  ];

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of system performance and ticket status</p>
        </div>
        <CreateTicketDialog />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Open" 
          value={stats?.totalOpen} 
          icon={<TicketIcon className="w-5 h-5 text-blue-500" />} 
          loading={statsLoading}
        />
        <StatCard 
          title="Assigned" 
          value={stats?.totalAssigned} 
          icon={<Users className="w-5 h-5 text-purple-500" />} 
          loading={statsLoading}
        />
        <StatCard 
          title="SLA Breaches" 
          value={stats?.slaBreachCount} 
          icon={<AlertTriangle className="w-5 h-5 text-red-500" />} 
          loading={statsLoading}
          trend="Critical"
        />
        <StatCard 
          title="Total Closed" 
          value={stats?.totalClosed} 
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />} 
          loading={statsLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Area */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ticket Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Feed */}
        <Card className="lg:col-span-1 h-[400px] flex flex-col">
          <CardHeader>
            <CardTitle>Recent Tickets</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full px-4">
              <div className="space-y-4 pb-4">
                {ticketsLoading ? (
                  [1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)
                ) : (
                  recentTickets?.slice(0, 5).map(ticket => (
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

function StatCard({ title, value, icon, loading, trend }: any) {
  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-8 w-16 mt-2" />
          ) : (
            <h3 className="text-3xl font-bold mt-1">{value}</h3>
          )}
        </div>
        <div className="p-3 bg-muted rounded-full">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
