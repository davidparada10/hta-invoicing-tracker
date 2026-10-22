"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { HtaAgentUIMessage } from "@/lib/agents/hta-agent";
import { formatCurrency, formatDate } from "@/lib/format";
import { clampBox, largeBox, parseStoredBox, type ChatBox } from "@/lib/chatLayout";
import {
  GROUP_SUMMARY_TOOLS,
  describeGroupSummary,
  fallbackAnswer,
  type GroupSummaryView,
  type UnsupportedView,
} from "@/lib/chatResults";

const BOX_KEY = "hta-chat-box";

const WRITE_TOOLS = new Set(["createDraw", "updateDraw", "markDrawPaid", "createBudgetLine"]);

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const router = useRouter();
  const refreshedIds = useRef(new Set<string>());
  // null = the default bottom-right placement; set once the user moves or
  // resizes the window (kept in this browser, and always clamped on screen).
  // Read once on the client; the panel is not rendered until opened, so this
  // cannot change the server-rendered markup.
  const [box, setBox] = useState<ChatBox | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = parseStoredBox(window.localStorage.getItem(BOX_KEY));
      return saved ? clampBox(saved, window.innerWidth, window.innerHeight) : null;
    } catch {
      return null;
    }
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<
    { mode: "move" | "resize"; startX: number; startY: number; origin: ChatBox } | null
  >(null);

  useEffect(() => {
    function onResize() {
      setBox((b) => (b ? clampBox(b, window.innerWidth, window.innerHeight) : b));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const saveBox = useCallback((b: ChatBox | null) => {
    try {
      if (b) window.localStorage.setItem(BOX_KEY, JSON.stringify(b));
      else window.localStorage.removeItem(BOX_KEY);
    } catch {
      /* not persisted: still works for this visit */
    }
  }, []);

  function currentBox(): ChatBox {
    const r = panelRef.current?.getBoundingClientRect();
    return r
      ? { x: r.left, y: r.top, w: r.width, h: r.height }
      : { x: 0, y: 0, w: 384, h: 512 };
  }

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, origin: currentBox() };
    setBox(dragRef.current.origin);
  }

  function onDragMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const next =
      d.mode === "move"
        ? { ...d.origin, x: d.origin.x + dx, y: d.origin.y + dy }
        : { ...d.origin, w: d.origin.w + dx, h: d.origin.h + dy };
    setBox(clampBox(next, window.innerWidth, window.innerHeight));
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setBox((b) => {
      saveBox(b);
      return b;
    });
  }

  function resetBox() {
    setBox(null);
    saveBox(null);
  }

  function toggleLarge() {
    const next = box && box.w >= 800 ? null : largeBox(window.innerWidth, window.innerHeight);
    setBox(next);
    saveBox(next);
  }
  const { messages, sendMessage, addToolApprovalResponse, status } = useChat<HtaAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      message.parts.forEach((part, i) => {
        if (!isToolUIPart(part)) return;
        const toolName = part.type.slice(5);
        if (!WRITE_TOOLS.has(toolName) || part.state !== "output-available") return;
        const output = part.output as Record<string, unknown> | undefined;
        if (output && typeof output === "object" && "error" in output) return;
        const key = `${message.id}:${i}`;
        if (refreshedIds.current.has(key)) return;
        refreshedIds.current.add(key);
        router.refresh();
      });
    }
  }, [messages, router]);

  const lastMessage = messages[messages.length - 1];
  const hasPendingApproval =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => isToolUIPart(part) && part.state === "approval-requested"
    );

  const isBusy = status === "submitted" || status === "streaming" || hasPendingApproval;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div
          ref={panelRef}
          className={`rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden ${
            box ? "fixed" : "relative mb-3 w-[22rem] sm:w-96 h-[32rem] max-h-[75vh]"
          }`}
          style={box ? { left: box.x, top: box.y, width: box.w, height: box.h } : undefined}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-background cursor-move select-none touch-none"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              startDrag("move", e);
            }}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onDoubleClick={(e) => {
              if (!(e.target as HTMLElement).closest("button")) resetBox();
            }}
            title="Drag to move. Double-click to reset."
          >
            <span className="text-sm font-semibold">Assistant</span>
            <span className="flex items-center gap-3">
              <button
                onClick={toggleLarge}
                aria-label={box && box.w >= 800 ? "Make smaller" : "Make larger"}
                title={box && box.w >= 800 ? "Back to normal size" : "Larger"}
                className="text-background/70 hover:text-background text-sm leading-none"
              >
                {box && box.w >= 800 ? "⤡" : "⤢"}
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-background/70 hover:text-background text-lg leading-none"
              >
                ×
              </button>
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-10 px-2">
                Try: &ldquo;What&rsquo;s the status on Aneta?&rdquo; or &ldquo;Mark draw 2 on
                Broadway as paid.&rdquo;
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-primary text-background"
                      : "bg-muted border border-border text-foreground"
                  }`}
                >
                  {message.parts.map((part, i) => (
                    <ChatPart key={i} part={part} addToolApprovalResponse={addToolApprovalResponse} />
                  ))}
                  {message.role === "assistant" &&
                    (message !== lastMessage || status === "ready" || status === "error") && (
                      <MissingAnswer message={message} />
                    )}
                </div>
              </div>
            ))}
            {(status === "submitted" || status === "streaming") && (
              <div className="text-xs text-muted-foreground px-1">Thinking…</div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border p-2.5 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                hasPendingApproval
                  ? "Confirm or cancel the pending action above first..."
                  : "Ask or describe something to add..."
              }
              className="input flex-1 py-2"
              disabled={isBusy}
              autoFocus
            />
            <button
              type="submit"
              disabled={isBusy || !input.trim()}
              className="rounded-lg bg-primary text-background text-sm font-medium px-3 py-2 disabled:opacity-50"
            >
              Send
            </button>
          </form>
          <div
            role="separator"
            aria-label="Resize assistant"
            title="Drag to resize"
            onPointerDown={(e) => startDrag("resize", e)}
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none text-muted-foreground"
          >
            <svg viewBox="0 0 20 20" className="w-5 h-5" aria-hidden="true">
              <path d="M18 8 8 18M18 13 13 18" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close assistant" : "Open assistant"}
        className="w-14 h-14 rounded-full bg-primary text-background shadow-lg flex items-center justify-center text-2xl hover:opacity-90 transition-colors"
      >
        {open ? "×" : "✨"}
      </button>
    </div>
  );
}

// Chat replies come back as markdown (tables, bold, lists) — render them
// properly instead of dumping raw "| a | b |" / "**x**" text into the bubble.
function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5 whitespace-pre-wrap">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          ul: ({ children }) => <ul className="my-1.5 ml-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1.5 ml-4 list-decimal space-y-0.5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-background/60 px-1 py-0.5 text-[0.85em]">{children}</code>
          ),
          table: ({ children }) => (
            <div className="my-1.5 -mx-1 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="text-muted-foreground">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-1.5 py-1 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b border-border/60 px-1.5 py-1 align-top">{children}</td>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ChatPart({
  part,
  addToolApprovalResponse,
}: {
  part: HtaAgentUIMessage["parts"][number];
  addToolApprovalResponse: (args: { id: string; approved: boolean }) => void;
}) {
  if (part.type === "text") {
    return <ChatMarkdown text={part.text} />;
  }

  if (!isToolUIPart(part)) return null;

  const toolName = part.type.slice(5);
  const isWrite = WRITE_TOOLS.has(toolName);

  if (part.state === "input-streaming" || part.state === "input-available") {
    return <p className="text-xs text-muted-foreground italic">Looking that up…</p>;
  }

  if (part.state === "approval-requested") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 my-1 dark:border-amber-800 dark:bg-amber-950/50">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-2">{describeProposal(toolName, part.input)}</p>
        <div className="flex gap-2">
          <button
            onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
            className="text-xs font-medium rounded-md bg-primary text-background px-3 py-1"
          >
            Confirm
          </button>
          <button
            onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}
            className="text-xs font-medium rounded-md border border-border px-3 py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (part.state === "approval-responded") {
    return <p className="text-xs text-muted-foreground italic">Working…</p>;
  }

  if (part.state === "output-denied") {
    return <p className="text-xs text-muted-foreground">Cancelled.</p>;
  }

  if (part.state === "output-error") {
    return <p className="text-xs text-red-600 dark:text-red-400">{part.errorText}</p>;
  }

  if (part.state === "output-available") {
    const output = part.output as Record<string, unknown>;
    if (output && typeof output === "object" && "error" in output) {
      return <p className="text-xs text-red-600 dark:text-red-400">{String(output.error)}</p>;
    }
    if (isWrite) {
      return <p className="text-xs text-paid font-medium">✓ Done.</p>;
    }
    return <ToolResult toolName={toolName} output={output} />;
  }

  return null;
}

// A finished assistant turn that ran lookups but wrote no text would otherwise
// show only a table (or nothing). State the result in a sentence instead, and
// say so plainly when there is nothing to state. Turns still waiting on an
// approval or a lookup, and write actions (which show their own "Done"), are left alone.
function MissingAnswer({ message }: { message: HtaAgentUIMessage }) {
  const hasText = message.parts.some((p) => p.type === "text" && p.text.trim().length > 0);
  if (hasText) return null;
  const toolParts = message.parts.filter(isToolUIPart);
  const waiting = toolParts.some(
    (p) =>
      p.state === "input-streaming" ||
      p.state === "input-available" ||
      p.state === "approval-requested" ||
      p.state === "approval-responded"
  );
  if (waiting) return null;
  const readParts = toolParts.filter((p) => !WRITE_TOOLS.has(p.type.slice(5)));
  if (toolParts.length > 0 && readParts.length === 0) return null; // write actions report themselves
  const results = readParts.flatMap((p) =>
    p.state === "output-available" ? [{ toolName: p.type.slice(5), output: p.output }] : []
  );
  const hadError = readParts.some(
    (p) =>
      p.state === "output-error" ||
      (p.state === "output-available" &&
        typeof p.output === "object" &&
        p.output !== null &&
        "error" in (p.output as object))
  );
  return (
    <p className="text-sm text-foreground mt-2" data-testid="missing-answer">
      {fallbackAnswer(results, hadError)}
    </p>
  );
}

function describeProposal(toolName: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "createDraw":
      return `Add Draw #${i.drawNumber} for ${i.projectName}: ${formatCurrency(
        i.amountRequested as number
      )} requested, status ${i.status ?? "draft"}.`;
    case "markDrawPaid":
      return i.amountReceived != null
        ? `Record ${formatCurrency(i.amountReceived as number)} on Draw #${i.drawNumber} (${i.projectName}).`
        : `Mark Draw #${i.drawNumber} on ${i.projectName} as paid.`;
    case "updateDraw": {
      const changes = Object.entries(i)
        .filter(([key]) => key !== "projectName" && key !== "drawNumber")
        .map(([key, value]) => `${key} → ${value}`)
        .join(", ");
      return `Update Draw #${i.drawNumber} on ${i.projectName}: ${changes || "no changes"}.`;
    }
    case "createBudgetLine":
      return `Add schedule line "${i.description}" (${formatCurrency(
        i.scheduledValue as number
      )}) to ${i.projectName}.`;
    default:
      return `Run ${toolName}?`;
  }
}

function GroupSummaryCard({ view }: { view: GroupSummaryView }) {
  const stats = view.stats;
  return (
    <div className="mt-1 space-y-2">
      <p className="text-xs font-medium">
        {view.groupType} {view.name}
      </p>
      <p className="text-[11px] text-muted-foreground">{view.scope}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {stats.map((s) => (
          <div key={s.label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{s.label}</dt>
            <dd
              className={`tabular-nums font-medium ${
                s.label === "Paid" ? "text-paid" : s.label === "Outstanding" ? "text-invoiced" : ""
              }`}
            >
              {formatCurrency(s.value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-muted-foreground">
        Retainage is held separately and is not part of Outstanding.
        {view.drafts > 0 ? ` Drafts not yet submitted: ${formatCurrency(view.drafts)} (not counted as invoiced).` : ""}
      </p>
      {view.projects.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="text-xs w-full">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-1 py-1">Project</th>
                <th className="text-right px-1 py-1">Invoiced</th>
                <th className="text-right px-1 py-1">Paid</th>
                <th className="text-right px-1 py-1">Outstanding</th>
                <th className="text-right px-1 py-1">Retainage</th>
              </tr>
            </thead>
            <tbody>
              {view.projects.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-1 py-1">
                    {p.project}
                    {p.closed && <span className="text-muted-foreground"> (closed)</span>}
                  </td>
                  <td className="px-1 py-1 text-right tabular-nums">{formatCurrency(p.invoiced)}</td>
                  <td className="px-1 py-1 text-right tabular-nums text-paid">{formatCurrency(p.paid)}</td>
                  <td className="px-1 py-1 text-right tabular-nums text-invoiced">{formatCurrency(p.outstanding)}</td>
                  <td className="px-1 py-1 text-right tabular-nums">{formatCurrency(p.retainage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(view.unpaidDrawCount > 0 || view.smallBalanceCount > 0) && (
        <p className="text-[11px] text-muted-foreground">
          {view.unpaidDrawCount} unpaid draw{view.unpaidDrawCount === 1 ? "" : "s"}
          {view.smallBalanceCount > 0
            ? `, plus ${view.smallBalanceCount} small balance${view.smallBalanceCount === 1 ? "" : "s"} under $1,000 not listed as open draws`
            : ""}
          .
        </p>
      )}
    </div>
  );
}

function UnsupportedResult({ view, output }: { view: UnsupportedView; output: unknown }) {
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      <p>{view.message}</p>
      <details className="mt-1">
        <summary className="cursor-pointer">Details</summary>
        <pre className="mt-1 whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>
      </details>
    </div>
  );
}

function ToolResult({ toolName, output }: { toolName: string; output: Record<string, unknown> }) {
  if (GROUP_SUMMARY_TOOLS.has(toolName)) {
    const view = describeGroupSummary(toolName, output);
    return view.kind === "group" ? (
      <GroupSummaryCard view={view} />
    ) : (
      <UnsupportedResult view={view} output={output} />
    );
  }

  if (toolName === "listProjects" && Array.isArray(output.projects)) {
    const projects = output.projects as Array<Record<string, unknown>>;
    return (
      <div className="overflow-x-auto -mx-1 mt-1">
        <table className="text-xs w-full">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left px-1 py-1">Project</th>
              <th className="text-right px-1 py-1">Open</th>
              <th className="text-right px-1 py-1">Paid</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-1 py-1">{String(p.name)}</td>
                <td className="px-1 py-1 text-right text-invoiced">
                  {formatCurrency(p.totalOpenToOwner as number)}
                </td>
                <td className="px-1 py-1 text-right text-paid">
                  {formatCurrency(p.totalPaidToOwner as number)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (toolName === "getRecentPayments") {
    const payments = (output.payments as Array<Record<string, unknown>>) ?? [];
    if (payments.length === 0) {
      return (
        <p className="text-xs text-muted-foreground mt-1">
          No payments recorded on {String(output.date)}.
        </p>
      );
    }
    return (
      <div className="overflow-x-auto -mx-1 mt-1">
        <table className="text-xs w-full">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left px-1 py-1">Project</th>
              <th className="text-left px-1 py-1">Draw</th>
              <th className="text-right px-1 py-1">Paid</th>
              <th className="text-right px-1 py-1">Retainage</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-1 py-1">{String(p.project)}</td>
                <td className="px-1 py-1">#{String(p.drawNumber)}</td>
                <td className="px-1 py-1 text-right text-paid">
                  {formatCurrency(p.amountPaid as number)}
                </td>
                <td className="px-1 py-1 text-right">{formatCurrency(p.retainageHeld as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (toolName === "getOpenDraws" && Array.isArray(output)) {
    const draws = output as Array<Record<string, unknown>>;
    if (draws.length === 0) return <p className="text-xs text-muted-foreground mt-1">No open draws.</p>;
    return (
      <div className="overflow-x-auto -mx-1 mt-1">
        <table className="text-xs w-full">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left px-1 py-1">Project</th>
              <th className="text-left px-1 py-1">Draw</th>
              <th className="text-right px-1 py-1">Requested</th>
              <th className="text-left px-1 py-1">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {draws.map((d, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-1 py-1">{String(d.project)}</td>
                <td className="px-1 py-1">#{String(d.drawNumber)}</td>
                <td className="px-1 py-1 text-right">{formatCurrency(d.amountRequested as number)}</td>
                <td className="px-1 py-1">{formatDate(d.dateSubmitted as string)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (toolName === "getProjectDetails" && output.project) {
    const project = output.project as Record<string, unknown>;
    const totals = output.totals as Record<string, unknown>;
    return (
      <div className="mt-1 space-y-1">
        <p className="text-xs font-medium">{String(project.name)}</p>
        <div className="flex gap-3 text-xs">
          <span className="text-invoiced">Open: {formatCurrency(totals.totalOpenToOwner as number)}</span>
          <span className="text-paid">
            Paid: {formatCurrency(totals.totalPaidToOwner as number)}
          </span>
          <span className="text-muted-foreground">Contract: {formatCurrency(totals.totalBudget as number)}</span>
        </div>
      </div>
    );
  }

  if (toolName === "getAgingSummary" && Array.isArray(output.buckets)) {
    const buckets = output.buckets as Array<Record<string, unknown>>;
    return (
      <div className="overflow-x-auto -mx-1 mt-1">
        <table className="text-xs w-full">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left px-1 py-1">Days</th>
              <th className="text-right px-1 py-1">Draws</th>
              <th className="text-right px-1 py-1">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-1 py-1">{String(b.bucket)}</td>
                <td className="px-1 py-1 text-right">{String(b.count)}</td>
                <td className="px-1 py-1 text-right text-invoiced">{formatCurrency(b.amount as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (toolName === "getBillingSummary" && Array.isArray(output.byProject)) {
    const byProject = output.byProject as Array<Record<string, unknown>>;
    return (
      <div className="mt-1 space-y-1">
        <p className="text-xs font-medium">{String(output.year)} YTD</p>
        <div className="flex gap-3 text-xs">
          <span className="text-invoiced">Billed: {formatCurrency(output.ytdRequested as number)}</span>
          <span className="text-paid">
            Received: {formatCurrency(output.ytdReceived as number)}
          </span>
          {output.ytdAvgDaysToPay != null && (
            <span className="text-muted-foreground">Avg days to pay: {String(output.ytdAvgDaysToPay)}</span>
          )}
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="text-xs w-full">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-1 py-1">Project</th>
                <th className="text-right px-1 py-1">Billed</th>
                <th className="text-right px-1 py-1">Received</th>
              </tr>
            </thead>
            <tbody>
              {byProject.map((p, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-1 py-1">{String(p.project)}</td>
                  <td className="px-1 py-1 text-right">{formatCurrency(p.requested as number)}</td>
                  <td className="px-1 py-1 text-right text-paid">
                    {formatCurrency(p.received as number)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (toolName === "getScheduleOfValues" && Array.isArray(output.lines)) {
    const lines = output.lines as Array<Record<string, unknown>>;
    return (
      <div className="mt-1 space-y-1">
        <p className="text-xs font-medium">
          {String(output.project)} · {formatCurrency(output.totalScheduledValue as number)}
        </p>
        <div className="overflow-x-auto -mx-1 max-h-40 overflow-y-auto">
          <table className="text-xs w-full">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left px-1 py-1">Item</th>
                <th className="text-right px-1 py-1">Value</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-1 py-1">{String(l.description)}</td>
                  <td className="px-1 py-1 text-right">{formatCurrency(l.scheduledValue as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <UnsupportedResult
      view={{
        kind: "unsupported",
        toolName,
        message: "I looked this up. The result isn't shown as a table here, so rely on the written answer.",
      }}
      output={output}
    />
  );
}
