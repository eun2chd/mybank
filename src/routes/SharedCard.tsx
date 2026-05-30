import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/auth";
import { formatMonthLabel, isCurrentMonth, shiftMonth, won } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/lib/pagination";

type SharedCardOption = {
  id: number;
  cardCompany: string;
  cardName: string;
};

type CardMember = { id: number; name: string; sortOrder: number };

type UsageSummary = {
  selectedYear: number;
  selectedMonth: number;
  grandPrincipal: number;
  grandMonthly: number;
  members: Array<{
    id: number;
    name: string;
    principalTotal: number;
    monthlyTotal: number;
    entryCount: number;
  }>;
};

type UsageEntry = {
  id: number;
  cardMemberId: number;
  memberName: string;
  usageDate: string;
  paymentPlan: "lump_sum" | "installment";
  productName: string;
  productUrl: string | null;
  principalAmount: number;
  monthlyPayment: number;
  installmentMonths: number;
  memo: string;
};

type UsageForm = {
  usageDate: string;
  cardMemberId: string;
  paymentPlan: "lump_sum" | "installment";
  productName: string;
  productUrl: string;
  principalAmount: string;
  monthlyPayment: string;
  installmentMonths: string;
  memo: string;
};

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const emptyUsageForm = (memberId = ""): UsageForm => ({
  usageDate: todayString(),
  cardMemberId: memberId,
  paymentPlan: "lump_sum",
  productName: "",
  productUrl: "",
  principalAmount: "",
  monthlyPayment: "",
  installmentMonths: "1",
  memo: ""
});

export function SharedCard() {
  const { user } = useOutletContext<AppContext>();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [sharedCards, setSharedCards] = useState<SharedCardOption[]>([]);
  const [cardId, setCardId] = useState<string>("");
  const [members, setMembers] = useState<CardMember[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [entries, setEntries] = useState<UsageEntry[]>([]);
  const [usageForm, setUsageForm] = useState<UsageForm>(emptyUsageForm());
  const [editingUsageId, setEditingUsageId] = useState<number | null>(null);
  const [memberName, setMemberName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const { page: entryPage, setPage: setEntryPage, pageItems: entryPageItems } = usePagination(entries);

  const periodLabel = formatMonthLabel(viewYear, viewMonth);
  const canGoNext = !isCurrentMonth(viewYear, viewMonth);

  async function loadSharedCards() {
    const rows = await apiFetch<SharedCardOption[]>("/api/cards/shared", user);
    setSharedCards(rows);
    setCardId((prev) => (prev && rows.some((c) => String(c.id) === prev) ? prev : rows[0] ? String(rows[0].id) : ""));
  }

  async function loadCardData(selectedCardId: string) {
    if (!selectedCardId) {
      setMembers([]);
      setSummary(null);
      setEntries([]);
      return;
    }
    const q = `cardId=${selectedCardId}&year=${viewYear}&month=${viewMonth}`;
    const [memberRows, summaryRow, entryRows] = await Promise.all([
      apiFetch<CardMember[]>(`/api/card-members?cardId=${selectedCardId}`, user),
      apiFetch<UsageSummary>(`/api/card-usage/summary?${q}`, user),
      apiFetch<UsageEntry[]>(`/api/card-usage?${q}`, user)
    ]);
    setMembers(memberRows);
    setSummary(summaryRow);
    setEntries(entryRows);
    if (!usageForm.cardMemberId && memberRows[0]) {
      setUsageForm((f) => ({ ...f, cardMemberId: String(memberRows[0].id) }));
    }
  }

  useEffect(() => {
    loadSharedCards().catch((e) => setMessage(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, [user.id]);

  useEffect(() => {
    loadCardData(cardId).catch((e) => setMessage(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, [user.id, cardId, viewYear, viewMonth]);

  const selectedCard = useMemo(
    () => sharedCards.find((c) => String(c.id) === cardId),
    [sharedCards, cardId]
  );

  function goPrevMonth() {
    const p = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(p.year);
    setViewMonth(p.month);
  }

  function goNextMonth() {
    if (!canGoNext) return;
    const n = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(n.year);
    setViewMonth(n.month);
  }

  function goThisMonth() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth() + 1);
  }

  async function addMember() {
    if (!cardId || !memberName.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/card-members", user, {
        method: "POST",
        body: JSON.stringify({ cardId: Number(cardId), name: memberName.trim(), sortOrder: members.length })
      });
      setMemberName("");
      await loadCardData(cardId);
      setMessage("사용자를 추가했습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "추가에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: CardMember) {
    if (!window.confirm(`「${member.name}」 사용자를 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/card-members/${member.id}`, user, { method: "DELETE" });
      await loadCardData(cardId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  function startEditUsage(entry: UsageEntry) {
    setEditingUsageId(entry.id);
    setUsageForm({
      usageDate: entry.usageDate,
      cardMemberId: String(entry.cardMemberId),
      paymentPlan: entry.paymentPlan,
      productName: entry.productName,
      productUrl: entry.productUrl ?? "",
      principalAmount: String(entry.principalAmount),
      monthlyPayment: String(entry.monthlyPayment),
      installmentMonths: String(entry.installmentMonths),
      memo: entry.memo ?? ""
    });
  }

  function resetUsageForm() {
    setEditingUsageId(null);
    setUsageForm(emptyUsageForm(members[0] ? String(members[0].id) : ""));
  }

  async function submitUsage(event: FormEvent) {
    event.preventDefault();
    if (!cardId) return;
    setSaving(true);
    setMessage("");
    try {
      const body = {
        cardId: Number(cardId),
        cardMemberId: Number(usageForm.cardMemberId),
        usageDate: usageForm.usageDate,
        paymentPlan: usageForm.paymentPlan,
        productName: usageForm.productName,
        productUrl: usageForm.productUrl || null,
        principalAmount: Number(usageForm.principalAmount),
        monthlyPayment: usageForm.paymentPlan === "installment" ? Number(usageForm.monthlyPayment) : Number(usageForm.principalAmount),
        installmentMonths: usageForm.paymentPlan === "installment" ? Number(usageForm.installmentMonths) : 1,
        memo: usageForm.memo || null
      };
      if (editingUsageId) {
        await apiFetch(`/api/card-usage/${editingUsageId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("내역을 수정했습니다.");
      } else {
        await apiFetch("/api/card-usage", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("내역을 등록했습니다.");
      }
      resetUsageForm();
      await loadCardData(cardId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function removeUsage(entry: UsageEntry) {
    if (!window.confirm(`「${entry.productName}」 내역을 삭제할까요?`)) return;
    try {
      await apiFetch(`/api/card-usage/${entry.id}`, user, { method: "DELETE" });
      if (editingUsageId === entry.id) resetUsageForm();
      await loadCardData(cardId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">공용 카드 · 사용자별 정산</p>}
        title="공용 카드 관리"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <select className={cn(selectClass, "w-auto min-w-[200px]")} value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {sharedCards.length === 0 ? <option value="">공용 카드 없음</option> : null}
              {sharedCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cardCompany} {c.cardName}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1 rounded-[11px] border border-border bg-card px-1 py-1">
              <Button type="button" variant="ghost" size="icon-sm" onClick={goPrevMonth} aria-label="이전 달">
                <HiChevronLeft size={18} />
              </Button>
              <span className="min-w-[100px] px-2 text-center text-sm font-bold">{periodLabel}</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={goNextMonth} disabled={!canGoNext} aria-label="다음 달">
                <HiChevronRight size={18} />
              </Button>
            </div>
          </div>
        }
      />

      {sharedCards.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            공용 카드가 없습니다.{" "}
            <Link to="/cards" className="font-semibold text-primary hover:underline">
              카드 관리
            </Link>
            에서 카드를 등록하고 「공용 카드」를 켜 주세요.
          </p>
        </Card>
      ) : (
        <>
          {summary ? (
            <div className="mb-4 grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summary.members.map((m) => (
                <Card key={m.id} className="py-4">
                  <CardContent className="px-4">
                    <p className="text-sm font-semibold text-muted-foreground">{m.name}</p>
                    <p className="tnum mt-1 text-xl font-bold">{won(m.principalTotal)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      월 납부 {won(m.monthlyTotal)} · {m.entryCount}건
                    </p>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-primary/30 bg-primary/10 py-4">
                <CardContent className="px-4">
                  <p className="text-sm font-semibold text-primary">합계</p>
                  <p className="tnum mt-1 text-xl font-extrabold">{won(summary.grandPrincipal)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">월 납부 합계 {won(summary.grandMonthly)}</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,260px)_minmax(0,360px)_minmax(0,1fr)]">
            <Card className="flex flex-col gap-0 py-0">
              <CardHeader className="border-b border-border/60 px-4 py-3">
                <CardTitle className="text-sm">카드 사용자</CardTitle>
                {selectedCard ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {selectedCard.cardCompany} {selectedCard.cardName}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex gap-1">
                  <Input
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    placeholder="예: 나, 엄마"
                    className="h-9"
                  />
                  <Button type="button" size="sm" onClick={addMember} disabled={saving || !memberName.trim()}>
                    추가
                  </Button>
                </div>
                <ul className="flex flex-col gap-1">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-lg bg-secondary/60 px-2.5 py-2 text-sm">
                      <span className="font-semibold">{m.name}</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => removeMember(m)}
                        aria-label="삭제"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="flex flex-col gap-0 py-0">
              <CardHeader className="border-b border-border/60 px-4 py-3">
                <CardTitle className="text-sm">{editingUsageId ? "내역 수정" : "사용 내역 등록"}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[520px] overflow-y-auto p-4">
                <form className="flex flex-col gap-2.5" onSubmit={submitUsage}>
                  <div className="grid gap-1">
                    <Label htmlFor="usageDate">사용일</Label>
                    <Input id="usageDate" type="date" value={usageForm.usageDate} onChange={(e) => setUsageForm({ ...usageForm, usageDate: e.target.value })} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="cardMemberId">누가 샀나요</Label>
                    <select
                      id="cardMemberId"
                      className={selectClass}
                      value={usageForm.cardMemberId}
                      onChange={(e) => setUsageForm({ ...usageForm, cardMemberId: e.target.value })}
                      required
                    >
                      <option value="">선택</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="paymentPlan">결제 방식</Label>
                    <select
                      id="paymentPlan"
                      className={selectClass}
                      value={usageForm.paymentPlan}
                      onChange={(e) =>
                        setUsageForm({
                          ...usageForm,
                          paymentPlan: e.target.value as "lump_sum" | "installment",
                          installmentMonths: e.target.value === "lump_sum" ? "1" : usageForm.installmentMonths
                        })
                      }
                    >
                      <option value="lump_sum">일시불</option>
                      <option value="installment">할부</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="productName">제품명</Label>
                    <Input id="productName" value={usageForm.productName} onChange={(e) => setUsageForm({ ...usageForm, productName: e.target.value })} required />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="productUrl">링크 (선택)</Label>
                    <Input id="productUrl" type="url" value={usageForm.productUrl} onChange={(e) => setUsageForm({ ...usageForm, productUrl: e.target.value })} placeholder="https://" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="principalAmount">원금</Label>
                    <Input id="principalAmount" type="number" value={usageForm.principalAmount} onChange={(e) => setUsageForm({ ...usageForm, principalAmount: e.target.value })} required />
                  </div>
                  {usageForm.paymentPlan === "installment" ? (
                    <>
                      <div className="grid gap-1">
                        <Label htmlFor="installmentMonths">할부 개월</Label>
                        <Input
                          id="installmentMonths"
                          type="number"
                          min={2}
                          value={usageForm.installmentMonths}
                          onChange={(e) => setUsageForm({ ...usageForm, installmentMonths: e.target.value })}
                          required
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label htmlFor="monthlyPayment">월 납부액</Label>
                        <Input
                          id="monthlyPayment"
                          type="number"
                          value={usageForm.monthlyPayment}
                          onChange={(e) => setUsageForm({ ...usageForm, monthlyPayment: e.target.value })}
                          placeholder="비우면 원금÷개월"
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="grid gap-1">
                    <Label htmlFor="memo">메모</Label>
                    <Input id="memo" value={usageForm.memo} onChange={(e) => setUsageForm({ ...usageForm, memo: e.target.value })} />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" disabled={saving || members.length === 0} className="flex-1">
                      {saving ? "저장 중…" : editingUsageId ? "수정" : "등록"}
                    </Button>
                    {editingUsageId ? (
                      <Button type="button" variant="outline" onClick={resetUsageForm}>
                        취소
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 flex-col gap-0 py-0">
              <CardHeader className="shrink-0 border-b border-border/60 px-4 py-3">
                <CardTitle className="text-sm">{periodLabel} 사용 내역</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                {entries.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">등록된 내역이 없습니다.</p>
                ) : (
                  <>
                  <DataTable wrapperClassName="min-h-0 flex-1">
                    <DataTableHeader>
                      <DataTableRow>
                        <DataTableHead>날짜</DataTableHead>
                        <DataTableHead>사용자</DataTableHead>
                        <DataTableHead>제품</DataTableHead>
                        <DataTableHead>결제</DataTableHead>
                        <DataTableHead>원금</DataTableHead>
                        <DataTableHead>월 납부</DataTableHead>
                        <DataTableHead>관리</DataTableHead>
                      </DataTableRow>
                    </DataTableHeader>
                    <DataTableBody>
                      {entryPageItems.map((entry) => (
                        <DataTableRow key={entry.id} className={cn(editingUsageId === entry.id && "bg-primary/10")}>
                          <DataTableCell className="tnum text-muted-foreground">{entry.usageDate.replace(/-/g, ".")}</DataTableCell>
                          <DataTableCell>{entry.memberName}</DataTableCell>
                          <DataTableCell>
                            <p className="max-w-[140px] truncate font-semibold">{entry.productName}</p>
                            {entry.productUrl ? (
                              <a href={entry.productUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                                링크
                              </a>
                            ) : null}
                          </DataTableCell>
                          <DataTableCell>
                            <Badge variant={entry.paymentPlan === "installment" ? "default" : "secondary"}>
                              {entry.paymentPlan === "installment" ? `${entry.installmentMonths}개월` : "일시불"}
                            </Badge>
                          </DataTableCell>
                          <DataTableCell className="tnum">{won(entry.principalAmount)}</DataTableCell>
                          <DataTableCell className="tnum">{won(entry.monthlyPayment)}</DataTableCell>
                          <DataTableCell>
                            <div className="flex justify-center gap-1">
                              <Button type="button" size="icon-sm" variant="ghost" onClick={() => startEditUsage(entry)}>
                                <Pencil size={14} />
                              </Button>
                              <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" onClick={() => removeUsage(entry)}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </DataTableBody>
                  </DataTable>
                  <Pagination total={entries.length} page={entryPage} onChange={setEntryPage} className="shrink-0 border-t border-border/60" />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {message ? (
        <p className={cn("mt-3 text-sm", message.includes("실패") ? "text-destructive" : "text-muted-foreground")}>{message}</p>
      ) : null}
    </div>
  );
}
