"use client";
import clsx from "clsx";

interface Props {
  label: string;
  value: string | number;
  subtitle?: string;
  color?: "default" | "green" | "red" | "orange";
  icon?: React.ReactNode;
}

const COLORS = {
  default: "bg-white border-gray-200",
  green: "bg-green-50 border-green-200",
  red: "bg-red-50 border-red-200",
  orange: "bg-orange-50 border-orange-200",
};

const VALUE_COLORS = {
  default: "text-gray-900",
  green: "text-green-700",
  red: "text-red-700",
  orange: "text-orange-700",
};

export default function MetricCard({ label, value, subtitle, color = "default", icon }: Props) {
  return (
    <div className={clsx("rounded-xl border p-5 shadow-sm", COLORS[color])}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className={clsx("text-3xl font-bold mt-1", VALUE_COLORS[color])}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="text-gray-300 mt-0.5">{icon}</div>}
      </div>
    </div>
  );
}
