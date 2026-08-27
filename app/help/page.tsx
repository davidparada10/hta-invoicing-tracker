import SiteHeader from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

const DRAW_COLOR = "#1d4ed8";
const BUDGET_COLOR = "#c2410c";
const SURFACE = "var(--card)";
const MUTED_SURFACE = "var(--muted)";
const BORDER = "var(--border)";
const INK = "var(--foreground)";
const MUTED_INK = "var(--muted-foreground)";
const DRAW_FILL = "var(--diagram-draw-fill)";
const BUDGET_FILL = "var(--diagram-budget-fill)";

export default function HelpPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">How the G702/G703 upload works</h1>
        <p className="text-sm text-muted-foreground max-w-2xl mb-8">
          Every G702/G703 draw workbook can fill two different things depending on which
          upload button you use: the <strong className="text-foreground">G702</strong> sheet
          auto-fills a single draw (accepts <strong className="text-foreground">.xlsx or .pdf</strong>),
          while the <strong className="text-foreground">G703</strong> continuation sheet
          replaces a project&rsquo;s entire schedule of values (
          <strong className="text-foreground">.xlsx only</strong> — its dense table isn&rsquo;t
          reliable to read from a PDF). Neither upload saves automatically — you review and
          confirm every value before it&rsquo;s stored.
        </p>

        <div className="rounded-xl border border-border bg-card p-5 mb-8 overflow-x-auto">
          <svg
            viewBox="0 0 1040 748"
            role="img"
            aria-label="Diagram showing a G702/G703 Excel workbook branching into two flows: the G702 sheet auto-fills an Owner Draw form which moves through draft, submitted, approved and paid status with a one-click Mark Paid shortcut and a re-upload path back to the form on lender rejection; the G703 sheet feeds a bulk schedule-of-values import that replaces all line items and rolls up into a contract value figure. Both flows converge on the project detail page."
            className="mx-auto min-w-[720px]"
          >
            <defs>
              <marker id="arrowDraw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={DRAW_COLOR} />
              </marker>
              <marker id="arrowBudget" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={BUDGET_COLOR} />
              </marker>
              <marker id="arrowNeutral" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={MUTED_INK} />
              </marker>
            </defs>

            <rect x="360" y="24" width="320" height="56" rx="10" fill={MUTED_SURFACE} stroke={BORDER} />
            <text x="520" y="47" textAnchor="middle" fontWeight="600" fontSize="13" fill={INK}>
              G702/G703 Draw Workbook
            </text>
            <text x="520" y="64" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fill={MUTED_INK}>
              uploaded from either tab — format depends on which
            </text>

            <line x1="450" y1="80" x2="300" y2="138" stroke={DRAW_COLOR} strokeWidth={1.6} markerEnd="url(#arrowDraw)" />
            <line x1="590" y1="80" x2="740" y2="138" stroke={BUDGET_COLOR} strokeWidth={1.6} markerEnd="url(#arrowBudget)" />

            <rect x="140" y="140" width="280" height="56" rx="10" fill={DRAW_FILL} stroke={DRAW_COLOR} strokeWidth={1.4} />
            <text x="280" y="163" textAnchor="middle" fontWeight="600" fontSize="13" fill={INK}>&quot;G702&quot; sheet</text>
            <text x="280" y="180" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fill={DRAW_COLOR}>
              application &amp; certificate — .xlsx or .pdf
            </text>

            <rect x="620" y="140" width="280" height="56" rx="10" fill={BUDGET_FILL} stroke={BUDGET_COLOR} strokeWidth={1.4} />
            <text x="760" y="163" textAnchor="middle" fontWeight="600" fontSize="13" fill={INK}>&quot;G703&quot; sheet</text>
            <text x="760" y="180" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" fill={BUDGET_COLOR}>
              schedule of values — .xlsx only
            </text>

            <line x1="280" y1="196" x2="280" y2="246" stroke={DRAW_COLOR} strokeWidth={1.6} markerEnd="url(#arrowDraw)" />
            <line x1="760" y1="196" x2="760" y2="246" stroke={BUDGET_COLOR} strokeWidth={1.6} markerEnd="url(#arrowBudget)" />

            <rect x="110" y="248" width="340" height="64" rx="10" fill={SURFACE} stroke={DRAW_COLOR} strokeWidth={1.4} />
            <text x="280" y="270" textAnchor="middle" fontWeight="600" fontSize="12.5" fill={INK}>Owner Draws tab — Add/Edit Draw</text>
            <text x="280" y="286" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>fills draw #, dates, requested $,</text>
            <text x="280" y="299" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>retainage — you review before saving</text>

            <rect x="610" y="248" width="340" height="64" rx="10" fill={SURFACE} stroke={BUDGET_COLOR} strokeWidth={1.4} />
            <text x="780" y="270" textAnchor="middle" fontWeight="600" fontSize="12.5" fill={INK}>Schedule of Values — Import from G702/G703</text>
            <text x="780" y="286" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>replaces ALL existing line items</text>
            <text x="780" y="299" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>— confirmation required if any exist</text>

            <line x1="780" y1="312" x2="780" y2="360" stroke={BUDGET_COLOR} strokeWidth={1.6} markerEnd="url(#arrowBudget)" />
            <rect x="610" y="362" width="340" height="52" rx="10" fill={BUDGET_FILL} stroke={BUDGET_COLOR} strokeWidth={1.4} />
            <text x="780" y="384" textAnchor="middle" fontWeight="600" fontSize="12.5" fill={INK}>One line per item</text>
            <text x="780" y="400" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={BUDGET_COLOR}>
              item # · category · description · scheduled value
            </text>

            <line x1="780" y1="414" x2="780" y2="462" stroke={BUDGET_COLOR} strokeWidth={1.6} markerEnd="url(#arrowBudget)" />
            <rect x="610" y="464" width="340" height="48" rx="10" fill={SURFACE} stroke={BORDER} />
            <text x="780" y="484" textAnchor="middle" fontWeight="600" fontSize="12.5" fill={INK}>Contract value rolls up</text>
            <text x="780" y="500" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>sum of every line&rsquo;s scheduled value</text>

            <line x1="280" y1="312" x2="280" y2="352" stroke={DRAW_COLOR} strokeWidth={1.6} markerEnd="url(#arrowDraw)" />

            <g fontFamily="ui-monospace, monospace" fontSize="10.5" fontWeight="600">
              <rect x="110" y="354" width="70" height="38" rx="8" fill={MUTED_SURFACE} stroke={BORDER} />
              <text x="145" y="378" textAnchor="middle" fill={MUTED_INK}>draft</text>

              <line x1="180" y1="373" x2="200" y2="373" stroke={MUTED_INK} strokeWidth={1.3} markerEnd="url(#arrowNeutral)" />
              <rect x="202" y="354" width="82" height="38" rx="8" fill={DRAW_FILL} stroke={DRAW_COLOR} />
              <text x="243" y="378" textAnchor="middle" fill={DRAW_COLOR}>submitted</text>

              <line x1="284" y1="373" x2="304" y2="373" stroke={MUTED_INK} strokeWidth={1.3} markerEnd="url(#arrowNeutral)" />
              <rect x="306" y="354" width="78" height="38" rx="8" fill={DRAW_FILL} stroke={DRAW_COLOR} />
              <text x="345" y="378" textAnchor="middle" fill={DRAW_COLOR}>approved</text>

              <line x1="384" y1="373" x2="404" y2="373" stroke={MUTED_INK} strokeWidth={1.3} markerEnd="url(#arrowNeutral)" />
              <rect x="406" y="354" width="60" height="38" rx="8" fill={MUTED_SURFACE} stroke={BORDER} />
              <text x="436" y="378" textAnchor="middle" fill={INK}>paid</text>
            </g>

            <path d="M 243 392 C 243 428, 436 428, 436 392" fill="none" stroke={DRAW_COLOR} strokeWidth={1.4} strokeDasharray="4 3" markerEnd="url(#arrowDraw)" />
            <text x="340" y="443" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fontWeight="600" fill={DRAW_COLOR}>
              &quot;Mark Paid&quot; — one click, no form
            </text>

            <path d="M 202 366 C 60 320, 60 300, 108 275" fill="none" stroke={MUTED_INK} strokeWidth={1.3} strokeDasharray="3 3" markerEnd="url(#arrowNeutral)" />
            <text x="10" y="330" fontFamily="ui-monospace, monospace" fontSize="10" fill={MUTED_INK}>lender rejects →</text>
            <text x="10" y="343" fontFamily="ui-monospace, monospace" fontSize="10" fill={MUTED_INK}>re-upload G702,</text>
            <text x="10" y="356" fontFamily="ui-monospace, monospace" fontSize="10" fill={MUTED_INK}>numbers overwrite</text>

            <line x1="280" y1="392" x2="280" y2="462" stroke={DRAW_COLOR} strokeWidth={1.6} markerEnd="url(#arrowDraw)" />
            <rect x="110" y="464" width="340" height="48" rx="10" fill={SURFACE} stroke={BORDER} />
            <text x="280" y="484" textAnchor="middle" fontWeight="600" fontSize="12.5" fill={INK}>Shows on the dashboard</text>
            <text x="280" y="500" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>
              &quot;Open Owner Draws&quot; — while submitted or approved
            </text>

            <line x1="280" y1="512" x2="450" y2="612" stroke={DRAW_COLOR} strokeWidth={1.4} markerEnd="url(#arrowDraw)" />
            <line x1="780" y1="512" x2="610" y2="612" stroke={BUDGET_COLOR} strokeWidth={1.4} markerEnd="url(#arrowBudget)" />

            <rect x="300" y="614" width="440" height="64" rx="10" fill={MUTED_SURFACE} stroke={BORDER} strokeWidth={1.4} />
            <text x="520" y="638" textAnchor="middle" fontWeight="600" fontSize="13" fill={INK}>Project Detail Page</text>
            <text x="520" y="656" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10.5" fill={MUTED_INK}>
              &quot;Total Paid to Date&quot;  next to  &quot;Currently Invoiced (Open)&quot;  next to  &quot;Contract Value&quot;
            </text>
          </svg>

          <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border max-w-2xl mx-auto">
            Uploading the same workbook from different tabs produces different results: the
            Owner Draws tab reads the G702 summary into one draw&rsquo;s fields for you to
            review before saving; the Schedule of Values tab reads the G703 continuation sheet and
            replaces the project&rsquo;s full line-item schedule in one pass.
          </p>
        </div>

        <div className="flex gap-6 text-xs text-muted-foreground mb-8">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: DRAW_COLOR }} />
            G702 → draw path
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: BUDGET_COLOR }} />
            G703 → schedule of values
          </span>
        </div>

        <h2 className="text-sm font-semibold text-foreground mb-1">What gets read from the G702 sheet</h2>
        <p className="text-xs text-muted-foreground mb-3">
          From .xlsx, read by AIA&rsquo;s standard G702 cell layout. From .pdf, read by searching
          the extracted text near each label below — a bit less exact, so always review before saving.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card mb-8">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Label on the form</th>
                <th className="text-left px-4 py-2">Reads from</th>
                <th className="text-left px-4 py-2">Fills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Row label="APPLICATION NO." cell="M3" field="draw_number" />
              <Row label="PERIOD TO" cell="M5" field="period_end" />
              <Row label="APPLICATION DATE" cell="M4" field="date_submitted" />
              <Row label="CURRENT PAYMENT DUE" cell="G36" field="amount_requested" />
              <Row label="Total Retainage" cell="G28" field="retainage_held" />
            </tbody>
          </table>
        </div>

        <h2 className="text-sm font-semibold text-foreground mb-1">What gets read from the G703 sheet</h2>
        <p className="text-xs text-muted-foreground mb-3">
          One row per schedule-of-values line, grouped under each &ldquo;DIVISION —&rdquo; header row.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">G703 column</th>
                <th className="text-left px-4 py-2">Reads</th>
                <th className="text-left px-4 py-2">Fills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Row label="A" cell="Line No." field="item_number" />
              <Row label="—" cell="nearest &quot;DIVISION —&quot; row above" field="category" />
              <Row label="B" cell="Description of Work" field="description" />
              <Row label="E" cell="Revised Contract Amt" field="scheduled_value" />
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function Row({ label, cell, field }: { label: string; cell: string; field: string }) {
  return (
    <tr>
      <td className="px-4 py-2 font-medium text-foreground">{label}</td>
      <td className="px-4 py-2 text-muted-foreground">
        <code className="font-mono text-xs bg-muted rounded px-1.5 py-0.5">{cell}</code>
      </td>
      <td className="px-4 py-2 font-mono text-xs text-foreground">{field}</td>
    </tr>
  );
}
