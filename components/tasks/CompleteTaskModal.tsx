"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import clsx from "clsx";
import { UploadCloud, Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Task } from "@/types";

interface Props {
  task: Task;
  onClose: () => void;
  onDone: () => void;
}

const SHRINK_ABOVE_BYTES = 3 * 1024 * 1024;
const MAX_SIDE = 1920;

// Big desktop screenshots can be several MB: scale them down before sending (keeps the upload fast and under the server limit).
async function shrinkImage(file: File): Promise<File> {
  if (file.size <= SHRINK_ABOVE_BYTES || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export default function CompleteTaskModal({ task, onClose, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = useCallback(async (f: File | undefined | null) => {
    if (!f) return;
    setError("");
    if (!f.type.startsWith("image/")) {
      setError("Envie uma imagem (print da tarefa feita).");
      return;
    }
    setPreparing(true);
    const ready = await shrinkImage(f);
    setPreparing(false);
    setFile(ready);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(ready);
    });
  }, []);

  // Ctrl+V with a screenshot in the clipboard
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const img = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (img) {
        e.preventDefault();
        pick(img);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function remove() {
    setFile(null);
    setPreview("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function submit() {
    if (!file) return;
    setSubmitting(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, { method: "POST", body: fd });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Não consegui concluir a tarefa. Tente de novo.");
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      if (data.discord === "failed") {
        setNotice("Tarefa concluída e print salva, mas o aviso no Discord falhou. Avise quem pediu a tarefa.");
        setSubmitting(false);
        return;
      }
      onDone();
    } catch {
      setError("Sem conexão com o servidor. Tente de novo.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-green-100 text-green-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900">Concluir tarefa</h2>
              <p className="text-sm text-gray-500 truncate">{task.title}</p>
            </div>
          </div>
          {!submitting && !notice && (
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" title="Cancelar">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {notice ? (
            <div className="flex items-start gap-2 text-sm font-medium px-3 py-3 rounded-lg bg-yellow-100 text-yellow-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              {notice}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600 leading-relaxed">
                Para concluir é <b className="text-gray-900">obrigatório enviar a print</b> da tarefa feita. Ela fica salva na tarefa e vai para o Discord.
              </p>

              {!file && !preparing && (
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); pick(e.dataTransfer.files?.[0]); }}
                  className={clsx(
                    "flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-8 px-4 cursor-pointer text-center transition-colors",
                    dragActive ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-gray-50 hover:border-violet-300"
                  )}
                >
                  <UploadCloud className={clsx("w-7 h-7", dragActive ? "text-violet-600" : "text-gray-400")} />
                  <p className="text-sm text-gray-600">
                    <span className="text-violet-600 font-semibold">Clique para escolher</span>, arraste ou <b>cole com Ctrl+V</b>
                  </p>
                  <p className="text-xs text-gray-400">PNG, JPG, GIF ou WEBP</p>
                </div>
              )}
              <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

              {preparing && (
                <div className="flex items-center justify-center gap-2 border-2 border-dashed border-violet-100 bg-violet-50 rounded-xl py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
                  <p className="text-sm text-violet-600">Preparando a imagem...</p>
                </div>
              )}

              {file && !preparing && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Print da tarefa" className="w-full max-h-64 object-contain rounded-lg bg-white" />
                  <div className="flex items-center justify-between gap-2 mt-2 px-1">
                    <p className="text-xs text-gray-500 truncate">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>
                    {!submitting && (
                      <button onClick={remove} className="text-xs font-medium text-red-600 hover:underline shrink-0">Trocar imagem</button>
                    )}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2 shrink-0">
          {notice ? (
            <button onClick={onDone} className="px-4 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">Fechar</button>
          ) : (
            <>
              <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:border-violet-400 disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={!file || preparing || submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Concluir tarefa
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
