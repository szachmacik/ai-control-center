import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KeyRound, Plus, Eye, EyeOff, Copy, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Secrets() {
  const { data: secrets, isLoading, refetch } = trpc.secrets.list.useQuery();
  const createSecret = trpc.secrets.create.useMutation({
    onSuccess: () => { refetch(); setOpen(false); toast.success("Secret saved"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteSecret = trpc.secrets.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Secret deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({ name: "", value: "", description: "" });

  const toggleReveal = (id: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Secrets Vault</h1>
          <p className="text-sm text-muted-foreground mt-1">Secure storage for API keys and credentials</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-border text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4" />
            Add Secret
          </Button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[oklch(0.72_0.18_75/0.08)] border border-[oklch(0.72_0.18_75/0.2)]">
        <KeyRound className="w-4 h-4 text-[oklch(0.72_0.18_75)] shrink-0" />
        <p className="text-xs text-[oklch(0.72_0.18_75)]">
          Secrets are stored encrypted. Values are only shown when explicitly revealed.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !secrets?.length ? (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <KeyRound className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No secrets stored</p>
            <Button size="sm" onClick={() => setOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Add first secret
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <div className="divide-y divide-border">
            {secrets.map((secret: any) => (
              <div key={secret.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/20 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{secret.name}</p>
                  {secret.description && (
                    <p className="text-xs text-muted-foreground truncate">{secret.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-mono text-xs bg-muted/30 border border-border rounded px-2 py-1 min-w-[120px] text-center">
                    {revealed.has(secret.id) ? (
                      <span className="text-foreground">{secret.value}</span>
                    ) : (
                      <span className="text-muted-foreground tracking-widest">••••••••</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleReveal(secret.id)}
                  >
                    {revealed.has(secret.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => copyValue(secret.value)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteId(secret.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Add Secret</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. OPENAI_API_KEY" className="bg-input border-border font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Value</Label>
              <Input type="password" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="Secret value" className="bg-input border-border font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description (optional)</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What is this secret used for?" className="bg-input border-border resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createSecret.mutate({ name: form.name, value: form.value, description: form.description || undefined })}
              disabled={!form.name.trim() || !form.value.trim() || createSecret.isPending}>
              Save Secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Secret</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action cannot be undone. The secret will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-border">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteSecret.mutate({ id: deleteId }); setDeleteId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
