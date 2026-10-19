"use client";
import clsx from "clsx";
import { Check, Loader2, X } from "lucide-react";
import { Tag, User } from "@/types";
import { AssistantDraft, INCIDENT_CATEGORIES, KIND_LABEL, Kind, SEVERITIES, isComplete } from "@/lib/assistantIntents";
import { QUALITY_INCIDENT_REASONS } from "@/lib/qualityIncidents";
import { WEEKDAY_LABELS } from "@/lib/scheduleFormat";
import type { Priority } from "@/lib/taskAssistant";

export interface Photo { url: string; name: string }

interface Props {
  current: AssistantDraft;
  setCurrent: (c: AssistantDraft) => void;
  users: User[];
  tags: Tag[];
  photos: Photo[];
  onRemovePhoto: (index: number) => void;
  creating: boolean;
  error: string;
  onCreate: () => void;
  onDiscard: () => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

const CREATE_LABEL: Record<Kind, string> = {
  task: "Criar tarefa",
  scheduled: "Programar tarefa",
  goal: "Criar meta",
  quality: "Registrar incidência",
  incident: "Registrar incidente",
};

// How many photos each kind can keep (the chat accepts up to 10 and tells what will be saved).
const PHOTO_MAX: Record<Kind, number> = { task: 1, scheduled: 0, goal: 0, quality: 1, incident: 10 };
const PHOTO_RULE: Record<Kind, string> = {
  task: "A tarefa guarda 1 foto.",
  scheduled: "Tarefa programada não guarda foto.",
  goal: "Meta não guarda foto.",
  quality: "A incidência guarda 1 foto (a prova).",
  incident: "O incidente guarda até 10 fotos.",
};

const BOX = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500";
const border = (bad: boolean) => (bad ? "border-red-400" : "border-gray-200");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

function PersonSelect({ value, onChange, users, bad, emptyLabel = "Selecione..." }: { value: string; onChange: (v: string) => void; users: User[]; bad?: boolean; emptyLabel?: string }) {
  return (
    <select className={clsx(BOX, border(!!bad))} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
    </select>
  );
}

function PrioritySelect({ value, onChange }: { value: Priority; onChange: (v: Priority) => void }) {
  return (
    <select className={clsx(BOX, "border-gray-200")} value={value} onChange={(e) => onChange(e.target.value as Priority)}>
      {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  );
}

function TagSelect({ value, onChange, tags }: { value: string; onChange: (v: string) => void; tags: Tag[] }) {
  return (
    <select className={clsx(BOX, "border-gray-200")} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Nenhum</option>
      {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}

export default function DraftCard({ current, setCurrent, users, tags, photos, onRemovePhoto, creating, error, onCreate, onDiscard }: Props) {
  const canCreate = isComplete(current) && !creating;
  const max = PHOTO_MAX[current.kind];

  let body: React.ReactNode = null;

  if (current.kind === "task") {
    const d = current.draft;
    const set = (p: Partial<typeof d>) => setCurrent({ kind: "task", draft: { ...d, ...p } });
    body = (
      <>
        <Field label="Título"><input className={clsx(BOX, border(!d.title.trim()))} value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Descrição">
          <textarea className={clsx(BOX, "border-gray-200 resize-y")} rows={Math.min(8, Math.max(3, d.description.split("\n").length + 1))} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Responsável"><PersonSelect value={d.assigneeId} onChange={(v) => set({ assigneeId: v })} users={users} bad={!d.assigneeId} /></Field>
          <Field label="Prazo (horário de Brasília)"><input type="datetime-local" className={clsx(BOX, border(!d.due))} value={d.due} onChange={(e) => set({ due: e.target.value })} /></Field>
          <Field label="Prioridade"><PrioritySelect value={d.priority} onChange={(v) => set({ priority: v })} /></Field>
          <Field label="País"><TagSelect value={d.tagId} onChange={(v) => set({ tagId: v })} tags={tags} /></Field>
        </div>
      </>
    );
  } else if (current.kind === "scheduled") {
    const d = current.draft;
    const set = (p: Partial<typeof d>) => setCurrent({ kind: "scheduled", draft: { ...d, ...p } });
    const toggleDay = (day: number) => set({ days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b) });
    body = (
      <>
        <Field label="Título"><input className={clsx(BOX, border(!d.title.trim()))} value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Descrição">
          <textarea className={clsx(BOX, "border-gray-200 resize-y")} rows={Math.min(8, Math.max(3, d.description.split("\n").length + 1))} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Responsável"><PersonSelect value={d.assigneeId} onChange={(v) => set({ assigneeId: v })} users={users} bad={!d.assigneeId} /></Field>
          <Field label="Horário de criação (Brasília)"><input type="time" className={clsx(BOX, border(!d.time))} value={d.time} onChange={(e) => set({ time: e.target.value })} /></Field>
          <Field label="Prioridade"><PrioritySelect value={d.priority} onChange={(v) => set({ priority: v })} /></Field>
          <Field label="País"><TagSelect value={d.tagId} onChange={(v) => set({ tagId: v })} tags={tags} /></Field>
        </div>
        <Field label="Dias da semana">
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => {
              const on = d.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors", on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-600 border-gray-200 hover:border-violet-300")}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Prazo de cada tarefa (horas)">
          <input type="number" min={1} max={720} className={clsx(BOX, "border-gray-200")} value={d.dueInHours} onChange={(e) => set({ dueInHours: Math.max(1, Math.min(720, Number(e.target.value) || 24)) })} />
        </Field>
      </>
    );
  } else if (current.kind === "goal") {
    const d = current.draft;
    const set = (p: Partial<typeof d>) => setCurrent({ kind: "goal", draft: { ...d, ...p } });
    body = (
      <>
        <Field label="Título da meta"><input className={clsx(BOX, border(!d.title.trim()))} value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Descrição">
          <textarea className={clsx(BOX, "border-gray-200 resize-y")} rows={Math.min(8, Math.max(3, d.description.split("\n").length + 1))} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Responsável"><PersonSelect value={d.assigneeId} onChange={(v) => set({ assigneeId: v })} users={users} bad={!d.assigneeId} /></Field>
          <Field label="Mês"><input type="month" className={clsx(BOX, border(!d.month))} value={d.month} onChange={(e) => set({ month: e.target.value })} /></Field>
        </div>
      </>
    );
  } else if (current.kind === "quality") {
    const d = current.draft;
    const set = (p: Partial<typeof d>) => setCurrent({ kind: "quality", draft: { ...d, ...p } });
    const reason = QUALITY_INCIDENT_REASONS.find((r) => r.key === d.reasonKey);
    body = (
      <>
        <Field label="Pessoa"><PersonSelect value={d.targetUserId} onChange={(v) => set({ targetUserId: v })} users={users} bad={!d.targetUserId} /></Field>
        <Field label="Motivo">
          <select className={clsx(BOX, border(!d.reasonKey))} value={d.reasonKey} onChange={(e) => set({ reasonKey: e.target.value })}>
            <option value="">Selecione...</option>
            {QUALITY_INCIDENT_REASONS.map((r) => <option key={r.key} value={r.key}>{r.label} ({r.points.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} pt)</option>)}
          </select>
          {reason && <p className="text-xs font-semibold text-red-600 mt-1">Vale {reason.points.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ponto(s) perdidos</p>}
        </Field>
        <Field label="Descrição">
          <textarea className={clsx(BOX, border(!d.description.trim()), "resize-y")} rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </>
    );
  } else {
    const d = current.draft;
    const set = (p: Partial<typeof d>) => setCurrent({ kind: "incident", draft: { ...d, ...p } });
    body = (
      <>
        <Field label="Título"><input className={clsx(BOX, border(!d.title.trim()))} value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Descrição">
          <textarea className={clsx(BOX, "border-gray-200 resize-y")} rows={Math.min(8, Math.max(3, d.description.split("\n").length + 1))} value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Categoria">
            <select className={clsx(BOX, "border-gray-200")} value={d.category} onChange={(e) => set({ category: e.target.value })}>
              {INCIDENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Gravidade">
            <select className={clsx(BOX, "border-gray-200")} value={d.severity} onChange={(e) => set({ severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Quando aconteceu (Brasília)"><input type="datetime-local" className={clsx(BOX, border(!d.occurredAt))} value={d.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} /></Field>
          <Field label="Pessoa relacionada"><PersonSelect value={d.relatedUserId} onChange={(v) => set({ relatedUserId: v })} users={users} emptyLabel="Nenhuma" /></Field>
        </div>
      </>
    );
  }

  return (
    <div className="flex gap-2.5 items-start">
      <div className="w-8 shrink-0" />
      <div className="flex-1 min-w-0 bg-white border-2 border-violet-300 rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Cartão</p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-violet-50 text-violet-700">{KIND_LABEL[current.kind]}</span>
        </div>
        <div className="space-y-3">{body}</div>

        {photos.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-gray-500 mb-1.5">Fotos anexadas ({photos.length}) · {PHOTO_RULE[current.kind]}</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={p.url} className={clsx("relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-white", i >= max && "opacity-40")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                  <button onClick={() => onRemovePhoto(i)} className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl" title="Remover foto">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {photos.length > max && (
              <p className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-yellow-100 text-yellow-700 mt-2">
                {max === 0 ? "As fotos não serão salvas neste tipo." : `Só as primeiras ${max} serão salvas; as esmaecidas ficam de fora.`}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onDiscard} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-600">
            <X className="w-4 h-4" /> Descartar
          </button>
          <button
            onClick={onCreate}
            disabled={!canCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {CREATE_LABEL[current.kind]}
          </button>
        </div>
      </div>
    </div>
  );
}
