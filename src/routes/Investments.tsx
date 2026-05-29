import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useOutletContext } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/auth";
import { won } from "@/lib/format";
import { cn } from "@/lib/utils";

type AssetType = "stock" | "coin" | "fund" | "etc";

type InvestmentItem = {
  id: number;
  name: string;
  assetType: AssetType;
  market: string | null;
  symbol: string | null;
  totalBuyAmount: number;
  totalQuantity: number;
  averagePrice: number;
  currentPrice: number;
  value: number;
  returnRate: number;
  profitAmount: number;
  memo: string;
};

type FormState = {
  name: string;
  symbol: string;
  market: string;
  assetType: AssetType;
  totalBuyAmount: string;
  totalQuantity: string;
  currentPrice: string;
  memo: string;
};

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "stock", label: "주식" },
  { value: "coin", label: "코인" },
  { value: "fund", label: "펀드" },
  { value: "etc", label: "기타" }
];

const TYPE_LABEL: Record<AssetType, string> = {
  stock: "주식",
  coin: "코인",
  fund: "펀드",
  etc: "기타"
};

const MARKET_OPTIONS = [
  { value: "", label: "선택 안 함" },
  { value: "KOSPI", label: "KOSPI" },
  { value: "KOSDAQ", label: "KOSDAQ" },
  { value: "NYSE", label: "NYSE" },
  { value: "NASDAQ", label: "NASDAQ" },
  { value: "AMEX", label: "AMEX" },
  { value: "TSE", label: "TSE (도쿄)" },
  { value: "HKEX", label: "HKEX (홍콩)" },
  { value: "LSE", label: "LSE (런던)" },
  { value: "UPBIT", label: "UPBIT" },
  { value: "BITHUMB", label: "BITHUMB" },
  { value: "BINANCE", label: "BINANCE" },
  { value: "ETC", label: "기타" }
] as const;

const emptyForm = (): FormState => ({
  name: "",
  symbol: "",
  market: "",
  assetType: "stock",
  totalBuyAmount: "",
  totalQuantity: "",
  currentPrice: "",
  memo: ""
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function Investments() {
  const { user } = useOutletContext<AppContext>();
  const [items, setItems] = useState<InvestmentItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const rows = await apiFetch<InvestmentItem[]>("/api/investments", user);
    setItems(rows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(item: InvestmentItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      symbol: item.symbol ?? "",
      market: item.market ?? "",
      assetType: item.assetType,
      totalBuyAmount: String(item.totalBuyAmount),
      totalQuantity: String(item.totalQuantity),
      currentPrice: String(item.currentPrice),
      memo: item.memo ?? ""
    });
    setMessage("");
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body = {
        name: form.name,
        symbol: form.symbol || null,
        market: form.market || null,
        assetType: form.assetType,
        totalBuyAmount: form.totalBuyAmount ? Number(form.totalBuyAmount) : 0,
        totalQuantity: form.totalQuantity ? Number(form.totalQuantity) : 0,
        currentPrice: form.currentPrice ? Number(form.currentPrice) : 0,
        memo: form.memo || null
      };

      if (editingId) {
        await apiFetch(`/api/investments/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("주식 자산을 수정했습니다.");
      } else {
        await apiFetch("/api/investments", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("주식 자산을 등록했습니다.");
      }

      setEditingId(null);
      setForm(emptyForm());
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: InvestmentItem) {
    if (!window.confirm(`「${item.name}」 종목을 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/investments/${item.id}`, user, { method: "DELETE" });
      if (editingId === item.id) startCreate();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  const totalValue = items.reduce((sum, i) => sum + i.value, 0);
  const totalBuy = items.reduce((sum, i) => sum + i.totalBuyAmount, 0);
  const totalProfit = totalValue - totalBuy;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">주식 자산 관리</p>}
        title="보유 종목"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 종목
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "종목 수정" : "종목 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="name">종목명</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="예: 삼성전자"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="symbol">심볼</Label>
                <Input
                  id="symbol"
                  value={form.symbol}
                  onChange={(e) => updateField("symbol", e.target.value)}
                  placeholder="예: 005930"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="market">시장</Label>
                <select
                  id="market"
                  className={selectClass}
                  value={form.market}
                  onChange={(e) => updateField("market", e.target.value)}
                >
                  {form.market &&
                  !MARKET_OPTIONS.some((opt) => opt.value === form.market) &&
                  form.market !== "" ? (
                    <option value={form.market}>{form.market}</option>
                  ) : null}
                  {MARKET_OPTIONS.map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assetType">자산 유형</Label>
                <select
                  id="assetType"
                  className={selectClass}
                  value={form.assetType}
                  onChange={(e) => updateField("assetType", e.target.value as AssetType)}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="totalBuyAmount">총 매수금</Label>
                <Input
                  id="totalBuyAmount"
                  type="number"
                  value={form.totalBuyAmount}
                  onChange={(e) => updateField("totalBuyAmount", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="totalQuantity">보유 수량</Label>
                <Input
                  id="totalQuantity"
                  type="number"
                  step="0.00000001"
                  value={form.totalQuantity}
                  onChange={(e) => updateField("totalQuantity", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currentPrice">현재가</Label>
                <Input
                  id="currentPrice"
                  type="number"
                  value={form.currentPrice}
                  onChange={(e) => updateField("currentPrice", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="memo">메모</Label>
                <Input
                  id="memo"
                  value={form.memo}
                  onChange={(e) => updateField("memo", e.target.value)}
                  placeholder="선택 입력"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? "저장 중…" : editingId ? "수정 저장" : "등록"}
                </Button>
                {editingId ? (
                  <Button type="button" variant="outline" onClick={startCreate}>
                    취소
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">보유 종목 목록</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length}종목 · 평가 {won(totalValue)}
              {items.length > 0 ? (
                <span className={cn(totalProfit >= 0 ? "text-success" : "text-destructive")}>
                  {" "}
                  ({totalProfit >= 0 ? "+" : ""}
                  {won(totalProfit)})
                </span>
              ) : null}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {items.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 종목이 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>종목</DataTableHead>
                    <DataTableHead>유형</DataTableHead>
                    <DataTableHead>평가액</DataTableHead>
                    <DataTableHead>수익률</DataTableHead>
                    <DataTableHead>현재가</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {items.map((item) => (
                    <DataTableRow
                      key={item.id}
                      className={cn(editingId === item.id && "bg-primary/10 hover:bg-primary/10")}
                    >
                      <DataTableCell>
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.symbol || "-"}
                          {item.market ? ` · ${item.market}` : ""}
                        </div>
                      </DataTableCell>
                      <DataTableCell>
                        <Badge variant="secondary">{TYPE_LABEL[item.assetType]}</Badge>
                      </DataTableCell>
                      <DataTableCell className="tnum">{won(item.value)}</DataTableCell>
                      <DataTableCell
                        className={cn(
                          "tnum font-semibold",
                          item.returnRate >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        {item.returnRate >= 0 ? "+" : ""}
                        {item.returnRate.toFixed(1)}%
                      </DataTableCell>
                      <DataTableCell className="tnum">{won(item.currentPrice)}</DataTableCell>
                      <DataTableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => startEdit(item)}
                            aria-label="수정"
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => remove(item)}
                            aria-label="삭제"
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            )}
          </CardContent>
        </Card>
      </div>

      {message ? (
        <p
          className={cn(
            "mt-3 shrink-0 text-sm",
            message.includes("실패") ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
