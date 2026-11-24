"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CATEGORY_COLORS } from "@/lib/finance/defaults";
import type { FinanceCategory, FinanceKind } from "@/lib/finance/types";
import { cn } from "@/lib/utils";
import { financeApi } from "./api";
import { CategoryDot } from "./form-parts";

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-1">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("size-5 rounded-full border-2", value === c ? "border-foreground" : "border-transparent")}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function NewCategoryRow({ kind, onCreated }: { kind: FinanceKind; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await financeApi.createCategory({ name, kind, color });
      setName("");
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <div className="flex gap-2">
        <Input aria-label="Nome da nova categoria" placeholder="Nova categoria…" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={saving || !name.trim()}><Plus /> Criar</Button>
      </div>
      <ColorPicker value={color} onChange={setColor} />
    </form>
  );
}

function CategoryRow({ cat, onChanged }: { cat: FinanceCategory; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);

  async function patch(data: Parameters<typeof financeApi.updateCategory>[1], ok?: string) {
    try {
      await financeApi.updateCategory(cat.id, data);
      if (ok) toast.success(ok);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove() {
    if (!window.confirm(`Apagar a categoria "${cat.name}"? Os lançamentos dela ficam "Sem categoria". Para só esconder, use Arquivar.`)) return;
    try {
      await financeApi.deleteCategory(cat.id);
      toast.success("Categoria apagada");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (editing) {
    return (
      <li className="space-y-2 py-2">
        <div className="flex gap-1">
          <Input aria-label="Nome" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button size="icon" variant="ghost" aria-label="Salvar" onClick={() => void patch({ name, color })}><Check /></Button>
          <Button size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditing(false)}><X /></Button>
        </div>
        <ColorPicker value={color} onChange={setColor} />
      </li>
    );
  }

  return (
    <li className={cn("flex items-center gap-2 py-1.5", cat.archived && "opacity-50")}>
      <CategoryDot color={cat.color} />
      <span className="flex-1 truncate text-sm">{cat.name}{cat.archived && " (arquivada)"}</span>
      <Button size="icon-sm" variant="ghost" aria-label="Editar" onClick={() => setEditing(true)}><Pencil /></Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={cat.archived ? "Desarquivar" : "Arquivar"}
        onClick={() => void patch({ archived: !cat.archived }, cat.archived ? "Categoria de volta" : "Categoria arquivada")}
      >
        {cat.archived ? <ArchiveRestore /> : <Archive />}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Apagar" onClick={() => void remove()}><Trash2 /></Button>
    </li>
  );
}

export function CategoriesPanel({ categories, onChanged }: { categories: FinanceCategory[]; onChanged: () => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {([["expense", "Categorias de gasto"], ["income", "Categorias de entrada"]] as const).map(([kind, title]) => (
        <Card key={kind}>
          <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <ul className="divide-y divide-border">
              {categories.filter((c) => c.kind === kind).map((c) => (
                <CategoryRow key={`${c.id}-${c.name}-${c.color}-${c.archived}`} cat={c} onChanged={onChanged} />
              ))}
            </ul>
            <NewCategoryRow kind={kind} onCreated={onChanged} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
