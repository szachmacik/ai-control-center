import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Plus,
  Globe,
  Trash2,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Download,
  FlaskConical,
  BarChart3,
  TrendingDown,
  TrendingUp,
  Eye,
  Play,
} from "lucide-react";
import { toast } from "sonner";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   color: "bg-slate-500/10 text-slate-400 border-slate-500/20",   icon: Clock },
  cloning:   { label: "Cloning",   color: "bg-blue-500/10 text-blue-400 border-blue-500/20",     icon: Loader2 },
  ready:     { label: "Ready",     color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  scanning:  { label: "Scanning",  color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",   icon: RefreshCw },
  completed: { label: "Scanned",   color: "bg-purple-500/10 text-purple-400 border-purple-500/20",   icon: Shield },
  error:     { label: "Error",     color: "bg-red-500/10 text-red-400 border-red-500/20",            icon: AlertTriangle },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium:   "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low:      "bg-blue-500/20 text-blue-400 border-blue-500/30",
  info:     "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function SeverityBadge({ count, level }: { count: number; level: string }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${SEVERITY_COLORS[level]}`}>
      {count} {level}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ready;
  const Icon = cfg.icon;
  const isAnimated = status === "cloning" || status === "scanning";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${cfg.color}`}>
      <Icon className={`h-3 w-3 ${isAnimated ? "animate-spin" : ""}`} />
      {cfg.label}
    </span>
  );
}

// ─── Risk score helpers ────────────────────────────────────────────────────────

function calcRiskScore(summary: any): number {
  if (!summary) return 0;
  return Math.min(100, (summary.critical ?? 0) * 10 + (summary.high ?? 0) * 5 + (summary.medium ?? 0) * 2 + (summary.low ?? 0));
}

function riskColor(score: number): string {
  if (score >= 70) return "text-red-400";
  if (score >= 40) return "text-orange-400";
  if (score >= 15) return "text-yellow-400";
  return "text-green-400";
}

function riskLabel(score: number): string {
  if (score >= 70) return "Critical Risk";
  if (score >= 40) return "High Risk";
  if (score >= 15) return "Medium Risk";
  return "Low Risk";
}

function RiskIcon({ score }: { score: number }) {
  if (score >= 70) return <ShieldX className="h-4 w-4 text-red-400" />;
  if (score >= 40) return <ShieldAlert className="h-4 w-4 text-orange-400" />;
  if (score >= 15) return <Shield className="h-4 w-4 text-yellow-400" />;
  return <ShieldCheck className="h-4 w-4 text-green-400" />;
}

// ─── Severity mini bar ─────────────────────────────────────────────────────────

function SeverityBar({ summary }: { summary: any }) {
  const total = summary?.total || 0;
  if (total === 0) return <span className="text-xs text-muted-foreground/50">No findings</span>;
  const bars = [
    { key: "critical", color: "bg-red-500",    count: summary.critical ?? 0 },
    { key: "high",     color: "bg-orange-500", count: summary.high ?? 0 },
    { key: "medium",   color: "bg-yellow-500", count: summary.medium ?? 0 },
    { key: "low",      color: "bg-blue-500",   count: summary.low ?? 0 },
    { key: "info",     color: "bg-slate-500",  count: summary.info ?? 0 },
  ].filter((b) => b.count > 0);
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 rounded-full overflow-hidden gap-px">
        {bars.map((b) => (
          <div
            key={b.key}
            className={b.color}
            style={{ width: `${(b.count / total) * 100}%` }}
            title={`${b.key}: ${b.count}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{total} finding{total !== 1 ? "s" : ""}</span>
    </div>
  );
}

// ─── Stats card ────────────────────────────────────────────────────────────────

function StatsCard({
  icon,
  label,
  value,
  sub,
  valueColor = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
          <p className={`text-xl font-bold ${valueColor || "text-foreground"}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SandboxList() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const { data: sandboxes, isLoading, refetch } = trpc.sandbox.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const data = query.state.data as any[];
      const active = Array.isArray(data) && data.some((s: any) => s.status === "cloning" || s.status === "scanning");
      return active ? 3000 : false;
    },
  });

  const deleteMutation = trpc.sandbox.delete.useMutation({
    onSuccess: () => { toast.success("Sandbox deleted"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const bulkDeleteMutation = trpc.sandbox.bulkDelete.useMutation({
    onSuccess: (data) => {
      toast.success(`Deleted ${data.succeeded} sandbox${data.succeeded !== 1 ? "es" : ""}${data.failed > 0 ? ` (${data.failed} failed)` : ""}`);
      setSelectedIds(new Set());
      setIsBulkDeleting(false);
      refetch();
    },
    onError: (err) => {
      toast.error(err.message);
      setIsBulkDeleting(false);
    },
  });

  const downloadMutation = trpc.sandbox.getDownloadPath.useMutation({
    onSuccess: (data) => toast.success(`ZIP ready: ${(data as any).filename}`),
    onError: (err) => toast.error(err.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: number[]) => {
    setSelectedIds((prev) => {
      if (ids.every((id) => prev.has(id))) return new Set();
      return new Set(ids);
    });
  };

  // ─── Global stats ──────────────────────────────────────────────────────────

  const list = (sandboxes as any[]) ?? [];
  const totalCount = list.length;
  const activeCount = list.filter((s) => s.status === "cloning" || s.status === "scanning").length;
  const completedCount = list.filter((s) => s.status === "completed").length;

  const totals = list.reduce(
    (acc, s) => {
      const sum = s.latestScan?.summary as any;
      if (sum) {
        acc.critical += sum.critical ?? 0;
        acc.high += sum.high ?? 0;
        acc.medium += sum.medium ?? 0;
        acc.low += sum.low ?? 0;
        acc.total += sum.total ?? 0;
      }
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
  );

  const scannedList = list.filter((s) => s.latestScan?.summary);
  const avgRisk = scannedList.length > 0
    ? Math.round(scannedList.reduce((sum, s) => sum + calcRiskScore(s.latestScan?.summary), 0) / scannedList.length)
    : null;

  // ─── Filtered list ─────────────────────────────────────────────────────────

  const filtered = statusFilter === "all" ? list : list.filter((s) => s.status === statusFilter);

  // ─── Available filter tabs ─────────────────────────────────────────────────

  const statusCounts: Record<string, number> = { all: list.length };
  list.forEach((s) => { statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1; });
  const filterTabs = ["all", "cloning", "scanning", "completed", "ready", "error"].filter(
    (f) => f === "all" || (statusCounts[f] ?? 0) > 0
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Security Sandbox</h1>
            <p className="text-sm text-muted-foreground">
              Clone your sites, anonymize data, and run controlled security tests
            </p>
          </div>
        </div>
        <Button onClick={() => setLocation("/sandbox/new")} className="gap-2">
          <Plus className="h-4 w-4" />
          New Sandbox
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
        <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">How it works: </span>
          Sentinel clones your website into an isolated environment, detects the technology stack
          (WordPress, Next.js, Laravel, Django, etc.), generates a matching Docker environment, anonymizes all PII,
          and runs OWASP Top 10 security scans. Download the sandbox ZIP to test locally with full runtime fidelity.
        </div>
      </div>

      {/* Global stats — only shown when there are sandboxes */}
      {totalCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatsCard
            icon={<FlaskConical className="h-5 w-5" />}
            label="Total Sandboxes"
            value={totalCount}
            sub={activeCount > 0 ? `${activeCount} active` : `${completedCount} completed`}
          />
          <StatsCard
            icon={<ShieldAlert className="h-5 w-5" />}
            label="Critical Findings"
            value={totals.critical}
            sub={`${totals.total} total across all scans`}
            valueColor={totals.critical > 0 ? "text-red-400" : "text-green-400"}
          />
          <StatsCard
            icon={<BarChart3 className="h-5 w-5" />}
            label="High Severity"
            value={totals.high}
            sub={`${totals.medium} medium · ${totals.low} low`}
            valueColor={totals.high > 0 ? "text-orange-400" : "text-green-400"}
          />
          {avgRisk !== null && (
            <StatsCard
              icon={avgRisk >= 40 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              label="Avg Risk Score"
              value={`${avgRisk}/100`}
              sub={riskLabel(avgRisk)}
              valueColor={riskColor(avgRisk)}
            />
          )}
        </div>
      )}

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <span className="text-sm text-foreground font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  disabled={isBulkDeleting}
                >
                  {isBulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete {selectedIds.size}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {selectedIds.size} sandbox{selectedIds.size !== 1 ? "es" : ""}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {selectedIds.size} sandbox{selectedIds.size !== 1 ? "es" : ""} and all associated scan results.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setIsBulkDeleting(true);
                      bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      {/* Filter tabs */}
      {totalCount > 0 && filterTabs.length > 2 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filterTabs.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({statusCounts[f] ?? 0})
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">
            {statusFilter === "all" ? "No sandboxes yet" : `No ${statusFilter} sandboxes`}
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1 mb-4">
            {statusFilter === "all"
              ? "Create your first sandbox to start security testing"
              : "Try a different filter"}
          </p>
          {statusFilter === "all" && (
            <Button onClick={() => setLocation("/sandbox/new")} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create Sandbox
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((sandbox: any) => {
            const summary = sandbox.latestScan?.summary as any;
            const riskScore = calcRiskScore(summary);
            const isActive = sandbox.status === "cloning" || sandbox.status === "scanning";

            return (
              <Card
                key={sandbox.id}
                className={`border-border bg-card hover:border-primary/30 transition-colors cursor-pointer group ${selectedIds.has(sandbox.id) ? "ring-2 ring-primary/40 border-primary/40" : ""}`}
                onClick={() => setLocation(`/sandbox/${sandbox.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title row */}
                      <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                        {/* Checkbox for bulk select */}
                        <div
                          className="shrink-0"
                          onClick={(e) => { e.stopPropagation(); toggleSelect(sandbox.id); }}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedIds.has(sandbox.id)
                              ? "bg-primary border-primary"
                              : "border-border bg-transparent hover:border-primary/60"
                          }`}>
                            {selectedIds.has(sandbox.id) && (
                              <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <h3 className="font-semibold text-foreground truncate">{sandbox.name}</h3>
                        <StatusBadge status={sandbox.status} />
                        {sandbox.anonymized && (
                          <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/5">
                            PII anonymized
                          </Badge>
                        )}
                        {sandbox.environmentType && (
                          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                            {sandbox.environmentType}
                          </Badge>
                        )}
                      </div>

                      {/* URL */}
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sandbox.targetUrl}</span>
                      </div>

                      {/* Progress bar */}
                      {isActive && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{sandbox.notes || (sandbox.status === "cloning" ? "Cloning site..." : "Running security scan...")}</span>
                            <span>{sandbox.cloneProgress ?? 0}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${sandbox.cloneProgress ?? 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      {sandbox.notes && !isActive && (
                        <p className="text-xs text-muted-foreground mb-3 truncate">{sandbox.notes}</p>
                      )}

                      {/* Severity summary */}
                      {summary && (
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <SeverityBar summary={summary} />
                          {summary.total > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <SeverityBadge count={summary.critical} level="critical" />
                              <SeverityBadge count={summary.high} level="high" />
                              <SeverityBadge count={summary.medium} level="medium" />
                              <SeverityBadge count={summary.low} level="low" />
                              <SeverityBadge count={summary.info} level="info" />
                            </div>
                          )}
                          {summary.total === 0 && (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Clean scan
                            </span>
                          )}
                        </div>
                      )}

                      {/* Meta */}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground/60">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(sandbox.createdAt).toLocaleDateString("pl-PL")}</span>
                        {sandbox.fileCount > 0 && <><span>·</span><span>{sandbox.fileCount} files</span></>}
                        {sandbox.latestScan?.createdAt && (
                          <><span>·</span><span>Last scan {new Date(sandbox.latestScan.createdAt).toLocaleDateString("pl-PL")}</span></>
                        )}
                      </div>
                    </div>

                    {/* Right side: risk score + actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      {/* Risk score */}
                      {summary && (
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center gap-1 justify-end">
                            <RiskIcon score={riskScore} />
                            <span className={`text-lg font-bold ${riskColor(riskScore)}`}>{riskScore}</span>
                          </div>
                          <p className="text-xs text-muted-foreground/60">risk score</p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {sandbox.deployType === "local_download" && !isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-8 text-xs"
                            onClick={() => downloadMutation.mutate({ id: sandbox.id })}
                            disabled={downloadMutation.isPending}
                          >
                            <Download className="h-3.5 w-3.5" />
                            ZIP
                          </Button>
                        )}
                        {sandbox.sandboxUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 h-8 text-xs"
                            onClick={() => window.open(sandbox.sandboxUrl, "_blank")}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                              disabled={isActive}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete sandbox?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "{sandbox.name}" and all associated scan results.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate({ id: sandbox.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Clean bill of health */}
      {completedCount > 0 && totals.critical === 0 && totals.high === 0 && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-green-500/20 bg-green-500/5">
          <ShieldCheck className="h-5 w-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-300">No critical or high severity issues found</p>
            <p className="text-xs text-muted-foreground">
              {totals.total > 0
                ? `${totals.total} lower-severity finding(s) across ${completedCount} scan(s).`
                : `All ${completedCount} completed scan(s) returned clean results.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
