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
import { cn } from "@/lib/utils";

type CategoryType = "expense" | "income" | "investment" | "transfer" | "subscription";

type CategoryItem = {
  id: number;
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  sortOrder: number;
};

type FormState = {
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  sortOrder: string;
};

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: "expense", label: "지출" },
  { value: "income", label: "수입" },
  { value: "investment", label: "투자" },
  { value: "transfer", label: "이체" },
  { value: "subscription", label: "구독" }
];

const TYPE_LABEL: Record<CategoryType, string> = {
  expense: "지출",
  income: "수입",
  investment: "투자",
  transfer: "이체",
  subscription: "구독"
};

const emptyForm = (): FormState => ({
  name: "",
  type: "expense",
  color: "#2F80ED",
  icon: "",
  sortOrder: "0"
});

const selectClass =
  "h-9 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-secondary/80 px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function Categories() {
  const { user } = useOutletContext<AppContext>();
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const rows = await apiFetch<CategoryItem[]>("/api/categories", user);
    setCategories(rows);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "불러오지 못했습니다."));
  }, [user.id]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setMessage("");
  }

  function startEdit(item: CategoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      type: item.type,
      color: item.color,
      icon: item.icon ?? "",
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
        name: form.name,
        type: form.type,
        color: form.color,
        icon: form.icon || null,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : 0
      };

      if (editingId) {
        await apiFetch(`/api/categories/${editingId}`, user, { method: "PUT", body: JSON.stringify(body) });
        setMessage("카테고리를 수정했습니다.");
      } else {
        await apiFetch("/api/categories", user, { method: "POST", body: JSON.stringify(body) });
        setMessage("카테고리를 등록했습니다.");
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

  async function remove(item: CategoryItem) {
    if (!window.confirm(`「${item.name}」 카테고리를 삭제할까요?`)) return;
    setMessage("");
    try {
      await apiFetch(`/api/categories/${item.id}`, user, { method: "DELETE" });
      if (editingId === item.id) startCreate();
      setMessage(`「${item.name}」 카테고리를 삭제했습니다.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <PageHeader
        className="mb-4 shrink-0 lg:mb-5"
        status={<p className="mb-1.5 text-xs font-semibold text-accent">카테고리 관리</p>}
        title="내 카테고리"
        actions={
          <Button type="button" variant="outline" onClick={startCreate}>
            <Plus size={16} />
            새 카테고리
          </Button>
        }
      />

      <div className="grid min-h-0 flex-1 gap-5 max-xl:grid-rows-[auto_minmax(0,1fr)] xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:min-h-0">
        <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
          <CardHeader className="shrink-0 border-b border-border/60 px-5 py-4">
            <CardTitle className="text-base">{editingId ? "카테고리 수정" : "카테고리 등록"}</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <form className="flex flex-col gap-3" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="예: 식비"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">유형</Label>
                <select
                  id="type"
                  className={selectClass}
                  value={form.type}
                  onChange={(e) => updateField("type", e.target.value as CategoryType)}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="color">색상</Label>
                <div className="flex gap-2">
                  <Input
                    id="color"
                    type="color"
                    value={form.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    className="h-9 w-14 shrink-0 cursor-pointer p-1"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => updateField("color", e.target.value)}
                    placeholder="#2F80ED"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="icon">아이콘 (선택)</Label>
                <Input
                  id="icon"
                  value={form.icon}
                  onChange={(e) => updateField("icon", e.target.value)}
                  placeholder="아이콘 이름 또는 이모지"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sortOrder">정렬 순서</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => updateField("sortOrder", e.target.value)}
                  placeholder="0"
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
            <CardTitle className="text-base">등록된 카테고리</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">총 {categories.length}개</p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {categories.length === 0 ? (
              <p className="flex flex-1 items-center justify-center px-5 py-8 text-sm text-muted-foreground">
                등록된 카테고리가 없습니다. 왼쪽에서 추가해 보세요.
              </p>
            ) : (
              <DataTable wrapperClassName="min-h-0 flex-1">
                <DataTableHeader>
                  <DataTableRow>
                    <DataTableHead>이름</DataTableHead>
                    <DataTableHead>유형</DataTableHead>
                    <DataTableHead>색상</DataTableHead>
                    <DataTableHead>아이콘</DataTableHead>
                    <DataTableHead>정렬</DataTableHead>
                    <DataTableHead>관리</DataTableHead>
                  </DataTableRow>
                </DataTableHeader>
                <DataTableBody>
                  {categories.map((item) => (
                    <DataTableRow
                      key={item.id}
                      className={cn(editingId === item.id && "bg-primary/10 hover:bg-primary/10")}
                    >
                      <DataTableCell>{item.name}</DataTableCell>
                      <DataTableCell>
                        <Badge variant="secondary">{TYPE_LABEL[item.type]}</Badge>
                      </DataTableCell>
                      <DataTableCell>
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className="size-4 shrink-0 rounded-full border border-border"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-xs text-muted-foreground">{item.color}</span>
                        </div>
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">{item.icon || "-"}</DataTableCell>
                      <DataTableCell className="tnum">{item.sortOrder}</DataTableCell>
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
