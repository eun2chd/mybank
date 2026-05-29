import { useEffect, useMemo, useState } from "react";
import { HiChevronLeft, HiChevronRight } from "react-icons/hi2";
import { Link, useOutletContext } from "react-router-dom";
import type { AppContext } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow
} from "@/components/ui/data-table";
import { apiFetch } from "@/auth";
import { formatMonthLabel, isCurrentMonth, shiftMonth, won } from "@/lib/format";
import { cn } from "@/lib/utils";

type TypeKind = "expense" | "income" | "neutral";

type TypeSummaryRow = {
  code: string;
  name: string;
  kind: TypeKind;
  total: number;
  count: number;
};

type TypeSummaryResponse = {
  selectedYear: number;
  selectedMonth: number;
  expenseTotal: number;
  incomeTotal: number;
  types: TypeSummaryRow[];
};

type TransactionRow = {
  id: number;
  transactionDate: string;
  title: string;
  merchant: string | null;
  amount: number;
  paymentMethod: string;
  categoryName: string | null;
  cardLabel: string | null;
  memo: string;
};

const KIND_LABEL: Record<TypeKind, string> = {
  expense: "지출",
  income: "수입",
  neutral: "제외"
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "카드",
  account: "계좌",
  cash: "현금"
};

function pickDefaultType(types: TypeSummaryRow[], expenseOnly: boolean) {
  const pool = expenseOnly ? types.filter((t) => t.kind === "expense") : types;
  const withRecords = pool.filter((t) => t.count > 0);
  return (withRecords[0] ?? pool[0])?.code ?? null;
}

export function TransactionTypeView() {
  const { user } = useOutletContext<AppContext>();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [expenseOnly, setExpenseOnly] = useState(true);
  const [summary, setSummary] = useState<TypeSummaryResponse | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [message, setMessage] = useState("");

  const canGoNext = !isCurrentMonth(viewYear, viewMonth);
  const periodLabel = formatMonthLabel(viewYear, viewMonth);

  const visibleTypes = useMemo(() => {
    if (!summary) return [];
    return expenseOnly ? summary.types.filter((t) => t.kind === "expense") : summary.types;
  }, [summary, expenseOnly]);

  const selectedType = useMemo(
    () => visibleTypes.find((t) => t.code === selectedCode) ?? summary?.types.find((t) => t.code === selectedCode) ?? null,
    [visibleTypes, summary, selectedCode]
  );

  const shareBase = useMemo(() => {
    if (!summary) return 0;
    if (expenseOnly) return summary.expenseTotal;
    return summary.types.reduce((s, t) => s + t.total, 0);
  }, [summary, expenseOnly]);

  useEffect(() => {
    setLoadingSummary(true);
    setMessage("");
    apiFetch<TypeSummaryResponse>(`/api/transactions/type-summary?year=${viewYear}&month=${viewMonth}`, user)
      .then((data) => {
        setSummary(data);
        setSelectedCode((prev) => {
          const pool = expenseOnly ? data.types.filter((t) => t.kind === "expense") : data.types;
          if (prev && pool.some((t) => t.code === prev)) return prev;
          return pickDefaultType(data.types, expenseOnly);
        });
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "요약을 불러오지 못했습니다.");
        setSummary(null);
      })
      .finally(() => setLoadingSummary(false));
  }, [user.id, viewYear, viewMonth]);

  useEffect(() => {
    if (!summary) return;
    setSelectedCode((prev) => {
      const pool = expenseOnly ? summary.types.filter((t) => t.kind === "expense") : summary.types;
      if (prev && pool.some((t) => t.code === prev)) return prev;
      return pickDefaultType(summary.types, expenseOnly);
    });
  }, [expenseOnly, summary]);

  useEffect(() => {
    if (!selectedCode) {
      setTransactions([]);
      return;
    }
    setLoadingTx(true);
    const query = new URLSearchParams({
      year: String(viewYear),
      month: String(viewMonth),
      transactionType: selectedCode
    });
    apiFetch<TransactionRow[]>(`/api/transactions?${query}`, user)
      .then(setTransactions)
      .catch((error) => setMessage(error instanceof Error ? error.message : "기록을 불러오지 못했습니다."))
      .finally(() => setLoadingTx(false));
  }, [user.id, viewYear, viewMonth, selectedCode]);

  function goPrevMonth() {
    const prev = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(prev.year);
    setViewMonth(prev.month);
  }

  function goNextMonth() {
    if (!canGoNext) return;
    const next = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  function goThisMonth() {
    const today = new Date();
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
  }

  return (
    <div className={cn("flex min-h-0 w-full flex-1 flex-col", loadingSummary && "opacity-60")}>
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={
          <p className="mb-1.5 text-xs font-semibold text-accent">
            유형을 고르면 그 유형 기록만 따로 모아서 봅니다
          </p>
        }
        title={`${periodLabel} 지출 내역`}
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 rounded-[11px] border border-border bg-card px-1 py-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={goPrevMonth} aria-label="이전 달">
                <HiChevronLeft size={18} />
              </Button>
              <button
                type="button"
                onClick={goThisMonth}
                className="min-w-[108px] cursor-pointer px-2 text-center text-sm font-bold"
              >
                {periodLabel}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={goNextMonth}
                disabled={!canGoNext}
                aria-label="다음 달"
              >
                <HiChevronRight size={18} />
              </Button>
            </div>
            {!isCurrentMonth(viewYear, viewMonth) ? (
              <Button type="button" variant="outline" size="sm" className="rounded-[11px]" onClick={goThisMonth}>
                이번 달
              </Button>
            ) : null}
          </div>
        }
      />

      {summary ? (
        <p className="mb-4 shrink-0 text-sm text-muted-foreground">
          {periodLabel} 지출 합계{" "}
          <span className="tnum font-bold text-foreground">{won(summary.expenseTotal)}</span>
          <span className="mx-2 text-border">·</span>
          수입 합계 <span className="tnum font-bold text-foreground">{won(summary.incomeTotal)}</span>
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 space-y-3 border-b border-border/60 px-5 py-4">
            <div>
              <CardTitle className="text-base">소비 유형 선택</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">보고 싶은 유형을 골라 주세요</p>
            </div>
            <div className="flex rounded-lg border border-border bg-secondary/50 p-0.5">
              <button
                type="button"
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                  expenseOnly ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => setExpenseOnly(true)}
              >
                지출 유형만
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                  !expenseOnly ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => setExpenseOnly(false)}
              >
                전체 유형
              </button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleTypes.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                {expenseOnly ? "지출 유형이 없습니다." : "등록된 유형이 없습니다."}{" "}
                <Link to="/transaction-types" className="text-primary hover:underline">
                  소비 유형 관리
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {visibleTypes.map((type) => {
                  const active = type.code === selectedCode;
                  const share = shareBase > 0 ? Math.round((type.total / shareBase) * 100) : 0;
                  return (
                    <li key={type.code}>
                      <button
                        type="button"
                        onClick={() => setSelectedCode(type.code)}
                        className={cn(
                          "flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                          active
                            ? "border-primary/40 bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-secondary/80"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{type.name}</span>
                          {!expenseOnly ? (
                            <Badge variant="secondary" className="shrink-0">
                              {KIND_LABEL[type.kind]}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <span className="tnum text-lg font-bold">{won(type.total)}</span>
                          <span className="text-xs text-muted-foreground">
                            {type.count}건{shareBase > 0 && type.total > 0 ? ` · 지출의 ${share}%` : ""}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">
              {selectedType ? `「${selectedType.name}」만 보기` : "유형을 선택하세요"}
            </CardTitle>
            {selectedType ? (
              <p className="mt-1 text-sm text-muted-foreground">
                다른 유형은 제외 · {selectedType.count}건 · 합계 {won(selectedType.total)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">왼쪽에서 유형을 선택하면 내역만 표시됩니다</p>
            )}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {!selectedCode ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                왼쪽에서 유형을 선택하세요.
              </p>
            ) : loadingTx ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                내역을 불러오는 중입니다.
              </p>
            ) : transactions.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                이 유형의 기록이 없습니다.{" "}
                <Link to="/entry" className="ml-1 text-primary hover:underline">
                  소비기록 입력
                </Link>
              </p>
            ) : (
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>날짜</DataTableHead>
                    <DataTableHead>내용</DataTableHead>
                    <DataTableHead>카테고리</DataTableHead>
                    <DataTableHead>결제</DataTableHead>
                    <DataTableHead>금액</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {transactions.map((tx) => (
                    <DataTableRow key={tx.id}>
                      <DataTableCell className="tnum text-muted-foreground">
                        {tx.transactionDate.replace(/-/g, ".")}
                      </DataTableCell>
                      <DataTableCell>
                        <p className="font-semibold">{tx.title}</p>
                        {tx.merchant ? (
                          <p className="text-xs text-muted-foreground">{tx.merchant}</p>
                        ) : null}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">{tx.categoryName || "-"}</DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {tx.cardLabel || PAYMENT_METHOD_LABEL[tx.paymentMethod] || "-"}
                      </DataTableCell>
                      <DataTableCell className="tnum font-bold">{won(tx.amount)}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </CardContent>
        </Card>
      </div>

      {message ? <p className="mt-3 shrink-0 text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
