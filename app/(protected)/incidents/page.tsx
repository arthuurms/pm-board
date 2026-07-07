"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Incident, User } from "@/types";
import { SeverityBadge, CategoryLabel } from "@/components/ui/Badge";
import { AlertTriangle, Plus } from "lucide-react";

interface FormState {
  title: string;
  description: string;
  category: string;
  severity: string;
  occurredAt: string;
  relatedUserId: string;
}

export default function IncidentsPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string })?.id;

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [filterMonth, setFilterMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>({
    title: "", description: "", category: "ops_down", severity: "high",
    occurredAt: new Date().toISOString().slice(0, 16), relatedUserId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { fetch("/api/users").then((r) => r.json()).then(setUsers); }, []);
  useEffect(() => {
    if (!userId) return;
    fetch(`/api/users/${userId}/permissions`).then((r) => r.json()).then(setPermissions);
  }, [userId]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterMonth) params.set("month", filterMonth);
    const res = await fetch(`/api/incidents?${params}`);
    setIncidents(await res.json());
    setLoading(false);
  }, [filterMonth]);

  useEffect(() => { load(); }, [load]);

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    const res = await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, relatedUserId: form.relatedUserId || null }),
    });
    setSubmitting(false);
    if (!res.ok) { setFormError((await res.json()).error); return; }
    setShowForm(false);
    setForm({ title: "", description: "", category: "ops_down", severity: "high", occurredAt: new Date().toISOString().slice(0, 16), relatedUserId: "" });
    load();
  }

  const SEVERITY_ORDER = ["critical", "high", "medium", "low"];
  const sorted = [...incidents].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">Incidentes Críticos</h1>
          </div>
          <p className="text-sm text-gray-500">Registro de falhas graves de operação, atendimento ou receita</p>
        </div>
        {permissions.create_incident && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Registrar Incidente
          </button>
        )}
      </div>

      <div className="flex gap-3 mb-5">
        <input type="month" className="border rounded-lg px-3 py-1.5 text-sm" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}
      {!loading && sorted.length === 0 && <p className="text-sm text-gray-400 text-center py-12">Nenhum incidente registrado</p>}

      {!loading && (
        <div className="space-y-3">
          {sorted.map((inc) => (
            <div key={inc.id} className="bg-white rounded-xl border border-red-100 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{inc.title}</p>
                  {inc.description && <p className="text-sm text-gray-500 mt-0.5">{inc.description}</p>}
                </div>
                <SeverityBadge severity={inc.severity} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded font-medium">
                  <CategoryLabel category={inc.category} />
                </span>
                <span>Ocorrido: {new Date(inc.occurredAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
                <span>Reportado por: {inc.reportedBy.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b"><h2 className="text-lg font-semibold">Registrar Incidente</h2></div>
            <form onSubmit={submitIncident} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="ops_down">Operação fora do ar</option>
                    <option value="service_failure">Falha de atendimento</option>
                    <option value="revenue_loss">Perda de venda/dado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Severidade *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data/hora ocorrência *</label>
                  <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pessoa relacionada</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.relatedUserId} onChange={(e) => setForm({ ...form, relatedUserId: e.target.value })}>
                    <option value="">Nenhuma</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                  {submitting ? "Salvando..." : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
