import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
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
import { MODALIDADES, NATUREZAS, UFS, data as fData, dataHora, moeda } from "@/lib/formato";
import { buscarItensPncp, buscarLicitacoesPncp, type LicitacaoPncp } from "@/lib/pncp.functions";
import { registrarAlerta, registrarMovimentacao } from "@/lib/registro";

export const Route = createFileRoute("/importar")({
  head: () => ({
    meta: [
      { title: "Importação automática - Licitações Cetro" },
      {
        name: "description",
        content:
          "Monitoramento automático de portais públicos com filtros por palavra-chave, UF, modalidade e natureza do serviço, incluindo obras de engenharia.",
      },
      { property: "og:title", content: "Importação automática - Licitações Cetro" },
      {
        property: "og:description",
        content: "Busque e importe licitações públicas direto para o acompanhamento da equipe.",
      },
    ],
  }),
  component: Importar,
});

function Importar() {
  const { equipeId, user, perfil } = useAuth();
  const qc = useQueryClient();
  const buscar = useServerFn(buscarLicitacoesPncp);
  const itensDe = useServerFn(buscarItensPncp);

  const [palavraChave, setPalavraChave] = useState("");
  const [uf, setUf] = useState("todas");
  const [modalidade, setModalidade] = useState("todas");
  const [natureza, setNatureza] = useState("Obras e engenharia");
  const [valorMinimo, setValorMinimo] = useState("");
  const [valorMaximo, setValorMaximo] = useState("");
  const [resultados, setResultados] = useState<LicitacaoPncp[]>([]);
  const [importadas, setImportadas] = useState<string[]>([]);

  const pesquisa = useMutation({
    mutationFn: async () =>
      buscar({
        data: {
          palavraChave,
          uf: uf === "todas" ? "" : uf,
          modalidade: modalidade === "todas" ? "" : modalidade,
          natureza: natureza === "todas" ? "" : natureza,
          valorMinimo: valorMinimo ? Number(valorMinimo) : undefined,
          valorMaximo: valorMaximo ? Number(valorMaximo) : undefined,
          paginas: 2,
        },
      }),
    onSuccess: (r) => {
      setResultados(r.licitacoes);
      if (r.erros.length > 0) toast.warning(r.erros[0]);
      toast.success(`${r.total} licitação(ões) encontrada(s) nos portais públicos.`);
    },
    onError: () => toast.error("Não foi possível consultar os portais agora. Tente novamente."),
  });

  const importar = useMutation({
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
          processo_administrativo: l.processo_administrativo,
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

      const { itens } = await itensDe({
        data: { cnpj: l.orgao_cnpj, ano: l.ano, sequencial: l.sequencial },
      });
      if (itens.length > 0) {
        await supabase.from("licitacao_itens").insert(
          itens.map((i: any) => ({
            licitacao_id: lic.id,
            equipe_id: equipeId,
            numero_item: i.numero_item,
            lote: i.lote,
            descricao: i.descricao,
            quantidade: i.quantidade,
            unidade: i.unidade,
            valor_unitario_estimado: i.valor_unitario_estimado,
            valor_total_estimado: i.valor_total_estimado,
            situacao: "em aberto",
          })),
        );
        await supabase
          .from("licitacoes")
          .update({
            qtd_itens: itens.length,
            qtd_lotes: new Set(itens.map((i: any) => i.lote).filter(Boolean)).size || null,
          })
          .eq("id", lic.id);
      }

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
        l.data_abertura && {
          tipo: "Intenção de recurso",
          descricao: "Prazo estimado (3 dias após a sessão) para manifestar intenção de recurso",
          data_limite: new Date(
            new Date(l.data_abertura).getTime() + 3 * 86400000,
          ).toISOString(),
        },
        l.data_abertura && {
          tipo: "Recurso",
          descricao: "Prazo estimado (3 dias úteis após a intenção) para apresentar razões de recurso",
          data_limite: new Date(
            new Date(l.data_abertura).getTime() + 6 * 86400000,
          ).toISOString(),
        },
        l.data_abertura && {
          tipo: "Contrarrazões",
          descricao: "Prazo estimado para contrarrazões",
          data_limite: new Date(
            new Date(l.data_abertura).getTime() + 9 * 86400000,
          ).toISOString(),
        },
      ].filter(Boolean) as Array<{ tipo: string; descricao: string; data_limite: string }>;

      if (prazos.length > 0) {
        await supabase
          .from("prazos")
          .insert(prazos.map((p) => ({ ...p, licitacao_id: lic.id, equipe_id: equipeId })));
      }

      if (l.site_url) {
        await supabase.from("documentos").insert({
          licitacao_id: lic.id,
          equipe_id: equipeId,
          tipo: "edital",
          nome: "Edital / processo no portal de origem",
          url: l.site_url,
        });
      }

      await registrarMovimentacao(
        ctx,
        lic.id,
        "importação",
        `Licitação importada automaticamente do PNCP (${l.portal}) por ${ctx.autorNome ?? "usuário"}.`,
      );
      await registrarAlerta(
        ctx,
        lic.id,
        "importação",
        `Nova licitação importada: ${l.numero}`,
        `${l.orgao} — ${l.objeto?.slice(0, 140)}`,
      );
      return l.fonte_id;
    },
    onSuccess: (fonteId) => {
      setImportadas((v) => [...v, fonteId]);
      toast.success("Licitação adicionada ao acompanhamento, com itens e prazos.");
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: any) =>
      toast.error(
        String(e?.message ?? "").includes("duplicate")
          ? "Essa licitação já está sendo acompanhada."
          : "Não foi possível importar essa licitação.",
      ),
  });

  return (
    <AppLayout
      titulo="Importação automática"
      descricao="Monitoramento de portais públicos (PNCP e sistemas de origem)"
    >
      <div className="space-y-5">
        <div className="surface-panel grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Palavras-chave de interesse</Label>
            <Input
              value={palavraChave}
              onChange={(e) => setPalavraChave(e.target.value)}
              placeholder="ex.: pavimentação asfáltica, creche, drenagem"
            />
          </div>
          <div className="space-y-1">
            <Label>Natureza do serviço</Label>
            <Select value={natureza} onValueChange={setNatureza}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as naturezas</SelectItem>
                {NATUREZAS.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Modalidade</Label>
            <Select value={modalidade} onValueChange={setModalidade}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Principais modalidades</SelectItem>
                {MODALIDADES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>UF</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {UFS.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Valor mínimo</Label>
            <Input type="number" value={valorMinimo} onChange={(e) => setValorMinimo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Valor máximo</Label>
            <Input type="number" value={valorMaximo} onChange={(e) => setValorMaximo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => pesquisa.mutate()} disabled={pesquisa.isPending}>
              <Search className="mr-2 h-4 w-4" />
              {pesquisa.isPending ? "Consultando portais…" : "Buscar oportunidades"}
            </Button>
          </div>
        </div>

        {resultados.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {resultados.length} resultado(s). O filtro de natureza classifica o objeto do edital —
            selecione “Obras e engenharia” para ver apenas construção civil e obras.
          </p>
        )}

        <div className="space-y-3">
          {resultados.map((l) => (
            <div key={l.fonte_id} className="surface-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-semibold">{l.numero}</span>
                    <Badge variant="secondary">{l.modalidade}</Badge>
                    <Badge variant="outline">{l.natureza}</Badge>
                    {l.situacao && <Badge variant="outline">{l.situacao}</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{l.objeto}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {l.orgao} · {l.cidade ?? "—"}/{l.uf ?? "—"} · Publicado {fData(l.data_publicacao)} ·
                    Abertura {dataHora(l.data_abertura)} · Propostas até{" "}
                    {dataHora(l.encerramento_proposta)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Portal: <strong>{l.portal}</strong> · Disputa: {l.plataforma} · Estimado:{" "}
                    <strong>{moeda(l.valor_estimado)}</strong>
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={importar.isPending || importadas.includes(l.fonte_id)}
                  onClick={() => importar.mutate(l)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {importadas.includes(l.fonte_id) ? "Importada" : "Acompanhar"}
                </Button>
              </div>
            </div>
          ))}
          {resultados.length === 0 && !pesquisa.isPending && (
            <div className="surface-panel p-10 text-center text-sm text-muted-foreground">
              Defina os filtros e clique em “Buscar oportunidades” para trazer licitações dos portais
              públicos.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
