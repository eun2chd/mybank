import { Link } from "react-router-dom";
import { HiPlus } from "react-icons/hi2";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  status?: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ status, title, actions, className }: Props) {
  return (
    <header className={cn("mb-6 flex w-full flex-wrap items-center justify-between gap-5", className)}>
      <div className="min-w-0">
        {status}
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-[27px]">{title}</h1>
      </div>
      {actions}
    </header>
  );
}

export function LiveStatus({ children }: { children?: React.ReactNode }) {
  return (
    <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-success">
      <span className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_rgba(63,214,140,0.18)]" />
      {children ?? "실시간 연결됨"}
    </p>
  );
}

export function EntryCta() {
  return (
    <Link
      to="/entry"
      className={cn(buttonVariants({ size: "lg" }), "rounded-[11px] px-4 shadow-lg shadow-primary/30")}
    >
      <HiPlus size={17} />
      소비기록 입력
    </Link>
  );
}
