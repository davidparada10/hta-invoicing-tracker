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
  trigger: { dot: "bg-blue-500", border: "border-blue-200 dark:border-blue-800", bg: "bg-blue-50 dark:bg-blue-950/40" },
  ui: { dot: "bg-indigo-500", border: "border-indigo-200 dark:border-indigo-800", bg: "bg-indigo-50 dark:bg-indigo-950/40" },
  server: { dot: "bg-purple-500", border: "border-purple-200 dark:border-purple-800", bg: "bg-purple-50 dark:bg-purple-950/40" },
  ai: { dot: "bg-violet-500", border: "border-violet-200 dark:border-violet-800", bg: "bg-violet-50 dark:bg-violet-950/40" },
  data: { dot: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-800", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  decision: { dot: "bg-amber-500", border: "border-amber-200 dark:border-amber-800", bg: "bg-amber-50 dark:bg-amber-950/40" },
  output: { dot: "bg-slate-400", border: "border-border", bg: "bg-muted" },
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
      <p className="text-xs font-semibold text-foreground leading-tight">{step.title}</p>
      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{step.detail}</p>
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
              <span className="text-muted-foreground">→</span>
              {step.edgeLabel && (
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
        Flow {number}
      </p>
      <h3 className="text-sm font-semibold text-foreground mb-0.5">{title}</h3>
      <p className="text-xs text-muted-foreground mb-3">{subtitle}</p>
      <FlowRow steps={steps} />
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-24 sm:pb-8">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          HTA Construction &amp; Development
        </p>
        <h1 className="text-2xl font-semibold text-foreground mb-1">
          Multi-Family Invoice Tracker — System Workflow
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl mb-8">
          Eight flows: G702 draw upload · G703 schedule-of-values import · draw lifecycle &amp;
          Mark Paid (partial pay supported) · aging alerts &amp; collections filters · billing
          summary reporting · AI assistant (read + confirm-to-write) · recurring draw-cadence
          reminders · passcode auth gate. Written for anyone who needs to pick up maintenance on
          this app.
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-2 mb-10 text-xs text-muted-foreground">
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
            { icon: "⚠️", title: "SoV mismatch check", detail: "Warns if schedule-of-values total ≠ amount requested + retainage held", category: "decision", edgeLabel: "confirm to override" },
            { icon: "📝", title: "Draw form", detail: "Controlled fields — user reviews", category: "ui", edgeLabel: "on Save" },
            { icon: "⚡", title: "upsertDraw", detail: "app/draws/actions.ts (Server Action)", category: "server", edgeLabel: "writes" },
            { icon: "🗄️", title: "inv_owner_draws", detail: "Supabase — insert or update by id", category: "data", edgeLabel: "revalidates" },
            { icon: "✅", title: "Page refreshed", detail: "Draws table + dashboard totals", category: "output" },
          ]}
        />

        <Flow
          number="2"
          title="G703 Schedule of Values Import"
          subtitle="Schedule of Values tab, on-demand — matches by item #, so history on unchanged lines survives"
          steps={[
            { icon: "👤", title: "Upload .xlsx", detail: "Schedule of Values tab — Import button", category: "trigger", edgeLabel: "confirms" },
            { icon: "❓", title: "Lines exist?", detail: "Browser confirm() if project has any", category: "decision", edgeLabel: "yes/no" },
            { icon: "📄", title: "parseBudgetFromXlsx", detail: "lib/g702-parser.ts — walks G703 rows", category: "server", edgeLabel: "returns rows" },
            { icon: "⚡", title: "importBudgetFromXlsx", detail: "app/budget/actions.ts — matches incoming rows to existing ones by item_number", category: "server", edgeLabel: "update/insert/delete" },
            { icon: "🗄️", title: "inv_project_budget_lines", detail: "Supabase — item numbers still present are updated in place (keeping their ID, so draw allocations tied to them survive); only items dropped from the file are deleted", category: "data", edgeLabel: "revalidates" },
            { icon: "✅", title: "Schedule of Values refreshed", detail: "Contract value + line table", category: "output" },
          ]}
        />

        <Flow
          number="3"
          title="Draw Lifecycle & Mark Paid"
          subtitle="draft → submitted → approved → paid — Mark Paid supports partial payments"
          steps={[
            { icon: "📝", title: "Draw created", detail: "status: draft or submitted", category: "ui", edgeLabel: "edit status" },
            { icon: "🔄", title: "submitted / approved", detail: "Quick status dropdown or Edit Draw modal — either path stamps date_submitted/date_approved to today on the actual transition into that status (not just \"if empty\"), since a still-draft draw can already carry a parser-guessed date that isn't a real submission/approval date. A date typed directly into the Edit Draw form is respected instead.", category: "decision", edgeLabel: "or" },
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
            { icon: "🚦", title: "Rate limit check", detail: "inv_chat_rate_limit by IP — 30 requests/5min, bounds Anthropic API cost since there's no per-user auth", category: "decision", edgeLabel: "not limited" },
            { icon: "⚡", title: "/api/chat", detail: "createAgentUIStreamResponse", category: "server", edgeLabel: "runs" },
            { icon: "🤖", title: "htaAgent (ToolLoopAgent)", detail: "lib/agents/hta-agent.ts · Claude via direct Anthropic API", category: "ai", edgeLabel: "picks a tool" },
            { icon: "🔍", title: "Read tool", detail: "listProjects / getOpenDraws / getProjectDetails / getRecentPayments / getAgingSummary / getBillingSummary / getScheduleOfValues / getDrawScheduleStatus — auto-runs", category: "server", edgeLabel: "or" },
            { icon: "✋", title: "Write tool proposed", detail: "createDraw / updateDraw / markDrawPaid (partial pay) / createBudgetLine", category: "decision", edgeLabel: "Confirm" },
            { icon: "🗄️", title: "Supabase write", detail: "Same tables as the manual forms use", category: "data", edgeLabel: "streams back" },
            { icon: "✅", title: "Chat reply", detail: "Plain-language summary of what happened", category: "output" },
          ]}
        />

        <Flow
          number="7"
          title="Recurring Draw-Cadence Reminders"
          subtitle="Dashboard + AI assistant — flags a project that hasn't had a draw started yet this cycle"
          steps={[
            { icon: "👤", title: "Set cadence", detail: "Add/Edit Project — day-of-month, or last weekday of the month", category: "trigger", edgeLabel: "validates" },
            { icon: "🗄️", title: "inv_projects", detail: "draw_due_type / draw_due_day — null means no cadence tracked", category: "data", edgeLabel: "read every load" },
            { icon: "⚡", title: "lib/drawSchedule.ts", detail: "Resolves this cycle's real due date; a weekend day-of-month rolls back to the prior Friday; pure, no stored date", category: "server", edgeLabel: "checks" },
            { icon: "❓", title: "Draw covers this cycle?", detail: "Matched by the draw's period_end/date_submitted, not when the record was created", category: "decision", edgeLabel: "no, due soon" },
            { icon: "🔔", title: "Alert banner + Next Draw column", detail: "Amber from 5 days out, through overdue; clears active-only", category: "output", edgeLabel: "also feeds" },
            { icon: "🤖", title: "getDrawScheduleStatus", detail: "Same status folded into the AI assistant's 'what needs work' answers", category: "ai" },
          ]}
        />

        <Flow
          number="8"
          title="Passcode Auth Gate"
          subtitle="Every request except /login and static assets — backed by RLS at the DB layer, not just the app layer"
          steps={[
            { icon: "🌐", title: "Any request", detail: "middleware.ts intercepts", category: "trigger", edgeLabel: "checks" },
            { icon: "🔑", title: "Session cookie?", detail: "hta_inv_session — HMAC-signed, 30 day TTL", category: "decision", edgeLabel: "invalid" },
            { icon: "🔒", title: "Redirect to /login", detail: "Passcode form", category: "output", edgeLabel: "submits" },
            { icon: "🚦", title: "Rate limit check", detail: "inv_login_attempts by IP — 10 failures/15min locks that IP out for 15min, even against a correct passcode", category: "decision", edgeLabel: "not locked" },
            { icon: "⚡", title: "/api/login", detail: "verifyPasscode() against SITE_PASSCODE", category: "server", edgeLabel: "sets cookie" },
            { icon: "✅", title: "Session created", detail: "createSessionToken() — HMAC(expiry, SITE_PASSCODE); a success clears the IP's attempt counter", category: "output" },
          ]}
        />

        <h2 className="text-sm font-semibold text-foreground mb-3 mt-10">Data Architecture</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10">
          <DataTable
            icon="🏗️"
            name="inv_projects"
            fields="name · project_number (unique) · address · lender · status · draw_due_type/draw_due_day (recurring draw cadence)"
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
          <DataTable
            icon="🚦"
            name="inv_login_attempts"
            fields="ip (PK) · failed_count · window_start · locked_until — throttles brute-forcing SITE_PASSCODE"
          />
          <DataTable
            icon="🚦"
            name="inv_chat_rate_limit"
            fields="ip (PK) · request_count · window_start — bounds Anthropic API cost on /api/chat"
          />
        </div>

        <h2 className="text-sm font-semibold text-foreground mb-3">Deployment &amp; Environment</h2>
        <div className="rounded-xl border border-border bg-card p-5 mb-10 text-sm">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <Detail term="Hosting">Vercel — auto-deploys on push to GitHub `main`</Detail>
            <Detail term="Database">Supabase Postgres, project &ldquo;hta-multifamily-invoicing&rdquo;</Detail>
            <Detail term="Auth">
              Single shared passcode (no per-user accounts). This only gates the Next.js
              pages/routes — Supabase&rsquo;s REST API is a separately internet-reachable
              service, so every table also has Row Level Security enabled with no policy
              for <code className="font-mono text-xs">anon</code>/
              <code className="font-mono text-xs">authenticated</code> (default-deny). The
              server uses the service-role key, which bypasses RLS by design and is never
              exposed to the browser.
            </Detail>
            <Detail term="AI">
              Direct Anthropic API (@ai-sdk/anthropic) — not the Vercel AI Gateway, so no
              team billing card is required. Needs its own API key.
            </Detail>
            <Detail term="Required env vars">
              <code className="font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
              <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> (secret —
              never prefix this one <code className="font-mono text-xs">NEXT_PUBLIC_</code>),{" "}
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

        <h2 className="text-sm font-semibold text-foreground mb-3">Where Things Live</h2>
        <div className="rounded-xl border border-border bg-card p-5 mb-6 text-sm">
          <dl className="space-y-2.5">
            <Detail term="app/*/page.tsx">Pages — dashboard, project detail, billing, chat, help, workflow (this page)</Detail>
            <Detail term="app/*/actions.ts">Every write — Server Actions called directly from client forms</Detail>
            <Detail term="lib/data.ts">Every read — all Supabase SELECT queries live here, including the paginated fetchAllRows() helper (PostgREST caps a plain select() at 1000 rows)</Detail>
            <Detail term="lib/g702-parser.ts">AIA G702/G703 Excel and PDF parsing (SheetJS + pdf-parse, fixed AIA cell layout)</Detail>
            <Detail term="lib/lender-portal-parser.ts">Alternate PDF format (Conventus/SwiftDraws-style lender portal exports), auto-detected by text signature — draw-only, does not import a schedule of values</Detail>
            <Detail term="lib/aging.ts">Days-open / aging-bucket math for the dashboard alert banner and Open Draws filters</Detail>
            <Detail term="lib/billing.ts">YTD/QTD billed-vs-received calc for the Billing Summary page</Detail>
            <Detail term="lib/drawSchedule.ts">Recurring draw-cadence math — this cycle&rsquo;s due date, isDrawOverdue/isDrawUrgent, matched by the draw&rsquo;s billed period rather than when it was created</Detail>
            <Detail term="lib/agents/, lib/tools/">The AI assistant — agent definition and its tools</Detail>
            <Detail term="lib/auth/session.ts">Passcode session signing/verification</Detail>
            <Detail term="lib/auth/rateLimit.ts">Per-IP login throttling against inv_login_attempts</Detail>
            <Detail term="lib/auth/chatRateLimit.ts">Per-IP request throttling on /api/chat against inv_chat_rate_limit</Detail>
            <Detail term="components/*Section.tsx">The CRUD table + modal for one entity (draws, schedule of values)</Detail>
            <Detail term="components/AddressAutocomplete.tsx">Google Places autocomplete for the project Address field, with a plain-text fallback</Detail>
            <Detail term="components/AgingAlertBanner.tsx, ProjectStatusSelect.tsx">Dashboard 60+ day alert; inline active/closed status dropdown</Detail>
            <Detail term="components/DrawsDueAlertBanner.tsx">Dashboard alert for projects overdue on their recurring draw cadence</Detail>
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
      <p className="text-xs font-mono font-semibold text-foreground">{name}</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{fields}</p>
    </div>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{term}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
