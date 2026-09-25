import { OwnerDraw } from "@/lib/types";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { buildMonthlyBillingBuckets, niceMax } from "@/lib/monthlyBilling";

const INVOICED_COLOR = "var(--billed)";
const PAID_COLOR = "var(--paid)";

export default function MonthlyBillingChart({ draws }: { draws: OwnerDraw[] }) {
  const months = buildMonthlyBillingBuckets(draws);

  if (months.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Monthly Billing</h2>
        <p className="text-sm text-muted-foreground py-8 text-center">
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
    <div className="rounded-xl border border-border bg-card p-5 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-foreground">Monthly Billing</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
      <p className="text-xs text-muted-foreground mb-3">
        Invoiced by submission date, paid by payment date — the two can land in different months.
      </p>

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
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={-8}
                  y={scaleY(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10.5}
                  fill="var(--muted-foreground)"
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
                    fill="var(--muted-foreground)"
                    fontFamily="ui-sans-serif, system-ui"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}

            <line x1={0} x2={chartWidth} y1={plotHeight} y2={plotHeight} stroke="var(--border)" strokeWidth={1} />
          </g>
        </svg>
      </div>
    </div>
  );
}
