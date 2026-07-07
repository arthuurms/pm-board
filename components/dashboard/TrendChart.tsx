"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface TrendPoint {
  month: string;
  label: string;
  reworkRate: number;
  slaRate: number;
  incidents: number;
}

interface Props {
  data: TrendPoint[];
}

export function ReworkSLAChart({ data }: Props) {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Retrabalho vs SLA de Entrega (% — últimos 6 meses)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip formatter={(v) => `${v}%`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="slaRate"
            name="SLA no Prazo"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="reworkRate"
            name="Taxa Retrabalho"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IncidentsChart({ data }: Props) {
  return (
    <div className="bg-white rounded-xl border p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Incidentes Críticos por Mês</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="incidents" name="Incidentes" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
