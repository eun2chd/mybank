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
import { TRANSACTION_KIND_AGGREGATE } from "@/lib/transaction-summary";
import { cn } from "@/lib/utils";

type TypeKind = "expense" | "income" | "neutral";

type TransactionTypeItem = {
  id: number;
  code: string;
  name: string;
  kind: TypeKind;
  sortOrder: number;
  isSystem: boolean;
};

type FormState = {
  code: string;
  name: string;
  kind: TypeKind;
  sortOrder: string;
};

const KIND_OPTIONS: { value: TypeKind; label: string }[] = [
  { value: "expense", label: "나간 돈 (−) · 지출" },
  { value: "income", label: "더함 (+) · 수입" },
  { value: "neutral", label: "나간 돈 (−) · 이체" }
];

const emptyForm = (): FormState => ({
  code: "",
  name: "",
  kind: "expense",
  sortOrder: "0"
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function TransactionTypes() {
  const { user } = useOutletContext<AppContext>();
  const [items, setItems] = useState<TransactionTypeItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSystem, setEditingSystem] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const rows = await apiFetch<TransactionTypeItem[]>("/api/transaction-types", user);
    setItems(rows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  function startCreate() {
    setEditingId(null);
    setEditingSystem(false);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(item: TransactionTypeItem) {
    setEditingId(item.id);
    setEditingSystem(item.isSystem);
    setForm({
      code: item.code,
      name: item.name,
      kind: item.kind,
      sortOrder: String(item.sortOrder)
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
        code: form.code,
        name: form.name,
        kind: form.kind,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : 0
      };

      if (editingId) {
        await apiFetch(`/api/transaction-types/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("소비 유형을 수정했습니다.");
      } else {
        await apiFetch("/api/transaction-types", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("소비 유형을 등록했습니다.");
      }

      setEditingId(null);
      setEditingSystem(false);
      setForm(emptyForm());
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: TransactionTypeItem) {
    if (item.isSystem) return;
    if (!window.confirm(`「${item.name}」 유형을 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/transaction-types/${item.id}`, user, { method: "DELETE" });
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
        status={<p className="mb-1.5 text-xs font-semibold text-accent">소비 유형 관리</p>}
        title="소비 유형"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 유형
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "유형 수정" : "유형 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="code">유형 코드</Label>
                <Input
                  id="code"
                  value={form.code}
                  onChange={(e) => updateField("code", e.target.value.toLowerCase())}
                  placeholder="예: meal, transport"
                  required
                  disabled={editingSystem}
                />
                <p className="text-xs text-muted-foreground">영문 소문자, 숫자, 밑줄(_)만 사용합니다.</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">표시 이름</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="예: 외식, 교통"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kind">대시보드 집계</Label>
                <select
                  id="kind"
                  className={selectClass}
                  value={form.kind}
                  onChange={(e) => updateField("kind", e.target.value as TypeKind)}
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{TRANSACTION_KIND_AGGREGATE[form.kind].hint}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sortOrder">정렬 순서</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => updateField("sortOrder", e.target.value)}
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
            <CardTitle className="text-base">등록된 유형</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">총 {items.length}건 · 기본 유형은 삭제할 수 없습니다</p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {items.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 유형이 없습니다.
              </p>
            ) : (
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>이름</DataTableHead>
                    <DataTableHead>코드</DataTableHead>
                    <DataTableHead>순계산</DataTableHead>
                    <DataTableHead>집계</DataTableHead>
                    <DataTableHead>구분</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {items.map((item) => (
                    <DataTableRow
                      key={item.id}
                      className={cn(editingId === item.id && "bg-primary/10 hover:bg-primary/10")}
                    >
                      <DataTableCell className="font-semibold">{item.name}</DataTableCell>
                      <DataTableCell className="tnum text-muted-foreground">{item.code}</DataTableCell>
                      <DataTableCell>
                        <Badge
                          variant={
                            item.kind === "income"
                              ? "default"
                              : item.kind === "expense" || item.kind === "neutral"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {TRANSACTION_KIND_AGGREGATE[item.kind].direction}
                        </Badge>
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {TRANSACTION_KIND_AGGREGATE[item.kind].aggregate}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {item.isSystem ? "기본" : "사용자"}
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
                          {!item.isSystem ? (
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
                          ) : null}
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
