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
import {
  categoryDisplayAmount,
  categoryShareBase,
  categoryTransferAmount,
  computeTransactionNet
} from "@/lib/transaction-summary";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/lib/pagination";

type CategoryType = "expense" | "income" | "investment" | "transfer" | "subscription";

type CategorySummaryRow = {
  id: number | null;
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  total: number;
  count: number;
  incomeTotal: number;
  expenseTotal: number;
  transferTotal: number;
  net: number;
};

type CategorySummaryResponse = {
  selectedYear: number;
  selectedMonth: number;
  expenseOnly: boolean;
  expenseTotal: number;
  incomeTotal: number;
  transferTotal: number;
  net: number;
  categories: CategorySummaryRow[];
};

type TransactionRow = {
  id: number;
  transactionDate: string;
  title: string;
  merchant: string | null;
  amount: number;
  transactionTypeName: string;
  paymentMethod: string;
  categoryName: string | null;
  cardLabel: string | null;
  memo: string;
};

const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = {
  expense: "지출",
  income: "수입",
  investment: "투자",
  transfer: "이체",
  subscription: "구독"
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "카드",
  account: "계좌",
  cash: "현금"
};

function categoryKey(row: CategorySummaryRow) {
  return row.id == null ? "none" : String(row.id);
}

function pickDefaultCategory(categories: CategorySummaryRow[], expenseOnly: boolean) {
  const pool = expenseOnly
    ? categories.filter((c) => c.type === "expense" || c.id === null)
    : categories;
  const withRecords = pool.filter((c) => c.count > 0);
  const target = withRecords[0] ?? pool[0];
  return target ? categoryKey(target) : null;
}

export function CategoryView() {
  const { user } = useOutletContext<AppContext>();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [expenseOnly, setExpenseOnly] = useState(true);
  const [summary, setSummary] = useState<CategorySummaryResponse | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [message, setMessage] = useState("");
  const { page: catViewPage, setPage: setCatViewPage, pageItems: catViewPageItems } = usePagination(transactions);

  const canGoNext = !isCurrentMonth(viewYear, viewMonth);
  const periodLabel = formatMonthLabel(viewYear, viewMonth);

  const visibleCategories = useMemo(() => {
    if (!summary) return [];
    const pool = expenseOnly
      ? summary.categories.filter((c) => c.type === "expense" || c.id === null)
      : summary.categories;
    return [...pool].sort((a, b) => {
      if (a.count > 0 && b.count === 0) return -1;
      if (a.count === 0 && b.count > 0) return 1;
      const aTotal = categoryDisplayAmount(a) + categoryTransferAmount(a);
      const bTotal = categoryDisplayAmount(b) + categoryTransferAmount(b);
      return bTotal - aTotal;
    });
  }, [summary, expenseOnly]);

  const selectedCategory = useMemo(
    () => summary?.categories.find((c) => categoryKey(c) === selectedKey) ?? null,
    [summary, selectedKey]
  );

  useEffect(() => {
    setLoadingSummary(true);
    setMessage("");
    const expenseParam = expenseOnly ? "" : "&expenseOnly=false";
    apiFetch<CategorySummaryResponse>(
      `/api/transactions/category-summary?year=${viewYear}&month=${viewMonth}${expenseParam}`,
      user
    )
      .then((data) => {
        setSummary(data);
        setSelectedKey((prev) => {
          const pool = expenseOnly
            ? data.categories.filter((c) => c.type === "expense" || c.id === null)
            : data.categories;
          if (prev && pool.some((c) => categoryKey(c) === prev)) return prev;
          return pickDefaultCategory(data.categories, expenseOnly);
        });
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "요약을 불러오지 못했습니다.");
        setSummary(null);
      })
      .finally(() => setLoadingSummary(false));
  }, [user.id, viewYear, viewMonth, expenseOnly]);

  useEffect(() => {
    if (!summary) return;
    setSelectedKey((prev) => {
      const pool = expenseOnly
        ? summary.categories.filter((c) => c.type === "expense" || c.id === null)
        : summary.categories;
      if (prev && pool.some((c) => categoryKey(c) === prev)) return prev;
      return pickDefaultCategory(summary.categories, expenseOnly);
    });
  }, [expenseOnly, summary]);

  useEffect(() => {
    if (!selectedKey) {
      setTransactions([]);
      return;
    }
    setLoadingTx(true);
    const query = new URLSearchParams({
      year: String(viewYear),
      month: String(viewMonth),
      categoryId: selectedKey
    });
    apiFetch<TransactionRow[]>(`/api/transactions?${query}`, user)
      .then(setTransactions)
      .catch((error) => setMessage(error instanceof Error ? error.message : "기록을 불러오지 못했습니다."))
      .finally(() => setLoadingTx(false));
  }, [user.id, viewYear, viewMonth, selectedKey]);

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
            카테고리를 고르면 그 카테고리 기록만 따로 모아서 봅니다
          </p>
        }
        title={`${periodLabel} 카테고리별 내역`}
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
          {periodLabel}{" "}
          · 수입{" "}
          <span className="tnum font-semibold text-primary">{won(summary.incomeTotal)}</span>
          {" "}
          · 지출{" "}
          <span className="tnum font-semibold text-destructive">{won(summary.expenseTotal)}</span>
          {" "}
          · 이체{" "}
          <span className="tnum font-semibold text-amber-400">{won(summary.transferTotal)}</span>
          {" "}
          · 순{" "}
          <span
            className={cn(
              "tnum font-bold",
              computeTransactionNet(
                summary.incomeTotal,
                summary.expenseTotal,
                summary.transferTotal
              ) >= 0
                ? "text-primary"
                : "text-destructive"
            )}
          >
            {won(
              computeTransactionNet(
                summary.incomeTotal,
                summary.expenseTotal,
                summary.transferTotal
              )
            )}
          </span>
          <span className="text-xs"> (= 수입 − 지출 − 이체)</span>
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 space-y-3 border-b border-border/60 px-5 py-4">
            <div>
              <CardTitle className="text-base">카테고리 선택</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">보고 싶은 카테고리를 골라 주세요</p>
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
                지출 카테고리만
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                  !expenseOnly ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => setExpenseOnly(false)}
              >
                전체 카테고리
              </button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleCategories.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                {expenseOnly ? "지출 카테고리가 없습니다." : "등록된 카테고리가 없습니다."}{" "}
                <Link to="/categories" className="text-primary hover:underline">
                  카테고리 관리
                </Link>
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {visibleCategories.map((category) => {
                  const key = categoryKey(category);
                  const active = key === selectedKey;
                  const displayAmount = categoryDisplayAmount(category);
                  const transferAmount = categoryTransferAmount(category);
                  const shareBase = summary ? categoryShareBase(summary, category) : 0;
                  const share = shareBase > 0 && displayAmount > 0 ? Math.round((displayAmount / shareBase) * 100) : 0;
                  const isIncome = category.type === "income";
                  const shareLabel = isIncome ? "수입" : "지출";
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={cn(
                          "flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors",
                          active
                            ? "border-primary/40 bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-secondary/80"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 font-semibold">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: category.color }}
                              aria-hidden
                            />
                            {category.name}
                          </span>
                          {!expenseOnly && category.id !== null ? (
                            <Badge variant="secondary" className="shrink-0">
                              {CATEGORY_TYPE_LABEL[category.type]}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <span
                              className={cn(
                                "tnum text-lg font-bold",
                                isIncome
                                  ? "text-primary"
                                  : category.count > 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              )}
                            >
                              {won(displayAmount)}
                            </span>
                            {!isIncome && transferAmount > 0 ? (
                              <p className="tnum mt-0.5 text-xs text-amber-400/90">이체 {won(transferAmount)}</p>
                            ) : null}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {category.count}건
                            {share > 0 ? ` · ${shareLabel}의 ${share}%` : ""}
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
              {selectedCategory ? `「${selectedCategory.name}」만 보기` : "카테고리를 선택하세요"}
            </CardTitle>
            {selectedCategory ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {selectedCategory.count}건
                {selectedCategory.incomeTotal > 0 ? (
                  <>
                    {" "}
                    · 수입 <span className="tnum font-semibold text-primary">{won(selectedCategory.incomeTotal)}</span>
                  </>
                ) : null}
                {selectedCategory.expenseTotal > 0 ? (
                  <>
                    {" "}
                    · 지출 <span className="tnum font-semibold text-destructive">{won(selectedCategory.expenseTotal)}</span>
                  </>
                ) : null}
                {selectedCategory.transferTotal > 0 ? (
                  <>
                    {" "}
                    · 이체 <span className="tnum font-semibold text-amber-400">{won(selectedCategory.transferTotal)}</span>
                  </>
                ) : null}
                {selectedCategory.count > 0 ? (
                  <>
                    {" "}
                    · 순{" "}
                    <span className="tnum font-bold">
                      {won(
                        computeTransactionNet(
                          selectedCategory.incomeTotal,
                          selectedCategory.expenseTotal,
                          selectedCategory.transferTotal
                        )
                      )}
                    </span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">왼쪽에서 카테고리를 선택하면 내역만 표시됩니다</p>
            )}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {!selectedKey ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                왼쪽에서 카테고리를 선택하세요.
              </p>
            ) : loadingTx ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                내역을 불러오는 중입니다.
              </p>
            ) : transactions.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                이 카테고리의 기록이 없습니다.{" "}
                <Link to="/entry" className="ml-1 text-primary hover:underline">
                  소비기록 입력
                </Link>
              </p>
            ) : (
              <>
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>날짜</DataTableHead>
                    <DataTableHead>내용</DataTableHead>
                    <DataTableHead>유형</DataTableHead>
                    <DataTableHead>결제</DataTableHead>
                    <DataTableHead>금액</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {catViewPageItems.map((tx) => (
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
                      <DataTableCell className="text-muted-foreground">
                        {tx.transactionTypeName || "-"}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {tx.cardLabel || PAYMENT_METHOD_LABEL[tx.paymentMethod] || "-"}
                      </DataTableCell>
                      <DataTableCell className="tnum font-bold">{won(tx.amount)}</DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <Pagination total={transactions.length} page={catViewPage} onChange={setCatViewPage} className="shrink-0 border-t border-border/60" />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {message ? <p className="mt-3 shrink-0 text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
