import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bot, ListTodo, Server, Activity, AlertCircle, Info, AlertTriangle,
  CheckCircle2, ShieldCheck, Wifi, WifiOff, TrendingUp,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import { subDays, format, startOfDay, isSameDay } from "date-fns";

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-2">{label}</p>
            <p className={`text-3xl font-bold tabular-nums ${accent ?? "text-foreground"}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent ? "bg-current/10" : "bg-muted/30"}`}
            style={accent ? { backgroundColor: `color-mix(in oklch, ${accent} 10%, transparent)` } : {}}
          >
            <Icon className={`w-5 h-5 ${accent ?? "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Custom tooltip for charts ────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  );
  const { data: auditStats } = trpc.audit.stats.useQuery(
    undefined,
    { refetchInterval: 60_000 },
  );
  const { data: recentFindings } = trpc.audit.recentFindings.useQuery(
    { days: 7 },
    { refetchInterval: 60_000 },
  );

  // Build 7-day activity chart from recentLogs (agentLogs)
  const activityData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    const logs: any[] = stats?.recentLogs ?? [];
    return days.map((day) => ({
      date: format(day, "EEE"),
      events: logs.filter((l) => isSameDay(new Date(l.createdAt), day)).length,
    }));
  }, [stats?.recentLogs]);

  // Build 7-day findings severity chart
  const findingsData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
    const findings: any[] = recentFindings ?? [];
    return days.map((day) => ({
      date: format(day, "EEE"),
      critical: findings.filter((f) => f.severity === "critical" && isSameDay(new Date(f.createdAt), day)).length,
      high: findings.filter((f) => f.severity === "high" && isSameDay(new Date(f.createdAt), day)).length,
      medium: findings.filter((f) => f.severity === "medium" && isSameDay(new Date(f.createdAt), day)).length,
    }));
  }, [recentFindings]);

  const eventIcon = (type: string) => {
    if (type === "error") return <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
    if (type === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-[oklch(0.72_0.18_75)] shrink-0" />;
    if (type === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.62_0.17_145)] shrink-0" />;
    return <Info className="w-3.5 h-3.5 text-primary shrink-0" />;
  };

  const agentDotColor = (status: string) => {
    if (status === "active") return "bg-[oklch(0.62_0.17_145)] shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
    if (status === "idle") return "bg-[oklch(0.72_0.18_75)]";
    return "bg-muted-foreground/40";
  };

  const infraDotColor = (status: string) => {
    if (status === "healthy") return "bg-[oklch(0.62_0.17_145)] shadow-[0_0_6px_oklch(0.62_0.17_145/0.7)]";
    if (status === "degraded") return "bg-[oklch(0.72_0.18_75)]";
    return "bg-destructive";
  };

  const severityColor: Record<string, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-blue-400",
    info: "text-muted-foreground",
  };

  const severityBg: Record<string, string> = {
    critical: "bg-red-500/10 border-red-500/20 text-red-400",
    high: "bg-orange-500/10 border-orange-500/20 text-orange-400",
    medium: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    low: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    info: "bg-muted/20 border-border text-muted-foreground",
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Bot}
            label="Active Agents"
            value={stats?.activeAgents ?? 0}
            sub={`of ${(stats?.agents ?? []).length} total`}
            accent="text-[oklch(0.62_0.17_145)]"
          />
          <StatCard
            icon={ListTodo}
            label="Running Tasks"
            value={stats?.runningTasks ?? 0}
            sub="in progress"
            accent="text-primary"
          />
          <StatCard
            icon={Server}
            label="Healthy Services"
            value={`${stats?.healthyServices ?? 0}/${stats?.totalServices ?? 0}`}
            sub="infrastructure"
            accent="text-[oklch(0.62_0.17_145)]"
          />
          <StatCard
            icon={Activity}
            label="Events Today"
            value={stats?.eventsToday ?? 0}
            sub="log entries"
          />
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity chart — 7 days */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Agent Activity — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={activityData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.62 0.17 145)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.62 0.17 145)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.3)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="events"
                  name="Events"
                  stroke="oklch(0.62 0.17 145)"
                  strokeWidth={2}
                  fill="url(#actGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Audit findings chart — 7 days */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Audit Findings — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={findingsData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0 0 / 0.3)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="critical" name="Critical" stackId="a" fill="oklch(0.55 0.22 25)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="high" name="High" stackId="a" fill="oklch(0.65 0.18 55)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="medium" name="Medium" stackId="a" fill="oklch(0.72 0.18 75)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agents status */}
        <Card className="bg-card border-border lg:col-span-1">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Agents
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/20 rounded-lg animate-pulse" />)}
              </div>
            ) : !(stats?.agents ?? []).length ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No agents configured</div>
            ) : (
              <div className="divide-y divide-border">
                {(stats?.agents ?? []).map((agent: any) => (
                  <div key={agent.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${agentDotColor(agent.status)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{agent.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{agent.role ?? agent.status}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
                      {agent.tasksCompleted ?? 0} tasks
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent logs */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-muted/20 rounded-lg animate-pulse" />)}
              </div>
            ) : !(stats?.recentLogs ?? []).length ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No recent activity</div>
            ) : (
              <div className="divide-y divide-border">
                {(stats?.recentLogs ?? []).map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5">{eventIcon(log.eventType)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug line-clamp-1">{log.message}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        {log.agentName && <span className="font-medium">{log.agentName}</span>}
                        <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Infrastructure + Recent Audit Findings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Infrastructure status */}
        {(stats?.infrastructure ?? []).length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Server className="w-4 h-4 text-primary" />
                Infrastructure
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(stats?.infrastructure ?? []).map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${infraDotColor(item.status)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{item.type}</p>
                    </div>
                    {item.status === "healthy" ? (
                      <Wifi className="w-3.5 h-3.5 text-[oklch(0.62_0.17_145)]" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-destructive" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Audit Findings */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Recent Audit Findings
              {auditStats && auditStats.criticalFindings > 0 && (
                <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0 bg-red-500/10 text-red-400 border-red-500/20">
                  {auditStats.criticalFindings} critical
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!(recentFindings ?? []).length ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-muted-foreground/20" />
                No findings in the last 7 days
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(recentFindings ?? []).slice(0, 6).map((f: any) => (
                  <div key={f.id} className="flex items-start gap-3 px-4 py-3">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 shrink-0 mt-0.5 ${severityBg[f.severity] ?? severityBg.info}`}
                    >
                      {f.severity}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug line-clamp-1">{f.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{f.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
