import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
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

type BillingCycle = "monthly" | "yearly" | "weekly" | "custom";
type SubscriptionStatus = "active" | "paused" | "cancelled";

type CardRow = { id: number; cardName: string; cardCompany: string };
type Category = { id: number; name: string; type: string };

const MAX_IMAGE_BYTES = 300 * 1024;

type SubscriptionItem = {
  id: number;
  name: string;
  imageUrl: string | null;
  amount: number;
  billingCycle: BillingCycle;
  paymentDay: number | null;
  nextPaymentDate: string | null;
  cardId: number | null;
  categoryId: number | null;
  status: SubscriptionStatus;
  cardLabel: string | null;
  categoryName: string | null;
  memo: string;
};

type FormState = {
  name: string;
  imageUrl: string;
  amount: string;
  billingCycle: BillingCycle;
  paymentDay: string;
  cardId: string;
  categoryId: string;
  status: SubscriptionStatus;
  memo: string;
};

const BILLING_CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "월간",
  yearly: "연간",
  weekly: "주간",
  custom: "직접"
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "이용 중",
  paused: "일시정지",
  cancelled: "해지"
};

function SubscriptionThumb({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="size-9 shrink-0 rounded-lg object-cover bg-secondary ring-1 ring-border/60"
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-bold text-accent ring-1 ring-border/60">
      {initial}
    </span>
  );
}

const emptyForm = (): FormState => ({
  name: "",
  imageUrl: "",
  amount: "",
  billingCycle: "monthly",
  paymentDay: "",
  cardId: "",
  categoryId: "",
  status: "active",
  memo: ""
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function monthlyEquivalent(amount: number, cycle: BillingCycle) {
  if (cycle === "yearly") return amount / 12;
  if (cycle === "weekly") return (amount * 52) / 12;
  return amount;
}

export function Subscriptions() {
  const { user } = useOutletContext<AppContext>();
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [subRows, cardRows, categoryRows] = await Promise.all([
      apiFetch<SubscriptionItem[]>("/api/subscriptions", user),
      apiFetch<CardRow[]>("/api/cards", user),
      apiFetch<Category[]>("/api/categories", user)
    ]);
    setItems(subRows);
    setCards(cardRows);
    setCategories(categoryRows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  const monthlyTotal = useMemo(
    () =>
      items
        .filter((i) => i.status === "active")
        .reduce((sum, i) => sum + monthlyEquivalent(i.amount, i.billingCycle), 0),
    [items]
  );

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(item: SubscriptionItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      imageUrl: item.imageUrl ?? "",
      amount: String(item.amount),
      billingCycle: item.billingCycle,
      paymentDay: item.paymentDay != null ? String(item.paymentDay) : "",
      cardId: item.cardId ? String(item.cardId) : "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
      status: item.status,
      memo: item.memo ?? ""
    });
    setMessage("");
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function clearImage() {
    updateField("imageUrl", "");
  }

  function onImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("이미지 파일만 등록할 수 있습니다.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setMessage("이미지는 300KB 이하여야 합니다.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateField("imageUrl", String(reader.result ?? ""));
      setMessage("");
    };
    reader.onerror = () => setMessage("이미지를 읽지 못했습니다.");
    reader.readAsDataURL(file);
  }

  const imageUrlFieldValue = form.imageUrl.startsWith("data:") ? "" : form.imageUrl;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.billingCycle === "monthly" && !form.paymentDay) {
      setMessage("월간 구독은 매달 결제일을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const body = {
        name: form.name,
        imageUrl: form.imageUrl || null,
        amount: form.amount ? Number(form.amount) : 0,
        billingCycle: form.billingCycle,
        paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
        cardId: form.cardId || null,
        categoryId: form.categoryId || null,
        status: form.status,
        memo: form.memo || null
      };

      if (editingId) {
        await apiFetch(`/api/subscriptions/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("구독을 수정했습니다.");
      } else {
        await apiFetch("/api/subscriptions", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("구독을 등록했습니다.");
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

  async function remove(item: SubscriptionItem) {
    if (!window.confirm(`「${item.name}」 구독을 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/subscriptions/${item.id}`, user, { method: "DELETE" });
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
        status={<p className="mb-1.5 text-xs font-semibold text-accent">구독 관리</p>}
        title="내 구독"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 구독
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "구독 수정" : "구독 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="name">구독명</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="예: Netflix, ChatGPT"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>구독 이미지 (선택)</Label>
                <div className="flex items-center gap-3">
                  <SubscriptionThumb name={form.name || "구독"} imageUrl={form.imageUrl || null} />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-input bg-secondary/50 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
                      <ImagePlus size={16} />
                      이미지 선택
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={onImageFile}
                      />
                    </label>
                    {form.imageUrl ? (
                      <Button type="button" variant="ghost" size="sm" className="h-8 self-start" onClick={clearImage}>
                        <X size={14} />
                        이미지 제거
                      </Button>
                    ) : null}
                  </div>
                </div>
                <Input
                  id="imageUrl"
                  value={imageUrlFieldValue}
                  onChange={(e) => updateField("imageUrl", e.target.value)}
                  placeholder="또는 이미지 URL (https://…)"
                />
                <p className="text-xs text-muted-foreground">PNG·JPG 등 300KB 이하, 또는 URL로 등록할 수 있습니다.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">금액</Label>
                <Input
                  id="amount"
                  type="number"
                  value={form.amount}
                  onChange={(e) => updateField("amount", e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="billingCycle">결제 주기</Label>
                <select
                  id="billingCycle"
                  className={selectClass}
                  value={form.billingCycle}
                  onChange={(e) => {
                    const billingCycle = e.target.value as BillingCycle;
                    updateField("billingCycle", billingCycle);
                    if (billingCycle !== "monthly") {
                      updateField("paymentDay", "");
                    }
                  }}
                >
                  {(Object.keys(BILLING_CYCLE_LABEL) as BillingCycle[]).map((key) => (
                    <option key={key} value={key}>
                      {BILLING_CYCLE_LABEL[key]}
                    </option>
                  ))}
                </select>
              </div>
              {form.billingCycle === "monthly" ? (
                <div className="grid gap-2">
                  <Label htmlFor="paymentDay">매달 결제일</Label>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-sm text-muted-foreground">매월</span>
                    <Input
                      id="paymentDay"
                      type="number"
                      min={1}
                      max={31}
                      value={form.paymentDay}
                      onChange={(e) => updateField("paymentDay", e.target.value)}
                      placeholder="15"
                      className="flex-1"
                      required
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">일</span>
                  </div>
                  <p className="text-xs text-muted-foreground">매월 같은 날짜에 결제되는 구독입니다.</p>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="cardId">결제 카드</Label>
                <select
                  id="cardId"
                  className={selectClass}
                  value={form.cardId}
                  onChange={(e) => updateField("cardId", e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.cardCompany} {card.cardName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="categoryId">카테고리</Label>
                <select
                  id="categoryId"
                  className={selectClass}
                  value={form.categoryId}
                  onChange={(e) => updateField("categoryId", e.target.value)}
                >
                  <option value="">선택 안 함</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="status">상태</Label>
                <select
                  id="status"
                  className={selectClass}
                  value={form.status}
                  onChange={(e) => updateField("status", e.target.value as SubscriptionStatus)}
                >
                  {(Object.keys(STATUS_LABEL) as SubscriptionStatus[]).map((key) => (
                    <option key={key} value={key}>
                      {STATUS_LABEL[key]}
                    </option>
                  ))}
                </select>
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
            <CardTitle className="text-base">등록된 구독</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              총 {items.length}건 · 활성 환산 월 {won(Math.round(monthlyTotal))}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {items.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 구독이 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>구독</DataTableHead>
                    <DataTableHead>금액</DataTableHead>
                    <DataTableHead>주기</DataTableHead>
                    <DataTableHead>매달 결제일</DataTableHead>
                    <DataTableHead>다음 결제일</DataTableHead>
                    <DataTableHead>카드</DataTableHead>
                    <DataTableHead>상태</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {items.map((item) => (
                    <DataTableRow
                      key={item.id}
                      className={cn(
                        editingId === item.id && "bg-primary/10 hover:bg-primary/10",
                        item.status === "cancelled" && "opacity-60"
                      )}
                    >
                      <DataTableCell>
                        <div className="flex items-center justify-center gap-2.5">
                          <SubscriptionThumb name={item.name} imageUrl={item.imageUrl} />
                          <span className="font-semibold">{item.name}</span>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="tnum">{won(item.amount)}</DataTableCell>
                      <DataTableCell>{BILLING_CYCLE_LABEL[item.billingCycle]}</DataTableCell>
                      <DataTableCell className="tnum">
                        {item.billingCycle === "monthly" && item.paymentDay != null
                          ? `매월 ${item.paymentDay}일`
                          : "-"}
                      </DataTableCell>
                      <DataTableCell className="tnum text-muted-foreground">
                        {item.nextPaymentDate
                          ? item.nextPaymentDate.replace(/-/g, ".")
                          : "-"}
                      </DataTableCell>
                      <DataTableCell className="max-w-[120px] truncate text-muted-foreground">
                        {item.cardLabel || "-"}
                      </DataTableCell>
                      <DataTableCell>
                        <Badge
                          variant={
                            item.status === "active"
                              ? "default"
                              : item.status === "paused"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {STATUS_LABEL[item.status]}
                        </Badge>
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
