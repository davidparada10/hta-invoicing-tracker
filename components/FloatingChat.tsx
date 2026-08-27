"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { HtaAgentUIMessage } from "@/lib/agents/hta-agent";
import { formatCurrency, formatDate } from "@/lib/format";

const WRITE_TOOLS = new Set(["createDraw", "markDrawPaid", "createBudgetLine"]);

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const router = useRouter();
  const refreshedIds = useRef(new Set<string>());
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
        <div className="mb-3 w-[22rem] sm:w-96 h-[32rem] max-h-[75vh] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-background">
            <span className="text-sm font-semibold">Assistant</span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-background/70 hover:text-background text-lg leading-none"
            >
              ×
            </button>
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

function ChatPart({
  part,
  addToolApprovalResponse,
}: {
  part: HtaAgentUIMessage["parts"][number];
  addToolApprovalResponse: (args: { id: string; approved: boolean }) => void;
}) {
  if (part.type === "text") {
    return <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>;
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
      return <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">✓ Done.</p>;
    }
    return <ToolResult toolName={toolName} output={output} />;
  }

  return null;
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
    case "createBudgetLine":
      return `Add schedule line "${i.description}" (${formatCurrency(
        i.scheduledValue as number
      )}) to ${i.projectName}.`;
    default:
      return `Run ${toolName}?`;
  }
}

function ToolResult({ toolName, output }: { toolName: string; output: Record<string, unknown> }) {
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
                <td className="px-1 py-1 text-right text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(p.totalPaidToOwner as number)}
                </td>
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
          <span className="text-emerald-700 dark:text-emerald-400">
            Paid: {formatCurrency(totals.totalPaidToOwner as number)}
          </span>
          <span className="text-muted-foreground">Contract: {formatCurrency(totals.totalBudget as number)}</span>
        </div>
      </div>
    );
  }

  return <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>;
}
