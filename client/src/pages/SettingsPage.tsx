import { useState, useEffect, useRef } from "react";
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
  Download,
  Upload,
  RotateCcw,
  Ratio,
  Database,
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
  const [isResetting, setIsResetting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const { data: ticketFeeHome } = useSetting("ticket_fee_home_maintenance");
  const { data: transportFeeHome } = useSetting("transport_fee_home_maintenance");
  const { data: ticketFeeBackbone } = useSetting("ticket_fee_backbone_maintenance");
  const { data: transportFeeBackbone } = useSetting("transport_fee_backbone_maintenance");
  const { data: ticketFeeInstall } = useSetting("ticket_fee_installation");
  const { data: transportFeeInstall } = useSetting("transport_fee_installation");

  const { data: oldBonusHome } = useSetting("bonus_home_maintenance");
  const { data: oldBonusBackbone } = useSetting("bonus_backbone_maintenance");
  const { data: oldBonusInstall } = useSetting("bonus_installation");

  const { data: ratioMaintSetting } = useSetting("preference_ratio_maintenance");
  const { data: ratioInstallSetting } = useSetting("preference_ratio_installation");

  const [values, setValues] = useState<Record<string, string>>({
    ticket_fee_home_maintenance: "",
    transport_fee_home_maintenance: "",
    ticket_fee_backbone_maintenance: "",
    transport_fee_backbone_maintenance: "",
    ticket_fee_installation: "",
    transport_fee_installation: "",
  });

  const [ratioMaint, setRatioMaint] = useState("4");
  const [ratioInstall, setRatioInstall] = useState("2");

  const [initialized, setInitialized] = useState(false);
  const [ratioInitialized, setRatioInitialized] = useState(false);

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

  useEffect(() => {
    if (!ratioInitialized && ratioMaintSetting !== undefined) {
      setRatioMaint(ratioMaintSetting?.value || "4");
      setRatioInstall(ratioInstallSetting?.value || "2");
      setRatioInitialized(true);
    }
  }, [ratioMaintSetting, ratioInstallSetting, ratioInitialized]);

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

  const handleSaveRatio = () => {
    const m = parseInt(ratioMaint, 10);
    const i = parseInt(ratioInstall, 10);
    if (isNaN(m) || m < 1 || isNaN(i) || i < 1) {
      toast({ title: "Invalid Ratio", description: "Both values must be at least 1", variant: "destructive" });
      return;
    }
    updateSetting({ key: "preference_ratio_maintenance", value: String(m) });
    updateSetting({ key: "preference_ratio_installation", value: String(i) });
    toast({ title: "Saved", description: `Preference ratio updated to ${m}:${i} (maintenance:installation)` });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await fetch("/api/export-database", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `netguard-export-${new Date().toISOString().split('T')[0]}.json.gz`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export Complete", description: "Database exported (compressed)" });
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setIsImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

      if (isGzip) {
        const res = await fetch("/api/import-database", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: buffer,
          credentials: "include",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `${res.status}: Import failed`);
        }
        const result = await res.json();
        toast({ title: "Import Complete", description: result.message || "Settings imported successfully" });
      } else {
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        const res = await apiRequest("POST", "/api/import-database", data);
        const result = await res.json();
        toast({ title: "Import Complete", description: result.message || "Settings imported successfully" });
      }
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message || "Invalid file format", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const handleBulkReset = async () => {
    setIsResetting(true);
    try {
      const res = await apiRequest("POST", "/api/bulk-reset-assignments", { maxAgeHours: 24 });
      const data = await res.json();
      toast({ title: "Reset Complete", description: data.message || `${data.reset} ticket(s) unassigned` });
    } catch (err: any) {
      toast({ title: "Reset Failed", description: err.message || "Something went wrong", variant: "destructive" });
    } finally {
      setIsResetting(false);
    }
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
            <p className="text-sm text-muted-foreground">System configuration and maintenance</p>
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
          Default Bonus Fees
        </div>
        <p className="text-sm text-muted-foreground">
          Set the default bonus breakdown per ticket type. These are used as fallback when a technician does not have individual fees configured. To set individual fees per technician, go to Users and click the dollar icon on each technician.
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
          <Ratio className="w-4 h-4" />
          Auto-Assign Preference Ratio
        </div>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-sky-500 flex items-center justify-center shrink-0">
                <Ratio className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Maintenance : Installation Ratio</h3>
                  <p className="text-xs text-muted-foreground">
                    Controls how auto-assign distributes tickets. In every cycle, technicians will get maintenance tickets first, then installation tickets based on this ratio.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="space-y-1 flex-1">
                    <label className="text-xs font-medium text-muted-foreground">Maintenance</label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={ratioMaint}
                      onChange={(e) => setRatioMaint(e.target.value)}
                      data-testid="input-ratio-maintenance"
                    />
                  </div>
                  <span className="text-lg font-bold text-muted-foreground mt-5">:</span>
                  <div className="space-y-1 flex-1">
                    <label className="text-xs font-medium text-muted-foreground">Installation</label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={ratioInstall}
                      onChange={(e) => setRatioInstall(e.target.value)}
                      data-testid="input-ratio-installation"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-5"
                    onClick={handleSaveRatio}
                    disabled={isPending}
                    data-testid="button-save-ratio"
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Current: Every {parseInt(ratioMaint) + parseInt(ratioInstall) || 6} tickets, {ratioMaint} will be maintenance and {ratioInstall} will be installation.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 mt-8 pt-6 border-t">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <RotateCcw className="w-4 h-4" />
          Assignment Management
        </div>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-rose-500 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <h3 className="font-semibold text-sm">Bulk Reset Old Assignments</h3>
                  <p className="text-xs text-muted-foreground">
                    Unassign all tickets that have been assigned for more than 24 hours with no progress (not started, not closed). These tickets will be set back to open and available for reassignment. This also runs automatically at midnight every day.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isResetting}
                  data-testid="button-bulk-reset"
                  onClick={handleBulkReset}
                >
                  {isResetting ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Resetting...</>
                  ) : (
                    "Reset Stale Assignments"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 mt-8 pt-6 border-t">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Database className="w-4 h-4" />
          Database
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-md bg-blue-500 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <h3 className="font-semibold text-sm">Export Database</h3>
                    <p className="text-xs text-muted-foreground">
                      Download all data as a JSON file for backup or migration.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isExporting}
                    data-testid="button-export-db"
                    onClick={handleExport}
                  >
                    {isExporting ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Exporting...</>
                    ) : (
                      "Export"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-md bg-green-500 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 space-y-2">
                  <div>
                    <h3 className="font-semibold text-sm">Import Database</h3>
                    <p className="text-xs text-muted-foreground">
                      Restore settings from a previously exported JSON file.
                    </p>
                  </div>
                  <input
                    ref={importFileRef}
                    type="file"
                    accept=".json,.gz,.json.gz"
                    className="hidden"
                    data-testid="input-import-file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isImporting}
                    data-testid="button-import-db"
                    onClick={() => importFileRef.current?.click()}
                  >
                    {isImporting ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Importing...</>
                    ) : (
                      "Import"
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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
