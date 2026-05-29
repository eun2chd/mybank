import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  HiArrowDown,
  HiArrowUp,
  HiChevronLeft,
  HiChevronRight
} from "react-icons/hi2";
import { BarChart, CategoryBars, DonutChart, GaugeBar, LineChart, Sparkline, useCountUp } from "@/components/charts";
import { ChartSeg } from "@/components/dashboard/ChartSeg";
import { EntryCta, LiveStatus, PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/auth";
import type { AppContext } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import {
  formatKoreanDateTime,
  formatMonthLabel,
  isCurrentMonth,
  shiftMonth,
  won,
  wonShort
} from "@/lib/format";

type DashboardData = {
  selectedYear: number;
  selectedMonth: number;
  isCurrentMonth: boolean;
  cashBalance: number;
  cardBalance: number;
  otherAssetsBalance: number;
  stockValue: number;
  totalAssets: number;
  assetChangeAmount: number;
  assetChangeRate: number;
  monthBudget: number;
  monthExpense: number;
  monthIncome: number;
  investmentProfitRate: number;
  investmentProfitAmount: number;
  accounts: Array<{ id: number; bankName: string; accountName: string; accountNumber: string; balance: number }>;
  holdings: Array<{
    id: number; name: string; symbol: string; market: string;
    buyAmount: number; totalQuantity: number; averagePrice: number;
    currentPrice: number; value: number; returnRate: number;
  }>;
  categories: Array<{ name: string; amount: number; color: string }>;
  incomeBreakdown: Array<{ name: string; amount: number }>;
  monthlyTrend: Array<{ label: string; value: number; display: string }>;
};

const BANK_TONES = ["#2F80ED", "#4D96FF", "#6BAAFF", "#89BEFF"];
const CHART_PALETTE = ["#2F80ED", "#4D96FF", "#7FB4FF", "#A9CDFF"];

function monthPeriodLabel(year: number, month: number, isCurrent: boolean) {
  return isCurrent ? "이번 달" : formatMonthLabel(year, month);
}

export function Dashboard() {
  const { user } = useOutletContext<AppContext>();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [clock, setClock] = useState(() => new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [holdings, setHoldings] = useState<DashboardData["holdings"]>([]);
  const priceTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const canGoNext = !isCurrentMonth(viewYear, viewMonth);

  const refreshHoldingPrices = useCallback(async () => {
    try {
      const result = await apiFetch<{ updated: number; prices: Array<{ id: number; currentPrice: number }> }>(
        "/api/investments/refresh-prices", user, { method: "POST" }
      );
      if (result.updated > 0) {
        setHoldings((prev) =>
          prev.map((h) => {
            const found = result.prices.find((p) => p.id === h.id);
            if (!found) return h;
            const value = h.totalQuantity * found.currentPrice;
            const returnRate = h.buyAmount > 0 ? ((value - h.buyAmount) / h.buyAmount) * 100 : 0;
            return { ...h, currentPrice: found.currentPrice, value, returnRate };
          })
        );
      }
    } catch {
      // 가격 갱신 실패 무시
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoading(true);
    setMessage("");
    apiFetch<DashboardData>(`/api/dashboard?year=${viewYear}&month=${viewMonth}`, user)
      .then((d) => { setData(d); setHoldings(d.holdings); })
      .then(() => refreshHoldingPrices())
      .catch((error) => setMessage(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [user.id, viewYear, viewMonth]);

  useEffect(() => {
    priceTimer.current = setInterval(() => refreshHoldingPrices(), 5 * 60 * 1000);
    return () => { if (priceTimer.current) clearInterval(priceTimer.current); };
  }, [refreshHoldingPrices]);

  const periodLabel = useMemo(
    () => monthPeriodLabel(viewYear, viewMonth, isCurrentMonth(viewYear, viewMonth)),
    [viewYear, viewMonth]
  );

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

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">대시보드를 불러오는 중입니다.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-destructive">{message || "데이터를 불러오지 못했습니다."}</p>
      </div>
    );
  }

  const spendPct = data.monthBudget > 0 ? Math.round((data.monthExpense / data.monthBudget) * 100) : 0;
  const netIncome = data.monthIncome - data.monthExpense;
  const posReturn = data.investmentProfitRate >= 0;
  const topCategory = data.categories[0]?.name;

  return (
    <div className={cn("w-full transition-opacity", loading && "pointer-events-none opacity-60")}>
      <PageHeader
        className="mb-4 lg:mb-5"
        status={
          <div className="mb-1.5 space-y-1">
            <LiveStatus>실시간 연결됨</LiveStatus>
            <p className="text-sm text-muted-foreground">{formatKoreanDateTime(clock)}</p>
          </div>
        }
        title={`안녕하세요, ${user.nickname}님`}
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
                {formatMonthLabel(viewYear, viewMonth)}
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
            {!data.isCurrentMonth ? (
              <Button type="button" variant="outline" size="sm" className="rounded-[11px]" onClick={goThisMonth}>
                이번 달
              </Button>
            ) : null}
            <EntryCta />
          </div>
        }
      />

      <div className="grid gap-5 pb-2">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <TotalAssetCard
            total={data.totalAssets}
            cash={data.cashBalance}
            cards={data.cardBalance}
            otherAssets={data.otherAssetsBalance}
            stock={data.stockValue}
            changeRate={data.assetChangeRate}
            changeAmount={data.assetChangeAmount}
          />
          <MiniSpendCard spent={data.monthExpense} budget={data.monthBudget} pct={spendPct} periodLabel={periodLabel} />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <MiniIncomeCard income={data.monthIncome} net={netIncome} breakdown={data.incomeBreakdown} periodLabel={periodLabel} />
          <MiniReturnCard rate={data.investmentProfitRate} profit={data.investmentProfitAmount} positive={posReturn} />
          <BudgetTipCard pct={spendPct} topCategory={topCategory} hasAccounts={data.cashBalance > 0} periodLabel={periodLabel} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <BankListCard accounts={data.accounts} cashTotal={data.cashBalance} />
          <StockCard holdings={holdings} stockValue={holdings.reduce((s, h) => s + h.value, 0)} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <TrendCard trend={data.monthlyTrend} periodLabel={periodLabel} />
          <CategoryCard categories={data.categories} periodLabel={periodLabel} />
        </div>
      </div>
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm font-semibold text-muted-foreground">{children}</p>;
}

function TotalAssetCard({
  total,
  cash,
  cards,
  otherAssets,
  stock,
  changeRate,
  changeAmount
}: {
  total: number;
  cash: number;
  cards: number;
  otherAssets: number;
  stock: number;
  changeRate: number;
  changeAmount: number;
}) {
  const animated = useCountUp(total, 1400);
  const up = changeAmount >= 0;
  return (
    <Card className="relative flex min-h-[260px] w-full min-w-0 flex-col overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card py-5 ring-1 ring-primary/20 lg:min-h-[280px]">
      <div className="pointer-events-none absolute -top-10 -right-8 size-[180px] rounded-full bg-[radial-gradient(circle,rgba(47,128,237,0.28),transparent_70%)]" />
      <CardContent className="relative flex min-h-0 flex-1 flex-col px-5">
        <CardLabel>나의 총 자산</CardLabel>
        <div className="tnum text-[42px] leading-none font-extrabold tracking-tight">{won(Math.round(animated))}</div>
        {total > 0 ? (
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            {changeAmount !== 0 ? (
              <>
                <Badge
                  className={cn(
                    "gap-1 border-0 hover:bg-success/15",
                    up ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                  )}
                >
                  {up ? <HiArrowUp size={13} /> : <HiArrowDown size={13} />}
                  {up ? "+" : ""}
                  {changeRate.toFixed(1)}%
                </Badge>
                <span className="text-sm text-muted-foreground">
                  전월 대비 순수익 {up ? "+" : ""}
                  {won(changeAmount)}
                </span>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">전월 대비 순수익 변동이 없습니다.</p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">계좌·카드·기타 자산·투자를 등록하면 총 자산이 표시됩니다.</p>
        )}
        <div className="mt-auto flex flex-wrap gap-x-7 gap-y-3 border-t border-border pt-4">
          <AssetSplit dot="#4D96FF" label="계좌" value={cash} />
          <AssetSplit dot="#6BAAFF" label="카드" value={cards} />
          <AssetSplit dot="#3FD68C" label="기타 자산" value={otherAssets} />
          <AssetSplit dot="#7FB4FF" label="투자" value={stock} />
        </div>
      </CardContent>
    </Card>
  );
}

function AssetSplit({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: dot }} />
        {label}
      </p>
      <strong className="tnum text-lg font-bold">{won(value)}</strong>
    </div>
  );
}

function MiniSpendCard({
  spent,
  budget,
  pct,
  periodLabel
}: {
  spent: number;
  budget: number;
  pct: number;
  periodLabel: string;
}) {
  return (
    <Card className="flex min-h-[220px] w-full min-w-0 flex-col py-5 lg:min-h-[260px]">
      <CardContent className="flex flex-1 flex-col px-5">
        <CardLabel>{periodLabel} 지출</CardLabel>
        <div className="tnum text-[26px] font-extrabold">{won(spent)}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          예산 {wonShort(budget)} 중 {pct}% 사용
        </p>
        <div className="mt-auto pt-3">
          <GaugeBar value={spent} max={budget} />
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
            <span>잔여 {wonShort(Math.max(0, budget - spent))}</span>
            <span>{pct}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniIncomeCard({
  income,
  net,
  breakdown,
  periodLabel
}: {
  income: number;
  net: number;
  breakdown: Array<{ name: string; amount: number }>;
  periodLabel: string;
}) {
  const pills = breakdown.length
    ? breakdown.slice(0, 2).map((b) => ({ label: b.name, v: wonShort(b.amount) }))
    : [
        { label: "수입", v: wonShort(income) },
        { label: "기타", v: "-" }
      ];
  return (
    <Card className="flex min-h-[200px] w-full min-w-0 flex-col py-5">
      <CardContent className="flex flex-1 flex-col px-5">
        <CardLabel>{periodLabel} 수입</CardLabel>
        <div className="tnum text-[26px] font-extrabold">{won(income)}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          순수익{" "}
          <span className={cn("font-bold", net >= 0 ? "text-success" : "text-destructive")}>
            {net >= 0 ? "+" : ""}
            {won(net)}
          </span>
        </p>
        <div className="mt-auto flex gap-2 pt-4">
          {pills.map((p) => (
            <div key={p.label} className="flex-1 rounded-lg bg-secondary px-2.5 py-2">
              <span className="text-[11px] text-muted-foreground">{p.label}</span>
              <strong className="tnum mt-0.5 block text-sm font-bold">{p.v}</strong>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniReturnCard({ rate, profit, positive }: { rate: number; profit: number; positive: boolean }) {
  return (
    <Card className="flex min-h-[200px] w-full min-w-0 flex-col py-5">
      <CardContent className="flex flex-1 flex-col px-5">
        <CardLabel>투자 수익률</CardLabel>
        <div className={cn("tnum text-[26px] font-extrabold", positive ? "text-success" : "text-destructive")}>
          {positive ? "+" : ""}
          {rate.toFixed(1)}%
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          평가 손익{" "}
          <span className={cn("font-bold", positive ? "text-success" : "text-destructive")}>
            {positive ? "+" : ""}
            {won(profit)}
          </span>
        </p>
        <div className="mt-auto">
          <Sparkline color={positive ? "var(--success)" : "var(--destructive)"} />
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetTipCard({
  pct,
  topCategory,
  hasAccounts,
  periodLabel
}: {
  pct: number;
  topCategory?: string;
  hasAccounts: boolean;
  periodLabel: string;
}) {
  return (
    <Card className="flex min-h-[200px] w-full min-w-0 flex-col justify-center bg-gradient-to-br from-accent/10 to-card py-5">
      <CardContent className="flex flex-1 flex-col justify-center px-5">
        <CardLabel>{periodLabel} 한 줄 분석</CardLabel>
        <p className="text-sm leading-relaxed">
          지출이 예산의 <b className="text-accent">{pct}%</b> 수준{pct <= 80 ? "으로 안정적" : ""}입니다.{" "}
          {hasAccounts ? (
            <>
              <b className="text-accent">{topCategory ?? "식비"}</b> 비중이 가장 큽니다.
            </>
          ) : (
            <>계좌를 연결하면 자산·소비 인사이트가 더 정확해집니다.</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function BankListCard({ accounts, cashTotal }: { accounts: DashboardData["accounts"]; cashTotal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const sorted = [...accounts].sort((a, b) => b.balance - a.balance);

  return (
    <Card className="flex min-h-[280px] w-full min-w-0 flex-col py-5">
      <CardContent className="flex flex-col px-5">
        <div className="mb-4">
          <SectionHead title="계좌별 잔액" sub={`${sorted.length}개 계좌 · 현금 ${wonShort(cashTotal)}`} />
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            등록된 계좌가 없습니다.{" "}
            <Link to="/accounts" className="text-primary hover:underline">
              계좌 추가
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((b, i) => {
              const share = cashTotal > 0 ? ((b.balance / cashTotal) * 100).toFixed(0) : "0";
              const tone = BANK_TONES[i % BANK_TONES.length];
              return (
                <div
                  key={b.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3.5 rounded-xl border px-3.5 py-3 transition-colors",
                    hover === i ? "border-border bg-secondary" : "border-transparent"
                  )}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className="flex size-[42px] shrink-0 items-center justify-center rounded-xl text-[15px] font-extrabold"
                    style={{ background: `${tone}26`, color: tone }}
                  >
                    {b.bankName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {b.bankName} <span className="font-medium text-muted-foreground">· {b.accountName}</span>
                    </p>
                    {b.accountNumber ? <p className="tnum text-xs text-muted-foreground">{b.accountNumber}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="tnum text-[15px] font-bold">{won(b.balance)}</p>
                    <p className="text-xs text-muted-foreground">전체의 {share}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StockCard({ holdings, stockValue }: { holdings: DashboardData["holdings"]; stockValue: number }) {
  const donutData = holdings.map((h) => ({ label: h.name, value: h.value }));

  return (
    <Card className="flex min-h-[280px] w-full min-w-0 flex-col py-5">
      <CardContent className="flex flex-col px-5">
        <div className="mb-4">
          <SectionHead title="보유 주식" sub={`평가액 ${won(stockValue)}`} />
        </div>
        {holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            보유 종목이 없습니다.{" "}
            <Link to="/investments" className="text-primary hover:underline">
              투자 추가
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center py-2">
              <DonutChart data={donutData} palette={CHART_PALETTE} centerLabel="총 평가액" centerValue={won(stockValue)} />
            </div>
            <div className="flex flex-col gap-1">
              {holdings.map((s, i) => (
                <div key={s.id} className="rounded-lg px-3 py-2.5 hover:bg-white/5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-sm" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                    <span className="flex-1 text-sm font-semibold">
                      {s.name}
                      {s.symbol ? <em className="ml-1.5 text-xs font-normal text-muted-foreground not-italic">{s.symbol}</em> : null}
                    </span>
                    <span className={cn("tnum text-sm font-bold", s.returnRate >= 0 ? "text-success" : "text-destructive")}>
                      {s.returnRate >= 0 ? "+" : ""}{s.returnRate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pl-4 text-xs text-muted-foreground">
                    <span>현재가 <strong className="text-foreground">{won(s.currentPrice)}</strong></span>
                    <span>보유가 <strong className="text-foreground">{won(s.averagePrice)}</strong></span>
                    <span>평가액 <strong className="text-foreground">{won(s.value)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendCard({ trend, periodLabel }: { trend: DashboardData["monthlyTrend"]; periodLabel: string }) {
  const [chartType, setChartType] = useState<"line" | "bar">("line");

  return (
    <Card className="flex min-h-[340px] w-full min-w-0 flex-col py-5">
      <CardContent className="flex flex-col px-5">
        <div className="mb-3">
          <SectionHead title="월별 소비 추이" sub={`${periodLabel} 포함 최근 6개월`} />
        </div>
        <div className="flex flex-col justify-center">
          {trend.length < 2 ? (
            <p className="text-sm text-muted-foreground">소비 추이 데이터가 부족합니다.</p>
          ) : chartType === "line" ? (
            <LineChart data={trend} />
          ) : (
            <BarChart data={trend} />
          )}
        </div>
        <ChartSeg
          className="mt-3 w-fit"
          value={chartType === "line" ? "선형" : "막대"}
          options={["선형", "막대"]}
          onChange={(v) => setChartType(v === "선형" ? "line" : "bar")}
        />
      </CardContent>
    </Card>
  );
}

function CategoryCard({ categories, periodLabel }: { categories: DashboardData["categories"]; periodLabel: string }) {
  const total = categories.reduce((s, c) => s + c.amount, 0);
  const bars = categories.map((c) => ({ label: c.name, value: c.amount }));

  return (
    <Card className="flex min-h-[340px] w-full min-w-0 flex-col py-5">
      <CardContent className="flex flex-col px-5">
        <div className="mb-4">
          <SectionHead title="소비 카테고리" sub={`${periodLabel} 총 ${wonShort(total)} 지출`} />
        </div>
        <div>
          {bars.length === 0 ? (
            <p className="text-sm text-muted-foreground">{periodLabel} 소비 기록이 없습니다.</p>
          ) : (
            <CategoryBars data={bars} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p>
    </div>
  );
}
