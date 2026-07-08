type TaskEmbedData = {
  title: string;
  description: string | null;
  priority: string;
  assigneeName: string;
  creatorName: string;
  dueDate: Date;
  completedAt: Date;
  onTime: boolean | null;
  isRework: boolean;
  reworkCount: number;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

// Maps first names to Discord user IDs so they can be @mentioned/pinged in notifications.
const DISCORD_USER_IDS: Record<string, string> = {
  arthur: "247150885489213441",
  samuel: "464125101290291200",
  breno: "269154305355808770",
  roberto: "1143010629725192253",
  vitor: "1358485145354633339",
};

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function discordIdForName(name: string): string | undefined {
  const firstName = normalize(name).split(" ")[0];
  return DISCORD_USER_IDS[firstName];
}

// Mention text for use in the embed body (renders as a clickable @name but does not ping).
function mentionOrName(name: string): string {
  const id = discordIdForName(name);
  return id ? `<@${id}>` : name;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function buildEmbed(task: TaskEmbedData, analysis: "pending" | "approved") {
  const onTime = task.onTime ?? task.completedAt <= task.dueDate;

  const fields = [
    { name: "Responsável", value: mentionOrName(task.assigneeName), inline: true },
    { name: "Solicitado por", value: mentionOrName(task.creatorName), inline: true },
    { name: "Prioridade", value: PRIORITY_LABELS[task.priority] ?? task.priority, inline: true },
    { name: "Prazo", value: formatDateTime(task.dueDate), inline: true },
    { name: "Concluída em", value: formatDateTime(task.completedAt), inline: true },
    { name: "No prazo?", value: onTime ? "✅ Sim" : "⚠️ Não, atrasada", inline: true },
    {
      name: "Análise",
      value: analysis === "approved" ? "✅ Tarefa correta" : "🔍 Em análise",
      inline: true,
    },
  ];

  if (task.isRework) {
    fields.push({
      name: "Retrabalho",
      value: `Sim (${task.reworkCount}x)`,
      inline: true,
    });
  }

  return {
    title: `✅ Tarefa concluída: ${task.title}`,
    description: task.description || "_Sem descrição_",
    color: analysis === "approved" ? 0x22c55e : onTime ? 0x3b82f6 : 0xef4444,
    fields,
    footer: {
      text: analysis === "approved"
        ? "Aprovada pelo solicitante."
        : "Acesse o aplicativo para revisar e marcar se está correta ou se precisa de retrabalho.",
    },
    timestamp: task.completedAt.toISOString(),
  };
}

// Posts the completion notification and returns the Discord message ID (for later editing), or null on failure.
export async function notifyTaskCompleted(task: TaskEmbedData): Promise<string | null> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return null;

  const embed = buildEmbed(task, "pending");
  const creatorMention = mentionOrName(task.creatorName);
  const content = `${creatorMention} sua tarefa foi concluída!`;

  try {
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, embeds: [embed] }),
    });
    if (!res.ok) {
      console.error("Discord webhook failed:", res.status, await res.text());
      return null;
    }
    const message = await res.json();
    return message.id ?? null;
  } catch (err) {
    console.error("Discord webhook error:", err);
    return null;
  }
}

// Edits a previously sent completion message to mark it as approved ("Tarefa correta").
export async function notifyTaskApproved(messageId: string, task: TaskEmbedData): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const embed = buildEmbed(task, "approved");

  try {
    const res = await fetch(`${webhookUrl}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.error("Discord message edit failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Discord message edit error:", err);
  }
}
