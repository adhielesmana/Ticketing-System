import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSetting, useUpdateSetting } from "@/hooks/use-tickets";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import { UserRole } from "@shared/schema";
import {
  Settings,
  DollarSign,
  Home,
  Wifi,
  Wrench,
  Save,
  Loader2,
  MapPin,
  Type,
  Truck,
  Ticket,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num || 0);
}

const bonusConfigs = [
  {
    type: "home_maintenance",
    label: "Home Maintenance",
    description: "Bonus for residential fiber maintenance tickets",
    icon: Home,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500",
    ticketFeeKey: "ticket_fee_home_maintenance",
    transportFeeKey: "transport_fee_home_maintenance",
  },
  {
    type: "backbone_maintenance",
    label: "Backbone Maintenance",
    description: "Bonus for backbone/core network maintenance tickets",
    icon: Wifi,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500",
    ticketFeeKey: "ticket_fee_backbone_maintenance",
    transportFeeKey: "transport_fee_backbone_maintenance",
  },
  {
    type: "installation",
    label: "New Installation",
    description: "Bonus for new FTTH installation tickets",
    icon: Wrench,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500",
    ticketFeeKey: "ticket_fee_installation",
    transportFeeKey: "transport_fee_installation",
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate: updateSetting, isPending } = useUpdateSetting();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isBackfillingNames, setIsBackfillingNames] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const { data: ticketFeeHome } = useSetting("ticket_fee_home_maintenance");
  const { data: transportFeeHome } = useSetting("transport_fee_home_maintenance");
  const { data: ticketFeeBackbone } = useSetting("ticket_fee_backbone_maintenance");
  const { data: transportFeeBackbone } = useSetting("transport_fee_backbone_maintenance");
  const { data: ticketFeeInstall } = useSetting("ticket_fee_installation");
  const { data: transportFeeInstall } = useSetting("transport_fee_installation");

  const { data: oldBonusHome } = useSetting("bonus_home_maintenance");
  const { data: oldBonusBackbone } = useSetting("bonus_backbone_maintenance");
  const { data: oldBonusInstall } = useSetting("bonus_installation");

  const [values, setValues] = useState<Record<string, string>>({
    ticket_fee_home_maintenance: "",
    transport_fee_home_maintenance: "",
    ticket_fee_backbone_maintenance: "",
    transport_fee_backbone_maintenance: "",
    ticket_fee_installation: "",
    transport_fee_installation: "",
  });

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && ticketFeeHome !== undefined && transportFeeHome !== undefined) {
      setValues({
        ticket_fee_home_maintenance: ticketFeeHome?.value || oldBonusHome?.value || "0",
        transport_fee_home_maintenance: transportFeeHome?.value || "0",
        ticket_fee_backbone_maintenance: ticketFeeBackbone?.value || oldBonusBackbone?.value || "0",
        transport_fee_backbone_maintenance: transportFeeBackbone?.value || "0",
        ticket_fee_installation: ticketFeeInstall?.value || oldBonusInstall?.value || "0",
        transport_fee_installation: transportFeeInstall?.value || "0",
      });
      setInitialized(true);
    }
  }, [ticketFeeHome, transportFeeHome, ticketFeeBackbone, transportFeeBackbone, ticketFeeInstall, transportFeeInstall, oldBonusHome, oldBonusBackbone, oldBonusInstall, initialized]);

  if (!user) return null;
  if (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN) {
    return <Redirect to="/dashboard/admin" />;
  }

  const handleSaveType = (config: typeof bonusConfigs[0]) => {
    const ticketFee = parseFloat(values[config.ticketFeeKey] || "0");
    const transportFee = parseFloat(values[config.transportFeeKey] || "0");
    if (isNaN(ticketFee) || ticketFee < 0 || isNaN(transportFee) || transportFee < 0) {
      toast({ title: "Invalid Amount", description: "Please enter valid numbers", variant: "destructive" });
      return;
    }
    const total = ticketFee + transportFee;
    updateSetting({ key: config.ticketFeeKey, value: ticketFee.toFixed(2) });
    updateSetting({ key: config.transportFeeKey, value: transportFee.toFixed(2) });
    updateSetting({ key: `bonus_${config.type}`, value: total.toFixed(2) });
    toast({ title: "Saved", description: `${config.label} bonus updated: ${formatCurrency(total)} per technician` });
  };

  const handleSaveAll = () => {
    bonusConfigs.forEach((config) => handleSaveType(config));
    toast({ title: "Saved", description: "All bonus settings updated" });
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-display" data-testid="text-settings-title">Settings</h1>
            <p className="text-sm text-muted-foreground">Configure bonus amounts for ticket types</p>
          </div>
        </div>
        <Button onClick={handleSaveAll} disabled={isPending} className="gap-2" data-testid="button-save-all-bonus">
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save All
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <DollarSign className="w-4 h-4" />
          Technician Bonus per Ticket
        </div>
        <p className="text-sm text-muted-foreground">
          Set the bonus breakdown for each ticket type. Each assigned technician receives the full bonus (ticket fee + transport fee). For a 2-person team, the total ticket cost is double. Overdue tickets automatically get zero bonus.
        </p>

        {bonusConfigs.map((config) => {
          const ticketFee = parseFloat(values[config.ticketFeeKey] || "0") || 0;
          const transportFee = parseFloat(values[config.transportFeeKey] || "0") || 0;
          const totalPerTech = ticketFee + transportFee;
          const totalPerTicket = totalPerTech * 2;

          return (
            <Card key={config.type}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-md ${config.bg} flex items-center justify-center shrink-0`}>
                    <config.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm" data-testid={`text-bonus-label-${config.type}`}>{config.label}</h3>
                      <p className="text-xs text-muted-foreground">{config.description}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Ticket className="w-3 h-3" />
                          Ticket Fee
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rp</span>
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="0"
                            value={values[config.ticketFeeKey]}
                            onChange={(e) => setValues(prev => ({ ...prev, [config.ticketFeeKey]: e.target.value }))}
                            className="pl-9"
                            data-testid={`input-ticket-fee-${config.type}`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Truck className="w-3 h-3" />
                          Transport Fee
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rp</span>
                          <Input
                            type="number"
                            min="0"
                            step="1000"
                            placeholder="0"
                            value={values[config.transportFeeKey]}
                            onChange={(e) => setValues(prev => ({ ...prev, [config.transportFeeKey]: e.target.value }))}
                            className="pl-9"
                            data-testid={`input-transport-fee-${config.type}`}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border flex-wrap">
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Per technician: <span className="font-semibold text-foreground">{formatCurrency(totalPerTech)}</span></p>
                        <p>Per ticket (2 techs): <span className="font-semibold text-foreground">{formatCurrency(totalPerTicket)}</span></p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSaveType(config)}
                        disabled={isPending}
                        data-testid={`button-save-${config.type}`}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4 mt-8 pt-6 border-t">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <MapPin className="w-4 h-4" />
          Data Maintenance
        </div>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-teal-500 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold text-sm">Backfill Ticket Areas</h3>
                  <p className="text-xs text-muted-foreground">
                    Extract area names from Google Maps URLs for existing tickets that don't have area data yet. This uses free reverse geocoding and may take a moment.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBackfilling}
                  data-testid="button-backfill-areas"
                  onClick={async () => {
                    setIsBackfilling(true);
                    try {
                      const res = await apiRequest("POST", "/api/tickets/backfill-areas");
                      const data = await res.json();
                      toast({
                        title: "Backfill Complete",
                        description: `${data.processed || 0} ticket(s) updated with area data.`,
                      });
                    } catch (err: any) {
                      toast({
                        title: "Backfill Failed",
                        description: err.message || "Something went wrong",
                        variant: "destructive",
                      });
                    } finally {
                      setIsBackfilling(false);
                    }
                  }}
                >
                  {isBackfilling ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing...</>
                  ) : (
                    "Run Backfill"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-indigo-500 flex items-center justify-center shrink-0">
                <Type className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold text-sm">Format Names (Title Case)</h3>
                  <p className="text-xs text-muted-foreground">
                    Convert all customer names and technician names in the database to title case (first letter of each word capitalized). New entries are automatically formatted.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBackfillingNames}
                  data-testid="button-backfill-names"
                  onClick={async () => {
                    setIsBackfillingNames(true);
                    try {
                      const res = await apiRequest("POST", "/api/backfill-names");
                      const data = await res.json();
                      toast({
                        title: "Names Formatted",
                        description: `${data.usersUpdated || 0} user(s) and ${data.ticketsUpdated || 0} ticket(s) updated.`,
                      });
                    } catch (err: any) {
                      toast({
                        title: "Format Failed",
                        description: err.message || "Something went wrong",
                        variant: "destructive",
                      });
                    } finally {
                      setIsBackfillingNames(false);
                    }
                  }}
                >
                  {isBackfillingNames ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing...</>
                  ) : (
                    "Format Names"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-amber-500 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold text-sm">Recalculate Bonuses & Scores</h3>
                  <p className="text-xs text-muted-foreground">
                    Recalculate ticket fee, transport fee, and bonus for all closed tickets using the current fee settings. Also rebuilds performance scores for all assigned technicians. Use this after changing fee settings to fix historical data.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRecalculating}
                  data-testid="button-recalculate-bonuses"
                  onClick={async () => {
                    setIsRecalculating(true);
                    try {
                      const res = await apiRequest("POST", "/api/recalculate-bonuses");
                      const data = await res.json();
                      toast({
                        title: "Recalculation Complete",
                        description: `${data.ticketsUpdated || 0} ticket(s) updated, ${data.performanceLogsUpdated || 0} performance log(s) refreshed.`,
                      });
                    } catch (err: any) {
                      toast({
                        title: "Recalculation Failed",
                        description: err.message || "Something went wrong",
                        variant: "destructive",
                      });
                    } finally {
                      setIsRecalculating(false);
                    }
                  }}
                >
                  {isRecalculating ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing...</>
                  ) : (
                    "Recalculate All"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
