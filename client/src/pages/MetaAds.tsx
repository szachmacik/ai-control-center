import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Plus, Trash2, TestTube, Send, Activity, CheckCircle,
  XCircle, BarChart3, Zap, Eye, ShoppingCart, UserCheck,
  ChevronDown, ChevronUp, ExternalLink
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "PageView" | "Lead" | "Purchase" | "Custom";

// ─── Severity badge ───────────────────────────────────────────────────────────

function StatusBadge({ success }: { success: boolean }) {
  return success ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-900/40 text-green-400 border border-green-800">
      <CheckCircle className="w-3 h-3" /> Sent
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-900/40 text-red-400 border border-red-800">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
}

// ─── Add Pixel Modal ──────────────────────────────────────────────────────────

function AddPixelModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    name: "",
    pixelId: "",
    accessToken: "",
    testEventCode: "",
    domain: "",
  });
  const [error, setError] = useState("");

  const addMutation = trpc.meta.addPixel.useMutation({
    onSuccess: () => { onAdded(); onClose(); },
    onError: (e: { message: string }) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-white mb-4">Add Meta Pixel</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">{error}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Name</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. Main Landing Page"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Pixel ID</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
              placeholder="123456789012345"
              value={form.pixelId}
              onChange={(e) => setForm({ ...form, pixelId: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Access Token</label>
            <textarea
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500 resize-none"
              placeholder="EAAxxxxxxx..."
              rows={3}
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Get from: Events Manager → Your Pixel → Settings → Generate Access Token
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Test Event Code (optional)</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-blue-500"
                placeholder="TEST12345"
                value={form.testEventCode}
                onChange={(e) => setForm({ ...form, testEventCode: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Domain (optional)</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="example.com"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => addMutation.mutate({
              name: form.name,
              pixelId: form.pixelId,
              accessToken: form.accessToken,
              testEventCode: form.testEventCode || undefined,
              domain: form.domain || undefined,
            })}
            disabled={!form.name || !form.pixelId || !form.accessToken || addMutation.isPending}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {addMutation.isPending ? "Testing connection..." : "Add Pixel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send Event Panel ─────────────────────────────────────────────────────────

function SendEventPanel({ pixelDbId }: { pixelDbId: number }) {
  const [eventType, setEventType] = useState<EventType>("PageView");
  const [url, setUrl] = useState("https://");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("");
  const [customEventName, setCustomEventName] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const pageViewMutation = trpc.meta.sendPageView.useMutation({
    onSuccess: (r: { eventsReceived: number; error?: string }) => setResult({ success: r.eventsReceived > 0, message: r.error ?? `Events received: ${r.eventsReceived}` }),
    onError: (e: { message: string }) => setResult({ success: false, message: e.message }),
  });
  const leadMutation = trpc.meta.sendLead.useMutation({
    onSuccess: (r: { eventsReceived: number; error?: string }) => setResult({ success: r.eventsReceived > 0, message: r.error ?? `Events received: ${r.eventsReceived}` }),
    onError: (e: { message: string }) => setResult({ success: false, message: e.message }),
  });
  const purchaseMutation = trpc.meta.sendPurchase.useMutation({
    onSuccess: (r: { eventsReceived: number; error?: string }) => setResult({ success: r.eventsReceived > 0, message: r.error ?? `Events received: ${r.eventsReceived}` }),
    onError: (e: { message: string }) => setResult({ success: false, message: e.message }),
  });
  const customMutation = trpc.meta.sendCustomEvent.useMutation({
    onSuccess: (r: { eventsReceived: number; error?: string }) => setResult({ success: r.eventsReceived > 0, message: r.error ?? `Events received: ${r.eventsReceived}` }),
    onError: (e: { message: string }) => setResult({ success: false, message: e.message }),
  });

  const isPending = pageViewMutation.isPending || leadMutation.isPending || purchaseMutation.isPending || customMutation.isPending;
  const userData = email || phone ? { email: email || undefined, phone: phone || undefined } : undefined;

  const handleSend = () => {
    setResult(null);
    if (eventType === "PageView") pageViewMutation.mutate({ pixelDbId, url, userData });
    else if (eventType === "Lead") leadMutation.mutate({ pixelDbId, url, userData });
    else if (eventType === "Purchase") purchaseMutation.mutate({ pixelDbId, url, value: parseFloat(value) || 0, userData });
    else customMutation.mutate({ pixelDbId, eventName: customEventName, url, userData });
  };

  const eventIcons: Record<EventType, React.ReactNode> = {
    PageView: <Eye className="w-4 h-4" />,
    Lead: <UserCheck className="w-4 h-4" />,
    Purchase: <ShoppingCart className="w-4 h-4" />,
    Custom: <Zap className="w-4 h-4" />,
  };

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-medium text-white flex items-center gap-2">
        <Send className="w-4 h-4 text-blue-400" /> Send Test Event
      </h3>

      {/* Event type selector */}
      <div className="grid grid-cols-4 gap-1">
        {(["PageView", "Lead", "Purchase", "Custom"] as EventType[]).map((type) => (
          <button
            key={type}
            onClick={() => setEventType(type)}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-colors ${
              eventType === type
                ? "bg-blue-600/30 border border-blue-500/50 text-blue-300"
                : "bg-white/5 border border-white/10 text-gray-400 hover:text-gray-200"
            }`}
          >
            {eventIcons[type]}
            {type}
          </button>
        ))}
      </div>

      {/* Fields */}
      <div className="space-y-2">
        {eventType === "Custom" && (
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Event name (e.g. SubmitApplication)"
            value={customEventName}
            onChange={(e) => setCustomEventName(e.target.value)}
          />
        )}
        <input
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          placeholder="Source URL (https://...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {eventType === "Purchase" && (
          <input
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            placeholder="Value (e.g. 99.00)"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>

      <button
        onClick={handleSend}
        disabled={isPending || !url}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Send className="w-4 h-4" />
        {isPending ? "Sending..." : `Send ${eventType}`}
      </button>

      {result && (
        <div className={`p-3 rounded-lg text-sm ${result.success ? "bg-green-900/30 border border-green-700 text-green-400" : "bg-red-900/30 border border-red-700 text-red-400"}`}>
          {result.success ? "✓ " : "✗ "}{result.message}
        </div>
      )}
    </div>
  );
}

// ─── Pixel Card ───────────────────────────────────────────────────────────────

type PixelData = { id: number; name: string; pixelId: string; domain?: string | null; isActive: boolean; testEventCode?: string | null; createdAt: Date };
function PixelCard({ pixel, onDeleted }: { pixel: PixelData; onDeleted: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const deleteMutation = trpc.meta.deletePixel.useMutation({ onSuccess: onDeleted });
  const testMutation = trpc.meta.testPixel.useMutation({
    onSuccess: (r: { success: boolean; message: string }) => setTestResult(r.success ? `✓ ${r.message}` : `✗ ${r.message}`),
    onError: (e: { message: string }) => setTestResult(`✗ ${e.message}`),
  });

  const stats = trpc.meta.getStats.useQuery(
    { pixelDbId: pixel.id },
    { enabled: expanded }
  );

  return (
    <div className="bg-white/3 border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <div className="text-white font-medium text-sm">{pixel.name}</div>
            <div className="text-gray-500 text-xs font-mono">ID: {pixel.pixelId}</div>
            {pixel.domain && <div className="text-gray-500 text-xs">{pixel.domain}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${pixel.isActive ? "bg-green-900/40 text-green-400 border border-green-800" : "bg-gray-800 text-gray-500 border border-gray-700"}`}>
            {pixel.isActive ? "Active" : "Inactive"}
          </span>
          <button
            onClick={() => testMutation.mutate({ id: pixel.id })}
            disabled={testMutation.isPending}
            className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
            title="Test connection"
          >
            <TestTube className="w-4 h-4" />
          </button>
          <button
            onClick={() => deleteMutation.mutate({ id: pixel.id })}
            disabled={deleteMutation.isPending}
            className="p-2 bg-white/5 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
            title="Delete pixel"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={`mx-4 mb-3 p-2 rounded text-xs ${testResult.startsWith("✓") ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
          {testResult}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/5 p-4 space-y-4">
          {/* Stats */}
          {stats.data && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/3 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-white">{stats.data.total}</div>
                <div className="text-xs text-gray-500">Total Events</div>
              </div>
              <div className="bg-white/3 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{stats.data.successful}</div>
                <div className="text-xs text-gray-500">Successful</div>
              </div>
              <div className="bg-white/3 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{stats.data.failed}</div>
                <div className="text-xs text-gray-500">Failed</div>
              </div>
            </div>
          )}

          {/* Event breakdown */}
          {stats.data && Object.keys(stats.data.byType).length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-gray-500 mb-2">Events by type</div>
              {Object.entries(stats.data.byType).map(([name, count]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{name}</span>
                  <span className="text-gray-400 font-mono">{count as number}</span>
                </div>
              ))}
            </div>
          )}

          {/* Send event panel */}
          <SendEventPanel pixelDbId={pixel.id} />

          {/* Event log */}
          <EventLog pixelDbId={pixel.id} />
        </div>
      )}
    </div>
  );
}

// ─── Event Log ────────────────────────────────────────────────────────────────

function EventLog({ pixelDbId }: { pixelDbId: number }) {
  const { data: events } = trpc.meta.getEventLog.useQuery({ pixelDbId, limit: 20 });

  if (!events || events.length === 0) {
    return (
      <div className="text-center text-gray-500 text-sm py-4">No events sent yet</div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-gray-500 mb-2">Recent events</div>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {events.map((e: { id: number; eventName: string; sourceUrl?: string | null; success: boolean; createdAt: Date }) => (
          <div key={e.id} className="flex items-center justify-between text-xs p-2 bg-white/3 rounded">
            <div className="flex items-center gap-2">
              <StatusBadge success={e.success} />
              <span className="text-gray-300 font-medium">{e.eventName}</span>
              {e.sourceUrl && (
                <span className="text-gray-500 truncate max-w-[200px]">{e.sourceUrl}</span>
              )}
            </div>
            <span className="text-gray-600 shrink-0">
              {new Date(e.createdAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MetaAds() {
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: pixels, refetch } = trpc.meta.listPixels.useQuery();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-400" />
            Meta Ads CAPI
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Server-side Conversions API — bypass ad blockers and iOS privacy restrictions
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Pixel
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-900/20 border border-blue-800/50 rounded-xl p-4 text-sm text-blue-300">
        <div className="font-medium mb-1 flex items-center gap-2">
          <ExternalLink className="w-4 h-4" /> How to get your Access Token
        </div>
        <ol className="text-blue-400 space-y-0.5 list-decimal list-inside text-xs">
          <li>Go to Meta Events Manager → Your Pixel → Settings</li>
          <li>Scroll to "Conversions API" → "Generate Access Token"</li>
          <li>Copy the token and paste it above</li>
          <li>Optionally add a Test Event Code from the "Test Events" tab for debugging</li>
        </ol>
      </div>

      {/* Pixel list */}
      {!pixels || pixels.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg">No pixels configured yet</p>
          <p className="text-sm mt-1">Add your first Meta Pixel to start sending server-side events</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pixels.map((pixel: PixelData) => (
            <PixelCard key={pixel.id} pixel={pixel} onDeleted={refetch} />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddPixelModal onClose={() => setShowAddModal(false)} onAdded={refetch} />
      )}
    </div>
  );
}
