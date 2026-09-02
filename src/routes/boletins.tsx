import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Download, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NATUREZAS, UFS, data as fData, dataHora, moeda } from "@/lib/formato";
import { buscarLicitacoesPncp, type LicitacaoPncp } from "@/lib/pncp.functions";
import { registrarAlerta, registrarMovimentacao } from "@/lib/registro";

export const Route = createFileRoute("/boletins")({
  head: () => ({
    meta: [
      { title: "Boletins de novas licitações - Licitações Cetro" },
      {
        name: "description",
        content:
          "Boletim diário das licitações publicadas nos portais públicos que ainda não estão em acompanhamento, agrupadas por dia de publicação.",
      },
      { property: "og:title", content: "Boletins de novas licitações - Licitações Cetro" },
      {
        property: "og:description",
        content:
          "Resumo diário dos novos editais publicados, com envio direto para o acompanhamento da equipe.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Boletins,
});

const PERIODOS = [
  { valor: "1", rotulo: "Hoje" },
  { valor: "3", rotulo: "3 dias" },
  { valor: "7", rotulo: "7 dias" },
  { valor: "15", rotulo: "15 dias" },
] as const;

function Boletins() {
  const { equipeId, user, perfil } = useAuth();
  const qc = useQueryClient();
  const buscar = useServerFn(buscarLicitacoesPncp);

  const [dias, setDias] = useState<string>("3");
  const [objeto, setObjeto] = useState("");
  const [natureza, setNatureza] = useState("Obras e engenharia");
  const [ufs, setUfs] = useState<string[]>([]);
  const [novas, setNovas] = useState<LicitacaoPncp[]>([]);
  const [importadas, setImportadas] = useState<string[]>([]);

  /** Licitações já em acompanhamento: ficam fora do boletim. */
  const { data: acompanhadas } = useQuery({
    queryKey: ["boletim-acompanhadas", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (await supabase.from("licitacoes").select("fonte_id").limit(5000)).data ?? [],
  });

  const { data: vistas } = useQuery({
    queryKey: ["visualizacoes-boletim", equipeId],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (
        await supabase
          .from("visualizacoes")
          .select("fonte_id,user_id,user_nome")
          .not("fonte_id", "is", null)
          .limit(5000)
      ).data ?? [],
  });

  const euVi = (fonteId: string) =>
    (vistas ?? []).some((v) => v.fonte_id === fonteId && v.user_id === user?.id);
  const vistaPor = (fonteId: string) =>
    (vistas ?? []).filter((v) => v.fonte_id === fonteId).map((v) => v.user_nome ?? "membro");

  const gerar = useMutation({
    mutationFn: async () =>
      buscar({
        data: {
          objeto,
          ufs,
           natureza: natureza === "todas" ? "" : natureza,
           ordenar: "publicacao",
        },
      }),
    onSuccess: (r) => {
      setNovas(r.licitacoes);
      if (r.erros.length > 0) toast.warning(r.erros[0]);
    },
    onError: () => toast.error("Não foi possível gerar o boletim agora. Tente novamente."),
  });

  useEffect(() => {
    if (equipeId) gerar.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipeId, dias]);

  const marcarVista = useMutation({
    mutationFn: async (fonteIds: string[]) => {
      if (!equipeId || !user) throw new Error("sem equipe");
      const pendentes = fonteIds.filter((f) => !euVi(f));
      if (pendentes.length === 0) return;
      const { error } = await supabase.from("visualizacoes").insert(
        pendentes.map((fonte_id) => ({
          equipe_id: equipeId,
          user_id: user.id,
          user_nome: perfil?.nome ?? perfil?.email ?? "membro",
          fonte_id,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["visualizacoes-boletim"] }),
    onError: () => toast.error("Não foi possível marcar o boletim como lido."),
  });

  const acompanhar = useMutation({
    mutationFn: async (l: LicitacaoPncp) => {
      if (!equipeId) throw new Error("Equipe não definida");
      const ctx = {
        equipeId,
        autorId: user?.id ?? null,
        autorNome: perfil?.nome ?? perfil?.email ?? null,
      };
      const { data: lic, error } = await supabase
        .from("licitacoes")
        .insert({
          equipe_id: equipeId,
          created_by: user?.id ?? null,
          numero: l.numero,
          modalidade: l.modalidade,
          orgao: l.orgao,
          objeto: l.objeto,
          natureza: l.natureza,
          data_publicacao: l.data_publicacao ? l.data_publicacao.slice(0, 10) : null,
          data_abertura: l.data_abertura ? l.data_abertura.slice(0, 10) : null,
          data_sessao: l.data_abertura,
          plataforma: l.plataforma,
          portal: l.portal,
          site_url: l.site_url,
          valor_estimado: l.valor_estimado,
          cidade: l.cidade,
          uf: l.uf,
          status: "publicada",
          proximo_evento: "Encerramento do envio de propostas",
          proximo_evento_data: l.encerramento_proposta,
          fonte: "PNCP",
          fonte_id: l.fonte_id,
        })
        .select("id")
        .single();
      if (error) throw error;

      const prazos = [
        l.encerramento_proposta && {
          tipo: "Envio de proposta",
          descricao: "Prazo final para envio da proposta no portal",
          data_limite: l.encerramento_proposta,
        },
        l.data_abertura && {
          tipo: "Sessão de disputa",
          descricao: "Abertura da sessão pública / início dos lances",
          data_limite: l.data_abertura,
        },
      ].filter(Boolean) as Array<{ tipo: string; descricao: string; data_limite: string }>;
      if (prazos.length > 0) {
        await supabase
          .from("prazos")
          .insert(prazos.map((p) => ({ ...p, licitacao_id: lic.id, equipe_id: equipeId })));
      }

      await registrarMovimentacao(
        ctx,
        lic.id,
        "importação",
        `Licitação incluída no acompanhamento a partir do boletim por ${ctx.autorNome ?? "usuário"}.`,
      );
      await registrarAlerta(
        ctx,
        lic.id,
        "importação",
        `Nova licitação do boletim: ${l.numero}`,
        `${l.orgao} — ${l.objeto?.slice(0, 140)}`,
      );
      return l.fonte_id;
    },
    onSuccess: (fonteId) => {
      setImportadas((v) => [...v, fonteId]);
      toast.success("Licitação enviada para o acompanhamento.");
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
      void qc.invalidateQueries({ queryKey: ["boletim-acompanhadas"] });
    },
    onError: (e: any) =>
      toast.error(
        String(e?.message ?? "").includes("duplicate")
          ? "Essa licitação já está sendo acompanhada."
          : "Não foi possível incluir essa licitação no acompanhamento.",
      ),
  });

  const grupos = useMemo(() => {
    const jaAcompanhadas = new Set(
      (acompanhadas ?? []).map((l: any) => l.fonte_id).filter(Boolean),
    );
    const limite = Date.now() - Number(dias) * 86400000;
    const mapa = new Map<string, LicitacaoPncp[]>();
    for (const l of novas) {
      if (jaAcompanhadas.has(l.fonte_id) || importadas.includes(l.fonte_id)) continue;
      const publicada = l.data_publicacao ? new Date(l.data_publicacao).getTime() : 0;
      if (!publicada || publicada < limite) continue;
      const dia = String(l.data_publicacao).slice(0, 10);
      mapa.set(dia, [...(mapa.get(dia) ?? []), l]);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [novas, acompanhadas, importadas, dias]);

  const total = grupos.reduce((s, [, l]) => s + l.length, 0);

  return (
    <AppLayout
      titulo="Boletins de novas licitações"
      descricao="Editais publicados nos portais públicos que ainda não estão em acompanhamento"
      acoes={
        <>
          <Button variant="outline" size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${gerar.isPending ? "animate-spin" : ""}`} />
            {gerar.isPending ? "Gerando…" : "Atualizar boletim"}
          </Button>
          <Button
            size="sm"
            disabled={total === 0}
            onClick={() => marcarVista.mutate(grupos.flatMap(([, l]) => l.map((x) => x.fonte_id)))}
          >
            <Check className="mr-2 h-4 w-4" /> Marcar boletim como lido
          </Button>
        </>
      }
    >
      <div className="surface-panel mb-4 grid gap-3 p-4 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2">
          <Label>Objeto de interesse (opcional)</Label>
          <Input
            value={objeto}
            onChange={(e) => setObjeto(e.target.value)}
            placeholder="ex.: pavimentação, drenagem, construção de escola"
          />
        </div>
        <div className="space-y-1">
          <Label>Natureza</Label>
          <Select value={natureza} onValueChange={setNatureza}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as naturezas</SelectItem>
              {NATUREZAS.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label>Estados (nenhum selecionado = todos)</Label>
            {ufs.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setUfs([])}>
                Limpar seleção
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {UFS.map((u) => {
              const ativo = ufs.includes(u);
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUfs((v) => (ativo ? v.filter((x) => x !== u) : [...v, u]))}
                  className={`rounded border px-2 py-1 text-xs transition-colors ${
                    ativo
                      ? "border-secondary bg-secondary text-secondary-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Tabs value={dias} onValueChange={setDias} className="mb-4">
        <TabsList>
          {PERIODOS.map((p) => (
            <TabsTrigger key={p.valor} value={p.valor}>
              {p.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {gerar.isPending && (
        <p className="text-sm text-muted-foreground">Consultando os portais públicos…</p>
      )}

      <div className="space-y-5">
        {grupos.map(([dia, itens]) => (
          <section key={dia} className="surface-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h2 className="font-display text-sm font-semibold">
                  Boletim de {fData(`${dia}T12:00:00`)}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {itens.length} nova(s) licitação(ões) publicada(s) neste dia
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => marcarVista.mutate(itens.map((l) => l.fonte_id))}
              >
                Marcar dia como lido
              </Button>
            </div>
            <ul className="divide-y">
              {itens.map((l) => (
                <li key={l.fonte_id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold">{l.numero}</span>
                      <Badge variant="secondary">{l.modalidade}</Badge>
                      <Badge variant="outline">{l.natureza}</Badge>
                      {l.situacao && <Badge variant="outline">{l.situacao}</Badge>}
                      {vistaPor(l.fonte_id).length > 0 && (
                        <Badge variant="outline" className="border-secondary/40 text-secondary">
                          Vista por {vistaPor(l.fonte_id).join(", ")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted-foreground">
                      {l.objeto}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.orgao} · {l.cidade ?? "—"}/{l.uf ?? "—"} · {moeda(l.valor_estimado)} ·
                      propostas até {dataHora(l.encerramento_proposta)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {l.site_url && (
                      <Button variant="secondary" size="sm" asChild>
                        <a href={l.site_url} target="_blank" rel="noreferrer">
                          Edital <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={acompanhar.isPending}
                      onClick={() => acompanhar.mutate(l)}
                    >
                      <Download className="mr-2 h-4 w-4" /> Acompanhar
                    </Button>
                    {!euVi(l.fonte_id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => marcarVista.mutate([l.fonte_id])}
                      >
                        <Check className="mr-1 h-3 w-3" /> Vista
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {!gerar.isPending && grupos.length === 0 && (
          <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
            Nenhuma licitação nova publicada no período com esses filtros. Amplie o período, os
            estados ou a natureza e atualize o boletim.
          </div>
        )}
      </div>
    </AppLayout>
  );
}
