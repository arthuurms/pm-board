// Fixed catalog of quality-of-service incident reasons and their point values.
// Source: "Remuneração Suporte" doc — each point lost = R$100 off the monthly quality bonus.
// Not admin-editable via UI since it's tied to payroll math; change here and redeploy if it changes.
export interface QualityIncidentReason {
  key: string;
  label: string;
  points: number;
}

export const QUALITY_INCIDENT_REASONS: QualityIncidentReason[] = [
  { key: "duplicate_order", label: "Pedido duplicado enviado ao mesmo cliente", points: 1.0 },
  { key: "false_resolved", label: 'Atendimento marcado como "finalizado" sem ter sido realmente resolvido', points: 0.5 },
  { key: "return_caused", label: "Erro do atendente que gera devolução", points: 1.0 },
  { key: "poor_quality", label: "Má qualidade no atendimento (tom, educação, clareza)", points: 1.0 },
  { key: "no_team_communication", label: "Falta de comunicação com a equipe sobre a efetividade do produto", points: 0.5 },
  { key: "warranty_not_opened", label: "Garantia do cliente não aberta quando deveria, gerando prejuízo", points: 1.0 },
  { key: "carrier_no_response", label: "Novidade acumulada / sem resposta à transportadora por muito tempo", points: 0.5 },
  { key: "other_loss", label: "Prejuízo adicional causado à operação, não listado acima", points: 1.0 },
];

export function findQualityReason(key: string): QualityIncidentReason | undefined {
  return QUALITY_INCIDENT_REASONS.find((r) => r.key === key);
}
