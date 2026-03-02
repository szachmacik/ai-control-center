import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderPlus, Rocket, GitBranch, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const TEMPLATES = [
  { id: "web-app", label: "Web Application", description: "React + tRPC + MySQL full-stack app" },
  { id: "api-service", label: "API Service", description: "Express REST API with database" },
  { id: "dashboard", label: "Analytics Dashboard", description: "Data visualization dashboard" },
  { id: "custom", label: "Custom", description: "Start from scratch" },
];

export default function NewProject() {
  const createProject = trpc.projects.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Project "${data.name}" created! Deployment queued.`);
      setForm({ name: "", description: "", template: "web-app", subdomain: "", repo: "" });
      setStep(2);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    description: "",
    template: "web-app",
    subdomain: "",
    repo: "",
  });

  const handleNameChange = (name: string) => {
    const subdomain = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    setForm({ ...form, name, subdomain });
  };

  if (step === 2) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center space-y-6 py-16">
          <div className="w-16 h-16 rounded-2xl bg-[oklch(0.62_0.17_145/0.1)] border border-[oklch(0.62_0.17_145/0.2)] flex items-center justify-center mx-auto">
            <Rocket className="w-7 h-7 text-[oklch(0.62_0.17_145)]" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Project Created!</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Your project has been scaffolded and deployment has been queued. It will be available at{" "}
              <span className="text-primary font-mono">{form.subdomain || "your-project"}.ofshore.dev</span> shortly.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" className="border-border" onClick={() => setStep(1)}>
              Create Another
            </Button>
            <Button onClick={() => window.open(`https://${form.subdomain}.ofshore.dev`, "_blank")}>
              <Globe className="w-4 h-4 mr-2" />
              Open Project
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">New Project</h1>
        <p className="text-sm text-muted-foreground mt-1">Scaffold and deploy a new application via Manus autodeploy</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-4 border-b border-border">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-primary" />
            Project Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Project Name</Label>
            <Input
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="my-awesome-app"
              className="bg-input border-border"
            />
          </div>

          {/* Subdomain preview */}
          {form.subdomain && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
              <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">Will be deployed to: </span>
              <span className="text-xs text-primary font-mono">{form.subdomain}.ofshore.dev</span>
            </div>
          )}

          {/* Template */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setForm({ ...form, template: t.id })}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    form.template === t.id
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-muted/10 text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  <p className="text-xs font-medium">{t.label}</p>
                  <p className="text-[10px] mt-0.5 opacity-70">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description (optional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What does this project do?"
              className="bg-input border-border resize-none"
              rows={2}
            />
          </div>

          {/* GitHub repo */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">GitHub Repository (optional)</Label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={form.repo}
                onChange={(e) => setForm({ ...form, repo: e.target.value })}
                placeholder="szachmacik/my-awesome-app"
                className="pl-8 bg-input border-border font-mono text-sm"
              />
            </div>
          </div>

          <Button
            className="w-full gap-2"
            onClick={() => createProject.mutate({
              name: form.name,
              description: form.description || undefined,
              template: form.template,
              subdomain: form.subdomain,
              repo: form.repo || undefined,
            })}
            disabled={!form.name.trim() || createProject.isPending}
          >
            {createProject.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
            ) : (
              <><Rocket className="w-4 h-4" /> Create & Deploy</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
