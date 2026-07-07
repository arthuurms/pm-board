"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { User } from "@/types";
import { ACTION_LABELS, ALL_ACTIONS } from "@/lib/permissions";
import { Users, Plus, Shield, Check, X } from "lucide-react";

interface UserWithPerms extends User {
  permissions?: Record<string, boolean>;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string })?.id;

  const [users, setUsers] = useState<UserWithPerms[]>([]);
  const [myPermissions, setMyPermissions] = useState<Record<string, boolean>>({});
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "collaborator", position: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    fetch(`/api/users/${currentUserId}/permissions`).then((r) => r.json()).then(setMyPermissions);
  }, [currentUserId]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadUserPerms(uid: string) {
    if (expandedUser === uid) { setExpandedUser(null); return; }
    const res = await fetch(`/api/users/${uid}/permissions`);
    const perms = await res.json();
    setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, permissions: perms } : u));
    setExpandedUser(uid);
  }

  async function togglePermission(uid: string, action: string, current: boolean) {
    const res = await fetch(`/api/users/${uid}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, granted: !current }),
    });
    const perms = await res.json();
    setUsers((prev) => prev.map((u) => u.id === uid ? { ...u, permissions: perms } : u));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    setSubmitting(false);
    if (!res.ok) { setFormError((await res.json()).error); return; }
    setShowForm(false);
    setNewUser({ name: "", email: "", password: "", role: "collaborator", position: "" });
    load();
  }

  const canManage = myPermissions.manage_permissions;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users className="w-6 h-6 text-violet-600" />
            <h1 className="text-2xl font-bold text-gray-900">Usuários & Permissões</h1>
          </div>
          <p className="text-sm text-gray-500">Gerencie membros e controle de acesso por ação</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm hover:bg-violet-700">
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>}

      {!loading && (
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-500 flex items-center justify-center text-white font-semibold text-sm">
                    {user.name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{user.name}</p>
                    <p className="text-xs text-gray-500">{user.email} {user.position ? `• ${user.position}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${user.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-600"}`}>
                    {user.role === "admin" ? "Admin / PM" : "Colaborador"}
                  </span>
                  {canManage && (
                    <button
                      onClick={() => loadUserPerms(user.id)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-violet-600 px-2 py-1 rounded hover:bg-violet-50 transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {expandedUser === user.id ? "Fechar" : "Permissões"}
                    </button>
                  )}
                </div>
              </div>

              {expandedUser === user.id && user.permissions && (
                <div className="border-t px-4 py-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Permissões</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ALL_ACTIONS.map((action) => {
                      const granted = user.permissions![action] ?? false;
                      const isAdmin = user.role === "admin";
                      return (
                        <div key={action} className="flex items-center justify-between bg-white rounded-lg border px-3 py-2">
                          <span className="text-sm text-gray-700">{ACTION_LABELS[action]}</span>
                          {isAdmin ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <button
                              onClick={() => togglePermission(user.id, action, granted)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${granted ? "bg-violet-500" : "bg-gray-200"}`}
                            >
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${granted ? "translate-x-5" : "translate-x-0.5"}`} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New user form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b"><h2 className="text-lg font-semibold">Novo Usuário</h2></div>
            <form onSubmit={createUser} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Papel</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="collaborator">Colaborador</option>
                    <option value="admin">Admin / PM</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo/Função</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={newUser.position} onChange={(e) => setNewUser({ ...newUser, position: e.target.value })} placeholder="Ex: Dev Frontend" />
                </div>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                  {submitting ? "Criando..." : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
