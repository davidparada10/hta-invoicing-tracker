import { OwnerDraw } from "@/lib/types";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";

const INVOICED_COLOR = "#1d4ed8";
const PAID_COLOR = "#047857";

interface MonthBucket {
  key: string;
  label: string;
  invoiced: number;
  paid: number;
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export default function MonthlyBillingChart({ draws }: { draws: OwnerDraw[] }) {
  const byMonth = new Map<string, MonthBucket>();

  for (const d of draws) {
    const dateStr = d.period_end ?? d.date_submitted ?? d.created_at;
    if (!dateStr) continue;
    const key = monthKey(dateStr);
    const bucket = byMonth.get(key) ?? { key, label: monthLabel(key), invoiced: 0, paid: 0 };
    bucket.invoiced += d.amount_requested ?? 0;
    bucket.paid += d.amount_paid ?? 0;
    byMonth.set(key, bucket);
  }

  const months = Array.from(byMonth.values()).sort((a, b) => a.key.localeCompare(b.key));

  if (months.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Monthly Billing</h2>
        <p className="text-sm text-slate-400 py-8 text-center">
          No draws yet — add one to see billing by month.
        </p>
      </div>
    );
  }

  const groupWidth = 84;
  const chartWidth = Math.max(520, months.length * groupWidth);
  const plotHeight = 200;
  const paddingLeft = 56;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 32;
  const width = chartWidth + paddingLeft + paddingRight;
  const height = plotHeight + paddingTop + paddingBottom;

  const maxValue = niceMax(Math.max(...months.map((m) => Math.max(m.invoiced, m.paid))));
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (maxValue / tickCount) * i);

  const scaleY = (v: number) => plotHeight - (v / maxValue) * plotHeight;
  const barWidth = 22;
  const barGap = 4;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900">Monthly Billing</h2>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: INVOICED_COLOR }} />
            Invoiced
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PAID_COLOR }} />
            Paid
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">By draw period — what was billed each month vs. paid so far.</p>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Bar chart of monthly billing showing amount invoiced versus amount paid for each draw period"
          style={{ minWidth: width, height: "auto" }}
        >
          <g transform={`translate(${paddingLeft},${paddingTop})`}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={0}
                  x2={chartWidth}
                  y1={scaleY(t)}
                  y2={scaleY(t)}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={scaleY(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10.5}
                  fill="#94A3B8"
                  fontFamily="ui-sans-serif, system-ui"
                >
                  {formatCurrencyCompact(t)}
                </text>
              </g>
            ))}

            {months.map((m, i) => {
              const groupX = i * groupWidth + (groupWidth - (barWidth * 2 + barGap)) / 2;
              const invoicedHeight = plotHeight - scaleY(m.invoiced);
              const paidHeight = plotHeight - scaleY(m.paid);
              return (
                <g key={m.key}>
                  <rect
                    x={groupX}
                    y={scaleY(m.invoiced)}
                    width={barWidth}
                    height={Math.max(invoicedHeight, 0)}
                    rx={4}
                    fill={INVOICED_COLOR}
                  >
                    <title>{`${m.label}: ${formatCurrency(m.invoiced)} invoiced`}</title>
                  </rect>
                  <rect
                    x={groupX + barWidth + barGap}
                    y={scaleY(m.paid)}
                    width={barWidth}
                    height={Math.max(paidHeight, 0)}
                    rx={4}
                    fill={PAID_COLOR}
                  >
                    <title>{`${m.label}: ${formatCurrency(m.paid)} paid`}</title>
                  </rect>
                  <text
                    x={groupX + barWidth + barGap / 2}
                    y={plotHeight + 18}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="#64748B"
                    fontFamily="ui-sans-serif, system-ui"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}

            <line x1={0} x2={chartWidth} y1={plotHeight} y2={plotHeight} stroke="#CBD5E1" strokeWidth={1} />
          </g>
        </svg>
      </div>
    </div>
  );
}
