"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { QualityIncident, User } from "@/types";
import { QUALITY_INCIDENT_REASONS, findQualityReason } from "@/lib/qualityIncidents";
import clsx from "clsx";
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Paperclip,
  Loader2,
  UploadCloud,
  X,
  Check,
  Sparkles,
} from "lucide-react";

interface FormState {
  targetUserId: string;
  reasonKey: string;
  description: string;
}

const EMPTY_FORM: FormState = { targetUserId: "", reasonKey: "", description: "" };

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtPts(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1 });
}

export default function QualidadePage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [incidents, setIncidents] = useState<QualityIncident[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<QualityIncident | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [proofFile, setProofFile] = useState<{ url: string; name: string } | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/permissions`).then((r) => r.json()).then((p) => {
      setPermissions(p);
      setPermissionsLoaded(true);
    });
  }, [userId]);

  const canAccess = permissions.manage_quality_incidents;

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth) params.set("month", filterMonth);
    const res = await fetch(`/api/quality-incidents?${params}`);
    if (res.ok) setIncidents(await res.json());
    setLoading(false);
  }, [filterMonth, canAccess]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setProofFile(null);
    setFormError("");
    setShowForm(true);
  }

  async function uploadProof(file: File) {
    setUploadingProof(true);
    setFormError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    setUploadingProof(false);
    if (!res.ok) {
      setFormError((await res.json()).error || "Falha ao enviar arquivo");
      return;
    }
    const data = await res.json();
    setProofFile({ url: data.url, name: data.name });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadProof(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadProof(file);
  }

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    const res = await fetch("/api/quality-incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        proofUrl: proofFile?.url ?? null,
        proofName: proofFile?.name ?? null,
      }),
    });
    setSubmitting(false);
    if (!res.ok) { setFormError((await res.json()).error); return; }
    setShowForm(false);
    setForm(EMPTY_FORM);
    setProofFile(null);
    load();
  }

  async function deleteIncident(id: string) {
    await fetch(`/api/quality-incidents/${id}`, { method: "DELETE" });
    setDeleteTarget(null);
    load();
  }

  // Points lost this month, grouped by person.
  const totals = incidents.reduce<Record<string, { name: string; points: number }>>((acc, inc) => {
    const key = inc.targetUserId;
    if (!acc[key]) acc[key] = { name: inc.targetUser.name, points: 0 };
    acc[key].points += inc.points;
    return acc;
  }, {});

  const selectedReason = form.reasonKey ? findQualityReason(form.reasonKey) : undefined;

  if (permissionsLoaded && !canAccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Você não tem acesso a essa área. Peça a um admin para liberar a permissão &quot;Qualidade de Serviço&quot;.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
            <ShieldCheck className="w-5.5 h-5.5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Qualidade de Serviço</h1>
            <p className="text-sm text-slate-500">Incidências de atendimento e pontos perdidos no bônus de qualidade</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-violet-500 text-white rounded-xl text-sm font-medium hover:from-violet-500 hover:to-violet-400 shadow-md shadow-violet-500/25 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Nova incidência
        </button>
      </div>

      <div className="flex gap-3 mb-6">
        <input
          type="month"
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        />
      </div>

      {Object.keys(totals).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {Object.entries(totals).map(([id, t]) => {
            const critical = t.points >= 5;
            const warn = t.points > 0 && !critical;
            return (
              <div
                key={id}
                className={clsx(
                  "relative overflow-hidden rounded-xl border p-3.5 shadow-sm bg-white",
                  critical ? "border-red-200" : warn ? "border-amber-200" : "border-slate-200"
                )}
              >
                <div
                  className={clsx(
                    "absolute inset-x-0 top-0 h-0.5",
                    critical ? "bg-gradient-to-r from-red-500 to-rose-400" : warn ? "bg-gradient-to-r from-amber-500 to-orange-400" : "bg-gradient-to-r from-violet-500 to-cyan-400"
                  )}
                />
                <p className="text-xs font-medium text-slate-500 truncate">{t.name}</p>
                <p className={clsx("text-xl font-bold tabular-nums tracking-tight mt-0.5", critical ? "text-red-600" : warn ? "text-amber-600" : "text-slate-900")}>
                  {fmtPts(t.points)}<span className="text-xs font-medium text-slate-400 ml-1">pts</span>
                </p>
                <p className="text-[11px] text-slate-400">perdidos no mês</p>
              </div>
            );
          })}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400 text-center py-12">Carregando...</p>}
      {!loading && incidents.length === 0 && (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl">
          <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">Nenhuma incidência registrada nesse mês</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div key={inc.id} className="group relative overflow-hidden bg-white rounded-xl border border-slate-200 pl-4 pr-4 py-4 shadow-sm hover:shadow-md hover:border-violet-200 transition-all">
              <div className={clsx("absolute inset-y-0 left-0 w-1", inc.points >= 1 ? "bg-gradient-to-b from-amber-400 to-orange-500" : "bg-gradient-to-b from-amber-300 to-amber-400")} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="inline-flex items-center bg-violet-50 text-violet-700 px-2 py-0.5 rounded-md font-medium text-xs">
                      {inc.targetUser.name}
                    </span>
                    <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md font-semibold text-xs tabular-nums">
                      {fmtPts(inc.points)} pt
                    </span>
                  </div>
                  <p className="font-medium text-slate-900 leading-snug">{inc.reasonLabel}</p>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">{inc.description}</p>
                  {inc.proofUrl && (
                    <a
                      href={inc.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 hover:underline mt-2.5 bg-violet-50/60 px-2 py-1 rounded-md"
                    >
                      <Paperclip className="w-3 h-3" /> {inc.proofName || "Ver prova"}
                    </a>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setDeleteTarget(inc)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                    title="Excluir incidência"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                <span>{new Date(inc.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
                <span>·</span>
                <span>Registrado por {inc.reportedBy.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
                <Plus className="w-4 h-4 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Nova incidência de qualidade</h2>
            </div>
            <form onSubmit={submitIncident} className="px-6 py-5 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pessoa *</label>
                <select
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                  value={form.targetUserId}
                  onChange={(e) => setForm({ ...form, targetUserId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo *</label>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {QUALITY_INCIDENT_REASONS.map((r) => {
                    const active = form.reasonKey === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setForm({ ...form, reasonKey: r.key })}
                        className={clsx(
                          "w-full flex items-start gap-3 text-left px-3 py-2.5 transition-colors",
                          active ? "bg-violet-50" : "bg-white hover:bg-slate-50"
                        )}
                      >
                        <span
                          className={clsx(
                            "mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                            active ? "border-violet-600 bg-violet-600" : "border-slate-300"
                          )}
                        >
                          {active && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </span>
                        <span className={clsx("flex-1 text-sm leading-snug", active ? "text-violet-900 font-medium" : "text-slate-700")}>
                          {r.label}
                        </span>
                        <span
                          className={clsx(
                            "shrink-0 text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded",
                            active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"
                          )}
                        >
                          {fmtPts(r.points)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {selectedReason && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    Vale {fmtPts(selectedReason.points)} ponto(s) — R$ {(100 * selectedReason.points).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de desconto
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descrição *</label>
                <textarea
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Prova (imagem)</label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

                {!proofFile && !uploadingProof && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={clsx(
                      "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer transition-colors text-center",
                      dragActive ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-violet-50/50"
                    )}
                  >
                    <UploadCloud className={clsx("w-7 h-7", dragActive ? "text-violet-600" : "text-slate-400")} />
                    <p className="text-sm text-slate-600">
                      <span className="text-violet-600 font-medium">Clique para escolher</span> ou arraste uma imagem aqui
                    </p>
                    <p className="text-xs text-slate-400">PNG, JPG — até 4MB</p>
                  </div>
                )}

                {uploadingProof && (
                  <div className="flex items-center justify-center gap-2 border-2 border-dashed border-violet-200 bg-violet-50/50 rounded-xl py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                    <p className="text-sm text-violet-600">Enviando imagem...</p>
                  </div>
                )}

                {proofFile && !uploadingProof && (
                  <div className="flex items-center gap-3 border border-slate-200 rounded-xl p-2.5 bg-slate-50">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-white border border-slate-200 shrink-0 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={proofFile.url} alt={proofFile.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{proofFile.name}</p>
                      <p className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Anexado</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg shrink-0"
                      title="Remover"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancelar</button>
                <button
                  type="submit"
                  disabled={submitting || uploadingProof}
                  className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-500 hover:to-violet-400 disabled:opacity-50 font-medium shadow-md shadow-violet-500/20"
                >
                  {submitting ? "Salvando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <p className="font-semibold text-slate-900 text-sm">Excluir incidência?</p>
            </div>
            <p className="text-sm text-slate-600 mb-1">Esta ação não pode ser desfeita:</p>
            <p className="text-sm font-medium text-slate-800 bg-slate-50 rounded-lg px-3 py-2 mb-4 truncate">{deleteTarget.reasonLabel} — {deleteTarget.targetUser.name}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
              <button onClick={() => deleteIncident(deleteTarget.id)} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
