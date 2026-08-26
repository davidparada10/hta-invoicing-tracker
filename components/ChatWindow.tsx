"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { HtaAgentUIMessage } from "@/lib/agents/hta-agent";
import { formatCurrency, formatDate } from "@/lib/format";

const WRITE_TOOLS = new Set(["createDraw", "markDrawPaid", "createSubInvoice", "createBudgetLine"]);

export default function ChatWindow() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, addToolApprovalResponse, status } = useChat<HtaAgentUIMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const isBusy = status === "submitted" || status === "streaming";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-12">
            Try: &ldquo;What&rsquo;s the status on Aneta?&rdquo; or &ldquo;Mark draw 2 on Broadway
            as paid.&rdquo;
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                message.role === "user"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-50 border border-slate-200 text-slate-800"
              }`}
            >
              {message.parts.map((part, i) => (
                <ChatPart key={i} part={part} addToolApprovalResponse={addToolApprovalResponse} />
              ))}
            </div>
          </div>
        ))}
        {isBusy && <div className="text-xs text-slate-400 px-1">Thinking…</div>}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your projects, or describe something to add..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={isBusy}
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="rounded-lg bg-slate-900 text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          Send
        </button>
      </form>
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
    return <p className="text-xs text-slate-400 italic">Looking that up…</p>;
  }

  if (part.state === "approval-requested") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 my-1">
        <p className="text-xs font-medium text-amber-800 mb-2">{describeProposal(toolName, part.input)}</p>
        <div className="flex gap-2">
          <button
            onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}
            className="text-xs font-medium rounded-md bg-slate-900 text-white px-3 py-1"
          >
            Confirm
          </button>
          <button
            onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false })}
            className="text-xs font-medium rounded-md border border-slate-300 px-3 py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (part.state === "approval-responded") {
    return <p className="text-xs text-slate-400 italic">Working…</p>;
  }

  if (part.state === "output-denied") {
    return <p className="text-xs text-slate-500">Cancelled.</p>;
  }

  if (part.state === "output-error") {
    return <p className="text-xs text-red-600">{part.errorText}</p>;
  }

  if (part.state === "output-available") {
    const output = part.output as Record<string, unknown>;
    if (output && typeof output === "object" && "error" in output) {
      return <p className="text-xs text-red-600">{String(output.error)}</p>;
    }
    if (isWrite) {
      return <p className="text-xs text-emerald-700 font-medium">✓ Done.</p>;
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
      return `Mark Draw #${i.drawNumber} on ${i.projectName} as paid.`;
    case "createSubInvoice":
      return `Add a ${formatCurrency(i.amount as number)} invoice from ${i.subcontractorName} on ${
        i.projectName
      }.`;
    case "createBudgetLine":
      return `Add budget line "${i.description}" (${formatCurrency(
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
          <thead className="text-slate-400">
            <tr>
              <th className="text-left px-1 py-1">Project</th>
              <th className="text-right px-1 py-1">Paid</th>
              <th className="text-right px-1 py-1">Open</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-1 py-1">{String(p.name)}</td>
                <td className="px-1 py-1 text-right text-emerald-700">
                  {formatCurrency(p.totalPaidToOwner as number)}
                </td>
                <td className="px-1 py-1 text-right text-blue-700">
                  {formatCurrency(p.totalOpenToOwner as number)}
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
    if (draws.length === 0) return <p className="text-xs text-slate-400 mt-1">No open draws.</p>;
    return (
      <div className="overflow-x-auto -mx-1 mt-1">
        <table className="text-xs w-full">
          <thead className="text-slate-400">
            <tr>
              <th className="text-left px-1 py-1">Project</th>
              <th className="text-left px-1 py-1">Draw</th>
              <th className="text-right px-1 py-1">Requested</th>
              <th className="text-left px-1 py-1">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {draws.map((d, i) => (
              <tr key={i} className="border-t border-slate-100">
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
          <span className="text-emerald-700">
            Paid: {formatCurrency(totals.totalPaidToOwner as number)}
          </span>
          <span className="text-blue-700">Open: {formatCurrency(totals.totalOpenToOwner as number)}</span>
          <span className="text-slate-500">Budget: {formatCurrency(totals.totalBudget as number)}</span>
        </div>
      </div>
    );
  }

  return <pre className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{JSON.stringify(output, null, 2)}</pre>;
}
