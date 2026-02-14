import { differenceInMinutes, differenceInHours } from "date-fns";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle } from "lucide-react";

interface SLAIndicatorProps {
  deadline: string;
  createdAt: string;
  status: string;
}

export function SLAIndicator({ deadline, createdAt, status }: SLAIndicatorProps) {
  if (status === 'closed') return null;

  const start = new Date(createdAt).getTime();
  const end = new Date(deadline).getTime();
  const now = new Date().getTime();

  const totalDuration = end - start;
  const elapsed = now - start;
  const percentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

  const minutesLeft = differenceInMinutes(new Date(deadline), new Date());
  const hoursLeft = differenceInHours(new Date(deadline), new Date());
  const isOverdue = minutesLeft < 0;

  let timeDisplay = "";
  if (isOverdue) {
    const absMin = Math.abs(minutesLeft);
    timeDisplay = absMin >= 60 ? `${Math.floor(absMin / 60)}h ${absMin % 60}m overdue` : `${absMin}m overdue`;
  } else {
    timeDisplay = hoursLeft >= 1 ? `${hoursLeft}h ${minutesLeft % 60}m left` : `${minutesLeft}m left`;
  }

  let barColor = "bg-emerald-500 dark:bg-emerald-400";
  let textColor = "text-emerald-700 dark:text-emerald-400";
  if (percentage > 75) {
    barColor = "bg-amber-500 dark:bg-amber-400";
    textColor = "text-amber-700 dark:text-amber-400";
  }
  if (percentage > 90 || isOverdue) {
    barColor = "bg-red-500 dark:bg-red-400";
    textColor = "text-red-700 dark:text-red-400";
  }

  return (
    <div className="space-y-1.5 min-w-[120px]" data-testid="sla-indicator">
      <div className="flex items-center justify-between gap-2">
        {isOverdue ? (
          <AlertTriangle className={`w-3 h-3 ${textColor}`} />
        ) : (
          <Clock className={`w-3 h-3 ${textColor}`} />
        )}
        <span className={`text-xs font-medium ${textColor}`}>
          {timeDisplay}
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
