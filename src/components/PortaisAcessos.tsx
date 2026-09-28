import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataHora } from "@/lib/formato";
import { combina } from "@/lib/busca";
import {
  definirSenhaAcesso,
  removerSenhaAcesso,
  revelarSenhaAcesso,
} from "@/services/portais/portais.functions";

const TIPOS = ["Portal", "Certificado digital", "Órgão", "Outro"] as const;

/** Nunca inclui a coluna `senha` (sem uso) nem qualquer dado de credencial. */
const COLUNAS =
  "id, nome, cpf, url, tipo, vencimento, login, tem_senha, created_by, criado_por_nome, created_at";

type Acesso = {
  id: string;
  nome: string;
  cpf: string | null;
  url: string | null;
  tipo: string;
  vencimento: string | null;
  login: string | null;
  tem_senha: boolean;
  created_by: string | null;
  criado_por_nome: string | null;
  created_at: string;
};

type Form = {
  nome: string;
  cpf: string;
  url: string;
  tipo: string;
  vencimento: string;
  login: string;
  senha: string;
};

const VAZIO: Form = {
  nome: "",
  cpf: "",
  url: "",
  tipo: "Portal",
  vencimento: "",
  login: "",
  senha: "",
};

/** Aceita "portal.com.br/x" (assume https) e recusa qualquer coisa que não seja http/https. */
function normalizarUrl(bruta: string): string | null {
  const t = bruta.trim();
  if (!t) return null;
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(comEsquema);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    return u.toString();
  } catch {
    throw new Error("A URL do portal não parece válida.");
  }
}

function urlSegura(u: string | null): string | null {
  return u && /^https?:\/\//i.test(u) ? u : null;
}

function situacao(vencimento: string | null): { texto: string; classe: string } {
  if (!vencimento) return { texto: "Sem vencimento", classe: "text-muted-foreground" };
  const fim = new Date(`${vencimento}T00:00:00`);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((fim.getTime() - hoje.getTime()) / 86_400_000);
  if (dias < 0) return { texto: "Vencido", classe: "border-destructive text-destructive" };
  if (dias === 0) return { texto: "Vence hoje", classe: "border-amber-500 text-amber-700" };
  if (dias <= 30)
    return { texto: `Vence em ${dias} dia(s)`, classe: "border-amber-500 text-amber-700" };
  return { texto: "Vigente", classe: "border-emerald-600 text-emerald-700" };
}

function CampoSenha({
  valor,
  onChange,
  placeholder,
}: {
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input
        type={ver ? "text" : "password"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
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

function Campos({
  valores,
  setValores,
  colunas,
  senhaPlaceholder,
}: {
  valores: Form;
  setValores: (v: Form) => void;
  colunas: string;
  senhaPlaceholder: string;
}) {
  const set = (p: Partial<Form>) => setValores({ ...valores, ...p });
  return (
    <div className={`grid gap-3 ${colunas}`}>
      <div className="space-y-1">
        <Label>Nome do portal</Label>
        <Input
          value={valores.nome}
          onChange={(e) => set({ nome: e.target.value })}
          placeholder="Digite o nome do portal"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label>CPF (opcional)</Label>
        <Input
          value={valores.cpf}
          onChange={(e) => set({ cpf: e.target.value })}
          placeholder="Digite o cpf"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label>URL (opcional)</Label>
        <Input
          value={valores.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="Digite a url do portal"
          autoComplete="off"
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
          value={valores.vencimento}
          onChange={(e) => set({ vencimento: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label>Login</Label>
        <Input
          value={valores.login}
          onChange={(e) => set({ login: e.target.value })}
          placeholder="Digite o login"
          autoComplete="off"
        />
      </div>
      <div className="space-y-1">
        <Label>Senha</Label>
        <CampoSenha
          valor={valores.senha}
          onChange={(v) => set({ senha: v })}
          placeholder={senhaPlaceholder}
        />
      </div>
    </div>
  );
}

export function PortaisAcessos() {
  const { equipeId, perfil, isAdmin, isDiretor } = useAuth();
  const qc = useQueryClient();
  const definir = useServerFn(definirSenhaAcesso);
  const remover = useServerFn(removerSenhaAcesso);
  const revelar = useServerFn(revelarSenhaAcesso);

  const podeRevelar = isAdmin || isDiretor;
  const [novo, setNovo] = useState<Form>(VAZIO);
  const [editando, setEditando] = useState<Acesso | null>(null);
  const [edicao, setEdicao] = useState<Form>(VAZIO);
  const [excluindo, setExcluindo] = useState<Acesso | null>(null);
  const [revelada, setRevelada] = useState<{ nome: string; senha: string } | null>(null);
  const [busca, setBusca] = useState("");

  const chave = ["portais-acessos", equipeId] as const;
  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  const { data: acessos, isLoading } = useQuery({
    queryKey: chave,
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data, error } = await supabase.from("portais_acessos").select(COLUNAS).order("nome");
      if (error) throw error;
      return (data ?? []) as Acesso[];
    },
  });

  const lista = useMemo(
    () =>
      (acessos ?? []).filter((a) =>
        combina(`${a.nome} ${a.url ?? ""} ${a.login ?? ""} ${a.tipo}`, busca),
      ),
    [acessos, busca],
  );

  /** Grava a senha pelo servidor; o acesso já foi salvo, então uma falha aqui vira aviso. */
  const guardarSenha = async (id: string, senha: string): Promise<string | null> => {
    if (!senha) return null;
    try {
      await definir({ data: { acesso_id: id, senha } });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "erro desconhecido";
    }
  };

  const criar = useMutation({
    mutationFn: async (f: Form) => {
      if (!equipeId) throw new Error("Equipe não definida.");
      const nome = f.nome.trim();
      if (!nome) throw new Error("Informe o nome do portal.");
      const { data, error } = await supabase
        .from("portais_acessos")
        .insert({
          equipe_id: equipeId,
          nome,
          cpf: f.cpf.trim() || null,
          url: normalizarUrl(f.url),
          tipo: f.tipo || "Portal",
          vencimento: f.vencimento || null,
          login: f.login.trim() || null,
          criado_por_nome: perfil?.nome ?? perfil?.email ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { aviso: await guardarSenha(data.id, f.senha) };
    },
    onSuccess: ({ aviso }) => {
      if (aviso) toast.warning(`Acesso salvo, mas a senha não foi guardada: ${aviso}`);
      else toast.success("Acesso salvo.");
      setNovo(VAZIO);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarEdicao = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: Form }) => {
      const nome = f.nome.trim();
      if (!nome) throw new Error("Informe o nome do portal.");
      const { error } = await supabase
        .from("portais_acessos")
        .update({
          nome,
          cpf: f.cpf.trim() || null,
          url: normalizarUrl(f.url),
          tipo: f.tipo || "Portal",
          vencimento: f.vencimento || null,
          login: f.login.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
      return { aviso: await guardarSenha(id, f.senha) };
    },
    onSuccess: ({ aviso }) => {
      if (aviso) toast.warning(`Dados salvos, mas a senha não foi guardada: ${aviso}`);
      else toast.success("Acesso atualizado.");
      setEditando(null);
      setEdicao(VAZIO);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const tirarSenha = useMutation({
    mutationFn: (id: string) => remover({ data: { acesso_id: id } }),
    onSuccess: () => {
      toast.success("Senha guardada removida.");
      setEditando((a) => (a ? { ...a, tem_senha: false } : a));
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portais_acessos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso excluído.");
      setExcluindo(null);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ver = useMutation({
    mutationFn: async (a: Acesso) => ({
      nome: a.nome,
      ...(await revelar({ data: { acesso_id: a.id } })),
    }),
    onSuccess: (r) => setRevelada({ nome: r.nome, senha: r.senha }),
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirEdicao = (a: Acesso) => {
    setEditando(a);
    setEdicao({
      nome: a.nome,
      cpf: a.cpf ?? "",
      url: a.url ?? "",
      tipo: a.tipo,
      vencimento: a.vencimento ?? "",
      login: a.login ?? "",
      senha: "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="surface-panel p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4" /> Criar novo acesso
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            criar.mutate(novo);
          }}
        >
          <Campos
            valores={novo}
            setValores={setNovo}
            colunas="md:grid-cols-2 xl:grid-cols-4"
            senhaPlaceholder="Digite a senha"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              A senha é guardada criptografada. Só administradores e diretores conseguem vê-la
              depois.
            </p>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Salvando…" : "Salvar acesso"}
            </Button>
          </div>
        </form>
      </div>

      <div className="surface-panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
          <h2 className="text-sm font-semibold">Acessos cadastrados ({lista.length})</h2>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar portal, link ou login"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Portal</th>
                <th className="p-3">Link</th>
                <th className="p-3">Status</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Criado por</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lista.map((a) => {
                const st = situacao(a.vencimento);
                const link = urlSegura(a.url);
                return (
                  <tr key={a.id}>
                    <td className="p-3">
                      <p className="font-medium">{a.nome}</p>
                      {a.login && <p className="text-xs text-muted-foreground">Login: {a.login}</p>}
                    </td>
                    <td className="max-w-xs p-3">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 break-all text-secondary hover:underline"
                        >
                          {link} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={st.classe}>
                        {st.texto}
                      </Badge>
                      {a.vencimento && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          até {new Date(`${a.vencimento}T00:00:00`).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </td>
                    <td className="p-3">{a.tipo}</td>
                    <td className="p-3">
                      <p>{a.criado_por_nome ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{dataHora(a.created_at)}</p>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {a.tem_senha &&
                          (podeRevelar ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Ver senha de ${a.nome}`}
                              title="Ver senha"
                              disabled={ver.isPending}
                              onClick={() => ver.mutate(a)}
                            >
                              <Eye className="h-4 w-4 text-secondary" />
                            </Button>
                          ) : (
                            <span
                              className="px-2 text-muted-foreground"
                              title="Senha guardada — só administradores e diretores podem ver"
                            >
                              <Lock className="h-4 w-4" />
                            </span>
                          ))}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar ${a.nome}`}
                          title="Editar"
                          onClick={() => abrirEdicao(a)}
                        >
                          <Pencil className="h-4 w-4 text-secondary" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Excluir ${a.nome}`}
                          title="Excluir"
                          onClick={() => setExcluindo(a)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && lista.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    {(acessos ?? []).length === 0
                      ? "Nenhum acesso cadastrado ainda. Use o formulário acima."
                      : "Nenhum acesso encontrado para essa busca."}
                  </td>
                </tr>
              )}
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={Boolean(editando)} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar acesso</DialogTitle>
            <DialogDescription>
              {editando?.tem_senha
                ? "Já existe uma senha guardada. Deixe o campo em branco para mantê-la."
                : "Nenhuma senha guardada para este acesso."}
            </DialogDescription>
          </DialogHeader>
          <Campos
            valores={edicao}
            setValores={setEdicao}
            colunas="md:grid-cols-2"
            senhaPlaceholder={editando?.tem_senha ? "•••••• (manter a atual)" : "Digite a senha"}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {editando?.tem_senha ? (
              <Button
                type="button"
                variant="outline"
                disabled={tirarSenha.isPending}
                onClick={() => editando && tirarSenha.mutate(editando.id)}
              >
                Remover senha guardada
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button
                disabled={salvarEdicao.isPending}
                onClick={() => editando && salvarEdicao.mutate({ id: editando.id, f: edicao })}
              >
                {salvarEdicao.isPending ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revelada)} onOpenChange={(o) => !o && setRevelada(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Senha — {revelada?.nome}</DialogTitle>
            <DialogDescription>
              Esta visualização foi registrada. Feche a janela quando terminar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm">{revelada?.senha}</code>
            <Button
              size="icon"
              variant="outline"
              aria-label="Copiar senha"
              title="Copiar"
              onClick={() => {
                if (!revelada) return;
                void navigator.clipboard
                  .writeText(revelada.senha)
                  .then(() => toast.success("Senha copiada."))
                  .catch(() => toast.error("Não foi possível copiar."));
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(excluindo)} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o acesso “{excluindo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro e a senha guardada serão apagados. Isso não altera o acesso no portal em
              si.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluindo && excluir.mutate(excluindo.id)}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
