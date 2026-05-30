import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  total: number;
  page: number;
  pageSize?: number;
  pageGroupSize?: number;
  onChange: (page: number) => void;
  className?: string;
}

const btnBase =
  "flex h-8 min-w-[32px] cursor-pointer items-center justify-center rounded-lg border border-border px-2 text-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40";

export function Pagination({
  total,
  page,
  pageSize = 10,
  pageGroupSize = 10,
  onChange,
  className
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const groupStart = Math.floor((page - 1) / pageGroupSize) * pageGroupSize + 1;
  const groupEnd = Math.min(groupStart + pageGroupSize - 1, totalPages);
  const pages = Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i);

  return (
    <div className={cn("flex items-center justify-center gap-1 py-3", className)}>
      <button
        type="button"
        className={btnBase}
        onClick={() => onChange(groupStart - 1)}
        disabled={groupStart <= 1}
        aria-label="이전 그룹"
      >
        <ChevronLeft size={15} />
      </button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            btnBase,
            p === page
              ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        className={btnBase}
        onClick={() => onChange(groupEnd + 1)}
        disabled={groupEnd >= totalPages}
        aria-label="다음 그룹"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
