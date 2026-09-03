import { useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePortaisAcessos, type AcessoForm, type AcessoPortal } from "@/hooks/usePortaisAcessos";
import { data as fData } from "@/lib/formato";

const TIPOS = ["Portal", "Certificado digital", "Órgão", "Outro"] as const;

const VAZIO: AcessoForm = {
  nome: "",
  cpf: "",
  url: "",
  tipo: "Portal",
  vencimento: "",
  login: "",
  senha: "",
};

function limpar(v: AcessoForm): AcessoForm {
  return {
    nome: v.nome.trim(),
    cpf: v.cpf?.trim() || null,
    url: v.url?.trim() || null,
    tipo: v.tipo || "Portal",
    vencimento: v.vencimento || null,
    login: v.login?.trim() || null,
    senha: v.senha || null,
  };
}

function CampoSenha({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input
        type={ver ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Digite a senha"
        className="pr-9"
      />
      <button
        type="button"
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        onClick={() => setVer((v) => !v)}
      >
        {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Formulario({
  valores,
  setValores,
  colunas,
}: {
  valores: AcessoForm;
  setValores: (v: AcessoForm) => void;
  colunas: string;
}) {
  const set = (p: Partial<AcessoForm>) => setValores({ ...valores, ...p });
  return (
    <div className={`grid gap-3 ${colunas}`}>
      <div className="space-y-1">
        <Label>Nome do portal</Label>
        <Input
          value={valores.nome}
          onChange={(e) => set({ nome: e.target.value })}
          placeholder="Digite o nome do portal"
        />
      </div>
      <div className="space-y-1">
        <Label>CPF (opcional)</Label>
        <Input
          value={valores.cpf ?? ""}
          onChange={(e) => set({ cpf: e.target.value })}
          placeholder="Digite o cpf"
        />
      </div>
      <div className="space-y-1">
        <Label>URL (opcional)</Label>
        <Input
          value={valores.url ?? ""}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="Digite a url do portal"
        />
      </div>
      <div className="space-y-1">
        <Label>Tipo</Label>
        <Select value={valores.tipo} onValueChange={(v) => set({ tipo: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Data de vencimento do login</Label>
        <Input
          type="date"
          value={valores.vencimento ?? ""}
          onChange={(e) => set({ vencimento: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Login</Label>
        <Input
          value={valores.login ?? ""}
          onChange={(e) => set({ login: e.target.value })}
          placeholder="Digite o login"
        />
      </div>
      <div className="space-y-1">
        <Label>Senha</Label>
        <CampoSenha valor={valores.senha ?? ""} onChange={(v) => set({ senha: v })} />
      </div>
    </div>
  );
}

function LinhaSenha({ senha }: { senha: string | null }) {
  const [ver, setVer] = useState(false);
  if (!senha) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs">{ver ? senha : "•".repeat(Math.min(senha.length, 10))}</span>
      <button
        type="button"
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setVer((v) => !v)}
      >
        {ver ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

export function AcessosPortais() {
  const { acessos, criar, atualizar, excluir } = usePortaisAcessos();
  const [novo, setNovo] = useState<AcessoForm>(VAZIO);
  const [editando, setEditando] = useState<AcessoPortal | null>(null);
  const [edicao, setEdicao] = useState<AcessoForm>(VAZIO);

  const abrirEdicao = (a: AcessoPortal) => {
    setEditando(a);
    setEdicao({
      nome: a.nome,
      cpf: a.cpf ?? "",
      url: a.url ?? "",
      tipo: a.tipo,
      vencimento: a.vencimento ?? "",
      login: a.login ?? "",
      senha: a.senha ?? "",
    });
  };

  const vencido = (v: string | null) => Boolean(v && new Date(v) < new Date());

  return (
    <div className="space-y-4">
      <div className="surface-panel p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> Criar novo acesso
        </h3>
        <Formulario
          valores={novo}
          setValores={setNovo}
          colunas="md:grid-cols-2 xl:grid-cols-4"
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={!novo.nome.trim() || criar.isPending}
            onClick={() =>
              criar.mutate(limpar(novo), { onSuccess: () => setNovo(VAZIO) })
            }
          >
            Salvar acesso
          </Button>
        </div>
      </div>

      <div className="surface-panel overflow-x-auto">
        <h3 className="border-b p-4 text-sm font-semibold">
          Acessos cadastrados ({acessos.length})
        </h3>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Portal</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Login</th>
              <th className="p-3">Senha</th>
              <th className="p-3">Vencimento</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {acessos.map((a) => (
              <tr key={a.id}>
                <td className="p-3">
                  <p className="font-medium">{a.nome}</p>
                  {a.cpf && <p className="text-xs text-muted-foreground">CPF {a.cpf}</p>}
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> abrir portal
                    </a>
                  )}
                </td>
                <td className="p-3">
                  <Badge variant="outline">{a.tipo}</Badge>
                </td>
                <td className="p-3">{a.login ?? "—"}</td>
                <td className="p-3">
                  <LinhaSenha senha={a.senha} />
                </td>
                <td className="p-3">
                  {a.vencimento ? (
                    <Badge variant={vencido(a.vencimento) ? "destructive" : "secondary"}>
                      {fData(a.vencimento)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => abrirEdicao(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => excluir.mutate(a.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {acessos.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground">
                  Nenhum acesso cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(editando)} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar acesso</DialogTitle>
          </DialogHeader>
          <Formulario valores={edicao} setValores={setEdicao} colunas="md:grid-cols-2" />
          <Button
            className="w-full"
            disabled={!edicao.nome.trim() || atualizar.isPending}
            onClick={() =>
              editando &&
              atualizar.mutate(
                { id: editando.id, ...limpar(edicao) },
                { onSuccess: () => setEditando(null) },
              )
            }
          >
            Salvar edição
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
