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
import { formatAmountInput, parseAmountInput, won } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/lib/pagination";

type AccountType = "checking" | "savings" | "investment" | "cash";

type AccountItem = {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  balance: number;
  accountType: AccountType;
  memo: string;
};

type FormState = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  balance: string;
  accountType: AccountType;
  memo: string;
};

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "checking", label: "입출금" },
  { value: "savings", label: "적금·저축" },
  { value: "investment", label: "증권" },
  { value: "cash", label: "현금" }
];

const TYPE_LABEL: Record<AccountType, string> = {
  checking: "입출금",
  savings: "적금·저축",
  investment: "증권",
  cash: "현금"
};

const emptyForm = (): FormState => ({
  bankName: "",
  accountName: "",
  accountNumber: "",
  balance: "",
  accountType: "checking",
  memo: ""
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function maskAccountNumber(value: string | null) {
  if (!value) return "-";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return value;
  return `•••• ${digits.slice(-4)}`;
}

export function Accounts() {
  const { user } = useOutletContext<AppContext>();
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const { page: acctPage, setPage: setAcctPage, pageItems: acctPageItems } = usePagination(accounts);

  async function load() {
    const rows = await apiFetch<AccountItem[]>("/api/accounts", user);
    setAccounts(rows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(item: AccountItem) {
    setEditingId(item.id);
    setForm({
      bankName: item.bankName,
      accountName: item.accountName,
      accountNumber: item.accountNumber ?? "",
      balance: formatAmountInput(item.balance),
      accountType: item.accountType,
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
        bankName: form.bankName,
        accountName: form.accountName,
        accountNumber: form.accountNumber || null,
        balance: parseAmountInput(form.balance),
        accountType: form.accountType,
        memo: form.memo || null
      };

      if (editingId) {
        await apiFetch(`/api/accounts/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("계좌를 수정했습니다.");
      } else {
        await apiFetch("/api/accounts", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("계좌를 등록했습니다.");
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

  async function remove(item: AccountItem) {
    if (!window.confirm(`「${item.bankName} ${item.accountName}」 계좌를 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/accounts/${item.id}`, user, { method: "DELETE" });
      if (editingId === item.id) startCreate();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">계좌 관리</p>}
        title="내 계좌"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 계좌
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "계좌 수정" : "계좌 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="bankName">은행명</Label>
                <Input
                  id="bankName"
                  value={form.bankName}
                  onChange={(e) => updateField("bankName", e.target.value)}
                  placeholder="예: 국민은행"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accountName">계좌명</Label>
                <Input
                  id="accountName"
                  value={form.accountName}
                  onChange={(e) => updateField("accountName", e.target.value)}
                  placeholder="예: 급여통장"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accountNumber">계좌번호</Label>
                <Input
                  id="accountNumber"
                  value={form.accountNumber}
                  onChange={(e) => updateField("accountNumber", e.target.value)}
                  placeholder="선택 입력"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="accountType">계좌 종류</Label>
                <select
                  id="accountType"
                  className={selectClass}
                  value={form.accountType}
                  onChange={(e) => updateField("accountType", e.target.value as AccountType)}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="balance">잔액</Label>
                <Input
                  id="balance"
                  type="text"
                  inputMode="numeric"
                  value={form.balance}
                  onChange={(e) => updateField("balance", formatAmountInput(e.target.value))}
                  placeholder="0"
                  className="tnum"
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
            <CardTitle className="text-base">등록된 계좌</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              총 {accounts.length}개{accounts.length > 0 ? ` · 잔액 합계 ${won(totalBalance)}` : ""}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {accounts.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 계좌가 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <>
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>은행</DataTableHead>
                    <DataTableHead>계좌명</DataTableHead>
                    <DataTableHead>종류</DataTableHead>
                    <DataTableHead>계좌번호</DataTableHead>
                    <DataTableHead>잔액</DataTableHead>
                    <DataTableHead>메모</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {acctPageItems.map((item) => (
                    <DataTableRow
                      key={item.id}
                      className={cn(editingId === item.id && "bg-primary/10 hover:bg-primary/10")}
                    >
                      <DataTableCell>{item.bankName}</DataTableCell>
                      <DataTableCell>{item.accountName}</DataTableCell>
                      <DataTableCell>
                        <Badge variant="secondary">{TYPE_LABEL[item.accountType]}</Badge>
                      </DataTableCell>
                      <DataTableCell className="tnum text-muted-foreground">
                        {maskAccountNumber(item.accountNumber)}
                      </DataTableCell>
                      <DataTableCell className="tnum">{won(item.balance)}</DataTableCell>
                      <DataTableCell className="max-w-[160px] truncate text-muted-foreground">
                        {item.memo || "-"}
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
              <Pagination total={accounts.length} page={acctPage} onChange={setAcctPage} className="shrink-0 border-t border-border/60" />
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
