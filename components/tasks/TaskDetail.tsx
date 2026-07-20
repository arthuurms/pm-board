"use client";
import { Task } from "@/types";
import { PriorityBadge, StatusBadge } from "@/components/ui/Badge";
import { X, Calendar, User2, Clock, CheckCircle, XCircle, RotateCcw, ThumbsUp, Paperclip } from "lucide-react";
import clsx from "clsx";

interface Props {
  task: Task;
  onClose: () => void;
}

function fmt(d: string | null | undefined, showSeconds = false) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    ...(showSeconds && { second: "2-digit" }),
  });
}

export default function TaskDetail({ task, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-end z-50">
      <div className="w-full max-w-md h-full bg-white shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-base font-semibold">Detalhes da Tarefa</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
            {task.description && <p className="text-sm text-gray-500 mt-1">{task.description}</p>}
            {task.attachmentUrl && (
              <a
                href={task.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:underline mt-2"
              >
                <Paperclip className="w-3.5 h-3.5" /> {task.attachmentName || "Arquivo anexado"}
              </a>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {task.tag && (
              <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                {task.tag.emoji} {task.tag.name}
              </span>
            )}
            {task.isRework && (
              <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded font-medium">
                <RotateCcw className="w-3 h-3" /> Retrabalho
              </span>
            )}
            {task.status === "completed" && task.onTime !== null && (
              task.onTime ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  <CheckCircle className="w-3 h-3" /> No prazo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                  <XCircle className="w-3 h-3" /> Fora do prazo
                </span>
              )
            )}
            {task.status === "completed" && (
              task.approved ? (
                <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
                  <ThumbsUp className="w-3 h-3" /> Tarefa correta
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  Aguardando revisão
                </span>
              )
            )}
          </div>

          {/* Rework count banner */}
          {task.reworkCount > 0 && (
            <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5">
              <RotateCcw className="w-4 h-4 text-orange-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-orange-800">
                  {task.reworkCount}× enviada para retrabalho
                </p>
                <p className="text-xs text-orange-600">
                  {task.reworkCount === 1
                    ? "Esta tarefa precisou de 1 correção"
                    : `Esta tarefa precisou de ${task.reworkCount} correções`}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Responsável</p>
              <p className="flex items-center gap-1 text-gray-700">
                <User2 className="w-4 h-4 text-gray-400" />{task.assignee.name}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Criado por</p>
              <p className="text-gray-700">{task.creator.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Prazo</p>
              <p className={clsx("flex items-center gap-1", new Date(task.dueDate) < new Date() && task.status !== "completed" ? "text-red-600" : "text-gray-700")}>
                <Calendar className="w-4 h-4 text-gray-400" />{fmt(task.dueDate)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Início</p>
              <p className="flex items-center gap-1 text-gray-700">
                <Clock className="w-4 h-4 text-gray-400" />{fmt(task.startedAt)}
              </p>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Conclusão</p>
              <p className="text-gray-900 font-semibold">{fmt(task.completedAt, true)}</p>
              {task.completedAt && task.onTime !== null && (
                task.onTime
                  ? <p className="text-xs text-green-600 font-medium">✓ Entregue dentro do prazo</p>
                  : <p className="text-xs text-red-600 font-medium">✗ Entregue fora do prazo</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Criação</p>
              <p className="text-gray-700">{fmt(task.createdAt)}</p>
            </div>
          </div>

          {/* Status history */}
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Histórico de mudanças</p>
            <div className="space-y-2">
              {task.statusHistory.map((h, i) => (
                <div key={h.id} className="flex items-start gap-2 text-xs text-gray-600">
                  <div className={clsx(
                    "w-1.5 h-1.5 rounded-full mt-1.5 shrink-0",
                    h.toStatus === "completed" ? "bg-green-400" :
                    h.toStatus === "in_progress" ? "bg-yellow-400" : "bg-slate-300"
                  )} />
                  <div>
                    <span className="font-medium">{h.changedBy.name}</span>
                    {" → "}
                    <span className="font-medium">
                      {h.toStatus === "completed" ? "Concluída" :
                       h.toStatus === "in_progress" ? "Em andamento" : "Pendente"}
                    </span>
                    {" · "}
                    {new Date(h.changedAt).toLocaleString("pt-BR", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
                    })}
                    {h.note && <p className="text-gray-400 italic mt-0.5">"{h.note}"</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
