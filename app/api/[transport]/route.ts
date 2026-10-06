import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { verifyAccessToken } from "@/lib/oauth";
import { describeSchedule, isValidTimeOfDay } from "@/lib/scheduleFormat";
import { currentBrtMonth, goalMonth, isValidMonth } from "@/lib/goalMonth";

const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;
const INCIDENT_CATEGORY_VALUES = [
  "ops_down", "service_failure", "revenue_loss", "communication", "deadline_miss",
  "quality", "process", "external", "security", "other",
] as const;
const INCIDENT_CATEGORY_HELP =
  "ops_down (operação fora do ar), service_failure (falha de atendimento), revenue_loss (perda de venda/dado), communication (falha de comunicação), deadline_miss (prazo não cumprido), quality (problema de qualidade), process (falha de processo), external (causa externa), security (segurança) ou other (outro)";
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

// Only http(s): these URLs end up in <a href>/<img src>, so javascript:/data: must never be accepted.
const imageUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "A imagem precisa ser um link http(s)");
const imageFileSchema = z.object({
  nome: z.string().describe("Nome do arquivo com extensão, ex: print.png"),
  base64: z.string().describe("Conteúdo da imagem em base64 (png, jpg, gif ou webp, até 4MB)"),
});
type ImageFile = z.infer<typeof imageFileSchema>;
const INCIDENT_SEVERITY_VALUES = ["low", "medium", "high", "critical"] as const;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function resolveUser(name: string) {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const target = normalize(name);
  return (
    users.find((u) => normalize(u.name) === target) ??
    users.find((u) => normalize(u.name).split(" ")[0] === target) ??
    users.find((u) => normalize(u.name).includes(target))
  );
}

async function resolveTag(name: string) {
  const tags = await prisma.tag.findMany();
  const target = normalize(name);
  return (
    tags.find((t) => normalize(t.name) === target) ??
    tags.find((t) => normalize(t.name).includes(target))
  );
}

// "YYYY-MM-DDTHH:mm" with no offset is treated as Brasília local time (fixed
// -03:00 — Brazil has not observed DST since 2019). If an offset/Z is already
// present, it's used as-is.
function parseBrasiliaDateTime(value: string): Date {
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(value);
  return new Date(hasOffset ? value : `${value}-03:00`);
}

function urlFileName(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
    return last || "imagem";
  } catch {
    return "imagem";
  }
}

// Turns image links and/or base64 files into stored attachments (links are kept as given, base64 is uploaded to Blob).
async function storeImages(
  urls: string[] | undefined,
  files: ImageFile[] | undefined
): Promise<{ urls: string[]; names: string[] } | { error: string }> {
  const outUrls: string[] = [];
  const outNames: string[] = [];
  for (const u of urls ?? []) {
    outUrls.push(u);
    outNames.push(urlFileName(u));
  }
  for (const f of files ?? []) {
    const ext = f.nome.split(".").pop()?.toLowerCase() ?? "";
    const contentType = IMAGE_MIME[ext];
    if (!contentType) return { error: `Arquivo "${f.nome}" não é uma imagem aceita (use png, jpg, gif ou webp).` };
    const buf = Buffer.from(f.base64.replace(/^data:[^,]*,/, ""), "base64");
    if (buf.length === 0) return { error: `Arquivo "${f.nome}" está vazio ou o base64 é inválido.` };
    if (buf.length > MAX_IMAGE_BYTES) return { error: `Arquivo "${f.nome}" tem mais de 4MB.` };
    try {
      const blob = await put(f.nome, buf, { access: "public", addRandomSuffix: true, contentType });
      outUrls.push(blob.url);
      outNames.push(f.nome);
    } catch (err) {
      console.error("MCP image upload failed:", err);
      return { error: `Não consegui enviar o arquivo "${f.nome}" para o armazenamento.` };
    }
  }
  if (outUrls.length > MAX_IMAGES) return { error: `Máximo de ${MAX_IMAGES} imagens.` };
  return { urls: outUrls, names: outNames };
}

const WEEKDAY_ALIASES: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

// "todos" | "uteis" | "seg,qua,sex" -> sorted weekday numbers (0 = Sunday), or null if unparseable.
function parseWeekdays(value: string): number[] | null {
  const v = normalize(value);
  if (v === "todos" || v === "todo dia" || v === "diario") return [0, 1, 2, 3, 4, 5, 6];
  if (v === "uteis" || v === "dias uteis") return [1, 2, 3, 4, 5];
  const days = v.split(/[\s,;]+/).filter(Boolean).map((p) => WEEKDAY_ALIASES[p.slice(0, 3)]);
  if (days.length === 0 || days.some((d) => d === undefined)) return null;
  return [...new Set(days)].sort((a, b) => a - b);
}

async function findScheduledTask(titulo: string, responsavel?: string) {
  let assigneeId: string | undefined;
  if (responsavel) {
    const assignee = await resolveUser(responsavel);
    if (!assignee) {
      const users = await prisma.user.findMany({ select: { name: true } });
      return { error: `Não encontrei ninguém chamado "${responsavel}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` };
    }
    assigneeId = assignee.id;
  }
  const candidates = await prisma.scheduledTask.findMany({
    where: { title: { contains: titulo, mode: "insensitive" }, ...(assigneeId ? { assigneeId } : {}) },
    include: { assignee: { select: { name: true } } },
  });
  if (candidates.length === 0) return { error: `Nenhuma tarefa programada encontrada com "${titulo}" no título.` };
  if (candidates.length > 1) {
    const lines = candidates.map((c) => `- "${c.title}" (responsável: ${c.assignee.name})`);
    return { error: `Mais de uma tarefa programada encontrada com "${titulo}" — seja mais específico:\n${lines.join("\n")}` };
  }
  return { schedule: candidates[0] };
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "criar_tarefa",
      {
        title: "Criar tarefa",
        description: "Cria uma nova tarefa no Clickfy, atribuída a um responsável, com prazo e prioridade.",
        inputSchema: {
          titulo: z.string().describe("Título da tarefa"),
          descricao: z.string().optional().describe("Descrição opcional da tarefa"),
          responsavel: z.string().describe("Nome da pessoa responsável por executar a tarefa"),
          solicitadoPor: z.string().describe("Nome de quem está pedindo/solicitando a criação da tarefa"),
          prazo: z.string().describe("Data e hora limite no formato YYYY-MM-DDTHH:mm, horário de Brasília"),
          prioridade: z.enum(PRIORITY_VALUES).optional().describe("low, medium, high ou urgent (padrão: medium)"),
          pais: z.string().optional().describe("Tag de país da tarefa, ex: Colômbia, México, Holanda (opcional)"),
          imagemUrl: imageUrlSchema.optional().describe("Link (http/https) de uma imagem para anexar à tarefa (opcional)"),
          imagemArquivo: imageFileSchema.optional().describe("Imagem em base64 para anexar à tarefa, se não houver link (opcional)"),
        },
      },
      async ({ titulo, descricao, responsavel, solicitadoPor, prazo, prioridade, pais, imagemUrl, imagemArquivo }) => {
        const assignee = await resolveUser(responsavel);
        const creator = await resolveUser(solicitadoPor);

        if (!assignee || !creator) {
          const users = await prisma.user.findMany({ select: { name: true } });
          const names = users.map((u) => u.name).join(", ");
          const who = !assignee ? responsavel : solicitadoPor;
          return {
            isError: true,
            content: [{ type: "text", text: `Não encontrei ninguém chamado "${who}". Pessoas cadastradas: ${names}` }],
          };
        }

        let tagId: string | undefined;
        if (pais) {
          const tag = await resolveTag(pais);
          if (!tag) {
            const tags = await prisma.tag.findMany();
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei a tag "${pais}". Tags cadastradas: ${tags.map((t) => t.name).join(", ")}` }],
            };
          }
          tagId = tag.id;
        }

        if (imagemUrl && imagemArquivo) {
          return { isError: true, content: [{ type: "text", text: "Envie só um anexo por tarefa: imagemUrl ou imagemArquivo." }] };
        }
        const stored = await storeImages(imagemUrl ? [imagemUrl] : undefined, imagemArquivo ? [imagemArquivo] : undefined);
        if ("error" in stored) return { isError: true, content: [{ type: "text", text: stored.error }] };

        const dueDate = parseBrasiliaDateTime(prazo);
        const task = await prisma.task.create({
          data: {
            title: titulo,
            description: descricao || null,
            priority: prioridade || "medium",
            dueDate,
            assigneeId: assignee.id,
            creatorId: creator.id,
            tagId,
            attachmentUrl: stored.urls[0] ?? null,
            attachmentName: stored.names[0] ?? null,
          },
        });

        await prisma.statusHistory.create({
          data: { taskId: task.id, fromStatus: null, toStatus: "pending", changedById: creator.id },
        });

        const dueDateLabel = dueDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        return {
          content: [{
            type: "text",
            text: `Tarefa "${titulo}" criada para ${assignee.name}, solicitada por ${creator.name}, prazo ${dueDateLabel}.${stored.urls.length ? " Imagem anexada." : ""}`,
          }],
        };
      }
    );

    server.registerTool(
      "listar_tarefas",
      {
        title: "Listar tarefas",
        description: "Lista tarefas cadastradas no Clickfy, opcionalmente filtrando por responsável, para consultar títulos/descrições exatos antes de criar ou duplicar uma tarefa.",
        inputSchema: {
          responsavel: z.string().optional().describe("Nome da pessoa responsável, para filtrar (opcional)"),
        },
      },
      async ({ responsavel }) => {
        let assigneeId: string | undefined;
        if (responsavel) {
          const assignee = await resolveUser(responsavel);
          if (!assignee) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei ninguém chamado "${responsavel}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
            };
          }
          assigneeId = assignee.id;
        }

        const tasks = await prisma.task.findMany({
          where: assigneeId ? { assigneeId } : {},
          include: { assignee: { select: { name: true } }, creator: { select: { name: true } }, tag: true },
          orderBy: { createdAt: "desc" },
          take: 30,
        });

        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "Nenhuma tarefa encontrada." }] };
        }

        const lines = tasks.map((t) => {
          const dueDateLabel = t.dueDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
          const tagLabel = t.tag ? ` | tag: ${t.tag.name}` : "";
          return `- "${t.title}"${t.description ? ` — ${t.description}` : ""} | responsável: ${t.assignee.name} | solicitado por: ${t.creator.name} | prazo: ${dueDateLabel} | status: ${t.status}${tagLabel}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
    );

    server.registerTool(
      "editar_tarefa",
      {
        title: "Editar tarefa",
        description: "Edita uma tarefa já existente no Clickfy (busca pelo título, aceita parte do texto) — prazo, prioridade, título ou descrição.",
        inputSchema: {
          titulo: z.string().describe("Título (ou parte dele) da tarefa a editar"),
          responsavel: z.string().optional().describe("Nome do responsável, para desempatar quando mais de uma tarefa tem título parecido"),
          novoPrazo: z.string().optional().describe("Novo prazo, formato YYYY-MM-DDTHH:mm, horário de Brasília"),
          novaPrioridade: z.enum(PRIORITY_VALUES).optional(),
          novoTitulo: z.string().optional(),
          novaDescricao: z.string().optional(),
          novoPais: z.string().optional().describe("Nova tag de país, ex: Colômbia, México, Holanda"),
          novaImagemUrl: imageUrlSchema.optional().describe("Link (http/https) de uma imagem para anexar, substituindo o anexo atual"),
          novaImagemArquivo: imageFileSchema.optional().describe("Imagem em base64 para anexar, substituindo o anexo atual"),
        },
      },
      async ({ titulo, responsavel, novoPrazo, novaPrioridade, novoTitulo, novaDescricao, novoPais, novaImagemUrl, novaImagemArquivo }) => {
        let assigneeFilter: string | undefined;
        if (responsavel) {
          const assignee = await resolveUser(responsavel);
          if (!assignee) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei ninguém chamado "${responsavel}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
            };
          }
          assigneeFilter = assignee.id;
        }

        const candidates = await prisma.task.findMany({
          where: {
            title: { contains: titulo, mode: "insensitive" },
            ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
          },
          include: { assignee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        });

        if (candidates.length === 0) {
          return { isError: true, content: [{ type: "text", text: `Nenhuma tarefa encontrada com "${titulo}" no título.` }] };
        }
        if (candidates.length > 1) {
          const lines = candidates.map((t) => `- "${t.title}" (responsável: ${t.assignee.name})`);
          return {
            isError: true,
            content: [{ type: "text", text: `Mais de uma tarefa encontrada com "${titulo}" — seja mais específico:\n${lines.join("\n")}` }],
          };
        }

        const data: Record<string, unknown> = {};
        if (novoPrazo) data.dueDate = parseBrasiliaDateTime(novoPrazo);
        if (novaPrioridade) data.priority = novaPrioridade;
        if (novoTitulo) data.title = novoTitulo;
        if (novaDescricao) data.description = novaDescricao;
        if (novoPais) {
          const tag = await resolveTag(novoPais);
          if (!tag) {
            const tags = await prisma.tag.findMany();
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei a tag "${novoPais}". Tags cadastradas: ${tags.map((t) => t.name).join(", ")}` }],
            };
          }
          data.tagId = tag.id;
        }
        if (novaImagemUrl || novaImagemArquivo) {
          if (novaImagemUrl && novaImagemArquivo) {
            return { isError: true, content: [{ type: "text", text: "Envie só um anexo: novaImagemUrl ou novaImagemArquivo." }] };
          }
          const stored = await storeImages(novaImagemUrl ? [novaImagemUrl] : undefined, novaImagemArquivo ? [novaImagemArquivo] : undefined);
          if ("error" in stored) return { isError: true, content: [{ type: "text", text: stored.error }] };
          data.attachmentUrl = stored.urls[0];
          data.attachmentName = stored.names[0];
        }

        const updated = await prisma.task.update({
          where: { id: candidates[0].id },
          data,
          include: { assignee: { select: { name: true } }, creator: { select: { name: true } }, tag: true },
        });
        const dueDateLabel = updated.dueDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        const tagLabel = updated.tag ? ` | tag: ${updated.tag.name}` : "";
        return {
          content: [{
            type: "text",
            text: `Tarefa "${updated.title}" atualizada.${updated.description ? ` — ${updated.description}` : ""} | responsável: ${updated.assignee.name} | solicitado por: ${updated.creator.name} | prazo: ${dueDateLabel} | prioridade: ${updated.priority} | status: ${updated.status}${tagLabel}`,
          }],
        };
      }
    );

    server.registerTool(
      "marcar_retrabalho",
      {
        title: "Marcar retrabalho",
        description: "Marca uma tarefa (concluída ou não) como retrabalho, com o motivo, movendo-a de volta para pendente.",
        inputSchema: {
          titulo: z.string().describe("Título (ou parte dele) da tarefa"),
          responsavel: z.string().optional().describe("Nome do responsável, para desempatar quando mais de uma tarefa tem título parecido"),
          motivo: z.string().describe("Motivo do retrabalho, mostrado para quem executa a tarefa"),
          marcadoPor: z.string().describe("Nome de quem está marcando o retrabalho"),
        },
      },
      async ({ titulo, responsavel, motivo, marcadoPor }) => {
        let assigneeFilter: string | undefined;
        if (responsavel) {
          const assignee = await resolveUser(responsavel);
          if (!assignee) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei ninguém chamado "${responsavel}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
            };
          }
          assigneeFilter = assignee.id;
        }

        const marcador = await resolveUser(marcadoPor);
        if (!marcador) {
          const users = await prisma.user.findMany({ select: { name: true } });
          return {
            isError: true,
            content: [{ type: "text", text: `Não encontrei ninguém chamado "${marcadoPor}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
          };
        }

        const candidates = await prisma.task.findMany({
          where: {
            title: { contains: titulo, mode: "insensitive" },
            ...(assigneeFilter ? { assigneeId: assigneeFilter } : {}),
          },
          include: { assignee: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        });

        if (candidates.length === 0) {
          return { isError: true, content: [{ type: "text", text: `Nenhuma tarefa encontrada com "${titulo}" no título.` }] };
        }
        if (candidates.length > 1) {
          const lines = candidates.map((t) => `- "${t.title}" (responsável: ${t.assignee.name})`);
          return {
            isError: true,
            content: [{ type: "text", text: `Mais de uma tarefa encontrada com "${titulo}" — seja mais específico:\n${lines.join("\n")}` }],
          };
        }

        const task = candidates[0];
        const now = new Date();
        const updated = await prisma.task.update({
          where: { id: task.id },
          data: {
            isRework: true,
            reworkCount: { increment: 1 },
            reworkReason: motivo,
            status: "pending",
            completedAt: null,
            onTime: null,
            approved: false,
            approvedAt: null,
          },
          include: { assignee: { select: { name: true } } },
        });
        await prisma.statusHistory.create({
          data: {
            taskId: task.id,
            fromStatus: task.status,
            toStatus: "pending",
            changedById: marcador.id,
            changedAt: now,
            note: `Retrabalho: ${motivo}`,
          },
        });

        return {
          content: [{
            type: "text",
            text: `Tarefa "${updated.title}" marcada como retrabalho (${updated.reworkCount}ª vez) para ${updated.assignee.name}. Motivo: ${motivo}`,
          }],
        };
      }
    );

    server.registerTool(
      "criar_incidencia",
      {
        title: "Criar incidência",
        description: "Registra uma incidência no Clickfy (ex: página derrubada com campanhas ativas, falha de serviço, perda de receita), opcionalmente relacionada a uma pessoa.",
        inputSchema: {
          titulo: z.string().describe("Título da incidência"),
          descricao: z.string().optional().describe("Descrição detalhada do que aconteceu"),
          categoria: z.enum(INCIDENT_CATEGORY_VALUES).describe(INCIDENT_CATEGORY_HELP),
          severidade: z.enum(INCIDENT_SEVERITY_VALUES).describe("low, medium, high ou critical"),
          relacionadoA: z.string().optional().describe("Nome da pessoa relacionada à incidência (opcional)"),
          reportadoPor: z.string().describe("Nome de quem está reportando a incidência"),
          ocorreuEm: z.string().optional().describe("Data/hora em que ocorreu, formato YYYY-MM-DDTHH:mm horário de Brasília (padrão: agora)"),
          imagensUrls: z.array(imageUrlSchema).max(MAX_IMAGES).optional().describe("Links (http/https) de imagens/prints para anexar, até 10 (opcional)"),
          imagensArquivos: z.array(imageFileSchema).max(MAX_IMAGES).optional().describe("Imagens em base64 para anexar, até 10 no total com os links (opcional)"),
        },
      },
      async ({ titulo, descricao, categoria, severidade, relacionadoA, reportadoPor, ocorreuEm, imagensUrls, imagensArquivos }) => {
        const reporter = await resolveUser(reportadoPor);
        if (!reporter) {
          const users = await prisma.user.findMany({ select: { name: true } });
          return {
            isError: true,
            content: [{ type: "text", text: `Não encontrei ninguém chamado "${reportadoPor}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
          };
        }

        let relatedUserId: string | undefined;
        if (relacionadoA) {
          const related = await resolveUser(relacionadoA);
          if (!related) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei ninguém chamado "${relacionadoA}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
            };
          }
          relatedUserId = related.id;
        }

        const stored = await storeImages(imagensUrls, imagensArquivos);
        if ("error" in stored) return { isError: true, content: [{ type: "text", text: stored.error }] };

        const incident = await prisma.incident.create({
          data: {
            title: titulo,
            description: descricao || null,
            category: categoria,
            severity: severidade,
            occurredAt: ocorreuEm ? parseBrasiliaDateTime(ocorreuEm) : new Date(),
            reportedById: reporter.id,
            relatedUserId: relatedUserId || null,
            attachmentUrls: stored.urls,
            attachmentNames: stored.names,
          },
        });

        const occurredLabel = incident.occurredAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        return {
          content: [{
            type: "text",
            text: `Incidência "${incident.title}" registrada (categoria: ${incident.category}, severidade: ${incident.severity}, ocorreu em: ${occurredLabel})${stored.urls.length ? `, com ${stored.urls.length} imagem(ns)` : ""}.`,
          }],
        };
      }
    );

    server.registerTool(
      "listar_incidencias",
      {
        title: "Listar incidências",
        description: "Lista as incidências do Clickfy (mais recentes primeiro), opcionalmente por pessoa relacionada e/ou mês. Use antes de editar para ver os títulos exatos.",
        inputSchema: {
          relacionadoA: z.string().optional().describe("Nome da pessoa relacionada, para filtrar (opcional)"),
          mes: z.string().optional().describe("Mês no formato YYYY-MM, horário de Brasília (opcional)"),
        },
      },
      async ({ relacionadoA, mes }) => {
        const where: Record<string, unknown> = {};
        if (relacionadoA) {
          const related = await resolveUser(relacionadoA);
          if (!related) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return { isError: true, content: [{ type: "text", text: `Não encontrei ninguém chamado "${relacionadoA}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }] };
          }
          where.relatedUserId = related.id;
        }
        if (mes) {
          if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
            return { isError: true, content: [{ type: "text", text: `Mês inválido "${mes}". Use YYYY-MM, ex: 2026-10.` }] };
          }
          const [y, m] = mes.split("-").map(Number);
          const BRT = 3 * 60 * 60 * 1000;
          where.occurredAt = { gte: new Date(Date.UTC(y, m - 1, 1) + BRT), lt: new Date(Date.UTC(y, m, 1) + BRT) };
        }

        const incidents = await prisma.incident.findMany({
          where,
          include: { reportedBy: { select: { name: true } } },
          orderBy: { occurredAt: "desc" },
          take: 30,
        });
        if (incidents.length === 0) return { content: [{ type: "text", text: "Nenhuma incidência encontrada." }] };

        const users = await prisma.user.findMany({ select: { id: true, name: true } });
        const lines = incidents.map((i) => {
          const when = i.occurredAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
          const who = i.relatedUserId ? users.find((u) => u.id === i.relatedUserId)?.name ?? "?" : "sem pessoa";
          return `- "${i.title}"${i.description ? ` — ${i.description}` : ""} | ${when} | pessoa: ${who} | categoria: ${i.category} | severidade: ${i.severity} | reportado por: ${i.reportedBy.name} | imagens: ${i.attachmentUrls.length}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
    );

    server.registerTool(
      "editar_incidencia",
      {
        title: "Editar incidência",
        description: "Edita uma incidência existente (busca pelo título, aceita parte do texto): título, descrição, categoria, severidade, data, pessoa relacionada e imagens.",
        inputSchema: {
          titulo: z.string().describe("Título (ou parte dele) da incidência a editar"),
          relacionadoA: z.string().optional().describe("Pessoa relacionada atual, para desempatar quando há títulos parecidos"),
          novoTitulo: z.string().optional(),
          novaDescricao: z.string().optional(),
          novaCategoria: z.enum(INCIDENT_CATEGORY_VALUES).optional().describe(INCIDENT_CATEGORY_HELP),
          novaSeveridade: z.enum(INCIDENT_SEVERITY_VALUES).optional(),
          novaDataOcorrencia: z.string().optional().describe("Nova data/hora, formato YYYY-MM-DDTHH:mm horário de Brasília"),
          novaPessoaRelacionada: z.string().optional().describe("Nova pessoa relacionada; use \"nenhuma\" para desvincular"),
          adicionarImagensUrls: z.array(imageUrlSchema).max(MAX_IMAGES).optional().describe("Links (http/https) de imagens a adicionar às já existentes"),
          adicionarImagensArquivos: z.array(imageFileSchema).max(MAX_IMAGES).optional().describe("Imagens em base64 a adicionar às já existentes"),
          removerTodasImagens: z.boolean().optional().describe("true remove todas as imagens atuais (aplicado antes de adicionar as novas)"),
        },
      },
      async ({ titulo, relacionadoA, novoTitulo, novaDescricao, novaCategoria, novaSeveridade, novaDataOcorrencia, novaPessoaRelacionada, adicionarImagensUrls, adicionarImagensArquivos, removerTodasImagens }) => {
        const where: Record<string, unknown> = { title: { contains: titulo, mode: "insensitive" } };
        if (relacionadoA) {
          const related = await resolveUser(relacionadoA);
          if (!related) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return { isError: true, content: [{ type: "text", text: `Não encontrei ninguém chamado "${relacionadoA}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }] };
          }
          where.relatedUserId = related.id;
        }
        const candidates = await prisma.incident.findMany({ where, orderBy: { occurredAt: "desc" } });
        if (candidates.length === 0) {
          return { isError: true, content: [{ type: "text", text: `Nenhuma incidência encontrada com "${titulo}" no título.` }] };
        }
        if (candidates.length > 1) {
          const lines = candidates.map((c) => `- "${c.title}" (${c.occurredAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})`);
          return { isError: true, content: [{ type: "text", text: `Mais de uma incidência encontrada com "${titulo}" — seja mais específico:\n${lines.join("\n")}` }] };
        }
        const current = candidates[0];

        const data: Record<string, unknown> = {};
        if (novoTitulo) data.title = novoTitulo;
        if (novaDescricao !== undefined) data.description = novaDescricao || null;
        if (novaCategoria) data.category = novaCategoria;
        if (novaSeveridade) data.severity = novaSeveridade;
        if (novaDataOcorrencia) data.occurredAt = parseBrasiliaDateTime(novaDataOcorrencia);
        if (novaPessoaRelacionada) {
          if (normalize(novaPessoaRelacionada) === "nenhuma") {
            data.relatedUserId = null;
          } else {
            const related = await resolveUser(novaPessoaRelacionada);
            if (!related) {
              const users = await prisma.user.findMany({ select: { name: true } });
              return { isError: true, content: [{ type: "text", text: `Não encontrei ninguém chamado "${novaPessoaRelacionada}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }] };
            }
            data.relatedUserId = related.id;
          }
        }

        if (removerTodasImagens || adicionarImagensUrls?.length || adicionarImagensArquivos?.length) {
          const stored = await storeImages(adicionarImagensUrls, adicionarImagensArquivos);
          if ("error" in stored) return { isError: true, content: [{ type: "text", text: stored.error }] };
          const keptUrls = removerTodasImagens ? [] : current.attachmentUrls;
          const keptNames = removerTodasImagens ? [] : current.attachmentNames;
          if (keptUrls.length + stored.urls.length > MAX_IMAGES) {
            return { isError: true, content: [{ type: "text", text: `Máximo de ${MAX_IMAGES} imagens por incidência (já tem ${keptUrls.length}).` }] };
          }
          data.attachmentUrls = [...keptUrls, ...stored.urls];
          data.attachmentNames = [...keptNames, ...stored.names];
        }

        if (Object.keys(data).length === 0) {
          return { isError: true, content: [{ type: "text", text: "Nada para alterar: informe pelo menos um campo novo." }] };
        }

        const updated = await prisma.incident.update({ where: { id: current.id }, data });
        const when = updated.occurredAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        return {
          content: [{
            type: "text",
            text: `Incidência "${updated.title}" atualizada (categoria: ${updated.category}, severidade: ${updated.severity}, ocorreu em: ${when}, imagens: ${updated.attachmentUrls.length}).`,
          }],
        };
      }
    );

    server.registerTool(
      "criar_meta",
      {
        title: "Criar meta",
        description: "Cria uma meta no Clickfy, atribuída a uma pessoa (fica visível na aba Metas até ser marcada como concluída).",
        inputSchema: {
          titulo: z.string().describe("Título da meta"),
          descricao: z.string().optional().describe("Descrição opcional da meta"),
          responsavel: z.string().describe("Nome da pessoa responsável pela meta"),
          solicitadoPor: z.string().describe("Nome de quem está criando a meta"),
          mes: z.string().optional().describe("Mês da meta no formato YYYY-MM, ex: 2026-10 (padrão: mês atual)"),
        },
      },
      async ({ titulo, descricao, responsavel, solicitadoPor, mes }) => {
        const assignee = await resolveUser(responsavel);
        const creator = await resolveUser(solicitadoPor);

        if (!assignee || !creator) {
          const users = await prisma.user.findMany({ select: { name: true } });
          const names = users.map((u) => u.name).join(", ");
          const who = !assignee ? responsavel : solicitadoPor;
          return {
            isError: true,
            content: [{ type: "text", text: `Não encontrei ninguém chamado "${who}". Pessoas cadastradas: ${names}` }],
          };
        }
        if (mes !== undefined && !isValidMonth(mes)) {
          return { isError: true, content: [{ type: "text", text: `Mês inválido "${mes}". Use YYYY-MM, ex: 2026-10.` }] };
        }

        const goal = await prisma.goal.create({
          data: {
            title: titulo,
            description: descricao || null,
            assigneeId: assignee.id,
            creatorId: creator.id,
            month: mes ?? currentBrtMonth(),
          },
        });

        return {
          content: [{
            type: "text",
            text: `Meta "${goal.title}" criada para ${assignee.name}, solicitada por ${creator.name}, mês ${goal.month}.`,
          }],
        };
      }
    );

    server.registerTool(
      "listar_metas",
      {
        title: "Listar metas",
        description: "Lista as metas cadastradas no Clickfy, opcionalmente filtrando por responsável.",
        inputSchema: {
          responsavel: z.string().optional().describe("Nome da pessoa responsável, para filtrar (opcional)"),
        },
      },
      async ({ responsavel }) => {
        let assigneeId: string | undefined;
        if (responsavel) {
          const assignee = await resolveUser(responsavel);
          if (!assignee) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return {
              isError: true,
              content: [{ type: "text", text: `Não encontrei ninguém chamado "${responsavel}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }],
            };
          }
          assigneeId = assignee.id;
        }

        const goals = await prisma.goal.findMany({
          where: assigneeId ? { assigneeId } : {},
          include: { assignee: { select: { name: true } }, creator: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        });

        if (goals.length === 0) {
          return { content: [{ type: "text", text: "Nenhuma meta encontrada." }] };
        }

        const lines = goals.map((g) => {
          const status = g.completed ? "concluída" : "em aberto";
          return `- "${g.title}"${g.description ? ` — ${g.description}` : ""} | mês: ${goalMonth(g)} | responsável: ${g.assignee.name} | criada por: ${g.creator.name} | status: ${status}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
    );

    server.registerTool(
      "criar_tarefa_programada",
      {
        title: "Criar tarefa programada",
        description: "Cria uma tarefa recorrente: o Clickfy gera sozinho uma nova tarefa para o responsável no horário (Brasília) e nos dias escolhidos, ex: todo dia às 18:00.",
        inputSchema: {
          titulo: z.string().describe("Título da tarefa que será criada a cada ocorrência"),
          descricao: z.string().optional().describe("Descrição opcional"),
          responsavel: z.string().describe("Nome da pessoa que recebe a tarefa"),
          solicitadoPor: z.string().describe("Nome de quem está criando a programação"),
          horario: z.string().describe("Horário no formato HH:mm, horário de Brasília (ex: 18:00)"),
          dias: z.string().optional().describe('Dias da semana: "todos" (padrão), "uteis" (seg a sex) ou lista como "seg,qua,sex" (dom,seg,ter,qua,qui,sex,sab)'),
          prazoHoras: z.number().int().min(1).max(720).optional().describe("Prazo da tarefa em horas depois de criada (padrão: 24)"),
          prioridade: z.enum(PRIORITY_VALUES).optional().describe("low, medium, high ou urgent (padrão: medium)"),
          pais: z.string().optional().describe("Tag de país, ex: Colômbia, México (opcional)"),
        },
      },
      async ({ titulo, descricao, responsavel, solicitadoPor, horario, dias, prazoHoras, prioridade, pais }) => {
        const assignee = await resolveUser(responsavel);
        const creator = await resolveUser(solicitadoPor);
        if (!assignee || !creator) {
          const users = await prisma.user.findMany({ select: { name: true } });
          const who = !assignee ? responsavel : solicitadoPor;
          return { isError: true, content: [{ type: "text", text: `Não encontrei ninguém chamado "${who}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }] };
        }
        if (!isValidTimeOfDay(horario)) {
          return { isError: true, content: [{ type: "text", text: `Horário inválido "${horario}". Use HH:mm, ex: 18:00.` }] };
        }
        const daysOfWeek = dias ? parseWeekdays(dias) : [0, 1, 2, 3, 4, 5, 6];
        if (!daysOfWeek) {
          return { isError: true, content: [{ type: "text", text: `Não entendi os dias "${dias}". Use "todos", "uteis" ou uma lista como "seg,qua,sex".` }] };
        }
        let tagId: string | undefined;
        if (pais) {
          const tag = await resolveTag(pais);
          if (!tag) {
            const tags = await prisma.tag.findMany();
            return { isError: true, content: [{ type: "text", text: `Não encontrei a tag "${pais}". Tags cadastradas: ${tags.map((t) => t.name).join(", ")}` }] };
          }
          tagId = tag.id;
        }

        const schedule = await prisma.scheduledTask.create({
          data: {
            title: titulo,
            description: descricao || null,
            priority: prioridade || "medium",
            timeOfDay: horario,
            daysOfWeek,
            dueInHours: prazoHoras ?? 24,
            assigneeId: assignee.id,
            creatorId: creator.id,
            tagId,
          },
        });
        return {
          content: [{
            type: "text",
            text: `Tarefa programada "${schedule.title}" criada para ${assignee.name}: ${describeSchedule(schedule.timeOfDay, schedule.daysOfWeek)} (prazo de ${schedule.dueInHours}h). A primeira tarefa chega na próxima ocorrência do horário.`,
          }],
        };
      }
    );

    server.registerTool(
      "listar_tarefas_programadas",
      {
        title: "Listar tarefas programadas",
        description: "Lista as tarefas recorrentes cadastradas no Clickfy, opcionalmente filtrando por responsável.",
        inputSchema: {
          responsavel: z.string().optional().describe("Nome da pessoa responsável, para filtrar (opcional)"),
        },
      },
      async ({ responsavel }) => {
        let assigneeId: string | undefined;
        if (responsavel) {
          const assignee = await resolveUser(responsavel);
          if (!assignee) {
            const users = await prisma.user.findMany({ select: { name: true } });
            return { isError: true, content: [{ type: "text", text: `Não encontrei ninguém chamado "${responsavel}". Pessoas cadastradas: ${users.map((u) => u.name).join(", ")}` }] };
          }
          assigneeId = assignee.id;
        }
        const schedules = await prisma.scheduledTask.findMany({
          where: assigneeId ? { assigneeId } : {},
          include: { assignee: { select: { name: true } }, tag: true },
          orderBy: { createdAt: "desc" },
        });
        if (schedules.length === 0) return { content: [{ type: "text", text: "Nenhuma tarefa programada encontrada." }] };
        const lines = schedules.map((s) => {
          const tagLabel = s.tag ? ` | tag: ${s.tag.name}` : "";
          return `- "${s.title}" | responsável: ${s.assignee.name} | ${describeSchedule(s.timeOfDay, s.daysOfWeek)} | prazo: ${s.dueInHours}h | prioridade: ${s.priority} | ${s.active ? "ativa" : "pausada"}${tagLabel}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
    );

    server.registerTool(
      "alterar_tarefa_programada",
      {
        title: "Alterar tarefa programada",
        description: "Altera uma tarefa recorrente existente (busca pelo título): horário, dias, prazo, prioridade, título, descrição, ou pausa/retoma.",
        inputSchema: {
          titulo: z.string().describe("Título (ou parte dele) da tarefa programada"),
          responsavel: z.string().optional().describe("Nome do responsável, para desempatar títulos parecidos"),
          novoHorario: z.string().optional().describe("Novo horário HH:mm, horário de Brasília"),
          novosDias: z.string().optional().describe('Novos dias: "todos", "uteis" ou lista como "seg,qua,sex"'),
          novoPrazoHoras: z.number().int().min(1).max(720).optional(),
          novaPrioridade: z.enum(PRIORITY_VALUES).optional(),
          novoTitulo: z.string().optional(),
          novaDescricao: z.string().optional(),
          ativa: z.boolean().optional().describe("false pausa a programação, true retoma"),
        },
      },
      async ({ titulo, responsavel, novoHorario, novosDias, novoPrazoHoras, novaPrioridade, novoTitulo, novaDescricao, ativa }) => {
        const found = await findScheduledTask(titulo, responsavel);
        if (found.error !== undefined) return { isError: true, content: [{ type: "text", text: found.error }] };

        const data: Record<string, unknown> = {};
        if (novoHorario !== undefined) {
          if (!isValidTimeOfDay(novoHorario)) return { isError: true, content: [{ type: "text", text: `Horário inválido "${novoHorario}". Use HH:mm.` }] };
          data.timeOfDay = novoHorario;
        }
        if (novosDias !== undefined) {
          const days = parseWeekdays(novosDias);
          if (!days) return { isError: true, content: [{ type: "text", text: `Não entendi os dias "${novosDias}".` }] };
          data.daysOfWeek = days;
        }
        if (novoPrazoHoras !== undefined) data.dueInHours = novoPrazoHoras;
        if (novaPrioridade) data.priority = novaPrioridade;
        if (novoTitulo) data.title = novoTitulo;
        if (novaDescricao) data.description = novaDescricao;
        if (ativa !== undefined) data.active = ativa;

        const updated = await prisma.scheduledTask.update({
          where: { id: found.schedule.id },
          data,
          include: { assignee: { select: { name: true } } },
        });
        return {
          content: [{
            type: "text",
            text: `Tarefa programada "${updated.title}" atualizada: ${describeSchedule(updated.timeOfDay, updated.daysOfWeek)} | responsável: ${updated.assignee.name} | prazo: ${updated.dueInHours}h | ${updated.active ? "ativa" : "pausada"}.`,
          }],
        };
      }
    );

    server.registerTool(
      "excluir_tarefa_programada",
      {
        title: "Excluir tarefa programada",
        description: "Exclui uma tarefa recorrente (busca pelo título). As tarefas já geradas continuam; só param de ser criadas novas.",
        inputSchema: {
          titulo: z.string().describe("Título (ou parte dele) da tarefa programada"),
          responsavel: z.string().optional().describe("Nome do responsável, para desempatar títulos parecidos"),
        },
      },
      async ({ titulo, responsavel }) => {
        const found = await findScheduledTask(titulo, responsavel);
        if (found.error !== undefined) return { isError: true, content: [{ type: "text", text: found.error }] };
        await prisma.scheduledTask.delete({ where: { id: found.schedule.id } });
        return { content: [{ type: "text", text: `Tarefa programada "${found.schedule.title}" (${found.schedule.assignee.name}) excluída.` }] };
      }
    );

    server.registerTool(
      "listar_tags",
      {
        title: "Listar tags",
        description: "Lista as tags de país disponíveis no Clickfy para atribuir a uma tarefa.",
        inputSchema: {},
      },
      async () => {
        const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
        if (tags.length === 0) return { content: [{ type: "text", text: "Nenhuma tag cadastrada." }] };
        return { content: [{ type: "text", text: tags.map((t) => t.name).join("\n") }] };
      }
    );

    server.registerTool(
      "listar_pessoas",
      {
        title: "Listar pessoas",
        description: "Lista as pessoas cadastradas no Clickfy, com os nomes exatos disponíveis para atribuir tarefas.",
        inputSchema: {},
      },
      async () => {
        const users = await prisma.user.findMany({ select: { name: true, role: true } });
        return { content: [{ type: "text", text: users.map((u) => `${u.name} (${u.role})`).join("\n") }] };
      }
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

const authHandler = withMcpAuth(
  mcpHandler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;

    // Static service key — used by internal/legacy integrations.
    if (bearerToken === process.env.MCP_API_KEY) {
      return { token: bearerToken, clientId: "clickfy-service", scopes: ["tasks:write"] };
    }

    // OAuth access token issued via /api/oauth/token, tied to a logged-in user.
    const claims = verifyAccessToken(bearerToken);
    if (!claims) return undefined;
    return {
      token: bearerToken,
      clientId: claims.cid,
      scopes: ["tasks:write"],
      extra: { userId: claims.sub },
    };
  },
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource" }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
