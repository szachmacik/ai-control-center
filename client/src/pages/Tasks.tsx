import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTodo, Plus, RefreshCw, Clock, CheckCircle2, XCircle, Circle } from "lucide-react";
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

export default function Tasks() {
  const { data: tasks, isLoading, refetch } = trpc.tasks.list.useQuery();
  const { data: agents } = trpc.agents.list.useQuery();
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { refetch(); setOpen(false); toast.success("Task created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigned_to: "", priority: "5" });

  const statusIcon = (status: string) => {
    if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-[oklch(0.62_0.17_145)]" />;
    if (status === "running") return <Clock className="w-4 h-4 text-primary animate-pulse" />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-destructive" />;
    return <Circle className="w-4 h-4 text-muted-foreground" />;
  };

  const statusColor = (status: string) => {
    if (status === "completed") return "bg-[oklch(0.62_0.17_145/0.1)] text-[oklch(0.62_0.17_145)] border-[oklch(0.62_0.17_145/0.25)]";
    if (status === "running") return "bg-primary/10 text-primary border-primary/25";
    if (status === "failed") return "bg-destructive/10 text-destructive border-destructive/25";
    return "bg-muted/50 text-muted-foreground border-border";
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and track AI agent tasks</p>
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
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !tasks?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <ListTodo className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No tasks yet</p>
            <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Create first task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <div className="divide-y divide-border">
            {tasks.map((task: any) => (
              <div key={task.id} className="flex items-start gap-4 px-5 py-4 hover:bg-accent/20 transition-colors">
                <div className="mt-0.5 shrink-0">{statusIcon(task.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${statusColor(task.status)}`}>
                      {task.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    {task.assigned_to && <span>Agent: {task.assigned_to}</span>}
                    <span>Priority: {task.priority}</span>
                    <span>{new Date(task.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Create New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Task title"
                className="bg-input border-border"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Task description..."
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
                <Label className="text-xs text-muted-foreground">Priority (1-10)</Label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="bg-input border-border"
                />
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
                priority: parseInt(form.priority),
              })}
              disabled={!form.title.trim() || createTask.isPending}
            >
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
