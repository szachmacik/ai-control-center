import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookOpen, Search, ExternalLink, FileText, Folder, Brain,
  Zap, Shield, Code2, Bot, Database, Globe, ChevronRight,
  Star, Clock, Download, Eye, Upload, Trash2, Loader2, Plus,
  RefreshCw, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Static knowledge base (Drive-backed, no API key needed) ─────────────────
const STATIC_ITEMS = [
  {
    id: "autodeploy",
    title: "Autonomous Deployment Knowledge Base",
    category: "deployment",
    tags: ["coolify", "digitalocean", "ci/cd", "docker"],
    description: "Complete guide to autonomous deployment on Coolify + DigitalOcean. Includes build commands, env vars, health checks, and rollback procedures.",
    driveFile: "autonomous-deployment-knowledge-base.md",
    lastUpdated: "2026-03-04",
    readTime: "12 min",
    starred: true,
    isStatic: true,
  },
  {
    id: "mcp-gateway",
    title: "MCP Gateway Architecture",
    category: "architecture",
    tags: ["mcp", "gateway", "agents", "api"],
    description: "Architecture for the Model Context Protocol gateway. How agents communicate, authenticate, and exchange data through the central hub.",
    driveFile: "mcp-gateway-architecture.md",
    lastUpdated: "2026-03-04",
    readTime: "8 min",
    starred: true,
    isStatic: true,
  },
  {
    id: "agent-security",
    title: "Agent Security Architecture",
    category: "security",
    tags: ["totp", "zero-trust", "telegram", "waf"],
    description: "Zero-trust security model for AI agents. TOTP verification, Telegram approval flows, WAF rules, rate limiting, and audit logging.",
    driveFile: "agent-security-architecture.md",
    lastUpdated: "2026-03-04",
    readTime: "10 min",
    starred: false,
    isStatic: true,
  },
  {
    id: "ai-stack-report",
    title: "AI Stack Final Report",
    category: "architecture",
    tags: ["openai", "anthropic", "gemini", "stack"],
    description: "Evaluation of AI provider stacks. Cost analysis, latency benchmarks, and recommendations for each use case in the ofshore.dev ecosystem.",
    driveFile: "ai-stack-final-report.md",
    lastUpdated: "2026-03-03",
    readTime: "15 min",
    starred: false,
    isStatic: true,
  },
  {
    id: "onboarding",
    title: "Agent Onboarding Guide",
    category: "agents",
    tags: ["onboarding", "agents", "workflow", "ecosystem"],
    description: "How to work in the ofshore.dev ecosystem as an AI agent. Conventions, folder structure, task reporting, and communication protocols.",
    driveFile: "agent-onboarding.md",
    lastUpdated: "2026-03-05",
    readTime: "6 min",
    starred: true,
    isStatic: true,
  },
  {
    id: "skill-deploy",
    title: "Skill: Autonomous Deployment",
    category: "skills",
    tags: ["skill", "manus", "deployment", "coolify"],
    description: "Manus skill for autonomous deployment. Covers Coolify API, DigitalOcean App Platform, environment variable management, and health verification.",
    driveFile: "skills/autonomous-deploy/SKILL.md",
    lastUpdated: "2026-03-04",
    readTime: "5 min",
    starred: false,
    isStatic: true,
  },
  {
    id: "ofshore-arch",
    title: "ofshore.dev Architecture Notes",
    category: "architecture",
    tags: ["ofshore", "ecosystem", "projects", "domains"],
    description: "Overview of the ofshore.dev ecosystem. All projects, domains, tech stacks, and how they interconnect. The single source of truth for architecture decisions.",
    driveFile: "context/ofshore-architecture.md",
    lastUpdated: "2026-03-06",
    readTime: "9 min",
    starred: true,
    isStatic: true,
  },
];

const CATEGORIES = [
  { id: "all", label: "All", icon: BookOpen },
  { id: "architecture", label: "Architecture", icon: Database },
  { id: "deployment", label: "Deployment", icon: Globe },
  { id: "security", label: "Security", icon: Shield },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "skills", label: "Skills", icon: Zap },
  { id: "general", label: "General", icon: FileText },
];

const CATEGORY_COLORS: Record<string, string> = {
  architecture: "bg-blue-500/10 text-blue-400 border-blue-500/25",
  deployment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  security: "bg-red-500/10 text-red-400 border-red-500/25",
  agents: "bg-violet-500/10 text-violet-400 border-violet-500/25",
  skills: "bg-amber-500/10 text-amber-400 border-amber-500/25",
  general: "bg-muted/50 text-muted-foreground border-border",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createMutation = trpc.knowledge.create.useMutation({
    onSuccess: () => {
      toast.success("File added to knowledge base");
      onUploaded();
      onClose();
    },
    onError: (err) => {
      toast.error(err.message);
      setUploading(false);
    },
  });

  const handleSubmit = async () => {
    if (!title || !file) return;
    setUploading(true);
    // Use file name as storageKey (in real app would upload to S3/Drive first)
    const storageKey = `knowledge/${Date.now()}_${file.name}`;
    createMutation.mutate({
      title,
      description: description || undefined,
      category,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || undefined,
      storageKey,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" /> Add to Knowledge Base
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} className="text-sm" />
          <Input placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm" />
          <div className="flex gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 text-sm rounded-md border border-input bg-background px-3 py-2"
            >
              {CATEGORIES.filter((c) => c.id !== "all").map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <Input placeholder="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} className="text-sm" />
          <div
            className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {file ? (
              <p className="text-sm text-foreground">{file.name} ({formatBytes(file.size)})</p>
            ) : (
              <p className="text-sm text-muted-foreground">Click to select file</p>
            )}
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={uploading}>Cancel</Button>
            <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={!title || !file || uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
              Add File
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Knowledge Card ───────────────────────────────────────────────────────────

function KnowledgeCard({
  item,
  onDelete,
  onToggleStar,
}: {
  item: any;
  onDelete?: (id: number) => void;
  onToggleStar?: (id: number) => void;
}) {
  const isStatic = item.isStatic;
  const tags: string[] = Array.isArray(item.tags) ? item.tags : [];
  const starred = item.starred ?? item.isStarred ?? false;

  return (
    <Card className="bg-card border-border hover:border-primary/40 transition-all duration-200 group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.general}`}>
                {item.category}
              </Badge>
              {starred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
              {!isStatic && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/25 text-blue-400">uploaded</Badge>}
            </div>
            <CardTitle className="text-sm font-semibold leading-tight group-hover:text-primary transition-colors">
              {item.title}
            </CardTitle>
          </div>
          <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {item.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag: string) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                #{tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {item.readTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.readTime}</span>}
            {item.fileSize && <span className="flex items-center gap-1"><Download className="w-3 h-3" />{formatBytes(item.fileSize)}</span>}
            {item.createdAt && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
              </span>
            )}
            {item.lastUpdated && !item.createdAt && (
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{item.lastUpdated}</span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isStatic && onToggleStar && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onToggleStar(item.id)}>
                <Star className={`w-3 h-3 ${starred ? "text-amber-400 fill-amber-400" : ""}`} />
              </Button>
            )}
            {item.publicUrl && (
              <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                <a href={item.publicUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3 h-3" />
                </a>
              </Button>
            )}
            {!isStatic && onDelete && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(item.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Knowledge() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: dbFiles = [], isLoading, refetch } = trpc.knowledge.list.useQuery(
    { search: search || undefined },
    { staleTime: 30_000 }
  );

  const deleteMutation = trpc.knowledge.delete.useMutation({
    onSuccess: () => {
      toast.success("File removed from knowledge base");
      setDeleteId(null);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleStarMutation = trpc.knowledge.toggleStar.useMutation({
    onSuccess: () => utils.knowledge.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  // Merge static + DB items
  const allItems = [
    ...STATIC_ITEMS,
    ...dbFiles.map((f) => ({
      ...f,
      tags: Array.isArray(f.tags) ? f.tags : [],
      starred: f.isStarred,
      isStatic: false,
    })),
  ];

  const filtered = allItems.filter((item) => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      item.title.toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q) ||
      (Array.isArray(item.tags) ? item.tags : []).some((t: string) => t.toLowerCase().includes(q));
    const matchesCategory = activeCategory === "all" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const starred = filtered.filter((i) => i.starred || (i as any).isStarred);
  const rest = filtered.filter((i) => !i.starred && !(i as any).isStarred);

  const totalDocs = allItems.length;
  const starredCount = allItems.filter((i) => i.starred || (i as any).isStarred).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Agent onboarding docs, architecture guides, skills, and uploaded files
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" onClick={() => setShowUpload(true)} className="gap-1.5 text-xs">
            <Upload className="w-3.5 h-3.5" /> Upload File
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Documents", value: totalDocs, icon: FileText, color: "text-blue-400" },
          { label: "Starred", value: starredCount, icon: Star, color: "text-amber-400" },
          { label: "Uploaded", value: dbFiles.length, icon: Upload, color: "text-violet-400" },
          { label: "Categories", value: CATEGORIES.length - 1, icon: Folder, color: "text-emerald-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-3 flex items-center gap-3">
              <Icon className={`w-4 h-4 ${color} shrink-0`} />
              <div>
                <p className="text-base font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + Category Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents, tags, descriptions…"
            className="pl-9 h-9 text-sm bg-muted/30"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {CATEGORIES.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={activeCategory === id ? "default" : "outline"}
              size="sm"
              className="h-9 text-xs gap-1.5"
              onClick={() => setActiveCategory(id)}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Starred */}
      {starred.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <h2 className="text-sm font-semibold">Pinned</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {starred.map((item) => (
              <KnowledgeCard
                key={item.id}
                item={item}
                onDelete={!item.isStatic ? (id) => setDeleteId(id) : undefined}
                onToggleStar={!item.isStatic ? (id) => toggleStarMutation.mutate({ id }) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rest */}
      {rest.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">All Documents</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {rest.map((item) => (
              <KnowledgeCard
                key={item.id}
                item={item}
                onDelete={!item.isStatic ? (id) => setDeleteId(id) : undefined}
                onToggleStar={!item.isStatic ? (id) => toggleStarMutation.mutate({ id }) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No documents match your search.</p>
        </div>
      )}

      {/* Quick links */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Code2 className="w-4 h-4 text-primary" />
            Quick Links
          </CardTitle>
          <CardDescription className="text-xs">Direct access to key resources</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "ofshore-agents/ on Google Drive", desc: "Root folder for all agent files" },
            { label: "Manus Skills Repository", desc: "Available skills for autonomous tasks" },
            { label: "Coolify Dashboard", desc: "Deployment management" },
            { label: "GitHub: szachmacik", desc: "All project repositories" },
          ].map(({ label, desc }) => (
            <button
              key={label}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border hover:border-primary/40 hover:bg-muted/50 transition-all text-left group"
            >
              <div>
                <p className="text-xs font-medium">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => refetch()}
        />
      )}

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Knowledge Base?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the file record from the knowledge base. The file itself will not be deleted from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
