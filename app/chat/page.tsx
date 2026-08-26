import SiteHeader from "@/components/SiteHeader";
import ChatWindow from "@/components/ChatWindow";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 flex-1 flex flex-col min-h-0">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">Assistant</h1>
        <p className="text-sm text-slate-500 mb-6">
          Ask about your projects, or describe a draw, invoice, or budget line to add.
        </p>
        <ChatWindow />
      </main>
    </div>
  );
}
