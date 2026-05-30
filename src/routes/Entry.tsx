import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Pagination } from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/auth";
import { formatAmountInput, parseAmountInput, won } from "@/lib/format";
import { usePagination } from "@/lib/pagination";
import { summarizeTransactionAmounts } from "@/lib/transaction-summary";
import { cn } from "@/lib/utils";

type CardRow = { id: number; cardName: string; cardCompany: string; balance: number; cardType: string };
type AccountRow = { id: number; bankName: string; accountName: string; balance: number };
type Category = { id: number; name: string; type: string };

type TransactionTypeOption = {
  id: number;
  code: string;
  name: string;
  kind: string;
};

type TransactionItem = {
  id: number;
  transactionDate: string;
  title: string;
  merchant: string | null;
  amount: number;
  transactionType: string;
  transactionTypeName: string;
  paymentMethod: string;
  cardId: number | null;
  accountId: number | null;
  categoryId: number | null;
  categoryName: string | null;
  cardLabel: string | null;
  accountLabel: string | null;
  memo: string;
};

type FormState = {
  transactionDate: string;
  title: string;
  merchant: string;
  amount: string;
  transactionType: string;
  paymentMethod: string;
  cardId: string;
  accountId: string;
  categoryId: string;
  memo: string;
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: "카드",
  account: "계좌",
  cash: "현금"
};

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const selectErrorClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-destructive bg-secondary/80 px-2.5 text-sm text-foreground outline-none";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm = (): FormState => ({
  transactionDate: todayString(),
  title: "",
  merchant: "",
  amount: "",
  transactionType: "expense",
  paymentMethod: "card",
  cardId: "",
  accountId: "",
  categoryId: "",
  memo: ""
});

export function Entry() {
  const { user } = useOutletContext<AppContext>();
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<TransactionTypeOption[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const { page, setPage, pageItems } = usePagination(transactions);

  async function load() {
    const [txRows, cardRows, accountRows, categoryRows, typeRows] = await Promise.all([
      apiFetch<TransactionItem[]>("/api/transactions", user),
      apiFetch<CardRow[]>("/api/cards", user),
      apiFetch<AccountRow[]>("/api/accounts", user),
      apiFetch<Category[]>("/api/categories", user),
      apiFetch<TransactionTypeOption[]>("/api/transaction-types", user)
    ]);
    setTransactions(txRows);
    setCards(cardRows);
    setAccounts(accountRows);
    setCategories(categoryRows);
    setTransactionTypes(typeRows);
  }

  const typeLabelMap = useMemo(
    () => Object.fromEntries(transactionTypes.map((t) => [t.code, t.name])),
    [transactionTypes]
  );

  const typeKindMap = useMemo(
    () => Object.fromEntries(transactionTypes.map((t) => [t.code, t.kind])),
    [transactionTypes]
  );

  const amountSummary = useMemo(
    () => summarizeTransactionAmounts(transactions, typeKindMap),
    [transactions, typeKindMap]
  );

  const defaultTypeCode = transactionTypes[0]?.code ?? "expense";

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  // 선택된 카드 정보
  const selectedCard = useMemo(
    () => (form.paymentMethod === "card" && form.cardId ? cards.find((c) => c.id === Number(form.cardId)) : null),
    [form.paymentMethod, form.cardId, cards]
  );

  // 선택된 계좌 정보
  const selectedAccount = useMemo(
    () => (form.paymentMethod === "account" && form.accountId ? accounts.find((a) => a.id === Number(form.accountId)) : null),
    [form.paymentMethod, form.accountId, accounts]
  );

  // 현재 거래 유형의 kind
  const currentKind = typeKindMap[form.transactionType] ?? "expense";

  // 잔액 부족 여부 (expense 타입 + 카드/계좌 선택 + 잔액 0 이하)
  const insufficientBalance = useMemo(() => {
    if (currentKind !== "expense") return false;
    if (form.paymentMethod === "card" && selectedCard) return selectedCard.balance <= 0;
    if (form.paymentMethod === "account" && selectedAccount) return selectedAccount.balance <= 0;
    return false;
  }, [currentKind, form.paymentMethod, selectedCard, selectedAccount]);

  // 폼 유효성
  const cardRequired = form.paymentMethod === "card" && !form.cardId;
  const accountRequired = form.paymentMethod === "account" && !form.accountId;
  const categoryRequired = !form.categoryId;

  function startCreate() {
    setEditingId(null);
    setForm({ ...emptyForm(), transactionType: defaultTypeCode });
    setMessage("");
    setSubmitAttempted(false);
  }

  function startEdit(item: TransactionItem) {
    setEditingId(item.id);
    setForm({
      transactionDate: item.transactionDate,
      title: item.title,
      merchant: item.merchant ?? "",
      amount: formatAmountInput(item.amount),
      transactionType: item.transactionType,
      paymentMethod: item.paymentMethod,
      cardId: item.cardId ? String(item.cardId) : "",
      accountId: item.accountId ? String(item.accountId) : "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
      memo: item.memo ?? ""
    });
    setMessage("");
    setSubmitAttempted(false);
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updatePaymentMethod(method: string) {
    setForm((prev) => ({
      ...prev,
      paymentMethod: method,
      cardId: method === "card" ? prev.cardId : "",
      accountId: method === "account" ? prev.accountId : ""
    }));
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatAmountInput(e.target.value);
    updateField("amount", formatted);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitAttempted(true);

    if (cardRequired || accountRequired || categoryRequired || insufficientBalance) return;

    setSaving(true);
    setMessage("");
    try {
      const body = {
        transactionDate: form.transactionDate,
        title: form.title,
        merchant: form.merchant || null,
        amount: parseAmountInput(form.amount),
        transactionType: form.transactionType,
        paymentMethod: form.paymentMethod,
        cardId: form.paymentMethod === "card" && form.cardId ? Number(form.cardId) : null,
        accountId: form.paymentMethod === "account" && form.accountId ? Number(form.accountId) : null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        memo: form.memo || null
      };

      if (editingId) {
        await apiFetch(`/api/transactions/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("소비 기록을 수정했습니다.");
      } else {
        await apiFetch("/api/transactions", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("소비 기록을 등록했습니다.");
      }

      setEditingId(null);
      setForm(emptyForm());
      setSubmitAttempted(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: TransactionItem) {
    if (!window.confirm(`「${item.title}」 기록을 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/transactions/${item.id}`, user, { method: "DELETE" });
      if (editingId === item.id) startCreate();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">소비기록 입력</p>}
        title="소비 내역"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 기록
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "소비 기록 수정" : "소비 기록 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="transactionDate">날짜</Label>
                <Input
                  id="transactionDate"
                  type="date"
                  value={form.transactionDate}
                  onChange={(e) => updateField("transactionDate", e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="title">내용</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  placeholder="예: 점심"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="merchant">사용처</Label>
                <Input
                  id="merchant"
                  value={form.merchant}
                  onChange={(e) => updateField("merchant", e.target.value)}
                  placeholder="선택 입력"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">금액</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₩
                  </span>
                  <Input
                    id="amount"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={handleAmountChange}
                    placeholder="0"
                    className="pl-7 text-right tnum"
                    required
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transactionType">유형</Label>
                {transactionTypes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    등록된 유형이 없습니다.{" "}
                    <Link to="/transaction-types" className="font-semibold text-primary hover:underline">
                      소비 유형 관리
                    </Link>
                    에서 추가해 주세요.
                  </p>
                ) : (
                  <select
                    id="transactionType"
                    className={selectClass}
                    value={form.transactionType}
                    onChange={(e) => updateField("transactionType", e.target.value)}
                    required
                  >
                    {transactionTypes.map((type) => (
                      <option key={type.id} value={type.code}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentMethod">결제 수단 <span className="text-destructive">*</span></Label>
                <select
                  id="paymentMethod"
                  className={selectClass}
                  value={form.paymentMethod}
                  onChange={(e) => updatePaymentMethod(e.target.value)}
                >
                  <option value="card">카드</option>
                  <option value="account">계좌</option>
                  <option value="cash">현금</option>
                </select>
              </div>

              {form.paymentMethod === "card" ? (
                <div className="grid gap-2">
                  <Label htmlFor="cardId">카드 <span className="text-destructive">*</span></Label>
                  <select
                    id="cardId"
                    className={submitAttempted && cardRequired ? selectErrorClass : selectClass}
                    value={form.cardId}
                    onChange={(e) => updateField("cardId", e.target.value)}
                  >
                    <option value="">카드 선택</option>
                    {cards.map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.cardCompany} {card.cardName}
                      </option>
                    ))}
                  </select>
                  {submitAttempted && cardRequired && (
                    <p className="text-xs text-destructive">카드를 선택해 주세요.</p>
                  )}
                  {selectedCard && (
                    <div className={cn(
                      "rounded-lg border px-3 py-2 text-xs",
                      selectedCard.balance <= 0
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border bg-secondary/40 text-muted-foreground"
                    )}>
                      잔액{" "}
                      <span className={cn("font-semibold tnum", selectedCard.balance <= 0 ? "text-destructive" : "text-foreground")}>
                        {won(selectedCard.balance)}
                      </span>
                      {selectedCard.balance <= 0 && " — 잔액 부족으로 등록할 수 없습니다."}
                    </div>
                  )}
                </div>
              ) : null}

              {form.paymentMethod === "account" ? (
                <div className="grid gap-2">
                  <Label htmlFor="accountId">계좌 <span className="text-destructive">*</span></Label>
                  <select
                    id="accountId"
                    className={submitAttempted && accountRequired ? selectErrorClass : selectClass}
                    value={form.accountId}
                    onChange={(e) => updateField("accountId", e.target.value)}
                  >
                    <option value="">계좌 선택</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.bankName} {account.accountName}
                      </option>
                    ))}
                  </select>
                  {submitAttempted && accountRequired && (
                    <p className="text-xs text-destructive">계좌를 선택해 주세요.</p>
                  )}
                  {selectedAccount && (
                    <div className={cn(
                      "rounded-lg border px-3 py-2 text-xs",
                      selectedAccount.balance <= 0
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border bg-secondary/40 text-muted-foreground"
                    )}>
                      잔액{" "}
                      <span className={cn("font-semibold tnum", selectedAccount.balance <= 0 ? "text-destructive" : "text-foreground")}>
                        {won(selectedAccount.balance)}
                      </span>
                      {selectedAccount.balance <= 0 && " — 잔액 부족으로 등록할 수 없습니다."}
                    </div>
                  )}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="categoryId">카테고리 <span className="text-destructive">*</span></Label>
                <select
                  id="categoryId"
                  className={submitAttempted && categoryRequired ? selectErrorClass : selectClass}
                  value={form.categoryId}
                  onChange={(e) => updateField("categoryId", e.target.value)}
                >
                  <option value="">카테고리 선택</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {submitAttempted && categoryRequired && (
                  <p className="text-xs text-destructive">카테고리를 선택해 주세요.</p>
                )}
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
                <Button
                  type="submit"
                  disabled={saving || (submitAttempted && insufficientBalance)}
                  className="flex-1"
                >
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
            <CardTitle className="text-base">등록된 소비 기록</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              총 {transactions.length}건
              {transactions.length > 0 ? (
                <>
                  {" "}
                  · 수입{" "}
                  <span className="tnum font-semibold text-primary">{won(amountSummary.income)}</span>
                  {" "}
                  · 지출{" "}
                  <span className="tnum font-semibold text-destructive">{won(amountSummary.expense)}</span>
                  {" "}
                  · 이체{" "}
                  <span className="tnum font-semibold text-amber-400">{won(amountSummary.transfer)}</span>
                  {" "}
                  · 순{" "}
                  <span className={cn("tnum font-bold", amountSummary.net >= 0 ? "text-primary" : "text-destructive")}>
                    {won(amountSummary.net)}
                  </span>
                  <span className="text-xs"> (= 수입 − 지출 − 이체)</span>
                </>
              ) : null}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {transactions.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 기록이 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <>
                <DataTable wrapperClassName="min-h-0 flex-1">
                  <DataTableHeader>
                    <DataTableRow>
                      <DataTableHead>날짜</DataTableHead>
                      <DataTableHead>내용</DataTableHead>
                      <DataTableHead>금액</DataTableHead>
                      <DataTableHead>유형</DataTableHead>
                      <DataTableHead>결제·수단</DataTableHead>
                      <DataTableHead>카테고리</DataTableHead>
                      <DataTableHead>관리</DataTableHead>
                    </DataTableRow>
                  </DataTableHeader>
                  <DataTableBody>
                    {pageItems.map((item) => (
                      <DataTableRow
                        key={item.id}
                        className={cn(editingId === item.id && "bg-primary/10 hover:bg-primary/10")}
                      >
                        <DataTableCell className="tnum whitespace-nowrap">{item.transactionDate}</DataTableCell>
                        <DataTableCell>
                          <div>{item.title}</div>
                          {item.merchant ? (
                            <div className="text-xs text-muted-foreground">{item.merchant}</div>
                          ) : null}
                        </DataTableCell>
                        <DataTableCell className="tnum">{won(item.amount)}</DataTableCell>
                        <DataTableCell>
                          <Badge variant="secondary">
                            {item.transactionTypeName || typeLabelMap[item.transactionType] || item.transactionType}
                          </Badge>
                        </DataTableCell>
                        <DataTableCell>
                          <div>{PAYMENT_METHOD_LABEL[item.paymentMethod] ?? item.paymentMethod}</div>
                          {item.cardLabel || item.accountLabel ? (
                            <div className="text-xs text-muted-foreground">
                              {item.cardLabel || item.accountLabel}
                            </div>
                          ) : null}
                        </DataTableCell>
                        <DataTableCell className="text-muted-foreground">
                          {item.categoryName || "-"}
                        </DataTableCell>
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
                <Pagination
                  total={transactions.length}
                  page={page}
                  onChange={setPage}
                  className="shrink-0 border-t border-border/60"
                />
              </>
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
