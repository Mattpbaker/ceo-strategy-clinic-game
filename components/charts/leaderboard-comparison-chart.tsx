"use client";

import { CompanyPerformanceSeries, ScoreBreakdown } from "@/lib/types";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface LeaderboardComparisonChartProps {
  series: CompanyPerformanceSeries[];
  leaderboard: ScoreBreakdown[];
}

const palette = [
  "#005f73",
  "#0a9396",
  "#94d2bd",
  "#ee9b00",
  "#ca6702",
  "#bb3e03",
  "#ae2012",
  "#3a86ff",
  "#4d908e",
  "#6a4c93"
];

export function LeaderboardComparisonChart({
  series,
  leaderboard
}: LeaderboardComparisonChartProps): React.ReactElement {
  const rankedIds = useMemo(() => {
    if (leaderboard.length > 0) {
      return [...leaderboard]
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.company_id);
    }

    return series.map((item) => item.company_id);
  }, [leaderboard, series]);

  const defaultVisibleIds = useMemo(() => rankedIds.slice(0, 5), [rankedIds]);
  const [visibleIds, setVisibleIds] = useState<string[]>(defaultVisibleIds);

  useEffect(() => {
    const availableIds = new Set(series.map((item) => item.company_id));
    setVisibleIds((previous) => {
      const cleaned = previous.filter((companyId) => availableIds.has(companyId));
      if (cleaned.length > 0) {
        return cleaned;
      }
      return defaultVisibleIds;
    });
  }, [defaultVisibleIds, series]);

  const companyById = useMemo(
    () => new Map(series.map((item) => [item.company_id, item])),
    [series]
  );

  const chartData = useMemo(() => {
    const rounds = new Set<number>();
    for (const item of series) {
      for (const point of item.points) {
        rounds.add(point.round_number);
      }
    }

    return [...rounds]
      .sort((a, b) => a - b)
      .map((roundNumber) => {
        const row: Record<string, number | string> = {
          round_number: roundNumber,
          label: `R${roundNumber}`
        };

        for (const item of series) {
          const point = item.points.find((entry) => entry.round_number === roundNumber);
          if (point) {
            row[item.company_id] = point.total_score;
          }
        }

        return row;
      });
  }, [series]);

  function toggleCompany(companyId: string): void {
    setVisibleIds((previous) => {
      if (previous.includes(companyId)) {
        return previous.filter((item) => item !== companyId);
      }
      return [...previous, companyId];
    });
  }

  return (
    <article className="card chart-card">
      <div className="card-head">
        <h3>Comparative Value Growth</h3>
        <p className="small">Default view shows top 5 companies by current rank.</p>
      </div>

      {chartData.length > 0 ? (
        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={280}>
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
              {visibleIds.map((companyId, index) => {
                const company = companyById.get(companyId);
                if (!company) {
                  return null;
                }

                return (
                  <Line
                    key={companyId}
                    type="monotone"
                    dataKey={companyId}
                    name={company.company_name}
                    stroke={palette[index % palette.length]}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="small">No historical data yet.</p>
      )}

      <div className="legend-toggle">
        {rankedIds.map((companyId) => {
          const company = companyById.get(companyId);
          if (!company) {
            return null;
          }

          const isActive = visibleIds.includes(companyId);
          return (
            <button
              key={companyId}
              className={`secondary legend-btn ${isActive ? "active" : ""}`}
              onClick={() => toggleCompany(companyId)}
              type="button"
            >
              {company.company_name}
            </button>
          );
        })}
      </div>
    </article>
  );
}
