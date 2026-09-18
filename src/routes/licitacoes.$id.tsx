import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  STATUS_LICITACAO,
  contagemRegressiva,
  corDoStatus,
  data as fData,
  dataHora,
  moeda,
  numero as fNumero,
  numeroDaMoeda,
} from "@/lib/formato";
import { InputMoeda } from "@/components/InputMoeda";

import { registrarAlerta, registrarMovimentacao } from "@/lib/registro";
import { partesDoFonteId, sincronizarLicitacaoPncp } from "@/lib/pncp.functions";

export const Route = createFileRoute("/licitacoes/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes da licitação - Licitações Cetro" },
      {
        name: "description",
        content:
          "Dados do edital, itens e lotes, prazos, documentos, concorrentes, posição da empresa e chat da licitação.",
      },
      { property: "og:title", content: "Detalhes da licitação - Licitações Cetro" },
      {
        property: "og:description",
        content: "Acompanhe dados, andamento, itens, concorrentes e chat de cada licitação.",
      },
    ],
  }),
  component: Detalhes,
});

function Detalhes() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { equipeId, user, perfil } = useAuth();
  const ctx = {
    equipeId: equipeId ?? "",
    autorId: user?.id ?? null,
    autorNome: perfil?.nome ?? perfil?.email ?? null,
  };

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["licitacao", id] });
    void qc.invalidateQueries({ queryKey: ["licitacoes"] });
  };

  const { data, isLoading } = useQuery({
    queryKey: ["licitacao", id],
    enabled: Boolean(equipeId),
    queryFn: async () => {
      const [lic, itens, movs, conc, docs, prazos, chat, lances, tarefas, membros] =
        await Promise.all([
          supabase.from("licitacoes").select("*").eq("id", id).maybeSingle(),
          supabase.from("licitacao_itens").select("*").eq("licitacao_id", id).order("numero_item"),
          supabase
            .from("movimentacoes")
            .select("*")
            .eq("licitacao_id", id)
            .order("ocorrido_em", { ascending: false }),
          supabase.from("concorrentes").select("*").eq("licitacao_id", id).order("posicao"),
          supabase.from("documentos").select("*").eq("licitacao_id", id).order("created_at"),
          supabase.from("prazos").select("*").eq("licitacao_id", id).order("data_limite"),
          supabase
            .from("chat_mensagens")
            .select("*")
            .eq("licitacao_id", id)
            .order("enviada_em", { ascending: true }),
          supabase
            .from("lances")
            .select("*")
            .eq("licitacao_id", id)
            .order("registrado_em", { ascending: false }),
          supabase.from("tarefas").select("*").eq("licitacao_id", id).order("prazo"),
          supabase.from("profiles").select("id,nome,email"),
        ]);
      return {
        lic: lic.data as any,
        itens: itens.data ?? [],
        movs: movs.data ?? [],
        conc: conc.data ?? [],
        docs: docs.data ?? [],
        prazos: prazos.data ?? [],
        chat: chat.data ?? [],
        lances: lances.data ?? [],
        tarefas: tarefas.data ?? [],
        membros: membros.data ?? [],
      };
    },
  });

  const atualizar = useMutation({
    mutationFn: async ({ campos, log }: { campos: Record<string, unknown>; log: string }) => {
      const { error } = await supabase
        .from("licitacoes")
        .update({ ...campos, ultima_atualizacao: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await registrarMovimentacao(ctx, id, "atualização", `${log} — por ${ctx.autorNome ?? "usuário"}`);
    },
    onSuccess: () => {
      toast.success("Licitação atualizada.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("licitacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Licitação excluída do acompanhamento.");
      void navigate({ to: "/licitacoes" });
    },
  });

  const licAtual = data?.lic;

  const sincronizar = useMutation({
    mutationFn: async () => {
      const partes = partesDoFonteId(licAtual?.fonte_id);
      if (!partes) throw new Error("Esta licitação não tem origem no PNCP para reconsulta.");
      const res = await sincronizarLicitacaoPncp({ data: partes });
      if (!res.ok || !res.licitacao) throw new Error("Não foi possível consultar o PNCP agora.");
      const novo = res.licitacao;
      const mudancas: string[] = [];
      const campos: Record<string, unknown> = {};

      const comparar = (
        rotulo: string,
        coluna: string,
        antes: unknown,
        depois: unknown,
        formatar: (v: any) => string,
      ) => {
        const a = antes ? String(antes).slice(0, 16) : "";
        const b = depois ? String(depois).slice(0, 16) : "";
        if (b && a !== b) {
          mudancas.push(`${rotulo}: ${antes ? formatar(antes) : "—"} → ${formatar(depois)}`);
          campos[coluna] = depois;
        }
      };

      comparar("Data de abertura", "data_abertura", licAtual.data_abertura, novo.data_abertura, fData);
      comparar("Data da sessão", "data_sessao", licAtual.data_sessao, novo.data_sessao, dataHora);
      comparar("Publicação", "data_publicacao", licAtual.data_publicacao, novo.data_publicacao, fData);
      comparar(
        "Valor estimado",
        "valor_estimado",
        licAtual.valor_estimado,
        novo.valor_estimado,
        (v) => moeda(Number(v)),
      );
      comparar(
        "Situação no portal",
        "situacao_proposta",
        licAtual.situacao_proposta,
        novo.situacao,
        (v) => String(v),
      );
      if (novo.site_url && novo.site_url !== licAtual.site_url) campos["site_url"] = novo.site_url;

      if (mudancas.length === 0) {
        await supabase
          .from("licitacoes")
          .update({ ultima_atualizacao: new Date().toISOString() })
          .eq("id", id);
        return { mudancas };
      }

      const situacao = String(novo.situacao ?? "").toLowerCase();
      if (situacao.includes("suspens")) campos["status"] = "suspensa";
      if (novo.data_sessao && novo.data_sessao !== licAtual.data_sessao) {
        campos["proximo_evento"] = "Sessão remarcada/prorrogada";
        campos["proximo_evento_data"] = novo.data_sessao;
      }

      const { error } = await supabase
        .from("licitacoes")
        .update({ ...campos, ultima_atualizacao: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      await registrarMovimentacao(
        ctx,
        id,
        "atualização do portal",
        `Alterações detectadas no PNCP — ${mudancas.join(" | ")}`,
      );
      await registrarAlerta(
        ctx,
        id,
        "prazo alterado",
        `Datas/situação alteradas na licitação ${licAtual.numero}`,
        mudancas.join(" | "),
      );
      return { mudancas };
    },
    onSuccess: (r) => {
      if (r && r.mudancas.length > 0) {
        toast.success(`Atualizada: ${r.mudancas.length} alteração(ões) registrada(s).`);
      } else {
        toast.info("Nenhuma alteração encontrada no portal de origem.");
      }
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lic = licAtual;

  if (isLoading || !lic) {
    return (
      <AppLayout titulo="Detalhes da licitação">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : "Licitação não encontrada."}
        </p>
      </AppLayout>
    );
  }

  const diferenca =
    lic.valor_ofertado != null && lic.melhor_valor != null
      ? lic.valor_ofertado - lic.melhor_valor
      : null;
  const percentual =
    diferenca != null && lic.melhor_valor ? (diferenca / lic.melhor_valor) * 100 : null;

  return (
    <AppLayout
      titulo={`Licitação ${lic.numero}`}
      descricao={`${lic.orgao ?? "—"} · última atualização ${dataHora(lic.ultima_atualizacao)}`}
      acoes={
        <>
          {lic.site_url && (
            <Button size="sm" asChild>
              <a href={lic.site_url} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Acessar site da licitação
              </a>
            </Button>
          )}
          {lic.fonte_id && (
            <Button
              variant="secondary"
              size="sm"
              disabled={sincronizar.isPending}
              onClick={() => sincronizar.mutate()}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${sincronizar.isPending ? "animate-spin" : ""}`}
              />
              Verificar atualizações
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/licitacoes">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir esta licitação?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todo o acompanhamento, itens, prazos, documentos e chat serão apagados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => excluir.mutate()}>Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={corDoStatus(lic.status)}>{lic.status}</Badge>
        {lic.modalidade && <Badge variant="secondary">{lic.modalidade}</Badge>}
        {lic.natureza && <Badge variant="outline">{lic.natureza}</Badge>}
        {lic.proximo_evento && (
          <span className="text-xs text-muted-foreground">
            Próximo evento: <strong>{lic.proximo_evento}</strong> ({dataHora(lic.proximo_evento_data)} ·
            faltam {contagemRegressiva(lic.proximo_evento_data)})
          </span>
        )}
      </div>

      <Tabs defaultValue="dados">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="acompanhamento">Acompanhamento</TabsTrigger>
          <TabsTrigger value="empresa">Minha empresa</TabsTrigger>
          <TabsTrigger value="concorrentes">Concorrentes</TabsTrigger>
          <TabsTrigger value="itens">Itens e lotes</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="prazos">Prazos e tarefas</TabsTrigger>
          <TabsTrigger value="chat">Chat da licitação</TabsTrigger>
        </TabsList>

        {/* DADOS */}
        <TabsContent value="dados" className="mt-4 space-y-4">
          <div className="surface-panel grid gap-4 p-5 md:grid-cols-3">
            <Info label="Número da licitação" valor={lic.numero} />
            <Info label="Modalidade" valor={lic.modalidade} />
            <Info label="Órgão/entidade" valor={lic.orgao} />
            <Info label="Processo administrativo" valor={lic.processo_administrativo} />
            <Info label="Cidade/UF" valor={`${lic.cidade ?? "—"}/${lic.uf ?? "—"}`} />
            <Info label="Natureza do serviço" valor={lic.natureza} />
            <Info label="Data de publicação" valor={fData(lic.data_publicacao)} />
            <Info label="Data de abertura" valor={fData(lic.data_abertura)} />
            <Info label="Data e horário da sessão" valor={dataHora(lic.data_sessao)} />
            <Info label="Portal da disputa" valor={lic.portal} destaque />
            <Info label="Modo/local da disputa" valor={lic.plataforma} />
            <Info label="Valor estimado" valor={moeda(lic.valor_estimado)} />
            <Info label="Quantidade de itens" valor={fNumero(lic.qtd_itens ?? data?.itens.length ?? 0)} />
            <Info label="Quantidade de lotes" valor={fNumero(lic.qtd_lotes ?? 0)} />
            <Info label="Concorrentes" valor={fNumero(lic.qtd_concorrentes ?? data?.conc.length ?? 0)} />
            <div className="md:col-span-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Objeto</p>
              <p className="mt-1 text-sm">{lic.objeto}</p>
            </div>
            {lic.site_url && (
              <div className="md:col-span-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Site da licitação
                </p>
                <a
                  href={lic.site_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm text-secondary hover:underline"
                >
                  Abrir processo em {lic.portal ?? "portal de origem"}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          <FormularioDados lic={lic} onSalvar={(campos, log) => atualizar.mutate({ campos, log })} />

          <div className="surface-panel space-y-3 p-5">
            <h3 className="text-sm font-semibold">Organização interna</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Select
                  value={lic.responsavel_id ?? "nenhum"}
                  onValueChange={(v) =>
                    atualizar.mutate({
                      campos: { responsavel_id: v === "nenhum" ? null : v },
                      log: "Responsável alterado",
                    })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Definir responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem responsável</SelectItem>
                    {(data?.membros ?? []).map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome ?? m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Etiquetas (separadas por vírgula)</Label>
                <Input
                  defaultValue={(lic.tags ?? []).join(", ")}
                  onBlur={(e) =>
                    atualizar.mutate({
                      campos: {
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      },
                      log: "Etiquetas atualizadas",
                    })
                  }
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Observações internas</Label>
                <Textarea
                  defaultValue={lic.observacoes ?? ""}
                  rows={3}
                  onBlur={(e) =>
                    atualizar.mutate({
                      campos: { observacoes: e.target.value },
                      log: "Observações internas atualizadas",
                    })
                  }
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ACOMPANHAMENTO */}
        <TabsContent value="acompanhamento" className="mt-4 space-y-4">
          <div className="surface-panel grid gap-3 p-5 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Status atual</Label>
              <Select
                value={lic.status}
                onValueChange={(v) => {
                  atualizar.mutate({ campos: { status: v }, log: `Status alterado para "${v}"` });
                  void registrarAlerta(
                    ctx,
                    id,
                    "status",
                    `Status alterado: ${lic.numero}`,
                    `Novo status: ${v} (por ${ctx.autorNome ?? "usuário"})`,
                  );
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_LICITACAO.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Próximo evento</Label>
              <Input
                defaultValue={lic.proximo_evento ?? ""}
                onBlur={(e) =>
                  atualizar.mutate({
                    campos: { proximo_evento: e.target.value },
                    log: "Próximo evento atualizado",
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Data do próximo evento</Label>
              <Input
                type="datetime-local"
                defaultValue={
                  lic.proximo_evento_data
                    ? new Date(lic.proximo_evento_data).toISOString().slice(0, 16)
                    : ""
                }
                onBlur={(e) =>
                  atualizar.mutate({
                    campos: {
                      proximo_evento_data: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    },
                    log: "Data do próximo evento atualizada",
                  })
                }
              />
            </div>
          </div>

          <FormularioMovimentacao
            onEnviar={async (tipo, descricao) => {
              await registrarMovimentacao(ctx, id, tipo, `${descricao} — por ${ctx.autorNome}`);
              recarregar();
            }}
          />

          <div className="surface-panel">
            <h3 className="border-b p-4 text-sm font-semibold">Histórico de movimentações</h3>
            <ol className="divide-y">
              {(data?.movs ?? []).map((m: any) => (
                <li key={m.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{m.tipo}</Badge>
                    <span className="text-xs text-muted-foreground">{dataHora(m.ocorrido_em)}</span>
                    {m.autor_nome && (
                      <span className="text-xs text-muted-foreground">· {m.autor_nome}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{m.descricao}</p>
                </li>
              ))}
              {(data?.movs ?? []).length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Nenhuma movimentação registrada.</li>
              )}
            </ol>
          </div>
        </TabsContent>

        {/* MINHA EMPRESA */}
        <TabsContent value="empresa" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Cartao titulo="Posição da empresa" valor={lic.posicao_empresa ? `${lic.posicao_empresa}º` : "—"} />
            <Cartao titulo="Valor ofertado" valor={moeda(lic.valor_ofertado)} />
            <Cartao titulo="Melhor valor atual" valor={moeda(lic.melhor_valor)} />
            <Cartao
              titulo="Diferença para o 1º"
              valor={diferenca == null ? "—" : `${moeda(diferenca)} (${percentual?.toFixed(2)}%)`}
            />
          </div>

          <FormularioEmpresa lic={lic} onSalvar={(campos, log) => atualizar.mutate({ campos, log })} />

          <div className="surface-panel">
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-sm font-semibold">Histórico de lances da empresa</h3>
            </div>
            <FormularioLance
              onEnviar={async (valor, minha, empresa) => {
                await supabase.from("lances").insert({
                  licitacao_id: id,
                  equipe_id: equipeId!,
                  empresa,
                  valor,
                  minha_empresa: minha,
                });
                await registrarMovimentacao(
                  ctx,
                  id,
                  "lance",
                  `Novo lance registrado: ${empresa} — ${moeda(valor)} (por ${ctx.autorNome})`,
                );
                recarregar();
              }}
            />
            <ul className="divide-y">
              {(data?.lances ?? []).map((l: any) => (
                <li key={l.id} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    {l.empresa} {l.minha_empresa && <Badge variant="secondary">nossa empresa</Badge>}
                  </span>
                  <span className="font-medium">{moeda(l.valor)}</span>
                  <span className="text-xs text-muted-foreground">{dataHora(l.registrado_em)}</span>
                </li>
              ))}
              {(data?.lances ?? []).length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Nenhum lance registrado.</li>
              )}
            </ul>
          </div>

          <div className="surface-panel p-5">
            <h3 className="text-sm font-semibold">Itens/lotes em que a empresa participa</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(data?.itens ?? [])
                .filter((i: any) => i.participando)
                .map((i: any) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 border-b pb-2">
                    <span>
                      Item {i.numero_item} {i.lote ? `· Lote ${i.lote}` : ""} — {i.descricao}
                    </span>
                    <span>
                      Ofertado {moeda(i.valor_ofertado)} · Posição {i.posicao_empresa ?? "—"}
                    </span>
                  </li>
                ))}
              {(data?.itens ?? []).filter((i: any) => i.participando).length === 0 && (
                <li className="text-muted-foreground">
                  Marque os itens na aba “Itens e lotes” para acompanhar a participação.
                </li>
              )}
            </ul>
          </div>
        </TabsContent>

        {/* CONCORRENTES */}
        <TabsContent value="concorrentes" className="mt-4 space-y-4">
          <FormularioConcorrente
            onEnviar={async (c) => {
              await supabase
                .from("concorrentes")
                .insert({ ...c, licitacao_id: id, equipe_id: equipeId! });
              await registrarMovimentacao(
                ctx,
                id,
                "concorrente",
                `Concorrente ${c.nome} registrado com ${moeda(c.valor_ofertado)} (por ${ctx.autorNome})`,
              );
              recarregar();
            }}
          />
          <div className="surface-panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">CNPJ</th>
                  <th className="p-3">Posição</th>
                  <th className="p-3">Valor ofertado</th>
                  <th className="p-3">Diferença p/ nossa proposta</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.conc ?? []).map((c: any) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium">
                      {c.nome} {c.vencedor && <Badge className="ml-2">vencedora</Badge>}
                    </td>
                    <td className="p-3">{c.cnpj ?? "—"}</td>
                    <td className="p-3">{c.posicao ? `${c.posicao}º` : "—"}</td>
                    <td className="p-3">{moeda(c.valor_ofertado)}</td>
                    <td className="p-3">
                      {lic.valor_ofertado != null && c.valor_ofertado != null
                        ? moeda(lic.valor_ofertado - c.valor_ofertado)
                        : "—"}
                    </td>
                    <td className="p-3">{c.situacao ?? "—"}</td>
                    <td className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await supabase.from("concorrentes").delete().eq("id", c.id);
                          recarregar();
                        }}
                      >
                        Remover
                      </Button>
                    </td>
                  </tr>
                ))}
                {(data?.conc ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-muted-foreground">
                      Nenhum concorrente registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ITENS */}
        <TabsContent value="itens" className="mt-4">
          <div className="surface-panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">Item</th>
                  <th className="p-3">Lote</th>
                  <th className="p-3">Descrição</th>
                  <th className="p-3">Qtd.</th>
                  <th className="p-3">Un.</th>
                  <th className="p-3">Unit. estimado</th>
                  <th className="p-3">Total estimado</th>
                  <th className="p-3">Nossa oferta</th>
                  <th className="p-3">Melhor valor</th>
                  <th className="p-3">Posição</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3">Vencedor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.itens ?? []).map((i: any) => (
                  <tr key={i.id}>
                    <td className="p-3">{i.numero_item}</td>
                    <td className="p-3">{i.lote ?? "—"}</td>
                    <td className="max-w-sm p-3">{i.descricao}</td>
                    <td className="p-3">{fNumero(i.quantidade)}</td>
                    <td className="p-3">{i.unidade ?? "—"}</td>
                    <td className="p-3">{moeda(i.valor_unitario_estimado)}</td>
                    <td className="p-3">{moeda(i.valor_total_estimado)}</td>
                    <td className="p-3">
                      <InputMoeda
                        className="h-8 w-32"
                        valorInicial={i.valor_ofertado}
                        aria-label="Valor ofertado do item"
                        onConfirmar={async (valor) => {
                          await supabase
                            .from("licitacao_itens")
                            .update({ valor_ofertado: valor, participando: valor != null })
                            .eq("id", i.id);
                          recarregar();
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <InputMoeda
                        className="h-8 w-32"
                        valorInicial={i.melhor_valor}
                        aria-label="Melhor valor do item"
                        onConfirmar={async (valor) => {
                          await supabase
                            .from("licitacao_itens")
                            .update({ melhor_valor: valor })
                            .eq("id", i.id);
                          recarregar();
                        }}
                      />
                    </td>

                    <td className="p-3">
                      <Input
                        className="h-8 w-16"
                        type="number"
                        defaultValue={i.posicao_empresa ?? ""}
                        onBlur={async (e) => {
                          await supabase
                            .from("licitacao_itens")
                            .update({
                              posicao_empresa: e.target.value ? Number(e.target.value) : null,
                            })
                            .eq("id", i.id);
                          recarregar();
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        className="h-8 w-32"
                        defaultValue={i.situacao ?? ""}
                        onBlur={async (e) => {
                          await supabase
                            .from("licitacao_itens")
                            .update({ situacao: e.target.value })
                            .eq("id", i.id);
                          recarregar();
                        }}
                      />
                    </td>
                    <td className="p-3">
                      <Input
                        className="h-8 w-40"
                        defaultValue={i.empresa_vencedora ?? ""}
                        onBlur={async (e) => {
                          await supabase
                            .from("licitacao_itens")
                            .update({ empresa_vencedora: e.target.value })
                            .eq("id", i.id);
                          recarregar();
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {(data?.itens ?? []).length === 0 && (
                  <tr>
                    <td colSpan={12} className="p-4 text-muted-foreground">
                      Nenhum item importado para esta licitação.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* DOCUMENTOS */}
        <TabsContent value="documentos" className="mt-4 space-y-4">
          <FormularioDocumento
            onEnviar={async (doc) => {
              await supabase.from("documentos").insert({ ...doc, licitacao_id: id, equipe_id: equipeId! });
              await registrarMovimentacao(
                ctx,
                id,
                "documento",
                `Documento "${doc.nome}" (${doc.tipo}) adicionado por ${ctx.autorNome}`,
              );
              await registrarAlerta(
                ctx,
                id,
                "documento",
                `Novo documento em ${lic.numero}`,
                `${doc.tipo}: ${doc.nome}`,
              );
              recarregar();
            }}
          />
          <div className="surface-panel divide-y">
            {(data?.docs ?? []).map((d: any) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="text-sm font-medium">{d.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.tipo} · publicado {fData(d.publicado_em)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {d.url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={d.url} target="_blank" rel="noreferrer">
                        Abrir <ExternalLink className="ml-2 h-3 w-3" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await supabase.from("documentos").delete().eq("id", d.id);
                      recarregar();
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ))}
            {(data?.docs ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhum documento cadastrado.</p>
            )}
          </div>
        </TabsContent>

        {/* PRAZOS */}
        <TabsContent value="prazos" className="mt-4 space-y-4">
          <FormularioPrazo
            onEnviar={async (p) => {
              await supabase.from("prazos").insert({ ...p, licitacao_id: id, equipe_id: equipeId! });
              recarregar();
            }}
          />
          <div className="surface-panel divide-y">
            {(data?.prazos ?? []).map((p: any) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="text-sm font-medium">{p.tipo}</p>
                  <p className="text-xs text-muted-foreground">{p.descricao}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">{dataHora(p.data_limite)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.concluido ? "concluído" : `faltam ${contagemRegressiva(p.data_limite)}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await supabase.from("prazos").update({ concluido: !p.concluido }).eq("id", p.id);
                    recarregar();
                  }}
                >
                  {p.concluido ? "Reabrir" : "Concluir"}
                </Button>
              </div>
            ))}
          </div>

          <FormularioTarefa
            membros={data?.membros ?? []}
            onEnviar={async (t) => {
              await supabase
                .from("tarefas")
                .insert({ ...t, licitacao_id: id, equipe_id: equipeId!, created_by: user?.id ?? null });
              recarregar();
            }}
          />
          <div className="surface-panel divide-y">
            {(data?.tarefas ?? []).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className={`text-sm ${t.concluida ? "line-through text-muted-foreground" : ""}`}>
                    {t.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.prazo ? dataHora(t.prazo) : "sem prazo"} ·{" "}
                    {(data?.membros ?? []).find((m: any) => m.id === t.responsavel_id)?.nome ??
                      "sem responsável"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await supabase.from("tarefas").update({ concluida: !t.concluida }).eq("id", t.id);
                    recarregar();
                  }}
                >
                  {t.concluida ? "Reabrir" : "Concluir"}
                </Button>
              </div>
            ))}
            {(data?.tarefas ?? []).length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">Nenhuma tarefa registrada.</p>
            )}
          </div>
        </TabsContent>

        {/* CHAT */}
        <TabsContent value="chat" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <div className="surface-panel flex h-[560px] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                <div>
                  <h3 className="text-sm font-semibold">Chat original da licitação</h3>
                  <p className="text-xs text-muted-foreground">
                    Reprodução das mensagens da sessão no portal — pregoeiro, sistema e licitantes.
                  </p>
                </div>
                {data?.lic?.site_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={data.lic.site_url} target="_blank" rel="noreferrer">
                      Abrir chat no portal
                    </a>
                  </Button>
                )}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {(data?.chat ?? []).map((m: any) => {
                  const papel = m.papel ?? (m.origem === "equipe" ? "equipe" : "licitante");
                  const estilo =
                    papel === "pregoeiro"
                      ? "bg-secondary/10 border-secondary/30"
                      : papel === "sistema"
                        ? "bg-muted border-border italic"
                        : papel === "equipe"
                          ? "ml-auto bg-primary/10 border-primary/30"
                          : "bg-card border-border";
                  return (
                    <div key={m.id} className={`max-w-[85%] rounded-lg border p-3 text-sm ${estilo}`}>
                      <p className="text-xs font-semibold">
                        {m.autor}{" "}
                        <span className="font-normal uppercase tracking-wide text-muted-foreground">
                          · {papel}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{m.mensagem}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{dataHora(m.enviada_em)}</p>
                    </div>
                  );
                })}
                {(data?.chat ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma mensagem reproduzida ainda. Cole a ata/chat do portal ao lado para
                    reproduzir a conversa aqui.
                  </p>
                )}
              </div>
              <form
                className="flex flex-wrap gap-2 border-t p-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const fd = new FormData(form);
                  const mensagem = String(fd.get("mensagem") ?? "").trim();
                  const autor = String(fd.get("autor") ?? "").trim();
                  const papel = String(fd.get("papel") ?? "licitante");
                  if (!mensagem) return;
                  await supabase.from("chat_mensagens").insert({
                    licitacao_id: id,
                    equipe_id: equipeId!,
                    autor: autor || (papel === "equipe" ? (ctx.autorNome ?? "Equipe") : "Portal"),
                    origem: papel === "equipe" ? "equipe" : "portal",
                    papel,
                    mensagem,
                  });
                  form.reset();
                  recarregar();
                }}
              >
                <Input name="autor" placeholder="Autor no portal" className="w-40" />
                <select
                  name="papel"
                  defaultValue="licitante"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="pregoeiro">Pregoeiro</option>
                  <option value="licitante">Licitante</option>
                  <option value="sistema">Sistema</option>
                  <option value="equipe">Nota interna</option>
                </select>
                <Input name="mensagem" placeholder="Mensagem reproduzida do chat…" className="min-w-40 flex-1" />
                <Button type="submit">Registrar</Button>
              </form>
            </div>

            <div className="surface-panel p-4">
              <h3 className="text-sm font-semibold">Importar chat do portal</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Copie o chat/ata da sessão no portal e cole abaixo. Cada linha é reproduzida como
                mensagem; formatos aceitos: <code>[10:32] Pregoeiro: texto</code> ou{" "}
                <code>10:32 - Licitante 12: texto</code>.
              </p>
              <form
                className="mt-3 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const bruto = String(new FormData(form).get("transcricao") ?? "");
                  const base = data?.lic?.data_sessao
                    ? new Date(data.lic.data_sessao)
                    : new Date();
                  const linhas = bruto
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean);
                  const registros = linhas.map((linha) => {
                    const hora = linha.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                    const semHora = linha.replace(/^[\[\(]?\s*\d{1,2}:\d{2}(?::\d{2})?\s*[\]\)]?\s*[-–]?\s*/, "");
                    const divisor = semHora.indexOf(":");
                    const autor = divisor > 0 && divisor < 60 ? semHora.slice(0, divisor).trim() : "Portal";
                    const mensagem = divisor > 0 && divisor < 60 ? semHora.slice(divisor + 1).trim() : semHora;
                    const autorNorm = autor.toLowerCase();
                    const papel = /pregoeir|agente de contrata|presidente|comiss/.test(autorNorm)
                      ? "pregoeiro"
                      : /sistema|portal|automat/.test(autorNorm)
                        ? "sistema"
                        : "licitante";
                    const enviada = new Date(base);
                    if (hora) {
                      enviada.setHours(Number(hora[1]), Number(hora[2]), Number(hora[3] ?? 0), 0);
                    }
                    return {
                      licitacao_id: id,
                      equipe_id: equipeId!,
                      autor,
                      papel,
                      origem: "portal",
                      mensagem,
                      enviada_em: enviada.toISOString(),
                    };
                  });
                  if (registros.length === 0) {
                    toast.error("Cole ao menos uma linha do chat do portal.");
                    return;
                  }
                  const { error } = await supabase.from("chat_mensagens").insert(registros);
                  if (error) {
                    toast.error("Não foi possível importar o chat.");
                    return;
                  }
                  toast.success(`${registros.length} mensagem(ns) reproduzida(s) do portal.`);
                  form.reset();
                  recarregar();
                }}
              >
                <Textarea
                  name="transcricao"
                  rows={14}
                  placeholder={"[09:02] Sistema: Sessão pública aberta\n[09:05] Pregoeiro: Boa tarde, senhores licitantes\n[09:07] Licitante 3: Solicito esclarecimento do item 4"}
                />
                <Button type="submit" className="w-full">
                  Reproduzir chat na plataforma
                </Button>
              </form>
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </AppLayout>
  );
}

function Info({ label, valor, destaque }: { label: string; valor?: string | null; destaque?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${destaque ? "font-semibold text-secondary" : ""}`}>{valor || "—"}</p>
    </div>
  );
}

function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="surface-panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-2 font-display text-xl font-semibold">{valor}</p>
    </div>
  );
}

function FormularioDados({
  lic,
  onSalvar,
}: {
  lic: any;
  onSalvar: (campos: Record<string, unknown>, log: string) => void;
}) {
  return (
    <div className="surface-panel grid gap-3 p-5 md:grid-cols-3">
      <h3 className="md:col-span-3 text-sm font-semibold">Editar dados do edital</h3>
      <div className="space-y-1">
        <Label>Portal da disputa</Label>
        <Input
          defaultValue={lic.portal ?? ""}
          placeholder="ex.: Compras.gov.br, BLL, Licitar Digital"
          onBlur={(e) => onSalvar({ portal: e.target.value }, "Portal da disputa atualizado")}
        />
      </div>
      <div className="space-y-1">
        <Label>Link do processo</Label>
        <Input
          defaultValue={lic.site_url ?? ""}
          onBlur={(e) => onSalvar({ site_url: e.target.value }, "Link do processo atualizado")}
        />
      </div>
      <div className="space-y-1">
        <Label>Data e horário da sessão</Label>
        <Input
          type="datetime-local"
          defaultValue={lic.data_sessao ? new Date(lic.data_sessao).toISOString().slice(0, 16) : ""}
          onBlur={(e) =>
            onSalvar(
              { data_sessao: e.target.value ? new Date(e.target.value).toISOString() : null },
              "Data da sessão atualizada",
            )
          }
        />
      </div>
    </div>
  );
}

function FormularioEmpresa({
  lic,
  onSalvar,
}: {
  lic: any;
  onSalvar: (campos: Record<string, unknown>, log: string) => void;
}) {
  return (
    <div className="surface-panel grid gap-3 p-5 md:grid-cols-3">
      <h3 className="md:col-span-3 text-sm font-semibold">Situação da nossa empresa</h3>
      <div className="space-y-1">
        <Label>Posição</Label>
        <Input
          type="number"
          defaultValue={lic.posicao_empresa ?? ""}
          onBlur={(e) =>
            onSalvar(
              { posicao_empresa: e.target.value ? Number(e.target.value) : null },
              `Posição atualizada para ${e.target.value || "—"}º`,
            )
          }
        />
      </div>
      <div className="space-y-1">
        <Label>Valor ofertado</Label>
        <InputMoeda
          valorInicial={lic.valor_ofertado}
          aria-label="Valor ofertado"
          onConfirmar={(valor) => onSalvar({ valor_ofertado: valor }, "Valor ofertado atualizado")}
        />
      </div>
      <div className="space-y-1">
        <Label>Melhor valor atual</Label>
        <InputMoeda
          valorInicial={lic.melhor_valor}
          aria-label="Melhor valor atual"
          onConfirmar={(valor) => onSalvar({ melhor_valor: valor }, "Melhor valor atualizado")}
        />
      </div>

      <div className="space-y-1">
        <Label>Situação da empresa</Label>
        <Input
          defaultValue={lic.situacao_empresa ?? ""}
          placeholder="classificada, habilitada…"
          onBlur={(e) => onSalvar({ situacao_empresa: e.target.value }, "Situação da empresa atualizada")}
        />
      </div>
      <div className="space-y-1">
        <Label>Situação da proposta</Label>
        <Input
          defaultValue={lic.situacao_proposta ?? ""}
          onBlur={(e) => onSalvar({ situacao_proposta: e.target.value }, "Situação da proposta atualizada")}
        />
      </div>
      <div className="space-y-1">
        <Label>Quantidade de concorrentes</Label>
        <Input
          type="number"
          defaultValue={lic.qtd_concorrentes ?? ""}
          onBlur={(e) =>
            onSalvar(
              { qtd_concorrentes: e.target.value ? Number(e.target.value) : null },
              "Quantidade de concorrentes atualizada",
            )
          }
        />
      </div>
      <div className="space-y-1 md:col-span-2">
        <Label>Motivo de desclassificação/inabilitação</Label>
        <Input
          defaultValue={lic.motivo_desclassificacao ?? ""}
          onBlur={(e) =>
            onSalvar({ motivo_desclassificacao: e.target.value }, "Motivo registrado")
          }
        />
      </div>
      <div className="space-y-1">
        <Label>Resultado final</Label>
        <Input
          defaultValue={lic.resultado_final ?? ""}
          placeholder="vencedora, perdida…"
          onBlur={(e) => onSalvar({ resultado_final: e.target.value }, "Resultado final registrado")}
        />
      </div>
    </div>
  );
}

function FormularioMovimentacao({
  onEnviar,
}: {
  onEnviar: (tipo: string, descricao: string) => Promise<void>;
}) {
  const [tipo, setTipo] = useState("evento");
  return (
    <form
      className="surface-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const descricao = String(new FormData(form).get("descricao") ?? "").trim();
        if (!descricao) return;
        await onEnviar(tipo, descricao);
        form.reset();
      }}
    >
      <div className="space-y-1">
        <Label>Tipo</Label>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["evento", "sessão", "recurso", "julgamento", "homologação", "retificação", "suspensão"].map(
              (t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-64 flex-1 space-y-1">
        <Label>Nova movimentação</Label>
        <Input name="descricao" placeholder="O que aconteceu?" />
      </div>
      <Button type="submit">Registrar</Button>
    </form>
  );
}

function FormularioLance({
  onEnviar,
}: {
  onEnviar: (valor: number, minha: boolean, empresa: string) => Promise<void>;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3 border-b p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const valor = numeroDaMoeda(String(fd.get("valor") ?? "")) ?? 0;
        const empresa = String(fd.get("empresa") ?? "").trim() || "Nossa empresa";
        if (!valor) return;
        await onEnviar(valor, empresa === "Nossa empresa", empresa);
        form.reset();
      }}
    >
      <div className="space-y-1">
        <Label>Empresa</Label>
        <Input name="empresa" placeholder="Nossa empresa" />
      </div>
      <div className="space-y-1">
        <Label>Valor do lance</Label>
        <Input
          name="valor"
          inputMode="numeric"
          placeholder="R$ 0,00"
          onInput={(e) => {
            e.currentTarget.value = aoDigitarMoeda(e.currentTarget.value);
          }}
        />

      </div>
      <Button type="submit">Registrar lance</Button>
    </form>
  );
}

function FormularioConcorrente({
  onEnviar,
}: {
  onEnviar: (c: {
    nome: string;
    cnpj: string | null;
    posicao: number | null;
    valor_ofertado: number | null;
    vencedor: boolean;
  }) => Promise<void>;
}) {
  return (
    <form
      className="surface-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const nome = String(fd.get("nome") ?? "").trim();
        if (!nome) return;
        await onEnviar({
          nome,
          cnpj: String(fd.get("cnpj") ?? "") || null,
          posicao: fd.get("posicao") ? Number(fd.get("posicao")) : null,
          valor_ofertado: numeroDaMoeda(String(fd.get("valor") ?? "")),
          vencedor: fd.get("vencedor") === "on",
        });
        form.reset();
      }}
    >
      <div className="space-y-1"><Label>Empresa</Label><Input name="nome" /></div>
      <div className="space-y-1"><Label>CNPJ</Label><Input name="cnpj" /></div>
      <div className="space-y-1"><Label>Posição</Label><Input name="posicao" type="number" className="w-24" /></div>
      <div className="space-y-1"><Label>Valor ofertado</Label><Input name="valor" inputMode="numeric" placeholder="R$ 0,00" onInput={(e) => { e.currentTarget.value = aoDigitarMoeda(e.currentTarget.value); }} /></div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" name="vencedor" /> vencedora
      </label>
      <Button type="submit">Adicionar concorrente</Button>
    </form>
  );
}

function FormularioDocumento({
  onEnviar,
}: {
  onEnviar: (d: { tipo: string; nome: string; url: string | null }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState("edital");
  return (
    <form
      className="surface-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const nome = String(fd.get("nome") ?? "").trim();
        if (!nome) return;
        await onEnviar({ tipo, nome, url: String(fd.get("url") ?? "") || null });
        form.reset();
      }}
    >
      <div className="space-y-1">
        <Label>Tipo</Label>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[
              "edital",
              "anexo",
              "termo de referência",
              "planilha",
              "ata da sessão",
              "habilitação",
              "recurso",
              "contrarrazões",
              "parecer",
              "resultado",
              "homologação",
              "contrato",
            ].map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-56 flex-1 space-y-1"><Label>Nome do documento</Label><Input name="nome" /></div>
      <div className="min-w-56 flex-1 space-y-1"><Label>Link</Label><Input name="url" placeholder="https://" /></div>
      <Button type="submit">Adicionar</Button>
    </form>
  );
}

function FormularioPrazo({
  onEnviar,
}: {
  onEnviar: (p: { tipo: string; descricao: string; data_limite: string }) => Promise<void>;
}) {
  return (
    <form
      className="surface-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const tipo = String(fd.get("tipo") ?? "").trim();
        const dataLimite = String(fd.get("data") ?? "");
        if (!tipo || !dataLimite) return;
        await onEnviar({
          tipo,
          descricao: String(fd.get("descricao") ?? ""),
          data_limite: new Date(dataLimite).toISOString(),
        });
        form.reset();
      }}
    >
      <div className="space-y-1"><Label>Tipo do prazo</Label><Input name="tipo" placeholder="Recurso, documentação…" /></div>
      <div className="min-w-56 flex-1 space-y-1"><Label>Descrição</Label><Input name="descricao" /></div>
      <div className="space-y-1"><Label>Data limite</Label><Input name="data" type="datetime-local" /></div>
      <Button type="submit">Adicionar prazo</Button>
    </form>
  );
}

function FormularioTarefa({
  membros,
  onEnviar,
}: {
  membros: any[];
  onEnviar: (t: { titulo: string; responsavel_id: string | null; prazo: string | null }) => Promise<void>;
}) {
  const [responsavel, setResponsavel] = useState("nenhum");
  return (
    <form
      className="surface-panel flex flex-wrap items-end gap-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const titulo = String(fd.get("titulo") ?? "").trim();
        if (!titulo) return;
        await onEnviar({
          titulo,
          responsavel_id: responsavel === "nenhum" ? null : responsavel,
          prazo: fd.get("prazo") ? new Date(String(fd.get("prazo"))).toISOString() : null,
        });
        form.reset();
      }}
    >
      <div className="min-w-56 flex-1 space-y-1"><Label>Nova tarefa</Label><Input name="titulo" /></div>
      <div className="space-y-1">
        <Label>Responsável</Label>
        <Select value={responsavel} onValueChange={setResponsavel}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">Sem responsável</SelectItem>
            {membros.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nome ?? m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label>Prazo</Label><Input name="prazo" type="datetime-local" /></div>
      <Button type="submit">Adicionar tarefa</Button>
    </form>
  );
}
