import SiteHeader from "@/components/SiteHeader";

export const dynamic = "force-dynamic";

type Category =
  | "trigger"
  | "ui"
  | "server"
  | "ai"
  | "data"
  | "decision"
  | "output";

const CATEGORY_STYLES: Record<Category, { dot: string; border: string; bg: string }> = {
  trigger: { dot: "bg-blue-500", border: "border-blue-200", bg: "bg-blue-50" },
  ui: { dot: "bg-indigo-500", border: "border-indigo-200", bg: "bg-indigo-50" },
  server: { dot: "bg-purple-500", border: "border-purple-200", bg: "bg-purple-50" },
  ai: { dot: "bg-violet-500", border: "border-violet-200", bg: "bg-violet-50" },
  data: { dot: "bg-emerald-500", border: "border-emerald-200", bg: "bg-emerald-50" },
  decision: { dot: "bg-amber-500", border: "border-amber-200", bg: "bg-amber-50" },
  output: { dot: "bg-slate-400", border: "border-slate-200", bg: "bg-slate-50" },
};

const CATEGORY_LABELS: Record<Category, string> = {
  trigger: "Trigger",
  ui: "UI / Page",
  server: "Server Action / Route",
  ai: "AI / Claude",
  data: "Data Store",
  decision: "Decision / Approval",
  output: "Output",
};

interface Step {
  icon: string;
  title: string;
  detail: string;
  category: Category;
  edgeLabel?: string;
}

function StepCard({ step }: { step: Step }) {
  const style = CATEGORY_STYLES[step.category];
  return (
    <div className={`shrink-0 w-44 rounded-lg border ${style.border} ${style.bg} p-3`}>
      <div className="text-lg mb-1">{step.icon}</div>
      <p className="text-xs font-semibold text-slate-900 leading-tight">{step.title}</p>
      <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{step.detail}</p>
    </div>
  );
}

function FlowRow({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-y-2 gap-x-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1">
          <StepCard step={step} />
          {i < steps.length - 1 && (
            <div className="flex flex-col items-center justify-center px-1 shrink-0 w-12">
              <span className="text-slate-300">→</span>
              {step.edgeLabel && (
                <span className="text-[10px] text-slate-400 text-center leading-tight">
                  {step.edgeLabel}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Flow({
  number,
  title,
  subtitle,
  steps,
}: {
  number: string;
  title: string;
  subtitle: string;
  steps: Step[];
}) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
        Flow {number}
      </p>
      <h3 className="text-sm font-semibold text-slate-900 mb-0.5">{title}</h3>
      <p className="text-xs text-slate-500 mb-3">{subtitle}</p>
      <FlowRow steps={steps} />
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
          HTA Construction &amp; Development
        </p>
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">
          Multi-Family Invoice Tracker — System Workflow
        </h1>
        <p className="text-sm text-slate-500 max-w-3xl mb-8">
          Seven flows: G702 draw upload · G703 schedule-of-values import · draw lifecycle &amp;
          Mark Paid (partial pay supported) · aging alerts &amp; collections filters · billing
          summary reporting · AI assistant (read + confirm-to-write) · passcode auth gate.
          Written for anyone who needs to pick up maintenance on this app.
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-10 text-xs text-slate-500">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${CATEGORY_STYLES[c].dot}`} />
              {CATEGORY_LABELS[c]}
            </span>
          ))}
        </div>

        <Flow
          number="1"
          title="G702 Draw Upload"
          subtitle="Owner Draws tab, on-demand — auto-fills the Add/Edit Draw form from .xlsx or .pdf"
          steps={[
            { icon: "👤", title: "Upload .xlsx or .pdf", detail: "Owner Draws tab, Add/Edit Draw modal", category: "trigger", edgeLabel: "detects format" },
            { icon: "❓", title: "Lender-portal PDF?", detail: "isLenderPortalPdfText() text-signature check", category: "decision", edgeLabel: "yes/no" },
            { icon: "📄", title: "parseG702FromXlsx/Pdf or parseLenderDrawFromPdf", detail: "lib/g702-parser.ts (AIA) or lib/lender-portal-parser.ts (Conventus/SwiftDraws)", category: "server", edgeLabel: "fills" },
            { icon: "⚠️", title: "SoV mismatch check", detail: "Warns if schedule-of-values total ≠ amount requested", category: "decision", edgeLabel: "confirm to override" },
            { icon: "📝", title: "Draw form", detail: "Controlled fields — user reviews", category: "ui", edgeLabel: "on Save" },
            { icon: "⚡", title: "upsertDraw", detail: "app/draws/actions.ts (Server Action)", category: "server", edgeLabel: "writes" },
            { icon: "🗄️", title: "inv_owner_draws", detail: "Supabase — insert or update by id", category: "data", edgeLabel: "revalidates" },
            { icon: "✅", title: "Page refreshed", detail: "Draws table + dashboard totals", category: "output" },
          ]}
        />

        <Flow
          number="2"
          title="G703 Schedule of Values Import"
          subtitle="Schedule of Values tab, on-demand — destructive: replaces every existing line item"
          steps={[
            { icon: "👤", title: "Upload .xlsx", detail: "Schedule of Values tab — Import button", category: "trigger", edgeLabel: "confirms" },
            { icon: "❓", title: "Lines exist?", detail: "Browser confirm() if project has any", category: "decision", edgeLabel: "yes/no" },
            { icon: "📄", title: "parseBudgetFromXlsx", detail: "lib/g702-parser.ts — walks G703 rows", category: "server", edgeLabel: "returns rows" },
            { icon: "⚡", title: "importBudgetFromXlsx", detail: "app/budget/actions.ts (Server Action)", category: "server", edgeLabel: "delete + insert" },
            { icon: "🗄️", title: "inv_project_budget_lines", detail: "Supabase — full replace, one project", category: "data", edgeLabel: "revalidates" },
            { icon: "✅", title: "Schedule of Values refreshed", detail: "Contract value + line table", category: "output" },
          ]}
        />

        <Flow
          number="3"
          title="Draw Lifecycle & Mark Paid"
          subtitle="draft → submitted → approved → paid — Mark Paid supports partial payments"
          steps={[
            { icon: "📝", title: "Draw created", detail: "status: draft or submitted", category: "ui", edgeLabel: "edit status" },
            { icon: "🔄", title: "submitted / approved", detail: "Edit Draw modal, manual status change", category: "decision", edgeLabel: "or" },
            { icon: "👤", title: "Mark Paid click", detail: "Opens a modal — amount received + date paid, defaults to full outstanding balance today", category: "trigger", edgeLabel: "calls" },
            { icon: "⚡", title: "markDrawPaid", detail: "amount_paid += received (accumulates); status always → paid", category: "server", edgeLabel: "writes" },
            { icon: "🗄️", title: "inv_owner_draws", detail: "status paid, but a short payment still counts as open", category: "data", edgeLabel: "checked by" },
            { icon: "✅", title: "openBalance()", detail: "lib/data.ts — max(0, requested − paid); underpaid draws stay in Open Draws", category: "output" },
          ]}
        />

        <Flow
          number="4"
          title="Aging Alerts & Collections Filters"
          subtitle="Open draws are bucketed by days-since-submission — no cron, computed on every page load"
          steps={[
            { icon: "🗄️", title: "getOpenDraws()", detail: "lib/data.ts — draws with a balance still owed", category: "data", edgeLabel: "each draw" },
            { icon: "⚡", title: "daysOpen / agingBucket", detail: "lib/aging.ts — pure functions, 0-30/31-60/61-90/90+ day buckets", category: "server", edgeLabel: "60+ days" },
            { icon: "🔔", title: "AgingAlertBanner", detail: "Dashboard banner — only renders when a draw is 61+ days old", category: "decision", edgeLabel: "click bucket" },
            { icon: "✅", title: "Filtered Open Draws", detail: "Bucket buttons + project Active/All toggle narrow both tables", category: "output" },
          ]}
        />

        <Flow
          number="5"
          title="Billing Summary Reporting"
          subtitle="/billing — read-only, cash-basis: billed by submission date, received by payment date"
          steps={[
            { icon: "👤", title: "Visit /billing", detail: "Optional ?year= query param, defaults to current year", category: "trigger", edgeLabel: "fetches" },
            { icon: "🗄️", title: "getAllDraws()", detail: "Same paginated helper the dashboard uses", category: "data", edgeLabel: "feeds" },
            { icon: "⚡", title: "buildBillingReport / buildProjectBillingBreakdown", detail: "lib/billing.ts — pure calc, no new tables", category: "server", edgeLabel: "returns" },
            { icon: "✅", title: "YTD/QTD by quarter + by project", detail: "Billed vs. received vs. outstanding, avg days to pay", category: "output" },
          ]}
        />

        <Flow
          number="6"
          title="AI Assistant"
          subtitle="/chat — reads run automatically; writes pause for user confirmation"
          steps={[
            { icon: "👤", title: "Ask or describe", detail: "\"What's paid on Aneta?\" or \"Add a draw...\"", category: "trigger", edgeLabel: "POST" },
            { icon: "⚡", title: "/api/chat", detail: "createAgentUIStreamResponse", category: "server", edgeLabel: "runs" },
            { icon: "🤖", title: "htaAgent (ToolLoopAgent)", detail: "lib/agents/hta-agent.ts · Claude via direct Anthropic API", category: "ai", edgeLabel: "picks a tool" },
            { icon: "🔍", title: "Read tool", detail: "listProjects / getOpenDraws / getProjectDetails — auto-runs", category: "server", edgeLabel: "or" },
            { icon: "✋", title: "Write tool proposed", detail: "createDraw / markDrawPaid (partial pay) / createBudgetLine", category: "decision", edgeLabel: "Confirm" },
            { icon: "🗄️", title: "Supabase write", detail: "Same tables as the manual forms use", category: "data", edgeLabel: "streams back" },
            { icon: "✅", title: "Chat reply", detail: "Plain-language summary of what happened", category: "output" },
          ]}
        />

        <Flow
          number="7"
          title="Passcode Auth Gate"
          subtitle="Every request except /login and static assets"
          steps={[
            { icon: "🌐", title: "Any request", detail: "middleware.ts intercepts", category: "trigger", edgeLabel: "checks" },
            { icon: "🔑", title: "Session cookie?", detail: "hta_inv_session — HMAC-signed, 30 day TTL", category: "decision", edgeLabel: "invalid" },
            { icon: "🔒", title: "Redirect to /login", detail: "Passcode form", category: "output", edgeLabel: "submits" },
            { icon: "⚡", title: "/api/login", detail: "verifyPasscode() against SITE_PASSCODE", category: "server", edgeLabel: "sets cookie" },
            { icon: "✅", title: "Session created", detail: "createSessionToken() — HMAC(expiry, SITE_PASSCODE)", category: "output" },
          ]}
        />

        <h2 className="text-sm font-semibold text-slate-900 mb-3 mt-10">Data Architecture</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          <DataTable
            icon="🏗️"
            name="inv_projects"
            fields="name · project_number (unique) · address · lender · status"
          />
          <DataTable
            icon="💵"
            name="inv_owner_draws"
            fields="project_id → draws to lender: amount_requested/approved/paid · retainage_held · dates · status"
          />
          <DataTable
            icon="📋"
            name="inv_project_budget_lines"
            fields="project_id → schedule of values: item_number · category · description · scheduled_value · retention_exempt"
          />
          <DataTable
            icon="🔗"
            name="inv_draw_line_allocations"
            fields="draw_id + budget_line_id → amount billed this period against that budget line"
          />
        </div>

        <h2 className="text-sm font-semibold text-slate-900 mb-3">Deployment &amp; Environment</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5 mb-10 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <Detail term="Hosting">Vercel — auto-deploys on push to GitHub `main`</Detail>
            <Detail term="Database">Supabase Postgres, project &ldquo;hta-multifamily-invoicing&rdquo;</Detail>
            <Detail term="Auth">Single shared passcode (no per-user accounts)</Detail>
            <Detail term="AI">
              Direct Anthropic API (@ai-sdk/anthropic) — not the Vercel AI Gateway, so no
              team billing card is required. Needs its own API key.
            </Detail>
            <Detail term="Required env vars">
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>,{" "}
              <code className="font-mono text-xs">SITE_PASSCODE</code>,{" "}
              <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>,{" "}
              <code className="font-mono text-xs">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
              (Places API — address autocomplete on Add/Edit Project; the field still works as
              plain text if this is missing)
            </Detail>
            <Detail term="Local dev">
              <code className="font-mono text-xs">vercel env pull</code> (per-environment —
              some vars are Preview/Production only) then{" "}
              <code className="font-mono text-xs">npm run dev</code>
            </Detail>
          </dl>
        </div>

        <h2 className="text-sm font-semibold text-slate-900 mb-3">Where Things Live</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6 text-sm">
          <dl className="space-y-2.5">
            <Detail term="app/*/page.tsx">Pages — dashboard, project detail, billing, chat, help, workflow (this page)</Detail>
            <Detail term="app/*/actions.ts">Every write — Server Actions called directly from client forms</Detail>
            <Detail term="lib/data.ts">Every read — all Supabase SELECT queries live here, including the paginated fetchAllRows() helper (PostgREST caps a plain select() at 1000 rows)</Detail>
            <Detail term="lib/g702-parser.ts">AIA G702/G703 Excel and PDF parsing (SheetJS + pdf-parse, fixed AIA cell layout)</Detail>
            <Detail term="lib/lender-portal-parser.ts">Alternate PDF format (Conventus/SwiftDraws-style lender portal exports), auto-detected by text signature — draw-only, does not import a schedule of values</Detail>
            <Detail term="lib/aging.ts">Days-open / aging-bucket math for the dashboard alert banner and Open Draws filters</Detail>
            <Detail term="lib/billing.ts">YTD/QTD billed-vs-received calc for the Billing Summary page</Detail>
            <Detail term="lib/agents/, lib/tools/">The AI assistant — agent definition and its tools</Detail>
            <Detail term="lib/auth/session.ts">Passcode session signing/verification</Detail>
            <Detail term="components/*Section.tsx">The CRUD table + modal for one entity (draws, schedule of values)</Detail>
            <Detail term="components/AddressAutocomplete.tsx">Google Places autocomplete for the project Address field, with a plain-text fallback</Detail>
            <Detail term="components/AgingAlertBanner.tsx, ProjectStatusSelect.tsx">Dashboard 60+ day alert; inline active/closed status dropdown</Detail>
          </dl>
        </div>
      </main>
    </div>
  );
}

function DataTable({ icon, name, fields }: { icon: string; name: string; fields: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="text-lg mb-1">{icon}</div>
      <p className="text-xs font-mono font-semibold text-slate-900">{name}</p>
      <p className="text-[11px] text-slate-600 mt-1 leading-snug">{fields}</p>
    </div>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-0.5">{term}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  );
}
