"use client";
import clsx from "clsx";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { dayNumber, formatDayMonth, relativeLabel, weekdayShort } from "@/lib/dayKey";

export type DayMode = "day" | "overdue" | "all";

interface Props {
  mode: DayMode;
  activeDay: string;
  todayDay: string;
  weekDays: string[];
  byDay: Record<string, { total: number; done: number }>;
  overdueCount: number;
  allCount: number;
  showBackToToday: boolean;
  onPickDay: (key: string) => void;
  onPickOverdue: () => void;
  onPickAll: () => void;
  onWeek: (delta: number) => void;
  onBackToToday: () => void;
}

export default function DayFilter({
  mode, activeDay, todayDay, weekDays, byDay, overdueCount, allCount, showBackToToday,
  onPickDay, onPickOverdue, onPickAll, onWeek, onBackToToday,
}: Props) {
  function tab(active: boolean, tone: "violet" | "red", onClick: () => void, icon: React.ReactNode, label: string, count?: number) {
    return (
      <button
        onClick={onClick}
        className={clsx(
          "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors",
          active
            ? tone === "red" ? "bg-red-600 border-red-600 text-white" : "bg-violet-600 border-violet-600 text-white"
            : tone === "red" ? "bg-white border-red-200 text-red-700 hover:border-red-400" : "bg-white border-gray-200 text-gray-700 hover:border-violet-300"
        )}
      >
        {icon}
        {label}
        {count !== undefined && (
          <span
            className={clsx(
              "min-w-6 text-center text-xs px-1.5 py-0.5 rounded-full font-bold",
              active ? "bg-white/25 text-white" : tone === "red" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
            )}
          >
            {count}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Ver tarefas</p>
      <div className="flex flex-wrap gap-2">
        {tab(mode === "day", "violet", () => onPickDay(mode === "day" ? activeDay : todayDay), <CalendarDays className="w-4 h-4" />, "Por dia")}
        {tab(mode === "overdue", "red", onPickOverdue, <AlertTriangle className="w-4 h-4" />, "Atrasadas", overdueCount)}
        {tab(mode === "all", "violet", onPickAll, <ListChecks className="w-4 h-4" />, "Todas as tarefas", allCount)}
      </div>

      {mode === "day" && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button onClick={() => onWeek(-1)} className="p-2 rounded-lg border border-gray-200 hover:border-violet-400 hover:text-violet-600" title="Semana anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => onWeek(1)} className="p-2 rounded-lg border border-gray-200 hover:border-violet-400 hover:text-violet-600" title="Próxima semana">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              Semana de {formatDayMonth(weekDays[0])} a {formatDayMonth(weekDays[6])}
            </span>
            {showBackToToday && (
              <button onClick={onBackToToday} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-700 hover:opacity-80">
                Voltar para hoje
              </button>
            )}
          </div>

          <div className="overflow-x-auto -mx-1 px-1">
            <div className="grid grid-cols-7 gap-2 min-w-[560px]">
              {weekDays.map((k) => {
                const stat = byDay[k];
                const open = stat ? stat.total - stat.done : 0;
                const selected = activeDay === k;
                const isToday = k === todayDay;
                const label = relativeLabel(k, todayDay) ?? weekdayShort(k);
                const tone = !stat ? "text-gray-400"
                  : k < todayDay && open > 0 ? "text-red-600"
                  : stat.done === stat.total ? "text-green-700"
                  : "text-violet-700";
                return (
                  <button
                    key={k}
                    onClick={() => onPickDay(k)}
                    title={stat ? `${stat.total} tarefa(s): ${open} em aberto, ${stat.done} concluída(s)` : "Nenhuma tarefa neste dia"}
                    className={clsx(
                      "flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3 min-h-[92px] transition-colors",
                      selected ? "bg-violet-600 border-violet-600 text-white shadow-md"
                        : isToday ? "bg-white border-violet-400 text-gray-800"
                        : "bg-white border-gray-200 text-gray-800 hover:border-violet-300"
                    )}
                  >
                    <span className={clsx("text-xs font-bold uppercase tracking-wide", selected ? "text-white/90" : isToday ? "text-violet-600" : "text-gray-500")}>
                      {label}
                    </span>
                    <span className="text-2xl font-bold leading-tight">{dayNumber(k)}</span>
                    <span className={clsx("text-xs font-semibold", selected ? "text-white" : tone)}>
                      {stat ? `${stat.total} ${stat.total === 1 ? "tarefa" : "tarefas"}` : "livre"}
                    </span>
                    {isToday && overdueCount > 0 && (
                      <span className={clsx("text-[11px] font-bold", selected ? "text-white" : "text-red-600")}>
                        +{overdueCount} {overdueCount === 1 ? "atrasada" : "atrasadas"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            O número é quantas tarefas vencem naquele dia. <span className="text-red-600 font-medium">Vermelho</span>: já passou e ainda tem tarefa aberta. <span className="text-green-700 font-medium">Verde</span>: tudo concluído.
          </p>
        </div>
      )}
    </div>
  );
}
