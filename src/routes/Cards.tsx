import { FormEvent, useEffect, useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/lib/pagination";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/auth";
import { won } from "@/lib/format";
import { cn } from "@/lib/utils";

type AccountOption = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  balance: number;
};

type CardItem = {
  id: number;
  cardCompany: string;
  cardName: string;
  cardType: "debit" | "credit";
  accountId: number | null;
  accountLabel: string | null;
  accountNumber: string | null;
  cardNumber: string | null;
  balance: number;
  isShared: boolean;
  memo: string;
};

type FormState = {
  cardCompany: string;
  cardName: string;
  cardType: "debit" | "credit";
  accountId: string;
  cardNumber: string;
  balance: string;
  isShared: boolean;
  memo: string;
};

const emptyForm = (): FormState => ({
  cardCompany: "",
  cardName: "",
  cardType: "debit",
  accountId: "",
  cardNumber: "",
  balance: "",
  isShared: false,
  memo: ""
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function maskNumber(value: string | null) {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return value;
  return `•••• ${digits.slice(-4)}`;
}

export function Cards() {
  const { user } = useOutletContext<AppContext>();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [cardRows, accountRows] = await Promise.all([
      apiFetch<CardItem[]>("/api/cards", user),
      apiFetch<AccountOption[]>("/api/accounts", user)
    ]);
    setCards(cardRows);
    setAccounts(accountRows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(card: CardItem) {
    setEditingId(card.id);
    setForm({
      cardCompany: card.cardCompany,
      cardName: card.cardName,
      cardType: card.cardType,
      accountId: card.accountId ? String(card.accountId) : "",
      cardNumber: card.cardNumber ?? "",
      // 체크카드 잔액은 계좌에서 자동 관리되므로 폼에 채우지 않음
      balance: card.cardType === "credit" ? String(card.balance) : "",
      isShared: card.isShared,
      memo: card.memo ?? ""
    });
    setMessage("");
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeCardType(cardType: "debit" | "credit") {
    setForm((prev) => ({
      ...prev,
      cardType,
      accountId: cardType === "debit" ? prev.accountId : "",
      cardNumber: cardType === "credit" ? prev.cardNumber : ""
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body = {
        cardCompany: form.cardCompany,
        cardName: form.cardName,
        cardType: form.cardType,
        accountId: form.cardType === "debit" && form.accountId ? Number(form.accountId) : null,
        cardNumber: form.cardType === "credit" ? form.cardNumber : null,
        balance: form.balance ? Number(form.balance) : 0,
        isShared: form.isShared,
        memo: form.memo || null
      };

      if (editingId) {
        await apiFetch(`/api/cards/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("카드 정보를 수정했습니다.");
      } else {
        await apiFetch("/api/cards", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("카드를 등록했습니다.");
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

  async function remove(card: CardItem) {
    if (!window.confirm(`「${card.cardCompany} ${card.cardName}」 카드를 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/cards/${card.id}`, user, { method: "DELETE" });
      if (editingId === card.id) startCreate();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  // 체크카드 표시 잔액: 연결 계좌 잔액 우선 사용
  function cardDisplayBalance(card: CardItem): number {
    if (card.cardType === "debit" && card.accountId) {
      const linked = accounts.find((a) => a.id === card.accountId);
      if (linked != null) return linked.balance;
    }
    return card.balance;
  }

  // 신용카드만 합산 (체크카드 잔액은 연결 계좌에서 표시됨)
  const creditBalance = cards.filter((c) => c.cardType === "credit").reduce((sum, c) => sum + c.balance, 0);
  const debitCount = cards.filter((c) => c.cardType === "debit").length;
  const { page: cardPage, setPage: setCardPage, pageItems: cardPageItems } = usePagination(cards);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">카드 관리</p>}
        title="내 카드"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 카드
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "카드 수정" : "카드 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="cardCompany">카드사</Label>
                <Input
                  id="cardCompany"
                  value={form.cardCompany}
                  onChange={(e) => updateField("cardCompany", e.target.value)}
                  placeholder="예: 신한카드"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cardName">카드명</Label>
                <Input
                  id="cardName"
                  value={form.cardName}
                  onChange={(e) => updateField("cardName", e.target.value)}
                  placeholder="예: Deep Dream"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cardType">카드 종류</Label>
                <select
                  id="cardType"
                  className={selectClass}
                  value={form.cardType}
                  onChange={(e) => changeCardType(e.target.value as "debit" | "credit")}
                >
                  <option value="debit">체크카드</option>
                  <option value="credit">신용카드</option>
                </select>
              </div>
              {form.cardType === "debit" ? (
                <div className="grid gap-2">
                  <Label htmlFor="accountId">연결 계좌</Label>
                  {accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      등록된 계좌가 없습니다.{" "}
                      <Link to="/accounts" className="font-semibold text-primary hover:underline">
                        계좌 관리
                      </Link>
                      에서 먼저 추가해 주세요.
                    </p>
                  ) : (
                    <select
                      id="accountId"
                      className={selectClass}
                      value={form.accountId}
                      onChange={(e) => updateField("accountId", e.target.value)}
                      required
                    >
                      <option value="">계좌 선택</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.bankName} {account.accountName}
                          {account.accountNumber ? ` (${maskNumber(account.accountNumber)})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="cardNumber">카드번호</Label>
                  <Input
                    id="cardNumber"
                    value={form.cardNumber}
                    onChange={(e) => updateField("cardNumber", e.target.value)}
                    placeholder="신용카드 번호"
                    required
                  />
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer rounded border-input accent-primary"
                  checked={form.isShared}
                  onChange={(e) => updateField("isShared", e.target.checked)}
                />
                공용 카드 (가족·함께 쓰는 카드)
              </label>
              {form.cardType === "credit" ? (
                <div className="grid gap-2">
                  <Label htmlFor="balance">카드 잔액</Label>
                  <Input
                    id="balance"
                    type="number"
                    value={form.balance}
                    onChange={(e) => updateField("balance", e.target.value)}
                    placeholder="0"
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-border/60 bg-secondary/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                  체크카드 잔액은 연결된 계좌의 잔액을 자동으로 표시합니다.
                </p>
              )}
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
            <CardTitle className="text-base">등록된 카드</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              총 {cards.length}개
              {debitCount > 0 ? ` · 체크 ${debitCount}개` : ""}
              {creditBalance > 0 ? ` · 신용카드 잔액 ${won(creditBalance)}` : ""}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {cards.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 카드가 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <>
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>카드사</DataTableHead>
                    <DataTableHead>카드명</DataTableHead>
                    <DataTableHead>종류</DataTableHead>
                    <DataTableHead>공용</DataTableHead>
                    <DataTableHead>연결 계좌·카드번호</DataTableHead>
                    <DataTableHead>잔액</DataTableHead>
                    <DataTableHead>메모</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {cardPageItems.map((card) => (
                    <DataTableRow
                      key={card.id}
                      className={cn(editingId === card.id && "bg-primary/10 hover:bg-primary/10")}
                    >
                      <DataTableCell>{card.cardCompany}</DataTableCell>
                      <DataTableCell>{card.cardName}</DataTableCell>
                      <DataTableCell>
                        <Badge variant={card.cardType === "credit" ? "default" : "secondary"}>
                          {card.cardType === "credit" ? "신용" : "체크"}
                        </Badge>
                      </DataTableCell>
                      <DataTableCell>{card.isShared ? <Badge variant="outline">공용</Badge> : "-"}</DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {card.cardType === "debit"
                          ? card.accountLabel || maskNumber(card.accountNumber)
                          : maskNumber(card.cardNumber)}
                      </DataTableCell>
                      <DataTableCell className="tnum">
                        <div>
                          <div>{won(cardDisplayBalance(card))}</div>
                          {card.cardType === "debit" && (
                            <div className="text-[11px] text-muted-foreground">계좌 잔액</div>
                          )}
                        </div>
                      </DataTableCell>
                      <DataTableCell className="max-w-[160px] truncate text-muted-foreground">
                        {card.memo || "-"}
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => startEdit(card)}
                            aria-label="수정"
                          >
                            <Pencil size={15} />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => remove(card)}
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
              <Pagination total={cards.length} page={cardPage} onChange={setCardPage} className="shrink-0 border-t border-border/60" />
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
