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

type AssetType = "deposit" | "loan" | "debt" | "other";

type OtherAssetItem = {
  id: number;
  name: string;
  assetType: AssetType;
  amount: number;
  expectedReturnDate: string | null;
  memo: string;
};

type FormState = {
  name: string;
  assetType: AssetType;
  amount: string;
  expectedReturnDate: string;
  memo: string;
};

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "deposit", label: "보증금" },
  { value: "loan", label: "빌려준 돈" },
  { value: "debt", label: "대출 (빚)" },
  { value: "other", label: "기타" }
];

const TYPE_LABEL: Record<AssetType, string> = {
  deposit: "보증금",
  loan: "빌려준 돈",
  debt: "대출",
  other: "기타"
};

const emptyForm = (): FormState => ({
  name: "",
  assetType: "deposit",
  amount: "",
  expectedReturnDate: "",
  memo: ""
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function OtherAssets() {
  const { user } = useOutletContext<AppContext>();
  const [assets, setAssets] = useState<OtherAssetItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const rows = await apiFetch<OtherAssetItem[]>("/api/other-assets", user);
    setAssets(rows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(item: OtherAssetItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      assetType: item.assetType,
      amount: String(item.assetType === "debt" ? Math.abs(item.amount) : item.amount),
      expectedReturnDate: item.expectedReturnDate ?? "",
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
        assetType: form.assetType,
        amount: form.amount ? Number(form.amount) : 0,
        expectedReturnDate: form.expectedReturnDate || null,
        memo: form.memo || null
      };

      if (editingId) {
        await apiFetch(`/api/other-assets/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("기타 자산을 수정했습니다.");
      } else {
        await apiFetch("/api/other-assets", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("기타 자산을 등록했습니다.");
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

  async function remove(item: OtherAssetItem) {
    if (!window.confirm(`「${item.name}」 항목을 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/other-assets/${item.id}`, user, { method: "DELETE" });
      if (editingId === item.id) startCreate();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  const totalAmount = assets.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">기타 자산 관리</p>}
        title="보증금·대출·빌려준 돈"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 자산
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "자산 수정" : "자산 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="예: 전세 보증금, 주택담보대출"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="assetType">유형</Label>
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
                <Label htmlFor="amount">
                  {form.assetType === "debt" ? "대출 잔액 (원금)" : "금액"}
                </Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => updateField("amount", e.target.value)}
                  placeholder="0"
                  required
                />
                {form.assetType === "debt" ? (
                  <p className="text-xs text-muted-foreground">
                    양수로 입력하면 자산 합계에 마이너스(-)로 반영됩니다.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expectedReturnDate">
                  {form.assetType === "debt" ? "상환 예정일" : "회수 예정일"}
                </Label>
                <Input
                  id="expectedReturnDate"
                  type="date"
                  value={form.expectedReturnDate}
                  onChange={(e) => updateField("expectedReturnDate", e.target.value)}
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
            <CardTitle className="text-base">등록된 기타 자산</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              총 {assets.length}건{assets.length > 0 ? ` · 합계 ${won(totalAmount)}` : ""}
            </p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {assets.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 기타 자산이 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>이름</DataTableHead>
                    <DataTableHead>유형</DataTableHead>
                    <DataTableHead>금액</DataTableHead>
                    <DataTableHead>예정일</DataTableHead>
                    <DataTableHead>메모</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {assets.map((item) => (
                    <DataTableRow
                      key={item.id}
                      className={cn(editingId === item.id && "bg-primary/10 hover:bg-primary/10")}
                    >
                      <DataTableCell>{item.name}</DataTableCell>
                      <DataTableCell>
                        <Badge variant={item.assetType === "debt" ? "destructive" : "secondary"}>
                          {TYPE_LABEL[item.assetType]}
                        </Badge>
                      </DataTableCell>
                      <DataTableCell className={cn("tnum", item.amount < 0 && "font-semibold text-destructive")}>
                        {won(item.amount)}
                      </DataTableCell>
                      <DataTableCell className="tnum text-muted-foreground">
                        {item.expectedReturnDate || "-"}
                      </DataTableCell>
                      <DataTableCell className="max-w-[140px] truncate text-muted-foreground">
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
