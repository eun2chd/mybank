import * as React from "react";

import { cn } from "@/lib/utils";

/** 상위 테이블에 보더·타이포를 걸어 th/td가 공통 스타일을 받습니다. */
function DataTable({ className, wrapperClassName, ...props }: React.ComponentProps<"table"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("min-h-0 w-full overflow-auto", wrapperClassName)}>
      <table
        data-slot="data-table"
        className={cn(
          "w-full border-collapse border border-border text-center",
          "[&_th]:border [&_td]:border [&_th]:border-border [&_td]:border-border",
          "[&_th]:px-3 [&_th]:py-2.5 [&_td]:px-3 [&_td]:py-2.5",
          "[&_th]:text-center [&_td]:text-center",
          "[&_th]:text-base [&_th]:font-bold [&_td]:text-sm [&_td]:font-semibold",
          className
        )}
        {...props}
      />
    </div>
  );
}

function DataTableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="data-table-header" className={cn("sticky top-0 z-10 bg-secondary text-foreground", className)} {...props} />;
}

function DataTableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="data-table-body"
      className={cn("bg-card text-foreground [&_tr]:transition-colors [&_tr:hover]:bg-secondary/35", className)}
      {...props}
    />
  );
}

function DataTableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="data-table-row" className={cn(className)} {...props} />;
}

function DataTableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="data-table-head" className={cn("whitespace-nowrap align-middle", className)} {...props} />;
}

function DataTableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td data-slot="data-table-cell" className={cn("align-middle", className)} {...props} />;
}

export { DataTable, DataTableHeader, DataTableBody, DataTableRow, DataTableHead, DataTableCell };
