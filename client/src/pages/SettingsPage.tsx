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
} from "lucide-react";

const bonusConfigs = [
  {
    key: "bonus_home_maintenance",
    label: "Home Maintenance",
    description: "Bonus for residential fiber maintenance tickets",
    icon: Home,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500",
  },
  {
    key: "bonus_backbone_maintenance",
    label: "Backbone Maintenance",
    description: "Bonus for backbone/core network maintenance tickets",
    icon: Wifi,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500",
  },
  {
    key: "bonus_installation",
    label: "New Installation",
    description: "Bonus for new FTTH installation tickets",
    icon: Wrench,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500",
  },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutate: updateSetting, isPending } = useUpdateSetting();

  const { data: homeSetting } = useSetting("bonus_home_maintenance");
  const { data: backboneSetting } = useSetting("bonus_backbone_maintenance");
  const { data: installSetting } = useSetting("bonus_installation");

  const [values, setValues] = useState<Record<string, string>>({
    bonus_home_maintenance: "",
    bonus_backbone_maintenance: "",
    bonus_installation: "",
  });

  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && homeSetting && backboneSetting && installSetting) {
      setValues({
        bonus_home_maintenance: homeSetting.value || "0",
        bonus_backbone_maintenance: backboneSetting.value || "0",
        bonus_installation: installSetting.value || "0",
      });
      setInitialized(true);
    }
  }, [homeSetting, backboneSetting, installSetting, initialized]);

  if (!user) return null;
  if (user.role !== UserRole.SUPERADMIN && user.role !== UserRole.ADMIN) {
    return <Redirect to="/dashboard/admin" />;
  }

  const handleSave = (key: string) => {
    const val = values[key];
    const numVal = parseFloat(val);
    if (isNaN(numVal) || numVal < 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid number", variant: "destructive" });
      return;
    }
    updateSetting(
      { key, value: numVal.toFixed(2) },
      {
        onSuccess: () => {
          toast({ title: "Saved", description: "Bonus amount updated successfully" });
        },
      }
    );
  };

  const handleSaveAll = () => {
    bonusConfigs.forEach((config) => {
      const val = values[config.key];
      const numVal = parseFloat(val);
      if (!isNaN(numVal) && numVal >= 0) {
        updateSetting({ key: config.key, value: numVal.toFixed(2) });
      }
    });
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
          Set the bonus amount awarded to technicians for each completed ticket type. If a ticket is closed after the SLA deadline (overdue), the bonus is automatically set to 0.
        </p>

        {bonusConfigs.map((config) => (
          <Card key={config.key}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-md ${config.bg} flex items-center justify-center shrink-0`}>
                  <config.icon className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h3 className="font-semibold text-sm" data-testid={`text-bonus-label-${config.key}`}>{config.label}</h3>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={values[config.key]}
                        onChange={(e) => setValues(prev => ({ ...prev, [config.key]: e.target.value }))}
                        className="pl-9"
                        data-testid={`input-bonus-${config.key}`}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSave(config.key)}
                      disabled={isPending}
                      data-testid={`button-save-${config.key}`}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
