import Link from "next/link";
import {
  BookOpen,
  MessageSquare,
  Bot,
  Send,
  CheckCircle2,
  ChevronRight,
  CalendarClock,
  Plus,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

const FLOW = [
  { icon: MessageSquare, title: "1. O pedido", text: "Alguém pede a tarefa: pelo botão Nova Tarefa, conversando com o Claude, ou ela já está programada." },
  { icon: Bot, title: "2. O robô monta", text: "Ele preenche os campos, acha a pessoa pelo nome e converte o prazo para o horário de Brasília." },
  { icon: Send, title: "3. Chega no responsável", text: "A tarefa aparece na hora no painel de Tarefas de quem vai fazer, no dia do prazo." },
  { icon: CheckCircle2, title: "4. Execução", text: "O responsável move para Em andamento e depois para Concluída. Quem pediu confere." },
];

const FIELDS = [
  { name: "Título", required: "Sim", how: "O que precisa ser feito, em uma frase." },
  { name: "Responsável", required: "Sim", how: "Quem vai fazer. O robô entende só o primeiro nome e ignora acento (\"breno\", \"robertao\"). Se não achar, ele mostra os nomes cadastrados." },
  { name: "Solicitado por", required: "Sim", how: "Quem está pedindo. É essa pessoa que confere a tarefa no final." },
  { name: "Prazo", required: "Sim", how: "Data e hora limite, sempre no horário de Brasília (ex: amanhã às 18h)." },
  { name: "Prioridade", required: "Não", how: "Baixa, Média, Alta ou Urgente. Se ninguém disser nada, fica Média." },
  { name: "País", required: "Não", how: "Etiqueta do país da operação (Colômbia, México...)." },
  { name: "Descrição", required: "Não", how: "Detalhes para quem vai executar." },
  { name: "Imagem", required: "Não", how: "Um link de imagem para anexar." },
];

const STATUS = [
  { label: "Pendente", color: "bg-gray-100 text-gray-700", text: "Ainda não começou." },
  { label: "Em andamento", color: "bg-yellow-100 text-yellow-700", text: "O responsável já está fazendo." },
  { label: "Concluída", color: "bg-green-100 text-green-700", text: "Terminou, com a print anexada. O sistema registra se foi dentro do prazo." },
];

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ComoFuncionaPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shrink-0">
          <BookOpen className="w-5 h-5 text-white" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Como funciona</h1>
          <p className="text-sm text-gray-500">O caminho de uma tarefa, do pedido até a conclusão, e o que o robô faz por você</p>
        </div>
      </div>

      <Section title="O caminho de uma tarefa">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {FLOW.map((s, i) => (
            <div key={s.title} className="relative bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center mb-3">
                <s.icon className="w-4.5 h-4.5" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">{s.title}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.text}</p>
              {i < FLOW.length - 1 && (
                <ChevronRight className="hidden md:block absolute -right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-400 z-10" />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="O que tem dentro de uma tarefa" subtitle="É isso que o robô precisa para montar a tarefa. O que for opcional ele deixa em branco ou usa o padrão.">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {FIELDS.map((f, i) => (
            <div key={f.name} className={`flex gap-4 px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}>
              <div className="w-36 shrink-0">
                <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                <span className={`text-[11px] font-semibold ${f.required === "Sim" ? "text-red-600" : "text-gray-400"}`}>
                  {f.required === "Sim" ? "Obrigatório" : "Opcional"}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{f.how}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Como o robô monta e envia" subtitle="Existem quatro jeitos de uma tarefa nascer. Em todos, ela cai direto no painel do responsável.">
        <div className="space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-violet-600" />
              <p className="font-semibold text-gray-900 text-sm">Pelo chat do Clickfy (Assistente)</p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Abra <Link href="/assistente" className="text-violet-700 font-medium hover:underline">Assistente</Link> no menu e cole o pedido do jeito que você escreveria, com o responsável,
              o dia, o horário e a prioridade no meio do texto. Quando o robô entende tudo, ele <b>cria a tarefa na hora</b>.
              Se faltar o responsável ou o prazo, ele mostra um cartão com o que entendeu e avisa o que falta: você completa no cartão ou escrevendo no chat (ex: &quot;amanhã 18h&quot;) e clica em <b>Criar tarefa</b>.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bot className="w-4 h-4 text-violet-600" />
              <p className="font-semibold text-gray-900 text-sm">Pedindo para o Claude</p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Você escreve o pedido do jeito que falaria com uma pessoa, por exemplo:
            </p>
            <p className="text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2 mt-2 leading-relaxed">
              &quot;Cria uma tarefa para o Breno: subir os criativos da Colômbia, prazo amanhã às 18h, prioridade alta.&quot;
            </p>
            <ol className="text-sm text-gray-600 mt-3 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>O robô separa o pedido nos campos da tabela acima.</li>
              <li>Procura o responsável e quem pediu pelo nome. Se faltar alguma informação, ele pergunta antes de criar.</li>
              <li>Cria a tarefa como <b>Pendente</b> e responde confirmando: para quem foi, quem pediu e o prazo.</li>
            </ol>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="w-4 h-4 text-violet-600" />
              <p className="font-semibold text-gray-900 text-sm">Tarefa programada (que se repete)</p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Para algo que precisa chegar sempre (ex: todo dia às 18:00), cadastre em{" "}
              <Link href="/tarefas-programadas" className="text-violet-700 font-medium hover:underline">Tarefas Programadas</Link>.
              O robô confere a cada minuto e, na hora marcada, cria a tarefa sozinho para o responsável. É uma por dia, por programação.
              A programação nova começa na próxima ocorrência do horário.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="w-4 h-4 text-violet-600" />
              <p className="font-semibold text-gray-900 text-sm">Pelo botão Nova Tarefa</p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Em <Link href="/tasks" className="text-violet-700 font-medium hover:underline">Tarefas</Link>, para quem tem permissão de criar.
              O formulário pede os mesmos campos.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Como a tarefa aparece para quem vai fazer" subtitle="A tela de Tarefas abre em Hoje e se atualiza sozinha a cada 15 segundos.">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3 text-sm text-gray-600 leading-relaxed">
          <p><b className="text-gray-900">Por dia:</b> a semana fica no topo com a quantidade de tarefas de cada dia. Clique num dia para ver o que vence nele, inclusive dias passados.</p>
          <p>
            <b className="text-red-600">Atrasada:</b>{" "}se o prazo passou e a tarefa não foi concluída, ela não fica presa no dia antigo. Aparece em Hoje, no topo, com a faixa vermelha
            &quot;ATRASADA HÁ N DIAS&quot; e valendo como prioridade máxima. A prioridade original continua guardada.
          </p>
          <p><b className="text-yellow-700">Em andamento:</b> acompanha você todos os dias, mesmo que o prazo seja mais para a frente, até ser concluída.</p>
          <p><b className="text-green-700">Concluídas:</b> as dos últimos 7 dias continuam na coluna Concluída. As do dia escolhido ficam com contorno verde, as outras esmaecidas.</p>
          <p>Use as abas <b className="text-gray-900">Atrasadas</b> e <b className="text-gray-900">Todas as tarefas</b> para ver tudo de uma vez.</p>
        </div>
      </Section>

      <Section title="Status e quem mexe em cada coisa">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          {STATUS.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>
              <p className="text-sm text-gray-600 mt-2">{s.text}</p>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3 text-sm text-gray-600 leading-relaxed">
          <p><b className="text-gray-900">Quem move:</b> o responsável pela tarefa (ou um admin). Quem só pediu a tarefa acompanha, mas não arrasta.</p>
          <p>
            <b className="text-gray-900">Para concluir:</b> é <b>obrigatório anexar a print</b> da tarefa feita (clique, arraste a imagem ou cole com Ctrl+V).
            Sem a print a tarefa não conclui. Ela fica salva na tarefa (botão &quot;Ver print&quot;) e vai para o Discord junto com o aviso, que marca quem pediu a tarefa.
          </p>
          <p>
            <b className="text-gray-900">Conferência:</b> quem pediu clica em <b>Tarefa correta</b> para aprovar, ou em{" "}
            <b className="inline-flex items-center gap-1"><RotateCcw className="w-3 h-3" />Retrabalho</b>, escrevendo o motivo. No retrabalho a tarefa volta para Pendente
            e mostra o motivo e quantas vezes já voltou.
          </p>
        </div>
      </Section>

      <Section title="Dúvidas comuns">
        <div className="space-y-2">
          <details className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 group">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">Minha tarefa não aparece em Hoje</summary>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Hoje mostra o que vence hoje, o que está atrasado e o que está em andamento. Se o prazo é em outro dia, clique nesse dia no calendário, ou use &quot;Todas as tarefas&quot;.
              Se você enxerga só as suas, confira se o filtro de pessoa não está em outra pessoa.
            </p>
          </details>
          <details className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" /> Por que a tarefa está vermelha e como Urgente?
            </summary>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Porque o prazo passou e ela ainda está aberta. Para não ser esquecida, vira a primeira da lista. Ao concluir, ela volta ao normal.
            </p>
          </details>
          <details className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">Não consigo concluir a tarefa</summary>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Para concluir é preciso anexar a print do que foi feito. Ao clicar em Concluir (ou arrastar para a coluna Concluída) abre uma janela: escolha a imagem, arraste ou cole com Ctrl+V.
              O botão só libera depois que a print estiver lá.
            </p>
          </details>
          <details className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-gray-900">O robô não achou a pessoa</summary>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              Ele responde com a lista de nomes cadastrados. Peça de novo usando um deles (o primeiro nome basta).
            </p>
          </details>
        </div>
      </Section>
    </div>
  );
}
