export const priorityColors: Record<string, string> = {
  low: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export const statusColors: Record<string, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  waiting_assignment: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  closed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pending_rejection: "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

export const statusLabels: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  pending_rejection: "Pending Rejection",
};

const attentionStatuses = new Set<string>([
  "pending_rejection",
  "open",
]);

const attentionDotColors: Record<string, string> = {
  pending_rejection: "bg-orange-500",
  open: "bg-blue-500",
  sla_overdue: "bg-red-500",
};

export function toCapName(name: string, maxLen = 0): string {
  if (!name) return "";
  const capitalized = name.replace(/\b\w/g, (c) => c.toUpperCase());
  if (maxLen > 0 && capitalized.length > maxLen) return capitalized.slice(0, maxLen) + "...";
  return capitalized;
}

export function toTitleCase(str: string): string {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AttentionDot({ status, slaOverdue, dataTestId }: {
  status: string;
  slaOverdue?: boolean;
  dataTestId?: string;
}) {
  if (slaOverdue) {
    return (
      <span
        className="inline-block w-2 h-2 rounded-full bg-red-500 attention-dot"
        data-testid={dataTestId}
      />
    );
  }

  if (!attentionStatuses.has(status)) return null;
  const color = attentionDotColors[status] || "bg-red-500";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} attention-dot`}
      data-testid={dataTestId}
    />
  );
}
