import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { toast } from "sonner";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  cloning: { label: "Cloning", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Loader2 },
  ready: { label: "Ready", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  scanning: { label: "Scanning", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20", icon: RefreshCw },
  completed: { label: "Scanned", color: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: Shield },
  error: { label: "Error", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: AlertTriangle },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  info: "bg-slate-500/20 text-slate-400 border-slate-500/30",
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function SandboxList() {
  const [, setLocation] = useLocation();
  const { data: sandboxes, isLoading, refetch } = trpc.sandbox.list.useQuery(undefined, {
    refetchInterval: (query) => {
      // Auto-refresh while any sandbox is cloning or scanning
      const data = query.state.data as any[];
      const active = Array.isArray(data) && data.some((s: any) => s.status === "cloning" || s.status === "scanning");
      return active ? 3000 : false;
    },
  });

  const deleteMutation = trpc.sandbox.delete.useMutation({
    onSuccess: () => {
      toast.success("Sandbox deleted");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const downloadMutation = trpc.sandbox.getDownloadPath.useMutation({
    onSuccess: (data) => {
      toast.success(`ZIP ready: ${data.filename}`);
    },
    onError: (err) => toast.error(err.message),
  });

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
          Sentinel clones your website into an isolated environment, automatically detects the technology stack
          (WordPress, Next.js, Laravel, Django, etc.), generates a matching Docker environment, anonymizes all PII,
          and runs security scans. Download the sandbox ZIP to test locally with full runtime fidelity.
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : sandboxes?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FlaskConical className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">No sandboxes yet</p>
          <p className="text-sm text-muted-foreground/60 mt-1 mb-4">
            Create your first sandbox to start security testing
          </p>
          <Button onClick={() => setLocation("/sandbox/new")} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Create Sandbox
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {sandboxes?.map((sandbox: any) => {
            const summary = sandbox.latestScan?.summary as any;
            return (
              <Card
                key={sandbox.id}
                className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setLocation(`/sandbox/${sandbox.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <h3 className="font-semibold text-foreground truncate">{sandbox.name}</h3>
                        <StatusBadge status={sandbox.status} />
                        {sandbox.anonymized && (
                          <Badge variant="outline" className="text-xs border-green-500/30 text-green-400 bg-green-500/5">
                            PII anonymized
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                        <Globe className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{sandbox.targetUrl}</span>
                      </div>

                      {/* Progress bar for cloning */}
                      {(sandbox.status === "cloning" || sandbox.status === "scanning") && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>{sandbox.notes || "Working..."}</span>
                            <span>{sandbox.cloneProgress}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: `${sandbox.cloneProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Notes for ready/completed */}
                      {sandbox.notes && sandbox.status !== "cloning" && sandbox.status !== "scanning" && (
                        <p className="text-xs text-muted-foreground mb-3 truncate">{sandbox.notes}</p>
                      )}

                      {/* Scan summary */}
                      {summary && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Last scan:</span>
                          <SeverityBadge count={summary.critical} level="critical" />
                          <SeverityBadge count={summary.high} level="high" />
                          <SeverityBadge count={summary.medium} level="medium" />
                          <SeverityBadge count={summary.low} level="low" />
                          <SeverityBadge count={summary.info} level="info" />
                          {summary.total === 0 && (
                            <span className="text-xs text-emerald-400">✓ No findings</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground/60">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(sandbox.createdAt).toLocaleDateString("pl-PL")}</span>
                        {sandbox.fileCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{sandbox.fileCount} files</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {sandbox.deployType === "local_download" && sandbox.status !== "cloning" && (
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
