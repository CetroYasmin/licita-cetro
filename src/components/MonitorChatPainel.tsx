import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Radio, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dataHora } from "@/lib/formato";
import {
  configurarChat,
  listarConectores,
  sincronizarChat,
} from "@/services/monitoring/monitoring.functions";
import { PALAVRAS_SUGERIDAS } from "@/services/monitoring/keywords";

export type LicitacaoChat = {
  id: string;
  numero: string;
  chat_monitorar: boolean;
  chat_conector: string | null;
  chat_id_externo: string | null;
  chat_ultima_coleta: string | null;
  chat_ultimo_erro: string | null;
  chat_erros_seguidos: number;
};

/** Só o que o tempo real precisa saber do cache da tela de detalhe (`["licitacao", id]`). */
type MensagemDoCache = { id: string; enviada_em: string };
type CacheLicitacao = { chat?: MensagemDoCache[] } & Record<string, unknown>;

function haQuanto(iso: string | null): string {
  if (!iso) return "ainda não coletado";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.round(min / 60)} h`;
  return dataHora(iso);
}

/**
 * Liga o monitoramento automático do chat de uma licitação, mostra a saúde da
 * coleta e gerencia as palavras-chave da equipe. As mensagens chegam por
 * tempo real (Supabase Realtime) direto na lista da aba Chat.
 */
export function MonitorChatPainel({ licitacao }: { licitacao: LicitacaoChat }) {
  const { equipeId, perfil } = useAuth();
  const qc = useQueryClient();
  const listar = useServerFn(listarConectores);
  const configurar = useServerFn(configurarChat);
  const sincronizar = useServerFn(sincronizarChat);

  const [conector, setConector] = useState(licitacao.chat_conector ?? "");
  const [idExterno, setIdExterno] = useState(licitacao.chat_id_externo ?? "");
  const [novaPalavra, setNovaPalavra] = useState("");

  const recarregar = () => void qc.invalidateQueries({ queryKey: ["licitacao", licitacao.id] });

  // Mensagens novas entram na lista sem recarregar a página nem refazer as 10 consultas da tela.
  useEffect(() => {
    const canal = supabase
      .channel(`chat-${licitacao.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_mensagens",
          filter: `licitacao_id=eq.${licitacao.id}`,
        },
        (payload) => {
          qc.setQueryData<CacheLicitacao | undefined>(["licitacao", licitacao.id], (antigo) => {
            if (!antigo) return antigo;
            const nova = payload.new as MensagemDoCache;
            const atuais = antigo.chat ?? [];
            if (atuais.some((m) => m.id === nova.id)) return antigo;
            const chat = [...atuais, nova].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
            return { ...antigo, chat };
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [licitacao.id, qc]);

  const { data: conectores } = useQuery({
    queryKey: ["chat-conectores"],
    queryFn: () => listar(),
    staleTime: Infinity,
  });

  const { data: palavras } = useQuery({
    queryKey: ["chat-palavras", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_palavras_chave")
        .select("id, palavra")
        .eq("ativo", true)
        .order("palavra");
      if (error) throw error;
      return data ?? [];
    },
  });

  const escolhido = (conectores ?? []).find((c) => c.slug === conector);

  const alternar = useMutation({
    mutationFn: async (monitorar: boolean) =>
      configurar({
        data: {
          licitacao_id: licitacao.id,
          monitorar,
          conector: conector || null,
          id_externo: idExterno.trim() || null,
        },
      }),
    onSuccess: (_r, monitorar) => {
      toast.success(monitorar ? "Monitoramento do chat ligado." : "Monitoramento desligado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const agora = useMutation({
    mutationFn: async () => sincronizar({ data: { licitacao_id: licitacao.id } }),
    onSuccess: (r) => {
      if (r.falhas > 0) toast.error("O portal não respondeu. Veja o detalhe abaixo.");
      else if (r.mensagens_novas > 0) toast.success(`${r.mensagens_novas} mensagem(ns) nova(s).`);
      else toast.info("Nenhuma mensagem nova.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const adicionar = useMutation({
    mutationFn: async (palavra: string) => {
      if (!equipeId) throw new Error("Equipe não definida");
      const { error } = await supabase
        .from("chat_palavras_chave")
        .insert({ equipe_id: equipeId, palavra: palavra.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setNovaPalavra("");
      void qc.invalidateQueries({ queryKey: ["chat-palavras"] });
    },
    onError: (e: { message?: string }) =>
      toast.error(
        String(e.message ?? "").includes("duplicate")
          ? "Essa palavra já está na lista."
          : "Não foi possível salvar.",
      ),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("chat_palavras_chave").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["chat-palavras"] }),
  });

  const ativas = new Set((palavras ?? []).map((p) => p.palavra.toLowerCase()));
  const sugeridas = [
    ...(perfil?.empresa_nome ? [perfil.empresa_nome] : []),
    ...PALAVRAS_SUGERIDAS,
  ].filter((p) => !ativas.has(p.toLowerCase()));

  const ligado = licitacao.chat_monitorar;
  const comFalha = ligado && licitacao.chat_erros_seguidos > 0;

  return (
    <div className="surface-panel space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4" /> Monitoramento automático do chat
            {ligado && !comFalha && <Badge>ao vivo</Badge>}
            {comFalha && <Badge variant="destructive">com falha</Badge>}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {conector === "bll"
              ? "No BLL, as mensagens chegam pelo Tampermonkey enquanto o chat estiver aberto no navegador."
              : "O sistema lê o chat do portal sozinho e avisa a equipe quando aparecer uma palavra-chave."}
          </p>
        </div>
        <Switch
          checked={ligado}
          disabled={alternar.isPending}
          onCheckedChange={(v) => alternar.mutate(v)}
          aria-label="Monitorar chat desta licitação"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Portal</Label>
          <Select value={conector} onValueChange={(valor) => {
            setConector(valor);
            if (valor === "bll") setIdExterno(licitacao.numero);
          }} disabled={ligado}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha o portal" />
            </SelectTrigger>
            <SelectContent>
              {(conectores ?? []).map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{conector === "bll" ? "Número da licitação no BLL" : "Identificador da compra"}</Label>
          <Input
            value={idExterno}
            disabled={ligado}
            onChange={(e) => setIdExterno(e.target.value)}
            placeholder={conector === "bll" ? "Ex.: 10.015/2026" : "Ex.: 981547-5-118-2026"}
          />
        </div>
      </div>
      {escolhido && <p className="-mt-2 text-xs text-muted-foreground">{escolhido.ajuda}</p>}

      {ligado && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
          <p>
            Última coleta: <strong>{haQuanto(licitacao.chat_ultima_coleta)}</strong>
          </p>
          {licitacao.chat_ultimo_erro && (
            <p className="text-destructive">
              Erro ({licitacao.chat_erros_seguidos}x seguidas): {licitacao.chat_ultimo_erro}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={agora.isPending || conector === "bll"}
            title={conector === "bll" ? "Abra o chat no BLL para receber mensagens pelo Tampermonkey" : undefined}
            onClick={() => agora.mutate()}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${agora.isPending ? "animate-spin" : ""}`} />
            Sincronizar agora
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <Label>Palavras-chave da equipe</Label>
        <div className="flex flex-wrap gap-1.5">
          {(palavras ?? []).map((p) => (
            <Badge key={p.id} variant="secondary" className="gap-1 pr-1">
              {p.palavra}
              <button
                type="button"
                aria-label={`Remover ${p.palavra}`}
                className="rounded-full p-0.5 hover:bg-background/60"
                onClick={() => remover.mutate(p.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {(palavras ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhuma palavra cadastrada.</span>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (novaPalavra.trim()) adicionar.mutate(novaPalavra);
          }}
        >
          <Input
            value={novaPalavra}
            onChange={(e) => setNovaPalavra(e.target.value)}
            placeholder="Ex.: convocação, nome da empresa…"
          />
          <Button type="submit" size="sm" variant="outline" disabled={adicionar.isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        </form>
        {sugeridas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Sugestões:
            {sugeridas.map((s) => (
              <button
                key={s}
                type="button"
                className="rounded-full border px-2 py-0.5 hover:bg-muted"
                onClick={() => adicionar.mutate(s)}
              >
                + {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
