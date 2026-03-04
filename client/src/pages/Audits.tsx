import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ShieldCheck, ShieldAlert, Activity, Package, Database, Zap,
  CheckCircle2, XCircle, AlertTriangle, Info, Loader2, RefreshCw,
  Clock, TrendingUp, Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Severity = "critical" | "high" | "medium" | "low" | "info" | "none";
type AuditType = "uptime" | "security" | "functional" | "dependency" | "db_health";

const SEVERITY_CONFIG: Record<Severity, { label: string; color: string; icon: React.ElementType }> = {
  critical: { label: "Critical", color: "bg-red-500/10 text-red-500 border-red-500/20", icon: XCircle },
  high:     { label: "High",     color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: ShieldAlert },
  medium:   { label: "Medium",   color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: AlertTriangle },
  low:      { label: "Low",      color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Info },
  info:     { label: "Info",     color: "bg-muted/50 text-muted-foreground border-border", icon: Info },
  none:     { label: "Clean",    color: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle2 },
};

const AUDIT_TYPE_CONFIG: Record<AuditType, { label: string; icon: React.ElementType; description: string }> = {
  uptime:     { label: "Uptime",      icon: Activity,    description: "Endpoint availability & response time" },
  security:   { label: "Security",    icon: ShieldCheck, description: "Secrets, headers, sensitive files" },
  functional: { label: "Functional",  icon: Zap,         description: "TypeScript errors, i18n, code quality" },
  dependency: { label: "Dependencies",icon: Package,     description: "CVEs, outdated packages" },
  db_health:  { label: "DB Health",   icon: Database,    description: "Supabase RLS, table sizes, indexes" },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] px-1.5 py-0 ${cfg.color}`}>
      <Icon className="w-2.5 h-2.5" />
      {cfg.label}
    </Badge>
  );
}

function AuditTypeBadge({ type }: { type: AuditType }) {
  const cfg = AUDIT_TYPE_CONFIG[type] ?? { label: type, icon: Activity };
  const Icon = cfg.icon;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsCards() {
  const { data: stats, isLoading } = trpc.audit.stats.useQuery(undefined, { refetchInterval: 30_000 });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Monitored Projects",
      value: stats?.projectCount ?? 0,
      icon: ShieldCheck,
      color: "text-primary",
    },
    {
      title: "Critical Findings",
      value: stats?.criticalFindings ?? 0,
      icon: XCircle,
      color: stats?.criticalFindings ? "text-red-500" : "text-green-500",
    },
    {
      title: "High Findings",
      value: stats?.highFindings ?? 0,
      icon: ShieldAlert,
      color: stats?.highFindings ? "text-orange-500" : "text-green-500",
    },
    {
      title: "Last Run",
      value: stats?.lastRunAt
        ? formatDistanceToNow(new Date(stats.lastRunAt), { addSuffix: true })
        : "Never",
      icon: Clock,
      color: "text-muted-foreground",
      small: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground">{card.title}</p>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <p className={`font-semibold ${card.small ? "text-sm" : "text-2xl"} text-foreground`}>
                {card.value}
              </p>
              {stats?.lastRunSeverity && card.title === "Last Run" && (
                <div className="mt-1">
                  <SeverityBadge severity={stats.lastRunSeverity as Severity} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Trigger Panel ────────────────────────────────────────────────────────────

function TriggerPanel() {
  const utils = trpc.useUtils();
  const triggerMutation = trpc.audit.trigger.useMutation({
    onSuccess: () => {
      utils.audit.runs.list.invalidate();
      utils.audit.stats.invalidate();
      utils.audit.recentFindings.invalidate();
    },
  });

  const [running, setRunning] = useState<AuditType | null>(null);

  const handleTrigger = async (type: AuditType) => {
    setRunning(type);
    try {
      await triggerMutation.mutateAsync({ type });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Run Audit Manually
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(Object.entries(AUDIT_TYPE_CONFIG) as [AuditType, typeof AUDIT_TYPE_CONFIG[AuditType]][]).map(([type, cfg]) => {
            const Icon = cfg.icon;
            const isRunning = running === type;
            return (
              <Button
                key={type}
                variant="outline"
                size="sm"
                className="flex-col h-auto py-3 gap-1.5 text-xs border-border hover:border-primary/30 hover:bg-primary/5"
                onClick={() => handleTrigger(type)}
                disabled={!!running}
              >
                {isRunning
                  ? <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  : <Icon className="w-4 h-4 text-muted-foreground" />
                }
                <span className={isRunning ? "text-primary" : "text-muted-foreground"}>
                  {cfg.label}
                </span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Run History Table ────────────────────────────────────────────────────────

function FindingsDialog({ runId }: { runId: number }) {
  const { data: findings, isLoading } = trpc.audit.runs.findings.useQuery({ runId });

  return (
    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-background border-border">
      <DialogHeader>
        <DialogTitle className="text-foreground">Findings — Run #{runId}</DialogTitle>
      </DialogHeader>
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !findings?.length ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <CheckCircle2 className="w-10 h-10 text-green-500/40" />
          <p className="text-sm text-muted-foreground">No findings — all checks passed</p>
        </div>
      ) : (
        <div className="space-y-2">
              {findings.map((f: any) => {
            const cfg = SEVERITY_CONFIG[f.severity as Severity] ?? SEVERITY_CONFIG.info;
            const Icon = cfg.icon;
            return (
              <div key={f.id} className={`rounded-lg border p-3 ${cfg.color.replace("text-", "border-").split(" ")[0]} bg-card`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 shrink-0 ${cfg.color.split(" ")[1]}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{f.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.code} · {f.category}</p>
                    </div>
                  </div>
                  <SeverityBadge severity={f.severity as Severity} />
                </div>
                {f.description && (
                  <p className="text-xs text-muted-foreground mt-2 ml-6">{f.description}</p>
                )}
                {f.location && (
                  <p className="text-xs font-mono text-muted-foreground/60 mt-1 ml-6">{f.location}</p>
                )}
                {f.evidence && (
                  <pre className="text-[10px] bg-muted/30 rounded p-2 mt-2 ml-6 overflow-x-auto whitespace-pre-wrap">
                    {f.evidence.slice(0, 300)}
                  </pre>
                )}
                {f.autoFixed && (
                  <div className="flex items-center gap-1.5 mt-2 ml-6">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                    <p className="text-xs text-green-500">Auto-fixed: {f.fixDescription}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </DialogContent>
  );
}

function RunHistoryTable() {
  const { data: runs, isLoading, refetch } = trpc.audit.runs.list.useQuery({ limit: 30 });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Audit History
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !runs?.length ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Activity className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No audit runs yet. Trigger one above.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs text-muted-foreground">Severity</TableHead>
                <TableHead className="text-xs text-muted-foreground text-right">Findings</TableHead>
                <TableHead className="text-xs text-muted-foreground">Triggered by</TableHead>
                <TableHead className="text-xs text-muted-foreground">Started</TableHead>
                <TableHead className="text-xs text-muted-foreground w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run: any) => (
                <TableRow key={run.id} className="border-border hover:bg-muted/20">
                  <TableCell className="py-2">
                    <AuditTypeBadge type={run.auditType as AuditType} />
                  </TableCell>
                  <TableCell className="py-2">
                    {run.status === "running" ? (
                      <span className="flex items-center gap-1 text-xs text-blue-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> Running
                      </span>
                    ) : run.status === "completed" ? (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-500">
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <SeverityBadge severity={run.severity as Severity} />
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-foreground">{run.totalFindings}</span>
                    {run.criticalCount > 0 && (
                      <span className="ml-1 text-[10px] text-red-500">({run.criticalCount} crit)</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-muted-foreground">{run.triggeredBy}</span>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
                    </span>
                  </TableCell>
                  <TableCell className="py-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      </DialogTrigger>
                      <FindingsDialog runId={run.id} />
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Recent Findings ──────────────────────────────────────────────────────────

function RecentFindings() {
  const { data: findings, isLoading } = trpc.audit.recentFindings.useQuery({ days: 7 });
  const critical = findings?.filter((f: any) => f.severity === "critical") ?? [];
  const high = findings?.filter((f: any) => f.severity === "high") ?? [];
  const rest = findings?.filter((f: any) => !["critical", "high"].includes(f.severity)) ?? [];
  const sorted = [...critical, ...high, ...rest].slice(0, 20);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          Recent Findings (7 days)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !sorted.length ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <CheckCircle2 className="w-8 h-8 text-green-500/30" />
            <p className="text-sm text-muted-foreground">No findings in the last 7 days</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((f: any) => {
              const cfg = SEVERITY_CONFIG[f.severity as Severity] ?? SEVERITY_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <div key={f.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/10">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color.split(" ")[1]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{f.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {f.code} · {f.category}
                      {f.location && ` · ${f.location}`}
                    </p>
                  </div>
                  <SeverityBadge severity={f.severity as Severity} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Monitored Projects ───────────────────────────────────────────────────────

function MonitoredProjects() {
  const { data: projects, isLoading } = trpc.audit.projects.list.useQuery();

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Monitored Projects
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted/20 rounded animate-pulse" />)}
          </div>
        ) : !projects?.length ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No projects configured.</p>
            <p className="text-xs text-muted-foreground mt-1">Add projects via the API or seed them from your repos.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((p: any) => {
              const typeIcons: Record<string, React.ElementType> = {
                github_repo: ShieldCheck, url: Activity, supabase: Database, npm_package: Package,
              };
              const Icon = typeIcons[p.type] ?? ShieldCheck;
              return (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/10">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{p.target}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${p.enabled ? "text-green-500 border-green-500/20" : "text-muted-foreground"}`}>
                    {p.enabled ? "active" : "paused"}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Audits() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Audits</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Security, uptime, functional, and dependency monitoring for all projects
        </p>
      </div>

      {/* Stats */}
      <StatsCards />

      {/* Trigger */}
      <TriggerPanel />

      {/* Main content */}
      <Tabs defaultValue="history" className="space-y-4">
        <TabsList className="bg-muted/30 border border-border">
          <TabsTrigger value="history" className="text-xs">Run History</TabsTrigger>
          <TabsTrigger value="findings" className="text-xs">Recent Findings</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs">Monitored Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <RunHistoryTable />
        </TabsContent>

        <TabsContent value="findings">
          <RecentFindings />
        </TabsContent>

        <TabsContent value="projects">
          <MonitoredProjects />
        </TabsContent>
      </Tabs>
    </div>
  );
}
