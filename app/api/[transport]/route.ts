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
        },
      },
      async ({ titulo, descricao, responsavel, solicitadoPor, prazo, prioridade }) => {
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

        const dueDate = parseBrasiliaDateTime(prazo);
        const task = await prisma.task.create({
          data: {
            title: titulo,
            description: descricao || null,
            priority: prioridade || "medium",
            dueDate,
            assigneeId: assignee.id,
            creatorId: creator.id,
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
          include: { assignee: { select: { name: true } }, creator: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        });

        if (tasks.length === 0) {
          return { content: [{ type: "text", text: "Nenhuma tarefa encontrada." }] };
        }

        const lines = tasks.map((t) => {
          const dueDateLabel = t.dueDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
          return `- "${t.title}"${t.description ? ` — ${t.description}` : ""} | responsável: ${t.assignee.name} | solicitado por: ${t.creator.name} | prazo: ${dueDateLabel} | status: ${t.status}`;
        });
        return { content: [{ type: "text", text: lines.join("\n") }] };
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
