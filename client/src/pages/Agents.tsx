import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Bot, Play, Square, RefreshCw, ChevronRight, Cpu, Brain,
  FolderOpen, Zap, Network, Sparkles, ExternalLink, Activity,
  CheckCircle2, XCircle, Clock, AlertCircle, Info, Hash, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";

const AGENT_TYPE_ICON: Record<string, React.ReactNode> = {
  manus: <Sparkles className="w-5 h-5 text-violet-400" />,
  n8n: <Network className="w-5 h-5 text-orange-400" />,
  autogpt: <Zap className="w-5 h-5 text-yellow-400" />,
  crewai: <Brain className="w-5 h-5 text-blue-400" />,
  custom: <Bot className="w-5 h-5 text-primary" />,
};
const AGENT_TYPE_COLOR: Record<string, string> = {
  manus: "bg-violet-500/10 border-violet-500/20",
  n8n: "bg-orange-500/10 border-orange-500/20",
  autogpt: "bg-yellow-500/10 border-yellow-500/20",
  crewai: "bg-blue-500/10 border-blue-500/20",
  custom: "bg-primary/10 border-primary/20",
};
const AI_PROVIDERS = [
  { id: "openai", name: "GPT-4o", provider: "OpenAI", model: "gpt-4o", color: "bg-emerald-500/10 border-emerald-500/20", icon: "🤖", secretKey: "OPENAI_API_KEY" },
  { id: "anthropic", name: "Claude 3.5", provider: "Anthropic", model: "claude-3-5-sonnet", color: "bg-amber-500/10 border-amber-500/20", icon: "🧠", secretKey: "ANTHROPIC_API_KEY" },
  { id: "gemini", name: "Gemini 1.5 Pro", provider: "Google", model: "gemini-1.5-pro", color: "bg-blue-500/10 border-blue-500/20", icon: "✨", secretKey: "GEMINI_API_KEY" },
];

function sColor(s: string) {
  if (s === "active") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
  if (s === "idle") return "bg-amber-500/10 text-amber-400 border-amber-500/25";
  if (s === "error") return "bg-destructive/10 text-destructive border-destructive/25";
  return "bg-muted/50 text-muted-foreground border-border";
}
function dColor(s: string) {
  if (s === "active") return "bg-emerald-400 shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
  if (s === "idle") return "bg-amber-400";
  if (s === "error") return "bg-destructive";
  return "bg-muted-foreground/40";
}
function taskIcon(s: string) {
  if (s === "completed") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (s === "failed") return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (s === "running") return <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />;
  if (s === "cancelled") return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Clock className="w-3.5 h-3.5 text-amber-400" />;
}
function logColor(l?: string) {
  if (l === "error") return "text-destructive";
  if (l === "warning") return "text-amber-400";
  if (l === "success") return "text-emerald-400";
  return "text-muted-foreground";
}
function logIcon(l?: string) {
  if (l === "error") return <AlertCircle className="w-3 h-3 text-destructive shrink-0" />;
  if (l === "warning") return <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />;
  if (l === "success") return <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />;
  return <Info className="w-3 h-3 text-muted-foreground/60 shrink-0" />;
}

function AgentDetailSheet({ agentId, open, onClose }: { agentId: number | null; open: boolean; onClose: () => void }) {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const { data: agent, isLoading: al } = trpc.agents.getById.useQuery(
    { id: agentId! }, { enabled: !!agentId, refetchInterval: 10_000 }
  );
  const { data: agentTasks, isLoading: tl } = trpc.agents.getTasks.useQuery(
    { agentId: agentId!, limit: 20 }, { enabled: !!agentId, refetchInterval: 15_000 }
  );
  const { data: logs, isLoading: ll } = trpc.tasks.getLogs.useQuery(
    { taskId: selectedTaskId! },
    { enabled: !!selectedTaskId, refetchInterval: selectedTaskId ? 3_000 : false }
  );
  const selectedTask = agentTasks?.find((t: any) => t.id === selectedTaskId);
  if (!agentId) return null;
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl bg-card border-border overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            {agent && (
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${AGENT_TYPE_COLOR[agent.agentType ?? "custom"]}`}>
                {AGENT_TYPE_ICON[agent.agentType ?? "custom"]}
              </div>
            )}
            <span>{al ? "Loading…" : agent?.name ?? "Agent"}</span>
          </SheetTitle>
          {agent && (
            <SheetDescription className="text-xs text-muted-foreground">
              {agent.role} · {agent.model ?? "No model"} · Tasks completed: {agent.tasksCompleted}
            </SheetDescription>
          )}
        </SheetHeader>
        {al ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading…</div>
        ) : agent ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Status", value: <div className="flex items-center gap-1.5"><div className={`w-2 h-2 rounded-full ${dColor(agent.status)}`} /><span className="text-sm font-medium capitalize">{agent.status}</span></div> },
                { label: "Last active", value: <p className="text-sm font-medium">{agent.lastActive ? new Date(agent.lastActive).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" }) : "Never"}</p> },
                { label: "Tasks done", value: <p className="text-2xl font-bold tabular-nums">{agent.tasksCompleted}</p> },
                { label: "Agent type", value: <p className="text-sm font-medium capitalize">{agent.agentType ?? "custom"}</p> },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted/20 rounded-lg p-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  {value}
                </div>
              ))}
            </div>
            {agent.description && <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>}
            {agent.driveFolderUrl && (
              <a href={agent.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <FolderOpen className="w-3.5 h-3.5" />Google Drive folder<ExternalLink className="w-3 h-3" />
              </a>
            )}
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5 text-muted-foreground" />Recent Tasks</p>
              {tl ? <div className="text-xs text-muted-foreground">Loading…</div> : !agentTasks?.length ? (
                <div className="text-xs text-muted-foreground">No tasks assigned yet</div>
              ) : (
                <div className="space-y-1.5">
                  {agentTasks.map((task: any) => (
                    <button key={task.id} onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                      className={`w-full flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${selectedTaskId === task.id ? "border-primary/40 bg-primary/10" : "border-border bg-muted/20 hover:border-border/80"}`}>
                      {taskIcon(task.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{task.title}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(task.createdAt).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}{task.priority && <span className="ml-1.5 capitalize">· {task.priority}</span>}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${sColor(task.status)}`}>{task.status}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedTaskId && (
              <div>
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                  Logs — {selectedTask?.title}
                  {selectedTask?.status === "running" && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-400 font-normal">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />Live
                    </span>
                  )}
                </p>
                <ScrollArea className="h-48 rounded-lg border border-border bg-muted/10 p-3">
                  {ll ? <p className="text-xs text-muted-foreground">Loading logs…</p> : !logs?.length ? (
                    <p className="text-xs text-muted-foreground">No logs yet</p>
                  ) : (
                    <div className="space-y-1.5 font-mono">
                      {logs.map((log: any) => (
                        <div key={log.id} className="flex items-start gap-1.5">
                          {logIcon(log.level)}
                          <div className="flex-1 min-w-0">
                            <span className={`text-[11px] ${logColor(log.level)}`}>{log.message}</span>
                            <span className="text-[10px] text-muted-foreground/50 ml-1.5">{new Date(log.createdAt).toLocaleTimeString("pl-PL")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
        ) : <div className="text-sm text-muted-foreground">Agent not found</div>}
      </SheetContent>
    </Sheet>
  );
}

function CreateAgentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", role: "", description: "", model: "", agentType: "custom" as string, mcpEndpoint: "", status: "idle" as string });
  const create = trpc.agents.create.useMutation({
    onSuccess: () => { toast.success("Agent created"); onCreated(); onClose(); setForm({ name: "", role: "", description: "", model: "", agentType: "custom", mcpEndpoint: "", status: "idle" }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />New Agent</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Name *</Label><Input className="mt-1" placeholder="My Agent" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Role</Label><Input className="mt-1" placeholder="monitor" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} /></div>
            <div><Label className="text-xs">Model</Label><Input className="mt-1" placeholder="gpt-4o-mini" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
          </div>
          <div><Label className="text-xs">Description</Label><Textarea className="mt-1 resize-none" rows={2} placeholder="What does this agent do?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Type</Label>
              <Select value={form.agentType} onValueChange={v => setForm(f => ({ ...f, agentType: v }))}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["manus","n8n","autogpt","crewai","custom"].map(t => <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Initial Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{["active","idle","offline","error"].map(s => <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">MCP Endpoint (optional)</Label><Input className="mt-1" placeholder="https://mcp.example.com/agent" value={form.mcpEndpoint} onChange={e => setForm(f => ({ ...f, mcpEndpoint: e.target.value }))} /></div>
        </div>
        <DialogFooter className="mt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!form.name || create.isPending} onClick={() => create.mutate({ name: form.name, role: form.role || undefined, description: form.description || undefined, model: form.model || undefined, agentType: form.agentType as any, status: form.status as any, mcpEndpoint: form.mcpEndpoint || undefined })}>
            {create.isPending ? "Creating…" : "Create Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentCard({ agent, onSelect, updateStatus, onDelete }: { agent: any; onSelect: (id: number) => void; updateStatus: any; onDelete: (id: number) => void }) {
  const agentType = agent.agentType ?? "custom";
  return (
    <Card className="bg-card border-border hover:border-border/80 transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${AGENT_TYPE_COLOR[agentType] ?? AGENT_TYPE_COLOR.custom}`}>
                {AGENT_TYPE_ICON[agentType] ?? AGENT_TYPE_ICON.custom}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${dColor(agent.status)}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{agent.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{agent.role}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sColor(agent.status)}`}>{agent.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {agent.description && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{agent.description}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-muted/20 rounded-lg p-2.5 text-center">
            <p className="text-lg font-bold tabular-nums">{agent.tasksCompleted ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Tasks done</p>
          </div>
          <div className="bg-muted/20 rounded-lg p-2.5 text-center">
            <p className="text-xs font-medium truncate">{agent.model ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">Model</p>
          </div>
        </div>
        {agent.driveFolderUrl && (
          <a href={agent.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <FolderOpen className="w-3 h-3" />Google Drive folder<ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        <div className="flex gap-2">
          {agent.status !== "active" ? (
            <Button size="sm" className="flex-1 h-8 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20" variant="outline"
              onClick={() => updateStatus.mutate({ id: agent.id, status: "active" })} disabled={updateStatus.isPending}>
              <Play className="w-3 h-3 mr-1" />Activate
            </Button>
          ) : (
            <Button size="sm" className="flex-1 h-8 text-xs bg-destructive/10 text-destructive border border-destructive/25 hover:bg-destructive/20" variant="outline"
              onClick={() => updateStatus.mutate({ id: agent.id, status: "idle" })} disabled={updateStatus.isPending}>
              <Square className="w-3 h-3 mr-1" />Deactivate
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" onClick={() => onSelect(agent.id)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(agent.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        {agent.lastActive && (
          <p className="text-[10px] text-muted-foreground/60">Last active: {new Date(agent.lastActive).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Agents() {
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { data: agents, isLoading, refetch } = trpc.agents.list.useQuery(undefined, { refetchInterval: 10_000 });
  const { data: secrets } = trpc.secrets.list.useQuery();
  const updateStatus = trpc.agents.updateStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Agent status updated"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteAgent = trpc.agents.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Agent deleted"); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });
  const hasSecret = (key: string) => secrets?.some((s: any) => s.name === key);
  const aiAgents = agents?.filter((a: any) => ["manus", "n8n", "autogpt", "crewai"].includes(a.agentType)) ?? [];
  const customAgents = agents?.filter((a: any) => !["manus", "n8n", "autogpt", "crewai"].includes(a.agentType)) ?? [];
  const activeCount = agents?.filter((a: any) => a.status === "active").length ?? 0;
  const totalTasks = agents?.reduce((sum: number, a: any) => sum + (a.tasksCompleted ?? 0), 0) ?? 0;
  const agentToDelete = agents?.find((a: any) => a.id === deleteId);
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Bot className="w-6 h-6 text-primary" />Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live status · auto-refreshes every 10s · {activeCount} active · {totalTasks} tasks done</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" />New Agent
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </Button>
        </div>
      </div>

      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Cpu className="w-3.5 h-3.5" />AI Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {AI_PROVIDERS.map((p) => (
            <Card key={p.id} className={`border ${p.color} bg-card`}>
              <CardContent className="p-4 flex items-center gap-3">
                <span className="text-2xl">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.provider} · {p.model}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${hasSecret(p.secretKey) ? "text-emerald-400 border-emerald-400/30" : "text-muted-foreground"}`}>
                  {hasSecret(p.secretKey) ? "Configured" : "No key"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          {aiAgents.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Brain className="w-3.5 h-3.5" />AI Agents</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {aiAgents.map((a: any) => <AgentCard key={a.id} agent={a} onSelect={setSelectedAgentId} updateStatus={updateStatus} onDelete={setDeleteId} />)}
              </div>
            </section>
          )}
          {customAgents.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2"><Bot className="w-3.5 h-3.5" />Custom Agents</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {customAgents.map((a: any) => <AgentCard key={a.id} agent={a} onSelect={setSelectedAgentId} updateStatus={updateStatus} onDelete={setDeleteId} />)}
              </div>
            </section>
          )}
          {!agents?.length && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <Bot className="w-8 h-8 opacity-30" /><p className="text-sm">No agents registered yet</p>
            </div>
          )}
        </>
      )}
      <AgentDetailSheet agentId={selectedAgentId} open={!!selectedAgentId} onClose={() => setSelectedAgentId(null)} />
      <CreateAgentDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={refetch} />
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete <strong>{agentToDelete?.name}</strong>? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteId && deleteAgent.mutate({ id: deleteId })} disabled={deleteAgent.isPending}>
              {deleteAgent.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
