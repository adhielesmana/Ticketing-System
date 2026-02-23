import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSetting, useUpdateSetting, useSystemTime } from "@/hooks/use-tickets";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Link, Redirect } from "wouter";
import { UserRole } from "@shared/schema";
import {
  Settings,
  DollarSign,
  Loader2,
  MapPin,
  Type,
  Download,
  Upload,
  RotateCcw,
  Ratio,
  Database,
  Calendar,
  Save,
  Clock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  const [isSavingCutoff, setIsSavingCutoff] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  const { data: ratioMaintSetting } = useSetting("preference_ratio_maintenance");
  const { data: ratioInstallSetting } = useSetting("preference_ratio_installation");
  const { data: cutoffSetting } = useSetting("cutoff_day");
  const [ratioMaint, setRatioMaint] = useState("4");
  const [ratioInstall, setRatioInstall] = useState("2");

  const [ratioInitialized, setRatioInitialized] = useState(false);
  const [cutoffDay, setCutoffDay] = useState("25");
  const [browserTime, setBrowserTime] = useState(() => new Date());

  const { data: systemTime, isLoading: systemTimeLoading } = useSystemTime();

  useEffect(() => {
    const ticker = setInterval(() => setBrowserTime(new Date()), 1000);
    return () => clearInterval(ticker);
  }, []);

  useEffect(() => {
    if (!ratioInitialized && ratioMaintSetting !== undefined) {
      setRatioMaint(ratioMaintSetting?.value || "4");
      setRatioInstall(ratioInstallSetting?.value || "2");
      setRatioInitialized(true);
    }
  }, [ratioMaintSetting, ratioInstallSetting, ratioInitialized]);

  useEffect(() => {
    if (cutoffSetting?.value !== undefined && cutoffSetting !== null) {
      setCutoffDay(cutoffSetting.value || "25");
    }
  }, [cutoffSetting]);

  if (!user) return null;
  if (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN) {
    return <Redirect to="/dashboard/admin" />;
  }

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

  const handleSaveCutoff = () => {
    const day = parseInt(cutoffDay, 10);
    if (isNaN(day) || day < 1 || day > 28) {
      toast({ title: "Invalid Cutoff Day", description: "Choose a number between 1 and 28", variant: "destructive" });
      return;
    }
    setIsSavingCutoff(true);
    updateSetting(
      { key: "cutoff_day", value: String(day) },
      {
        onSuccess: () => toast({ title: "Saved", description: `Cutoff day updated to ${day}` }),
        onSettled: () => setIsSavingCutoff(false),
      },
    );
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
        toast({ title: "Import Complete", description: result.message || "Database imported successfully" });
      } else {
        const text = new TextDecoder().decode(buffer);
        const data = JSON.parse(text);
        const res = await apiRequest("POST", "/api/import-database", data);
        const result = await res.json();
        toast({ title: "Import Complete", description: result.message || "Database imported successfully" });
      }
      queryClient.invalidateQueries();
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

  const formatIsoLocal = (value?: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
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
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-indigo-500 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Technician bonus fees</h3>
                  <p className="text-xs text-muted-foreground">
                    Bonus calculations now rely on each technician's own ticket and transport fees, so calculated bonuses are tied directly to the individual technician instead of a global default.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Open the Staff Management list, find a technician, and press the $ icon to edit that technician's fees. Those values are used whenever a ticket is closed to compute the technician's bonus total.
                </p>
                <div className="flex justify-end">
                  <Button asChild variant="outline" size="sm" className="gap-2">
                    <Link to="/users" data-testid="button-open-staff-management">Open Staff Management</Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
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

      <div className="space-y-4 mt-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Calendar className="w-4 h-4" />
          Monthly Cutoff Day
        </div>
        <p className="text-sm text-muted-foreground">
          Choose the cutoff day (1–28) for rolling monthly periods. Each period runs from day {Math.min(28, (parseInt(cutoffDay, 10) || 25) + 1)} through day {parseInt(cutoffDay, 10) || 25}.
        </p>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-md bg-slate-500 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">Cutoff day</h3>
                  <p className="text-xs text-muted-foreground">
                    Used by performance reports to determine the day range. Keep the value between 1 and 28 so every month includes the start day.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Day of month</label>
                    <Input
                      type="number"
                      min="1"
                      max="28"
                      value={cutoffDay}
                      onChange={(e) => setCutoffDay(e.target.value)}
                      data-testid="input-cutoff-day"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveCutoff}
                    disabled={isSavingCutoff}
                    data-testid="button-save-cutoff"
                  >
                    {isSavingCutoff ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Saving...</>
                    ) : (
                      <><Save className="w-4 h-4" /> Save</>
                    )}
                  </Button>
                </div>
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
      <div className="space-y-4 mt-8 pt-6 border-t">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Clock className="w-4 h-4" />
          Time Diagnostics
        </div>
        <Card>
          <CardContent className="p-5">
            {systemTimeLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TimeRow label="Browser time" value={browserTime.toLocaleString()} detail="Local device clock" />
                <TimeRow
                  label="Server / Docker (node)"
                  value={formatIsoLocal(systemTime?.serverTime)}
                  detail={`Timezone ${systemTime?.serverTimezone || "UTC"}`}
                />
                <TimeRow label="Docker shell" value={systemTime?.dockerTime || "—"} detail="date -u inside container" />
                <TimeRow label="Host shell" value={systemTime?.hostTime || "—"} detail="date inside container" />
                <TimeRow label="Database time" value={formatIsoLocal(systemTime?.dbTime)} detail={`Timezone ${systemTime?.dbTimezone || "UTC"}`} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface TimeRowProps {
  label: string;
  value: string;
  detail?: string;
}

function TimeRow({ label, value, detail }: TimeRowProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-mono">{value}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
