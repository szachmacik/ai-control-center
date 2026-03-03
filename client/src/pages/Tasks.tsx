import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTodo, Plus, RefreshCw, Clock, CheckCircle2, XCircle, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Priority = "low" | "medium" | "high" | "urgent";

const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-muted/50 text-muted-foreground border-border",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  high: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  urgent: "bg-destructive/10 text-destructive border-destructive/25",
};

const PRIORITY_ICON: Record<Priority, React.ReactNode> = {
  low: <Circle className="w-3 h-3" />,
  medium: <Circle className="w-3 h-3 fill-blue-400 text-blue-400" />,
  high: <AlertTriangle className="w-3 h-3" />,
  urgent: <AlertTriangle className="w-3 h-3 fill-destructive text-destructive" />,
};

export default function Tasks() {
  const { data: tasks, isLoading, refetch } = trpc.tasks.list.useQuery();
  const { data: agents } = trpc.agents.list.useQuery();
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { refetch(); setOpen(false); toast.success("Task created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    assigned_to: "",
    priority: "medium" as Priority,
  });

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status === "running") return <Clock className="w-4 h-4 text-primary animate-pulse" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-destructive" />;
    return <Circle className="w-4 h-4 text-muted-foreground" />;
  };

  const statusColor = (status: string) => {
    if (status === "completed") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    if (status === "running") return "bg-primary/10 text-primary border-primary/25";
    if (status === "failed") return "bg-destructive/10 text-destructive border-destructive/25";
    if (status === "cancelled") return "bg-muted/50 text-muted-foreground border-border";
    return "bg-muted/30 text-muted-foreground border-border";
  };

  const grouped = {
    pending: tasks?.filter((t: any) => t.status === "pending") ?? [],
    running: tasks?.filter((t: any) => t.status === "running") ?? [],
    completed: tasks?.filter((t: any) => t.status === "completed") ?? [],
    failed: tasks?.filter((t: any) => ["failed", "cancelled"].includes(t.status)) ?? [],
  };

  const TaskCard = ({ task }: { task: any }) => (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2 hover:border-primary/30 transition-colors cursor-pointer">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug">{task.title}</p>
        {statusIcon(task.status)}
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${PRIORITY_COLORS[task.priority as Priority] ?? PRIORITY_COLORS.medium}`}>
          {PRIORITY_ICON[task.priority as Priority]}
          {task.priority ?? "medium"}
        </Badge>
        {task.assignedTo && (
          <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
            {task.assignedTo}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {new Date(task.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );

  const Column = ({ title, items, color }: { title: string; items: any[]; color: string }) => (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="flex items-center gap-2 pb-1 border-b border-border">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((task: any) => <TaskCard key={task.id} task={task} />)}
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground/50">Empty</div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">Orchestrate work across AI agents</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-6 bg-muted/30 rounded animate-pulse" />
              {[1, 2].map((j) => <div key={j} className="h-20 bg-card border border-border rounded-lg animate-pulse" />)}
            </div>
          ))}
        </div>
      ) : !tasks?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <ListTodo className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No tasks yet — delegate work to your agents</p>
            <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Create first task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Column title="Pending" items={grouped.pending} color="bg-muted-foreground" />
          <Column title="Running" items={grouped.running} color="bg-primary" />
          <Column title="Completed" items={grouped.completed} color="bg-emerald-400" />
          <Column title="Failed" items={grouped.failed} color="bg-destructive" />
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="What needs to be done?"
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Detailed instructions for the agent..."
                className="bg-input border-border resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Assign to Agent</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {agents?.map((a: any) => (
                      <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Priority })}>
                  <SelectTrigger className="bg-input border-border">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createTask.mutate({
                title: form.title,
                description: form.description || undefined,
                assignedTo: form.assigned_to || undefined,
                priority: form.priority,
              })}
              disabled={!form.title.trim() || createTask.isPending}
            >
              {createTask.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
