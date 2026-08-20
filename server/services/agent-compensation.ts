import { casablancaDateString, casablancaToday } from "../utils/casablanca-time";

type AgentProfile = {
  id: number;
  username?: string | null;
  role?: string | null;
  paymentType?: string | null;
  paymentAmount?: number | null;
  isActive?: number | boolean | null;
  createdAt?: Date | string | null;
};

type AgentSetting = {
  agentId: number;
  commissionRate?: number | null;
};

type DeliveredOrder = {
  assignedToId?: number | string | null;
};

export type AgentCompensationLine = {
  agentId: number;
  agentName: string;
  paymentType: "fixed" | "commission";
  paymentAmount: number;
  commissionRate: number;
  deliveredCount: number;
  monthsCount: number;
  totalCostCents: number;
};

type CalculateAgentCompensationOptions = {
  agents: AgentProfile[];
  settings: AgentSetting[];
  deliveredOrders: DeliveredOrder[];
  dateFrom?: string;
  dateTo?: string;
  now?: Date;
};

function calendarDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : casablancaDateString(value);
  }
  const direct = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : casablancaDateString(parsed);
}

function monthIndex(date: string): number {
  const [year, month] = date.split("-").map(Number);
  return year * 12 + month - 1;
}

export function isFixedPaymentType(paymentType: string | null | undefined): boolean {
  const normalized = (paymentType ?? "").trim().toLowerCase();
  return normalized === "fixe" || normalized === "fixed";
}

export function countTouchedCalendarMonths(dateFrom: string, dateTo: string): number {
  const start = calendarDate(dateFrom);
  const end = calendarDate(dateTo);
  if (!start || !end || start > end) return 0;
  return monthIndex(end) - monthIndex(start) + 1;
}

export function variableCommissionCostCents(
  agent: Pick<AgentProfile, "paymentType"> | undefined,
  commissionRateDh: number,
): number {
  if (isFixedPaymentType(agent?.paymentType)) return 0;
  return Math.round(Number(commissionRateDh || 0) * 100);
}

export function calculateAgentCompensation({
  agents,
  settings,
  deliveredOrders,
  dateFrom,
  dateTo,
  now = new Date(),
}: CalculateAgentCompensationOptions): {
  lines: AgentCompensationLine[];
  commissionTotalCents: number;
  fixedTotalCents: number;
  totalCostCents: number;
} {
  const periodEnd = calendarDate(dateTo) ?? casablancaToday(now);
  const requestedStart = calendarDate(dateFrom);
  const rateByAgent = new Map(
    settings.map(setting => [Number(setting.agentId), Number(setting.commissionRate ?? 0)]),
  );
  const deliveredByAgent = new Map<number, number>();

  for (const order of deliveredOrders) {
    if (order.assignedToId == null) continue;
    const agentId = Number(order.assignedToId);
    if (!Number.isFinite(agentId)) continue;
    deliveredByAgent.set(agentId, (deliveredByAgent.get(agentId) ?? 0) + 1);
  }

  const lines: AgentCompensationLine[] = [];
  let commissionTotalCents = 0;
  let fixedTotalCents = 0;

  for (const agent of agents) {
    if (agent.role && agent.role !== "agent") continue;

    const agentId = Number(agent.id);
    const deliveredCount = deliveredByAgent.get(agentId) ?? 0;
    const fixed = isFixedPaymentType(agent.paymentType);
    const commissionRate = rateByAgent.get(agentId) ?? 0;
    const paymentAmount = Math.max(0, Number(agent.paymentAmount ?? 0));
    const activeNow = agent.isActive !== 0 && agent.isActive !== false;

    if (!fixed) {
      const totalCostCents = Math.round(commissionRate * 100 * deliveredCount);
      commissionTotalCents += totalCostCents;
      if (deliveredCount > 0) {
        lines.push({
          agentId,
          agentName: agent.username ?? `Agent ${agentId}`,
          paymentType: "commission",
          paymentAmount,
          commissionRate,
          deliveredCount,
          monthsCount: 0,
          totalCostCents,
        });
      }
      continue;
    }

    const createdDate = calendarDate(agent.createdAt);
    const effectiveStart = requestedStart && createdDate
      ? (requestedStart > createdDate ? requestedStart : createdDate)
      : requestedStart ?? createdDate ?? periodEnd;
    const monthsCount = countTouchedCalendarMonths(effectiveStart, periodEnd);
    const shouldInclude = monthsCount > 0 && (activeNow || deliveredCount > 0);
    if (!shouldInclude) continue;

    const totalCostCents = paymentAmount * monthsCount;
    fixedTotalCents += totalCostCents;
    lines.push({
      agentId,
      agentName: agent.username ?? `Agent ${agentId}`,
      paymentType: "fixed",
      paymentAmount,
      commissionRate: 0,
      deliveredCount,
      monthsCount,
      totalCostCents,
    });
  }

  return {
    lines,
    commissionTotalCents,
    fixedTotalCents,
    totalCostCents: commissionTotalCents + fixedTotalCents,
  };
}