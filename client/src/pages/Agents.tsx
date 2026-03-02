import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Play, Square, RefreshCw, ChevronRight, Cpu } from "lucide-react";
import { toast } from "sonner";

export default function Agents() {
  const { data: agents, isLoading, refetch } = trpc.agents.list.useQuery();
  const updateStatus = trpc.agents.updateStatus.useMutation({
    onSuccess: () => { refetch(); toast.success("Agent status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const statusColor = (status: string) => {
    if (status === "active") return "bg-[oklch(0.62_0.17_145/0.1)] text-[oklch(0.62_0.17_145)] border-[oklch(0.62_0.17_145/0.25)]";
    if (status === "idle") return "bg-[oklch(0.72_0.18_75/0.1)] text-[oklch(0.72_0.18_75)] border-[oklch(0.72_0.18_75/0.25)]";
    return "bg-muted/50 text-muted-foreground border-border";
  };

  const dotColor = (status: string) => {
    if (status === "active") return "bg-[oklch(0.62_0.17_145)] shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
    if (status === "idle") return "bg-[oklch(0.72_0.18_75)]";
    return "bg-muted-foreground/40";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and monitor AI agents</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-48 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !agents?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <Bot className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No agents configured</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent: any) => (
            <Card key={agent.id} className="bg-card border-border hover:border-border/80 transition-all group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-primary" />
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
              <CardContent className="space-y-4">
                {agent.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{agent.description}</p>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted/20 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold text-foreground tabular-nums">{agent.tasks_completed ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Tasks done</p>
                  </div>
                  <div className="bg-muted/20 rounded-lg p-2.5 text-center">
                    <p className="text-xs font-medium text-foreground truncate">{agent.model ?? "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Model</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {agent.status !== "active" ? (
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-[oklch(0.62_0.17_145/0.1)] text-[oklch(0.62_0.17_145)] border border-[oklch(0.62_0.17_145/0.25)] hover:bg-[oklch(0.62_0.17_145/0.2)]"
                      variant="outline"
                      onClick={() => updateStatus.mutate({ id: agent.id, status: "active" })}
                      disabled={updateStatus.isPending}
                    >
                      <Play className="w-3 h-3 mr-1" />
                      Start
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
                      Stop
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {agent.last_active && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Last active: {new Date(agent.last_active).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
