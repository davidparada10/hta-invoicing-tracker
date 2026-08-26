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
    <div className="flex items-stretch gap-1 overflow-x-auto pb-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1 shrink-0">
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
          Five flows: G702 draw upload · G703 budget import · draw lifecycle &amp; Mark Paid ·
          AI assistant (read + confirm-to-write) · passcode auth gate. Written for anyone who
          needs to pick up maintenance on this app.
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
          subtitle="Owner Draws tab, on-demand — auto-fills the Add/Edit Draw form from an AIA G702 sheet"
          steps={[
            { icon: "👤", title: "Upload .xlsx", detail: "Owner Draws tab, Add/Edit Draw modal", category: "trigger", edgeLabel: "reads" },
            { icon: "📄", title: "parseG702FromXlsx", detail: "lib/g702-parser.ts — fixed AIA cell refs", category: "server", edgeLabel: "fills" },
            { icon: "📝", title: "Draw form", detail: "Controlled fields — user reviews", category: "ui", edgeLabel: "on Save" },
            { icon: "⚡", title: "upsertDraw", detail: "app/draws/actions.ts (Server Action)", category: "server", edgeLabel: "writes" },
            { icon: "🗄️", title: "inv_owner_draws", detail: "Supabase — insert or update by id", category: "data", edgeLabel: "revalidates" },
            { icon: "✅", title: "Page refreshed", detail: "Draws table + dashboard totals", category: "output" },
          ]}
        />

        <Flow
          number="2"
          title="G703 Budget Import"
          subtitle="Budget tab, on-demand — destructive: replaces every existing line item"
          steps={[
            { icon: "👤", title: "Upload .xlsx", detail: "Budget tab — Import button", category: "trigger", edgeLabel: "confirms" },
            { icon: "❓", title: "Lines exist?", detail: "Browser confirm() if project has any", category: "decision", edgeLabel: "yes/no" },
            { icon: "📄", title: "parseBudgetFromXlsx", detail: "lib/g702-parser.ts — walks G703 rows", category: "server", edgeLabel: "returns rows" },
            { icon: "⚡", title: "importBudgetFromXlsx", detail: "app/budget/actions.ts (Server Action)", category: "server", edgeLabel: "delete + insert" },
            { icon: "🗄️", title: "inv_project_budget_lines", detail: "Supabase — full replace, one project", category: "data", edgeLabel: "revalidates" },
            { icon: "✅", title: "Budget tab refreshed", detail: "Total Budget + line table", category: "output" },
          ]}
        />

        <Flow
          number="3"
          title="Draw Lifecycle & Mark Paid"
          subtitle="draft → submitted → approved → paid, or one click straight to paid"
          steps={[
            { icon: "📝", title: "Draw created", detail: "status: draft or submitted", category: "ui", edgeLabel: "edit status" },
            { icon: "🔄", title: "submitted / approved", detail: "Edit Draw modal, manual status change", category: "decision", edgeLabel: "or" },
            { icon: "👤", title: "Mark Paid click", detail: "Dashboard or project draws table", category: "trigger", edgeLabel: "calls" },
            { icon: "⚡", title: "markDrawPaid", detail: "sets amount_paid, date_paid = today", category: "server", edgeLabel: "writes" },
            { icon: "🗄️", title: "inv_owner_draws", detail: "status → paid", category: "data", edgeLabel: "drops from" },
            { icon: "✅", title: "Open Owner Draws", detail: "Dashboard list — only submitted/approved show", category: "output" },
          ]}
        />

        <Flow
          number="4"
          title="AI Assistant"
          subtitle="/chat — reads run automatically; writes pause for user confirmation"
          steps={[
            { icon: "👤", title: "Ask or describe", detail: "\"What's paid on Aneta?\" or \"Add a draw...\"", category: "trigger", edgeLabel: "POST" },
            { icon: "⚡", title: "/api/chat", detail: "createAgentUIStreamResponse", category: "server", edgeLabel: "runs" },
            { icon: "🤖", title: "htaAgent (ToolLoopAgent)", detail: "lib/agents/hta-agent.ts · Claude via direct Anthropic API", category: "ai", edgeLabel: "picks a tool" },
            { icon: "🔍", title: "Read tool", detail: "listProjects / getOpenDraws / getProjectDetails — auto-runs", category: "server", edgeLabel: "or" },
            { icon: "✋", title: "Write tool proposed", detail: "createDraw / markDrawPaid / createBudgetLine", category: "decision", edgeLabel: "Confirm" },
            { icon: "🗄️", title: "Supabase write", detail: "Same tables as the manual forms use", category: "data", edgeLabel: "streams back" },
            { icon: "✅", title: "Chat reply", detail: "Plain-language summary of what happened", category: "output" },
          ]}
        />

        <Flow
          number="5"
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
              <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>
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
            <Detail term="app/*/page.tsx">Pages — dashboard, project detail, chat, help, workflow (this page)</Detail>
            <Detail term="app/*/actions.ts">Every write — Server Actions called directly from client forms</Detail>
            <Detail term="lib/data.ts">Every read — all Supabase SELECT queries live here</Detail>
            <Detail term="lib/g702-parser.ts">G702 and G703 Excel parsing (SheetJS, fixed AIA cell layout)</Detail>
            <Detail term="lib/agents/, lib/tools/">The AI assistant — agent definition and its tools</Detail>
            <Detail term="lib/auth/session.ts">Passcode session signing/verification</Detail>
            <Detail term="components/*Section.tsx">The CRUD table + modal for one entity (draws, budget)</Detail>
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
