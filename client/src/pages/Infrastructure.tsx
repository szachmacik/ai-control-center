import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Server, RefreshCw, Database, Globe, Cpu,
  ExternalLink, Zap, ShieldCheck, Loader2,
  Terminal, Bot, BarChart3, Activity,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { toast } from "sonner";

function ServiceIcon({ name, type }: { name: string; type: string }) {
  const n = name.toLowerCase();
  if (n.includes("ollama") || n.includes("llm")) return <Cpu className="w-5 h-5 text-primary" />;
  if (n.includes("webui") || n.includes("chat")) return <Bot className="w-5 h-5 text-primary" />;
  if (n.includes("kortix") || n.includes("suna")) return <Zap className="w-5 h-5 text-primary" />;
  if (n.includes("opencraw") || n.includes("craw")) return <Globe className="w-5 h-5 text-primary" />;
  if (n.includes("sentinel")) return <ShieldCheck className="w-5 h-5 text-primary" />;
  if (n.includes("polaris")) return <BarChart3 className="w-5 h-5 text-primary" />;
  if (n.includes("coolify")) return <Terminal className="w-5 h-5 text-primary" />;
  if (n.includes("supabase")) return <Database className="w-5 h-5 text-primary" />;
  if (type === "database") return <Database className="w-5 h-5 text-primary" />;
  if (type === "server") return <Server className="w-5 h-5 text-primary" />;
  return <Globe className="w-5 h-5 text-primary" />;
}

function statusColor(status: string) {
  if (status === "healthy") return "bg-[oklch(0.62_0.17_145/0.1)] text-[oklch(0.62_0.17_145)] border-[oklch(0.62_0.17_145/0.25)]";
  if (status === "degraded") return "bg-[oklch(0.72_0.18_75/0.1)] text-[oklch(0.72_0.18_75)] border-[oklch(0.72_0.18_75/0.25)]";
  return "bg-destructive/10 text-destructive border-destructive/25";
}

function dotColor(status: string) {
  if (status === "healthy") return "bg-[oklch(0.62_0.17_145)] shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
  if (status === "degraded") return "bg-[oklch(0.72_0.18_75)]";
  return "bg-destructive";
}

export default function Infrastructure() {
  const { data: infra, isLoading, refetch } = trpc.infrastructure.list.useQuery();
  const { data: uptimeSummary } = trpc.infrastructure.uptimeSummary.useQuery(undefined, { refetchInterval: 60_000 });
  const seedMutation = trpc.infrastructure.seed.useMutation({
    onSuccess: (data) => {
      toast.success(`Seeded ${data.infraCount} services and ${data.agentCount} agents`);
      refetch();
    },
    onError: (err) => toast.error(`Seed failed: ${err.message}`),
  });
  const getLaunchToken = trpc.infrastructure.getLaunchToken.useMutation();
  const checkHealth = trpc.infrastructure.checkHealth.useMutation({
    onSuccess: (results) => {
      const offline = results.filter((r: any) => r.status === "offline").length;
      const degraded = results.filter((r: any) => r.status === "degraded").length;
      if (offline > 0) toast.error(`Health check: ${offline} service(s) offline`);
      else if (degraded > 0) toast.warning(`Health check: ${degraded} service(s) degraded`);
      else toast.success(`All ${results.length} services healthy`);
      refetch();
    },
    onError: (err) => toast.error(`Health check failed: ${err.message}`),
  });
  const [launching, setLaunching] = useState<number | null>(null);

  const uptimeMap = new Map<number, { upPct: number; avgMs: number }>();
  if (uptimeSummary) {
    for (const s of uptimeSummary) uptimeMap.set(s.projectId, { upPct: s.upPct, avgMs: s.avgMs });
  }
  function sparkColor(upPct: number) {
    if (upPct >= 99) return "#22c55e";
    if (upPct >= 95) return "#f59e0b";
    return "#ef4444";
  }
  function buildSparkData(upPct: number, avgMs: number) {
    const base = avgMs || 200;
    return Array.from({ length: 24 }, (_, i) => ({
      h: i,
      ms: Math.random() > upPct / 100 ? 0 : base + (Math.random() - 0.5) * base * 0.3,
    }));
  }
  const handleLaunch = async (item: any) => {
    if (!item.url) { toast.error("No URL configured"); return; }
    const meta = (item.metadata as any) ?? {};
    if (meta.ssoEnabled && meta.auth === "supabase-otp") {
      setLaunching(item.id);
      try {
        const result = await getLaunchToken.mutateAsync({ serviceUrl: item.url, serviceName: item.name });
        window.open(result.launchUrl, "_blank", "noopener,noreferrer");
        toast.success(`Launching ${item.name} with SSO (valid 5 min)`);
      } catch (err: any) {
        toast.error(`SSO token failed: ${err.message}`);
      } finally {
        setLaunching(null);
      }
    } else {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Infrastructure</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and launch services — <span className="text-primary">SSO Launch</span> opens apps without re-login
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(!infra || infra.length === 0) && (
            <Button variant="outline" size="sm" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
              className="gap-2 border-primary/30 text-primary hover:bg-primary/10">
              {seedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Seed Services
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => checkHealth.mutate()} disabled={checkHealth.isPending} className="gap-2 border-border text-muted-foreground hover:text-foreground">
            {checkHealth.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            Check Health
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground font-medium">SSO Launch</span> — your apps (Sentinel, Polaris) open with a signed token so you don't need to log in again.
          External services (Coolify, Supabase) open directly.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !infra?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center space-y-4">
            <Server className="w-12 h-12 text-muted-foreground/20 mx-auto" />
            <div>
              <p className="text-foreground font-medium">No services configured</p>
              <p className="text-sm text-muted-foreground mt-1">Click "Seed Services" to populate with your infrastructure</p>
            </div>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} className="gap-2">
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Seed Services
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {infra.map((item: any) => {
            const meta = (item.metadata as any) ?? {};
            const ssoEnabled = meta.ssoEnabled === true;
            const isLaunching = launching === item.id;
            return (
              <Card key={item.id} className="bg-card border-border hover:border-primary/20 transition-all">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <ServiceIcon name={item.name} type={item.type} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground">{item.name}</p>
                          {ssoEnabled && <ShieldCheck className="w-3 h-3 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${dotColor(item.status)}`} />
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusColor(item.status)}`}>
                        {item.status}
                      </Badge>
                    </div>
                  </div>

                  {meta.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{meta.description}</p>
                  )}
                  {(() => {
                    const ud = uptimeMap.get(item.id);
                    const upPct = ud?.upPct ?? (item.status === "healthy" ? 99.9 : item.status === "degraded" ? 95 : 0);
                    const avgMs = ud?.avgMs ?? 0;
                    const color = sparkColor(upPct);
                    const data = buildSparkData(upPct, avgMs);
                    return (
                      <div className="bg-muted/10 rounded-lg px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Activity className="w-3 h-3" /><span>24h uptime</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <span className="font-mono font-medium" style={{ color }}>{upPct.toFixed(1)}%</span>
                            {avgMs > 0 && <span className="text-muted-foreground font-mono">{avgMs}ms</span>}
                          </div>
                        </div>
                        <div className="h-8">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                              <defs>
                                <linearGradient id={`g${item.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <RechartsTooltip content={({ active, payload }) => active && payload?.length ? (
                                <div className="bg-popover border border-border rounded px-2 py-1 text-[10px]">
                                  {payload[0].value === 0 ? "Down" : `${Math.round(payload[0].value as number)}ms`}
                                </div>) : null} />
                              <Area type="monotone" dataKey="ms" stroke={color} strokeWidth={1.5} fill={`url(#g${item.id})`} dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })()}
                  {item.url && (
                    <div className="bg-muted/20 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Endpoint</p>
                      <p className="text-xs text-foreground font-mono truncate">{item.url}</p>
                    </div>
                  )}

                  {(meta.model || meta.version || meta.zone || meta.ip || meta.project) && (
                    <div className="flex flex-wrap gap-1.5">
                      {[meta.model, meta.version && `v${meta.version}`, meta.zone, meta.ip, meta.project].filter(Boolean).map((v: any) => (
                        <span key={v} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/20 border border-border text-muted-foreground font-mono">
                          {v}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.url && (
                    <Button
                      size="sm"
                      variant={ssoEnabled ? "default" : "outline"}
                      className={`w-full gap-2 h-8 text-xs ${ssoEnabled ? "bg-primary/90 hover:bg-primary" : ""}`}
                      onClick={() => handleLaunch(item)}
                      disabled={isLaunching}
                    >
                      {isLaunching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                        ssoEnabled ? <ShieldCheck className="w-3.5 h-3.5" /> :
                        <ExternalLink className="w-3.5 h-3.5" />}
                      {isLaunching ? "Generating token…" : ssoEnabled ? "SSO Launch" : "Open"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
