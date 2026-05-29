import { cn } from "@/lib/utils";

export function ChartSeg({
  value,
  options,
  onChange,
  className
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 rounded-lg bg-secondary p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            value === o ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
