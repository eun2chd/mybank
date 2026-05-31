import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Pencil, Trash2, X, ZoomIn } from "lucide-react";
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
import { formatMonthLabel, shiftMonth, won } from "@/lib/format";
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
  grandLumpSum: number;
  grandInstallment: number;
  grandTotal: number;
  members: Array<{
    id: number;
    name: string;
    lumpSumTotal: number;
    installmentTotal: number;
    billingTotal: number;
    entryCount: number;
  }>;
};

type UsageEntry = {
  id: number;
  cardMemberId: number;
  memberName: string;
  usageDate: string;
  billingDate: string | null;
  paymentPlan: "lump_sum" | "installment";
  productName: string;
  productUrl: string | null;
  principalAmount: number;
  monthlyPayment: number;
  installmentMonths: number;
  memo: string;
  images: string[];
};

type UsageForm = {
  usageDate: string;
  billingDate: string;
  cardMemberId: string;
  paymentPlan: "lump_sum" | "installment";
  productName: string;
  productUrl: string;
  principalAmount: string;
  monthlyPayment: string;
  installmentMonths: string;
  memo: string;
  images: string[];
};

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const emptyUsageForm = (memberId = ""): UsageForm => ({
  usageDate: todayString(),
  billingDate: "",
  cardMemberId: memberId,
  paymentPlan: "lump_sum",
  productName: "",
  productUrl: "",
  principalAmount: "",
  monthlyPayment: "",
  installmentMonths: "1",
  memo: "",
  images: []
});

function readFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

function ImageLightbox({
  images,
  startIndex,
  onClose
}: {
  images: string[];
  startIndex: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % images.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[95vh] max-w-[95vw] flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="absolute right-0 top-0 z-10 text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X size={18} />
        </Button>
        <img
          src={images[idx]}
          className="max-h-[88vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          alt={`이미지 ${idx + 1}`}
        />
        {images.length > 1 && (
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20"
              onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
            >
              <HiChevronLeft size={20} />
            </Button>
            <span className="text-sm text-white">
              {idx + 1} / {images.length}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/20"
              onClick={() => setIdx((i) => (i + 1) % images.length)}
            >
              <HiChevronRight size={20} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);
  const [detailEntry, setDetailEntry] = useState<UsageEntry | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filterMemberId, setFilterMemberId] = useState<string>("");
  const [filterPaymentPlan, setFilterPaymentPlan] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredEntries = useMemo(() => {
    const keyword = filterSearch.trim().toLowerCase();
    return entries.filter((e) => {
      if (filterMemberId && String(e.cardMemberId) !== filterMemberId) return false;
      if (filterPaymentPlan && e.paymentPlan !== filterPaymentPlan) return false;
      if (keyword && !e.productName.toLowerCase().includes(keyword)) return false;
      return true;
    });
  }, [entries, filterMemberId, filterPaymentPlan, filterSearch]);

  const { page: entryPage, setPage: setEntryPage, pageItems: entryPageItems } = usePagination(filteredEntries);

  const periodLabel = formatMonthLabel(viewYear, viewMonth);

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
      billingDate: entry.billingDate ?? "",
      cardMemberId: String(entry.cardMemberId),
      paymentPlan: entry.paymentPlan,
      productName: entry.productName,
      productUrl: entry.productUrl ?? "",
      principalAmount: String(entry.principalAmount),
      monthlyPayment: String(entry.monthlyPayment),
      installmentMonths: String(entry.installmentMonths),
      memo: entry.memo ?? "",
      images: entry.images ?? []
    });
  }

  function resetUsageForm() {
    setEditingUsageId(null);
    setUsageForm(emptyUsageForm(members[0] ? String(members[0].id) : ""));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const dataUrls = await readFilesAsDataUrls(files);
      setUsageForm((f) => ({ ...f, images: [...f.images, ...dataUrls] }));
    } catch {
      setMessage("이미지를 읽지 못했습니다.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(index: number) {
    setUsageForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }));
  }

  async function addImagesFromFileList(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    try {
      const dataUrls = await readFilesAsDataUrls(imageFiles);
      setUsageForm((f) => ({ ...f, images: [...f.images, ...dataUrls] }));
    } catch {
      setMessage("이미지를 읽지 못했습니다.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addImagesFromFileList(e.dataTransfer.files);
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = Array.from(e.clipboardData.items).filter((item) => item.type.startsWith("image/"));
    if (items.length === 0) return;
    e.preventDefault();
    const files = items.map((item) => item.getAsFile()).filter(Boolean) as File[];
    addImagesFromFileList(files);
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
        billingDate: usageForm.billingDate || null,
        paymentPlan: usageForm.paymentPlan,
        productName: usageForm.productName,
        productUrl: usageForm.productUrl || null,
        principalAmount: Number(usageForm.principalAmount),
        monthlyPayment: usageForm.paymentPlan === "installment" ? Number(usageForm.monthlyPayment) : Number(usageForm.principalAmount),
        installmentMonths: usageForm.paymentPlan === "installment" ? Number(usageForm.installmentMonths) : 1,
        memo: usageForm.memo || null,
        images: usageForm.images.length > 0 ? usageForm.images : null
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
              <Button type="button" variant="ghost" size="icon-sm" onClick={goNextMonth} aria-label="다음 달">
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
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-muted-foreground">{m.name}</p>
                      <span className="text-[11px] text-muted-foreground">{m.entryCount}건</span>
                    </div>
                    <p className="tnum mt-1.5 text-xl font-extrabold">{won(m.billingTotal)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">합계 (일시불+할부)</p>
                    <div className="mt-2 flex flex-col gap-0.5">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>일시불 원금</span>
                        <span className="tnum font-medium">{won(m.lumpSumTotal)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>할부 월납부</span>
                        <span className="tnum font-medium">{won(m.installmentTotal)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-primary/30 bg-primary/10 py-4">
                <CardContent className="px-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-primary">전체 합계</p>
                    <span className="text-[11px] text-primary/70">
                      {summary.members.reduce((s, m) => s + m.entryCount, 0)}건
                    </span>
                  </div>
                  <p className="tnum mt-1.5 text-xl font-extrabold text-primary">{won(summary.grandTotal)}</p>
                  <p className="mt-0.5 text-[11px] text-primary/70">합계 (일시불+할부)</p>
                  <div className="mt-2 flex flex-col gap-0.5">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>일시불 원금</span>
                      <span className="tnum font-medium">{won(summary.grandLumpSum)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>할부 월납부</span>
                      <span className="tnum font-medium">{won(summary.grandInstallment)}</span>
                    </div>
                  </div>
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
              <CardContent className="overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 260px)" }}>
                <form className="flex flex-col gap-2.5" onSubmit={submitUsage}>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor="usageDate">사용일</Label>
                      <Input id="usageDate" type="date" value={usageForm.usageDate} onChange={(e) => setUsageForm({ ...usageForm, usageDate: e.target.value })} required />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="billingDate" className="flex items-center gap-1">
                        결제예정월
                        <span className="text-[10px] font-normal text-muted-foreground">(선택)</span>
                      </Label>
                      <Input
                        id="billingDate"
                        type="month"
                        value={usageForm.billingDate ? usageForm.billingDate.slice(0, 7) : ""}
                        onChange={(e) => setUsageForm({ ...usageForm, billingDate: e.target.value ? e.target.value + "-01" : "" })}
                        placeholder="YYYY-MM"
                      />
                    </div>
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

                  <div
                    className={cn(
                      "grid gap-1.5 rounded-lg border border-dashed p-3 transition-colors",
                      dragOver ? "border-primary bg-primary/5" : "border-border"
                    )}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onPaste={handlePaste}
                  >
                    <Label className="flex items-center gap-1.5 text-sm font-semibold">
                      <ImageIcon size={14} />
                      스크린샷 이미지
                    </Label>
                    {usageForm.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {usageForm.images.map((img, i) => (
                          <div key={i} className="group relative h-16 w-16 shrink-0">
                            <img
                              src={img}
                              className="h-full w-full cursor-pointer rounded-md border border-border object-cover"
                              onClick={() => setLightbox({ images: usageForm.images, index: i })}
                              alt={`이미지 ${i + 1}`}
                            />
                            <button
                              type="button"
                              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={() => removeImage(i)}
                              aria-label="이미지 삭제"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-input bg-secondary/60 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImageIcon size={15} />
                      {dragOver
                        ? "놓으면 추가됩니다"
                        : usageForm.images.length > 0
                          ? `이미지 추가 (현재 ${usageForm.images.length}장)`
                          : "클릭 · 붙여넣기(Ctrl+V) · 드래그"}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageChange}
                    />
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">{periodLabel} 사용 내역</CardTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="relative">
                      <Input
                        value={filterSearch}
                        onChange={(e) => { setFilterSearch(e.target.value); setEntryPage(1); }}
                        placeholder="제목 검색"
                        className="h-7 w-[120px] pr-6 text-xs"
                      />
                      {filterSearch && (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => { setFilterSearch(""); setEntryPage(1); }}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                    <select
                      className={cn(selectClass, "h-7 w-auto min-w-[90px] text-xs")}
                      value={filterMemberId}
                      onChange={(e) => { setFilterMemberId(e.target.value); setEntryPage(1); }}
                    >
                      <option value="">전체 사용자</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <select
                      className={cn(selectClass, "h-7 w-auto min-w-[80px] text-xs")}
                      value={filterPaymentPlan}
                      onChange={(e) => { setFilterPaymentPlan(e.target.value); setEntryPage(1); }}
                    >
                      <option value="">전체 결제</option>
                      <option value="lump_sum">일시불</option>
                      <option value="installment">할부</option>
                    </select>
                    {(filterMemberId || filterPaymentPlan || filterSearch) && (
                      <button
                        type="button"
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => { setFilterMemberId(""); setFilterPaymentPlan(""); setFilterSearch(""); setEntryPage(1); }}
                      >
                        <X size={11} />
                        초기화
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                {entries.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">등록된 내역이 없습니다.</p>
                ) : (
                  <>
                    <DataTable wrapperClassName="min-h-0 flex-1">
                      <DataTableHeader>
                        <DataTableRow>
                          <DataTableHead>결제예정</DataTableHead>
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
                          <DataTableRow
                            key={entry.id}
                            className={cn(editingUsageId === entry.id && "bg-primary/10", "cursor-pointer")}
                            onClick={() => setDetailEntry(entry)}
                          >
                            <DataTableCell className="tnum">
                              <p className="font-semibold text-primary">
                                {(entry.billingDate ?? entry.usageDate).slice(0, 7).replace("-", ".")}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                사용 {entry.usageDate.slice(5).replace("-", ".")}
                              </p>
                            </DataTableCell>
                            <DataTableCell>{entry.memberName}</DataTableCell>
                            <DataTableCell>
                              <p className="max-w-[140px] truncate font-semibold">{entry.productName}</p>
                              {entry.productUrl ? (
                                <a href={entry.productUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                                  링크
                                </a>
                              ) : null}
                              {entry.images && entry.images.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                                  {entry.images.slice(0, 3).map((img, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      className="group relative h-8 w-8 overflow-hidden rounded border border-border transition-opacity hover:opacity-80"
                                      onClick={() => setLightbox({ images: entry.images, index: i })}
                                      aria-label={`이미지 ${i + 1} 크게 보기`}
                                    >
                                      <img src={img} className="h-full w-full object-cover" alt="" />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
                                        <ZoomIn size={12} className="text-white opacity-0 group-hover:opacity-100" />
                                      </div>
                                    </button>
                                  ))}
                                  {entry.images.length > 3 && (
                                    <button
                                      type="button"
                                      className="flex h-8 w-8 items-center justify-center rounded border border-border bg-secondary/60 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                                      onClick={() => setLightbox({ images: entry.images, index: 3 })}
                                    >
                                      +{entry.images.length - 3}
                                    </button>
                                  )}
                                </div>
                              )}
                            </DataTableCell>
                            <DataTableCell>
                              <Badge variant={entry.paymentPlan === "installment" ? "default" : "secondary"}>
                                {entry.paymentPlan === "installment" ? `${entry.installmentMonths}개월` : "일시불"}
                              </Badge>
                            </DataTableCell>
                            <DataTableCell className="tnum">{won(entry.principalAmount)}</DataTableCell>
                            <DataTableCell className="tnum">{won(entry.monthlyPayment)}</DataTableCell>
                            <DataTableCell onClick={(e) => e.stopPropagation()}>
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
                    <Pagination total={filteredEntries.length} page={entryPage} onChange={setEntryPage} className="shrink-0 border-t border-border/60" />
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

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      {detailEntry && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
              <h3 className="font-semibold">{detailEntry.productName}</h3>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setDetailEntry(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <p className="text-[11px] text-muted-foreground">사용일</p>
                  <p className="font-medium">{detailEntry.usageDate.replace(/-/g, ".")}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">결제예정월</p>
                  <p className="font-medium text-primary">
                    {(detailEntry.billingDate ?? detailEntry.usageDate).slice(0, 7).replace("-", ".")}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">사용자</p>
                  <p className="font-medium">{detailEntry.memberName}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">결제방식</p>
                  <p className="font-medium">
                    {detailEntry.paymentPlan === "installment"
                      ? `할부 ${detailEntry.installmentMonths}개월`
                      : "일시불"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">원금</p>
                  <p className="tnum font-bold">{won(detailEntry.principalAmount)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {detailEntry.paymentPlan === "installment" ? "월 납부액" : "결제금액"}
                  </p>
                  <p className="tnum font-bold">{won(detailEntry.monthlyPayment)}</p>
                </div>
              </div>
              {detailEntry.productUrl && (
                <a
                  href={detailEntry.productUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  링크 열기
                </a>
              )}
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">메모</p>
                <p className={cn("min-h-[48px] rounded-lg bg-secondary/60 px-3 py-2 text-sm", !detailEntry.memo && "text-muted-foreground")}>
                  {detailEntry.memo || "메모 없음"}
                </p>
              </div>
              {detailEntry.images && detailEntry.images.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] text-muted-foreground">이미지 ({detailEntry.images.length}장)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailEntry.images.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        className="h-16 w-16 overflow-hidden rounded-md border border-border hover:opacity-80"
                        onClick={() => { setDetailEntry(null); setLightbox({ images: detailEntry.images, index: i }); }}
                      >
                        <img src={img} className="h-full w-full object-cover" alt="" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
