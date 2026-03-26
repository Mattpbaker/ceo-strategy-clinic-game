"use client";

import { CompanyPerformanceSeries, MetricKey } from "@/lib/types";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export type PerformanceMetricKey = "total_score" | MetricKey;

const metricLabels: Record<PerformanceMetricKey, string> = {
  total_score: "Total Value",
  cash: "Cash",
  revenue_growth: "Revenue Growth",
  market_share: "Market Share",
  talent_morale: "Talent Morale",
  operational_resilience: "Operational Resilience",
  brand_reputation: "Brand Reputation",
  regulatory_risk: "Regulatory Risk"
};

interface CompanyPerformanceChartProps {
  series: CompanyPerformanceSeries | null;
  metric: PerformanceMetricKey;
  onMetricChange: (metric: PerformanceMetricKey) => void;
}

export function CompanyPerformanceChart({
  series,
  metric,
  onMetricChange
}: CompanyPerformanceChartProps): React.ReactElement {
  const chartData = useMemo(() => {
    if (!series) {
      return [];
    }

    return series.points.map((point) => ({
      round_number: point.round_number,
      label: `R${point.round_number}`,
      value: metric === "total_score" ? point.total_score : point.metrics[metric]
    }));
  }, [metric, series]);

  return (
    <article className="card chart-card">
      <div className="card-head split">
        <div>
          <h3>Value and Growth</h3>
          <p className="small">{series ? `Tracking ${series.company_name}` : "Company data unavailable"}</p>
        </div>
        <label className="chart-filter">
          Metric
          <select value={metric} onChange={(event) => onMetricChange(event.target.value as PerformanceMetricKey)}>
            {(Object.keys(metricLabels) as PerformanceMetricKey[]).map((key) => (
              <option key={key} value={key}>
                {metricLabels[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {series && chartData.length > 0 ? (
        <>
          <div className="chart-shell">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(34, 58, 74, 0.14)" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip
                  formatter={(value) =>
                    Array.isArray(value) ? value.join(", ") : Number(value ?? 0).toFixed(2)
                  }
                  labelFormatter={(label) => `Round ${String(label).replace("R", "")}`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#005f73"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {series.history_start_round && series.history_start_round > 1 ? (
            <p className="small">History starts from round {series.history_start_round}.</p>
          ) : null}
        </>
      ) : (
        <p className="small">Resolve rounds to populate performance history.</p>
      )}
    </article>
  );
}
