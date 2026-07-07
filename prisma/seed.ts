import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ALL_ACTIONS = [
  "create_task",
  "move_in_progress",
  "move_completed",
  "mark_rework",
  "create_incident",
  "manage_permissions",
];

async function main() {
  console.log("🌱 Seeding database...");

  // --- Users ---
  const adminPassword = await bcrypt.hash("admin123", 10);
  const userPassword = await bcrypt.hash("user123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@pm.com" },
    update: {},
    create: {
      name: "Ana Silva",
      email: "admin@pm.com",
      password: adminPassword,
      role: "admin",
      position: "Project Manager",
    },
  });

  const joao = await prisma.user.upsert({
    where: { email: "joao@pm.com" },
    update: {},
    create: {
      name: "João Costa",
      email: "joao@pm.com",
      password: userPassword,
      role: "collaborator",
      position: "Desenvolvedor Frontend",
    },
  });

  const maria = await prisma.user.upsert({
    where: { email: "maria@pm.com" },
    update: {},
    create: {
      name: "Maria Oliveira",
      email: "maria@pm.com",
      password: userPassword,
      role: "collaborator",
      position: "Desenvolvedora Backend",
    },
  });

  const carlos = await prisma.user.upsert({
    where: { email: "carlos@pm.com" },
    update: {},
    create: {
      name: "Carlos Lima",
      email: "carlos@pm.com",
      password: userPassword,
      role: "collaborator",
      position: "Designer UX",
    },
  });

  // --- Default permissions for admin (full access) ---
  for (const action of ALL_ACTIONS) {
    await prisma.userPermission.upsert({
      where: { userId_action: { userId: admin.id, action } },
      update: { granted: true },
      create: { userId: admin.id, action, granted: true },
    });
  }

  // Collaborator default: can move to in_progress and completed, no manage_permissions
  const collabActions = ["create_task", "move_in_progress", "move_completed", "mark_rework", "create_incident"];
  for (const user of [joao, maria, carlos]) {
    for (const action of collabActions) {
      await prisma.userPermission.upsert({
        where: { userId_action: { userId: user.id, action } },
        update: { granted: true },
        create: { userId: user.id, action, granted: true },
      });
    }
    await prisma.userPermission.upsert({
      where: { userId_action: { userId: user.id, action: "manage_permissions" } },
      update: { granted: false },
      create: { userId: user.id, action: "manage_permissions", granted: false },
    });
  }

  // --- Tasks ---
  const now = new Date();
  const past = (days: number) => new Date(now.getTime() - days * 86400000);
  const future = (days: number) => new Date(now.getTime() + days * 86400000);

  // Helper to create task with history
  async function createTask(data: {
    title: string;
    description?: string;
    priority: string;
    status: string;
    isRework?: boolean;
    dueDate: Date;
    startedAt?: Date;
    completedAt?: Date;
    onTime?: boolean;
    assigneeId: string;
    creatorId: string;
    originalTaskId?: string;
  }) {
    const task = await prisma.task.create({ data });

    await prisma.statusHistory.create({
      data: {
        taskId: task.id,
        fromStatus: null,
        toStatus: "pending",
        changedById: data.creatorId,
        changedAt: task.createdAt,
      },
    });

    if (data.startedAt) {
      await prisma.statusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: "pending",
          toStatus: "in_progress",
          changedById: data.assigneeId,
          changedAt: data.startedAt,
        },
      });
    }

    if (data.completedAt) {
      await prisma.statusHistory.create({
        data: {
          taskId: task.id,
          fromStatus: data.startedAt ? "in_progress" : "pending",
          toStatus: "completed",
          changedById: data.assigneeId,
          changedAt: data.completedAt,
        },
      });
    }

    return task;
  }

  // Pending tasks
  await createTask({
    title: "Configurar pipeline de CI/CD",
    description: "Implementar GitHub Actions para deploy automático em staging.",
    priority: "high",
    status: "pending",
    dueDate: future(5),
    assigneeId: joao.id,
    creatorId: admin.id,
  });

  await createTask({
    title: "Revisar layout do dashboard",
    description: "Ajustar responsividade e cores conforme novo guia de estilo.",
    priority: "medium",
    status: "pending",
    dueDate: future(3),
    assigneeId: carlos.id,
    creatorId: admin.id,
  });

  await createTask({
    title: "Implementar autenticação SSO",
    description: "Integrar com Google Workspace para login único.",
    priority: "urgent",
    status: "pending",
    dueDate: future(1),
    assigneeId: maria.id,
    creatorId: admin.id,
  });

  // In-progress tasks
  await createTask({
    title: "Migração do banco de dados para PostgreSQL",
    description: "Migrar dados do MySQL para PostgreSQL sem downtime.",
    priority: "high",
    status: "in_progress",
    dueDate: future(7),
    startedAt: past(2),
    assigneeId: maria.id,
    creatorId: admin.id,
  });

  await createTask({
    title: "Criar componentes de UI do sistema de notificações",
    priority: "medium",
    status: "in_progress",
    dueDate: future(4),
    startedAt: past(1),
    assigneeId: joao.id,
    creatorId: admin.id,
  });

  // Completed on time (this month)
  const t1 = await createTask({
    title: "Documentação da API REST",
    description: "Escrever documentação Swagger para todos os endpoints.",
    priority: "low",
    status: "completed",
    dueDate: past(3),
    startedAt: past(10),
    completedAt: past(4),
    onTime: true,
    assigneeId: joao.id,
    creatorId: admin.id,
  });

  await createTask({
    title: "Testes de integração do módulo de pagamento",
    priority: "high",
    status: "completed",
    dueDate: past(5),
    startedAt: past(15),
    completedAt: past(6),
    onTime: true,
    assigneeId: maria.id,
    creatorId: admin.id,
  });

  // Completed late
  await createTask({
    title: "Refatoração do módulo de relatórios",
    priority: "medium",
    status: "completed",
    dueDate: past(10),
    startedAt: past(20),
    completedAt: past(3),
    onTime: false,
    assigneeId: carlos.id,
    creatorId: admin.id,
  });

  // Rework task (linked to t1)
  await createTask({
    title: "Documentação da API REST — Correção",
    description: "Corrigir exemplos de request/response que estavam incorretos.",
    priority: "high",
    status: "completed",
    isRework: true,
    dueDate: past(1),
    startedAt: past(3),
    completedAt: past(2),
    onTime: true,
    assigneeId: joao.id,
    creatorId: admin.id,
    originalTaskId: t1.id,
  });

  // Another rework, not yet completed
  await createTask({
    title: "Testes E2E do checkout — Correção",
    description: "Os testes falharam em ambiente de homologação, necessário reescrever cenários.",
    priority: "urgent",
    status: "in_progress",
    isRework: true,
    dueDate: future(2),
    startedAt: past(1),
    assigneeId: maria.id,
    creatorId: admin.id,
  });

  // Previous month completed tasks (for trend charts)
  const prevMonth = (days: number) => new Date(now.getTime() - (30 + days) * 86400000);

  await createTask({
    title: "Implementar cache Redis",
    priority: "high",
    status: "completed",
    dueDate: prevMonth(5),
    startedAt: prevMonth(20),
    completedAt: prevMonth(6),
    onTime: true,
    assigneeId: maria.id,
    creatorId: admin.id,
  });

  await createTask({
    title: "Redesign da página de login",
    priority: "medium",
    status: "completed",
    dueDate: prevMonth(3),
    startedAt: prevMonth(15),
    completedAt: prevMonth(2),
    onTime: true,
    assigneeId: carlos.id,
    creatorId: admin.id,
  });

  await createTask({
    title: "Integração com API de CEP",
    priority: "low",
    status: "completed",
    isRework: true,
    dueDate: prevMonth(8),
    startedAt: prevMonth(18),
    completedAt: prevMonth(7),
    onTime: true,
    assigneeId: joao.id,
    creatorId: admin.id,
  });

  // --- Incidents ---
  await prisma.incident.createMany({
    data: [
      {
        title: "Plataforma fora do ar por 45 minutos",
        description: "Deploy com bug causou queda do servidor de produção. Rollback necessário.",
        category: "ops_down",
        severity: "critical",
        occurredAt: past(5),
        reportedById: admin.id,
        relatedUserId: maria.id,
      },
      {
        title: "Falha no envio de e-mails transacionais",
        description: "Serviço de e-mail ficou sem créditos, clientes não receberam confirmações de pedido.",
        category: "service_failure",
        severity: "high",
        occurredAt: past(12),
        reportedById: admin.id,
        relatedUserId: joao.id,
      },
      {
        title: "Automação de precificação gerou preços zerados",
        description: "Script de atualização de preços zerou 23 produtos por 2 horas, causando perda de receita.",
        category: "revenue_loss",
        severity: "critical",
        occurredAt: prevMonth(10),
        reportedById: admin.id,
        relatedUserId: carlos.id,
      },
    ],
  });

  console.log("✅ Seed concluído!");
  console.log("   Admin:  admin@pm.com / admin123");
  console.log("   Colabs: joao@pm.com / maria@pm.com / carlos@pm.com — senha: user123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
