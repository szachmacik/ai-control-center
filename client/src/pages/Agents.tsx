import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot, Play, Square, RefreshCw, ChevronRight, Cpu, Brain,
  FolderOpen, Zap, Network, Sparkles, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

// Agent type icons
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

// AI Provider agents (static, linked to secrets)
const AI_PROVIDERS = [
  { id: "openai", name: "GPT-4o", provider: "OpenAI", model: "gpt-4o", color: "bg-emerald-500/10 border-emerald-500/20", icon: "🤖", secretKey: "OPENAI_API_KEY" },
  { id: "anthropic", name: "Claude 3.5", provider: "Anthropic", model: "claude-3-5-sonnet", color: "bg-amber-500/10 border-amber-500/20", icon: "🧠", secretKey: "ANTHROPIC_API_KEY" },
  { id: "gemini", name: "Gemini 1.5 Pro", provider: "Google", model: "gemini-1.5-pro", color: "bg-blue-500/10 border-blue-500/20", icon: "✨", secretKey: "GEMINI_API_KEY" },
];

export default function Agents() {
  const { data: agents, isLoading, refetch } = trpc.agents.list.useQuery();
  const { data: secrets } = trpc.secrets.list.useQuery();
  const updateStatus = trpc.agents.updateStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Agent status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const statusColor = (status: string) => {
    if (status === "active") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    if (status === "idle") return "bg-amber-500/10 text-amber-400 border-amber-500/25";
    if (status === "error") return "bg-destructive/10 text-destructive border-destructive/25";
    return "bg-muted/50 text-muted-foreground border-border";
  };

  const dotColor = (status: string) => {
    if (status === "active") return "bg-emerald-400 shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
    if (status === "idle") return "bg-amber-400";
    if (status === "error") return "bg-destructive";
    return "bg-muted-foreground/40";
  };

  const hasSecret = (key: string) => secrets?.some((s: any) => s.name === key);

  // Group agents by type
  const aiAgents = agents?.filter((a: any) => ["manus", "n8n", "autogpt", "crewai"].includes(a.agentType)) ?? [];
  const customAgents = agents?.filter((a: any) => !["manus", "n8n", "autogpt", "crewai"].includes(a.agentType)) ?? [];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage AI agents and provider connections</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {/* AI Providers Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">AI Providers</h2>
          <span className="text-xs text-muted-foreground/50 ml-1">— API connections</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {AI_PROVIDERS.map((p) => {
            const connected = hasSecret(p.secretKey);
            return (
              <Card key={p.id} className={`bg-card border transition-all hover:border-border/80 ${connected ? "border-border" : "border-dashed border-border/50"}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl ${p.color}`}>
                        {p.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.provider}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={connected
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 text-[10px]"
                      : "bg-muted/50 text-muted-foreground border-border text-[10px]"
                    }>
                      {connected ? "Connected" : "Not set"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono bg-muted/30 px-2 py-0.5 rounded text-[10px]">{p.model}</span>
                    <span className="text-[10px] opacity-60">{p.secretKey}</span>
                  </div>
                  {!connected && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-xs border-dashed border-border text-muted-foreground hover:text-foreground"
                      onClick={() => toast.info(`Add ${p.secretKey} in Secrets vault to connect`)}
                    >
                      Configure API Key
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Orchestration Agents Section */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Orchestration Agents</h2>
          <span className="text-xs text-muted-foreground/50 ml-1">— autonomous workers</span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !agents?.length ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Bot className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm mb-1">No agents seeded yet</p>
              <p className="text-xs text-muted-foreground/60">Go to Infrastructure → Seed to populate agents</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent: any) => {
              const agentType = agent.agentType ?? "custom";
              const typeIcon = AGENT_TYPE_ICON[agentType] ?? AGENT_TYPE_ICON.custom;
              const typeColor = AGENT_TYPE_COLOR[agentType] ?? AGENT_TYPE_COLOR.custom;
              return (
                <Card key={agent.id} className="bg-card border-border hover:border-border/80 transition-all group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${typeColor}`}>
                            {typeIcon}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${dotColor(agent.status)}`} />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold text-foreground">{agent.name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">{agent.role}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(agent.status)}`}>
                        {agent.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {agent.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{agent.description}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/20 rounded-lg p-2.5 text-center">
                        <p className="text-lg font-bold text-foreground tabular-nums">{agent.tasksCompleted ?? 0}</p>
                        <p className="text-[10px] text-muted-foreground">Tasks done</p>
                      </div>
                      <div className="bg-muted/20 rounded-lg p-2.5 text-center">
                        <p className="text-xs font-medium text-foreground truncate">{agent.model ?? "—"}</p>
                        <p className="text-[10px] text-muted-foreground">Model</p>
                      </div>
                    </div>

                    {/* Drive folder link */}
                    {agent.driveFolderUrl && (
                      <a
                        href={agent.driveFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <FolderOpen className="w-3 h-3" />
                        Google Drive folder
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}

                    <div className="flex gap-2">
                      {agent.status !== "active" ? (
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ id: agent.id, status: "active" })}
                          disabled={updateStatus.isPending}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Activate
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs bg-destructive/10 text-destructive border border-destructive/25 hover:bg-destructive/20"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ id: agent.id, status: "idle" })}
                          disabled={updateStatus.isPending}
                        >
                          <Square className="w-3 h-3 mr-1" />
                          Deactivate
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>

                    {agent.lastActive && (
                      <p className="text-[10px] text-muted-foreground/60">
                        Last active: {new Date(agent.lastActive).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
