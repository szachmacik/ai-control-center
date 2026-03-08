import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, RefreshCw, Clock, CheckCircle2, XCircle, Circle,
  AlertTriangle, FileText, ExternalLink, Bot, Info, Loader2,
  Calendar, User, Tag, Activity,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "pending" | "running" | "completed" | "failed" | "cancelled";
type LogLevel = "info" | "warning" | "error" | "success";

const STATUS_CONFIG: Record<Status, { icon: React.ReactNode; color: string; label: string }> = {
  pending:   { icon: <Circle className="w-4 h-4" />,        color: "bg-muted/50 text-muted-foreground border-border",          label: "Pending" },
  running:   { icon: <Loader2 className="w-4 h-4 animate-spin" />, color: "bg-blue-500/10 text-blue-400 border-blue-500/25",   label: "Running" },
  completed: { icon: <CheckCircle2 className="w-4 h-4" />,  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", label: "Completed" },
  failed:    { icon: <XCircle className="w-4 h-4" />,       color: "bg-destructive/10 text-destructive border-destructive/25", label: "Failed" },
  cancelled: { icon: <XCircle className="w-4 h-4" />,       color: "bg-muted/50 text-muted-foreground border-border",          label: "Cancelled" },
};

const PRIORITY_CONFIG: Record<Priority, { color: string; label: string }> = {
  low:    { color: "bg-muted/50 text-muted-foreground border-border",          label: "Low" },
  medium: { color: "bg-blue-500/10 text-blue-400 border-blue-500/25",          label: "Medium" },
  high:   { color: "bg-amber-500/10 text-amber-400 border-amber-500/25",       label: "High" },
  urgent: { color: "bg-destructive/10 text-destructive border-destructive/25", label: "Urgent" },
};

const LOG_LEVEL_CONFIG: Record<LogLevel, { icon: React.ReactNode; color: string; dot: string }> = {
  info:    { icon: <Info className="w-3.5 h-3.5" />,          color: "text-muted-foreground",  dot: "bg-blue-400" },
  warning: { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-amber-400",         dot: "bg-amber-400" },
  error:   { icon: <XCircle className="w-3.5 h-3.5" />,       color: "text-destructive",       dot: "bg-destructive" },
  success: { icon: <CheckCircle2 className="w-3.5 h-3.5" />,  color: "text-emerald-400",       dot: "bg-emerald-400" },
};

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const taskId = parseInt(id ?? "0", 10);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: task, isLoading: taskLoading, refetch: refetchTask } = trpc.tasks.getById.useQuery(
    { id: taskId },
    { enabled: !!taskId, refetchInterval: autoRefresh ? 3000 : false }
  );

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = trpc.tasks.getLogs.useQuery(
    { taskId },
    { enabled: !!taskId, refetchInterval: autoRefresh ? 3000 : false }
  );

  const { data: driveFiles = [] } = trpc.tasks.getDriveFiles.useQuery(
    { taskId },
    { enabled: !!taskId }
  );

  const handleRefresh = () => {
    refetchTask();
    refetchLogs();
  };

  if (taskLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button variant="ghost" size="sm" onClick={() => navigate("/tasks")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Tasks
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Task not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = (task.status ?? "pending") as Status;
  const priority = (task.priority ?? "low") as Priority;
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const priorityCfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.low;
  const isRunning = status === "running";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/tasks")} className="mt-0.5 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{task.title}</h1>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className={autoRefresh ? "border-blue-500/50 text-blue-400" : ""}
          >
            <Activity className={`w-3.5 h-3.5 mr-1.5 ${autoRefresh ? "text-blue-400" : ""}`} />
            {autoRefresh ? "Live" : "Auto-refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Meta cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1.5">Status</p>
            <Badge variant="outline" className={`text-xs gap-1.5 ${statusCfg.color}`}>
              {statusCfg.icon} {statusCfg.label}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1.5">Priority</p>
            <Badge variant="outline" className={`text-xs ${priorityCfg.color}`}>
              {priorityCfg.label}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Created
            </p>
            <p className="text-sm font-medium">
              {task.createdAt ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true }) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <User className="w-3 h-3" /> Assigned
            </p>
            <p className="text-sm font-medium truncate">{task.assignedTo ?? "Unassigned"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tags */}
      {Array.isArray(task.tags) && task.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Tag className="w-3.5 h-3.5 text-muted-foreground" />
          {(task.tags as string[]).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Timeline / Logs */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Activity Log
                {logsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />}
                {!logsLoading && (
                  <span className="ml-auto text-xs text-muted-foreground font-normal">{logs.length} entries</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 && !logsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">No log entries yet.</p>
              ) : (
                <ScrollArea className="h-[420px]">
                  <div className="relative pl-8 pr-4 pb-4">
                    {/* Timeline line */}
                    <div className="absolute left-[1.375rem] top-0 bottom-0 w-px bg-border" />
                    <div className="space-y-0">
                      {logs.map((log, idx) => {
                        const level = (log.level ?? "info") as LogLevel;
                        const cfg = LOG_LEVEL_CONFIG[level] ?? LOG_LEVEL_CONFIG.info;
                        return (
                          <div key={log.id ?? idx} className="relative flex gap-3 py-2.5">
                            {/* Timeline dot */}
                            <div className={`absolute left-[-1.625rem] top-3.5 w-2.5 h-2.5 rounded-full border-2 border-background ${cfg.dot}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <span className={`shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm ${cfg.color}`}>{log.message}</p>
                                  {log.agentName && (
                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                      <Bot className="w-3 h-3" /> {log.agentName}
                                    </p>
                                  )}
                                  {Boolean(log.details && typeof log.details === "object" && Object.keys(log.details as object).length > 0) && (
                                    <pre className="text-xs text-muted-foreground mt-1 bg-muted/30 rounded p-2 overflow-x-auto">
                                      {JSON.stringify(log.details as object, null, 2)}
                                    </pre>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                                  {log.createdAt ? format(new Date(log.createdAt), "HH:mm:ss") : ""}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Result + Drive Files */}
        <div className="space-y-4">
          {/* Result */}
          {task.result && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Result
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.result}</p>
                {task.resultDriveUrl && (
                  <a
                    href={task.resultDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open in Drive
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {/* Drive Files */}
          {driveFiles.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Output Files
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {driveFiles.map((f) => (
                  <a
                    key={f.id}
                    href={f.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-400 hover:underline truncate"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{f.fileName}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 ml-auto" />
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Timestamps */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {[
                { label: "Created", value: task.createdAt },
                { label: "Started", value: task.startedAt },
                { label: "Completed", value: task.completedAt },
                { label: "Due", value: task.dueDate },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">
                    {value ? format(new Date(value), "MMM d, HH:mm") : "—"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
