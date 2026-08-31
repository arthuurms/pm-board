"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { QualityIncident, User } from "@/types";
import { QUALITY_INCIDENT_REASONS, findQualityReason } from "@/lib/qualityIncidents";
import { ShieldAlert, Plus, Trash2, Paperclip, Loader2 } from "lucide-react";

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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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

  if (permissionsLoaded && !canAccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center py-20">
        <ShieldAlert className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Você não tem acesso a essa área. Peça a um admin para liberar a permissão &quot;Qualidade de Serviço&quot;.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <ShieldAlert className="w-6 h-6 text-amber-500" />
            <h1 className="text-2xl font-bold text-gray-900">Qualidade de Serviço</h1>
          </div>
          <p className="text-sm text-gray-500">Incidências de atendimento e pontos perdidos no bônus de qualidade</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova incidência
        </button>
      </div>

      <div className="flex gap-3 mb-5">
        <input type="month" className="border rounded-lg px-3 py-1.5 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
      </div>

      {Object.keys(totals).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {Object.entries(totals).map(([id, t]) => (
            <div key={id} className="bg-white rounded-xl border p-3 shadow-sm">
              <p className="text-xs text-gray-500 truncate">{t.name}</p>
              <p className={`text-lg font-bold ${t.points >= 5 ? "text-red-600" : t.points > 0 ? "text-amber-600" : "text-gray-900"}`}>
                {t.points.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} pts
              </p>
              <p className="text-xs text-gray-400">perdidos no mês</p>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}
      {!loading && incidents.length === 0 && <p className="text-sm text-gray-400 text-center py-12">Nenhuma incidência registrada nesse mês</p>}

      {!loading && (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div key={inc.id} className="bg-white rounded-xl border border-amber-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center bg-violet-50 text-violet-700 px-2 py-0.5 rounded font-medium text-xs">
                      {inc.targetUser.name}
                    </span>
                    <span className="inline-flex items-center bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium text-xs">
                      {inc.points.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} pt
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 mt-1.5">{inc.reasonLabel}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{inc.description}</p>
                  {inc.proofUrl && (
                    <a
                      href={inc.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline mt-2"
                    >
                      <Paperclip className="w-3 h-3" /> {inc.proofName || "Ver prova"}
                    </a>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setDeleteTarget(inc)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                    title="Excluir incidência"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span>{new Date(inc.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
                <span>Registrado por: {inc.reportedBy.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b"><h2 className="text-lg font-semibold">Nova incidência de qualidade</h2></div>
            <form onSubmit={submitIncident} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pessoa *</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.targetUserId}
                  onChange={(e) => setForm({ ...form, targetUserId: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.reasonKey}
                  onChange={(e) => setForm({ ...form, reasonKey: e.target.value })}
                  required
                >
                  <option value="">Selecione...</option>
                  {QUALITY_INCIDENT_REASONS.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label} — {r.points.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} pt
                    </option>
                  ))}
                </select>
                {form.reasonKey && (
                  <p className="text-xs text-amber-600 mt-1">
                    Vale {findQualityReason(form.reasonKey)?.points.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ponto(s) — R$ {(100 * (findQualityReason(form.reasonKey)?.points ?? 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} de desconto
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prova (imagem)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="w-full text-sm"
                  onChange={handleFileChange}
                />
                {uploadingProof && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando...</p>}
                {proofFile && !uploadingProof && <p className="text-xs text-green-600 mt-1">Anexado: {proofFile.name}</p>}
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={submitting || uploadingProof} className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                  {submitting ? "Salvando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Excluir incidência?</p>
            </div>
            <p className="text-sm text-gray-600 mb-1">Esta ação não pode ser desfeita:</p>
            <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate">{deleteTarget.reasonLabel} — {deleteTarget.targetUser.name}</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => deleteIncident(deleteTarget.id)} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
