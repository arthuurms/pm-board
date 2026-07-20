import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;

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
        },
      },
      async ({ titulo, descricao, responsavel, solicitadoPor, prazo, prioridade, pais }) => {
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
          },
        });

        await prisma.statusHistory.create({
          data: { taskId: task.id, fromStatus: null, toStatus: "pending", changedById: creator.id },
        });

        const dueDateLabel = dueDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        return {
          content: [{
            type: "text",
            text: `Tarefa "${titulo}" criada para ${assignee.name}, solicitada por ${creator.name}, prazo ${dueDateLabel}.`,
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
        },
      },
      async ({ titulo, responsavel, novoPrazo, novaPrioridade, novoTitulo, novaDescricao, novoPais }) => {
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

        const updated = await prisma.task.update({ where: { id: candidates[0].id }, data });
        const dueDateLabel = updated.dueDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        return {
          content: [{ type: "text", text: `Tarefa "${updated.title}" atualizada. Prazo: ${dueDateLabel}, prioridade: ${updated.priority}.` }],
        };
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
    if (!bearerToken || bearerToken !== process.env.MCP_API_KEY) return undefined;
    return { token: bearerToken, clientId: "clickfy", scopes: ["tasks:write"] };
  },
  { required: true }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
