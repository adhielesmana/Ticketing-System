import { differenceInMinutes } from "date-fns";
import { Progress } from "@/components/ui/progress";

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
  const isOverdue = minutesLeft < 0;

  let colorClass = "bg-green-500";
  if (percentage > 75) colorClass = "bg-yellow-500";
  if (percentage > 90) colorClass = "bg-red-500";
  if (isOverdue) colorClass = "bg-red-600";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium">
        <span>SLA Timer</span>
        <span className={isOverdue ? "text-destructive" : ""}>
          {isOverdue 
            ? `${Math.abs(minutesLeft)}m Overdue` 
            : `${minutesLeft}m Remaining`}
        </span>
      </div>
      <Progress value={percentage} className={`h-2 ${colorClass}`} />
    </div>
  );
}
