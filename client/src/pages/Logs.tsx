import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ScrollText, RefreshCw, Search, AlertCircle, Info, AlertTriangle,
  CheckCircle2, Download, Filter, X,
} from "lucide-react";
import { useState } from "react";

type EventType = "all" | "info" | "warning" | "error" | "success";

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "success", label: "Success" },
];

export default function Logs() {
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState<EventType>("all");
  const [agentName, setAgentName] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { data: logs, isLoading, refetch } = trpc.logs.listFiltered.useQuery({
    search: search || undefined,
    eventType: eventType === "all" ? undefined : eventType,
    agentName: agentName || undefined,
    limit: 500,
  }, { refetchInterval: 15_000 });

  const { data: csvData, refetch: fetchCsv } = trpc.logs.exportCsv.useQuery({
    search: search || undefined,
    eventType: eventType === "all" ? undefined : eventType,
    agentName: agentName || undefined,
  }, { enabled: false });

  function handleExportCsv() {
    fetchCsv().then(({ data }) => {
      if (!data) return;
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  const eventIcon = (type: string) => {
    if (type === "error") return <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
    if (type === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-[oklch(0.72_0.18_75)] shrink-0" />;
    if (type === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.62_0.17_145)] shrink-0" />;
    return <Info className="w-3.5 h-3.5 text-primary shrink-0" />;
  };

  const eventBadgeColor = (type: string) => {
    if (type === "error") return "bg-destructive/10 text-destructive border-destructive/25";
    if (type === "warning") return "bg-[oklch(0.72_0.18_75/0.1)] text-[oklch(0.72_0.18_75)] border-[oklch(0.72_0.18_75/0.25)]";
    if (type === "success") return "bg-[oklch(0.62_0.17_145/0.1)] text-[oklch(0.62_0.17_145)] border-[oklch(0.62_0.17_145/0.25)]";
    return "bg-primary/10 text-primary border-primary/25";
  };

  const hasActiveFilters = eventType !== "all" || agentName;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Activity Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agent actions and system events
            {logs && <span className="ml-2 text-primary font-medium">({logs.length} entries)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setShowFilters(v => !v)}
            className={`gap-2 border-border text-muted-foreground hover:text-foreground ${hasActiveFilters ? "border-primary text-primary" : ""}`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={handleExportCsv}
            className="gap-2 border-border text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search log messages…"
          className="pl-9 bg-input border-border"
        />
      </div>

      {/* Filters panel */}
      {showFilters && (
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Event type filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Type:</span>
                <div className="flex gap-1">
                  {EVENT_TYPES.map(et => (
                    <button
                      key={et.value}
                      onClick={() => setEventType(et.value)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                        eventType === et.value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30"
                      }`}
                    >
                      {et.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Agent name filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Agent:</span>
                <Input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Filter by agent name…"
                  className="h-7 text-xs w-48 bg-input border-border"
                />
              </div>

              {/* Clear filters */}
              {hasActiveFilters && (
                <Button
                  variant="ghost" size="sm"
                  onClick={() => { setEventType("all"); setAgentName(""); }}
                  className="gap-1.5 text-xs text-muted-foreground h-7"
                >
                  <X className="w-3 h-3" />
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log entries */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : !logs?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <ScrollText className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No log entries found</p>
            {hasActiveFilters && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setEventType("all"); setAgentName(""); setSearch(""); }}
                className="mt-3 text-xs text-muted-foreground"
              >
                Clear all filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border overflow-hidden">
          <div className="divide-y divide-border">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-accent/20 transition-colors">
                <div className="mt-0.5">{eventIcon(log.eventType ?? log.event_type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-foreground leading-snug">{log.message}</p>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${eventBadgeColor(log.eventType ?? log.event_type)}`}>
                      {log.eventType ?? log.event_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    {(log.agentName ?? log.agent_name) && (
                      <span className="font-medium">{log.agentName ?? log.agent_name}</span>
                    )}
                    {(log.taskId ?? log.task_id) && <span>Task #{log.taskId ?? log.task_id}</span>}
                    <span className="font-mono">
                      {new Date(log.createdAt ?? log.created_at).toLocaleString()}
                    </span>
                  </div>
                  {log.details && (
                    <pre className="mt-2 text-[10px] font-mono text-muted-foreground bg-muted/20 rounded p-2 overflow-x-auto">
                      {typeof log.details === "string" ? log.details : JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
