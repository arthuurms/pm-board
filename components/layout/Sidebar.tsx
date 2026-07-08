"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import clsx from "clsx";
import {
  LayoutDashboard,
  ListTodo,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Users,
  BarChart2,
  LogOut,
  ChevronRight,
  CalendarCheck,
} from "lucide-react";

const NAV_ALL = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/tasks", label: "Tarefas", icon: ListTodo, adminOnly: false },
  { href: "/completed", label: "Concluídas", icon: CheckCircle2, adminOnly: false },
  { href: "/rework", label: "Concluídas — Retrabalho", icon: RotateCcw, adminOnly: false },
  { href: "/daily-tasks", label: "Tarefas Diárias", icon: CalendarCheck, adminOnly: false },
  { href: "/incidents", label: "Incidentes", icon: AlertTriangle, adminOnly: false },
  { href: "/performance", label: "Análise de Desempenho", icon: BarChart2, adminOnly: false },
  { href: "/users", label: "Usuários & Permissões", icon: Users, adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as { name?: string; email?: string; role?: string } | undefined;
  const isAdmin = user?.role === "admin";
  const NAV = NAV_ALL.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className="w-64 min-h-screen bg-[#1a1d23] text-white flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
            <ChevronRight className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Fourfy Board</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active
                  ? "bg-violet-600 text-white font-medium"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-sm font-bold">
            {user?.name?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.role === "admin" ? "Admin / PM" : "Colaborador"}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
