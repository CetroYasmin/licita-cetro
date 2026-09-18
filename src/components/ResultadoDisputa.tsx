import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { InputMoeda, textoMoeda } from "@/components/InputMoeda";
import { aoDigitarMoeda, numeroDaMoeda } from "@/lib/formato";

export const FASES = [
  "Recebimento de propostas",
  "Sessão de disputa",
  "Julgamento das propostas",
  "Habilitação",
  "Diligência",
  "Intenção de recurso",
  "Recurso",
  "Adjudicação",
  "Homologação",
  "Contratação",
] as const;

const TOTAL = 20;
const VISIVEIS = 5;

type Linha = { nome: string; valor: string };

const VAZIO: Linha[] = Array.from({ length: TOTAL }, () => ({ nome: "", valor: "" }));

/** Percentual de desconto sobre o valor estimado. */
function percentualDesconto(estimado: number | null | undefined, ofertado: number | null): string {
  if (!estimado || estimado <= 0 || ofertado == null) return "—";
  const p = ((estimado - ofertado) / estimado) * 100;
  return `${p.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/**
 * Registro manual do resultado da sessão: até 20 empresas colocadas, a posição
 * e o valor da nossa empresa, o percentual de desconto de cada uma e a fase atual.
 */
export function ResultadoDisputa({ licitacao }: { licitacao: any }) {
  const { equipeId } = useAuth();
  const qc = useQueryClient();

  const { data: concorrentes } = useQuery({
    queryKey: ["concorrentes", licitacao.id],
    enabled: Boolean(equipeId),
    queryFn: async () =>
      (
        await supabase
          .from("concorrentes")
          .select("id,nome,valor_ofertado,posicao")
          .eq("licitacao_id", licitacao.id)
          .order("posicao", { ascending: true })
      ).data ?? [],
  });

  const [linhas, setLinhas] = useState<Linha[]>(VAZIO);
  const [posicao, setPosicao] = useState(
    licitacao.posicao_empresa != null ? String(licitacao.posicao_empresa) : "",
  );
  const [nossoValor, setNossoValor] = useState(textoMoeda(licitacao.valor_ofertado));
  const [fase, setFase] = useState<string>(licitacao.fase ?? "");
  const [mostrarTodas, setMostrarTodas] = useState(false);

  useEffect(() => {
    if (!concorrentes) return;
    setLinhas(
      Array.from({ length: TOTAL }, (_, i) => {
        const c = concorrentes.find((x: any) => x.posicao === i + 1);
        return { nome: c?.nome ?? "", valor: textoMoeda(c?.valor_ofertado) };
      }),
    );
  }, [concorrentes]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!equipeId) throw new Error("Equipe não definida");
      const { error: erroUpdate } = await supabase
        .from("licitacoes")
        .update({
          posicao_empresa: posicao ? Number(posicao) : null,
          valor_ofertado: numeroDaMoeda(nossoValor),
          fase: fase || null,
          ultima_atualizacao: new Date().toISOString(),
        })
        .eq("id", licitacao.id);
      if (erroUpdate) throw erroUpdate;

      const { error: erroDelete } = await supabase
        .from("concorrentes")
        .delete()
        .eq("licitacao_id", licitacao.id)
        .lte("posicao", TOTAL);
      if (erroDelete) throw erroDelete;

      const novos = linhas
        .map((l, i) => ({ ...l, posicao: i + 1 }))
        .filter((l) => l.nome.trim().length > 0)
        .map((l) => ({
          licitacao_id: licitacao.id,
          equipe_id: equipeId,
          nome: l.nome.trim(),
          posicao: l.posicao,
          valor_ofertado: numeroDaMoeda(l.valor),
          vencedor: l.posicao === 1,
        }));
      if (novos.length > 0) {
        const { error } = await supabase.from("concorrentes").insert(novos);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Resultado da disputa salvo.");
      void qc.invalidateQueries({ queryKey: ["concorrentes", licitacao.id] });
      void qc.invalidateQueries({ queryKey: ["em-andamento"] });
      void qc.invalidateQueries({ queryKey: ["licitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visiveis = mostrarTodas ? TOTAL : VISIVEIS;
  const preenchidasOcultas = linhas
    .slice(VISIVEIS)
    .filter((l) => l.nome.trim().length > 0).length;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Posição da nossa empresa</Label>
          <Input
            type="number"
            min={1}
            className="h-8 text-xs"
            value={posicao}
            onChange={(e) => setPosicao(e.target.value)}
            placeholder="ex.: 2"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Nosso valor ofertado</Label>
          <InputMoeda
            className="h-8 text-xs"
            value={nossoValor}
            onChangeTexto={setNossoValor}
            aria-label="Nosso valor ofertado"
          />
          <p className="text-[11px] text-muted-foreground">
            Desconto: {percentualDesconto(licitacao.valor_estimado, numeroDaMoeda(nossoValor))}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fase atual da licitação</Label>
          <Select value={fase} onValueChange={setFase}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar fase" />
            </SelectTrigger>
            <SelectContent>
              {FASES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Empresas participantes (até {TOTAL})</Label>
        {linhas.slice(0, visiveis).map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-xs font-semibold text-muted-foreground">{i + 1}º</span>
            <Input
              className="h-8 flex-1 text-xs"
              value={l.nome}
              placeholder="Nome da empresa"
              onChange={(e) =>
                setLinhas((v) =>
                  v.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)),
                )
              }
            />
            <Input
              className="h-8 w-[150px] text-xs"
              type="text"
              inputMode="numeric"
              value={l.valor}
              placeholder="R$ 0,00"
              onChange={(e) =>
                setLinhas((v) =>
                  v.map((x, j) => (j === i ? { ...x, valor: aoDigitarMoeda(e.target.value) } : x)),
                )
              }
            />
            <span className="w-16 text-right text-[11px] text-muted-foreground">
              {percentualDesconto(licitacao.valor_estimado, numeroDaMoeda(l.valor))}
            </span>
          </div>
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setMostrarTodas((v) => !v)}
        >
          {mostrarTodas
            ? "Ocultar empresas da 6ª à 20ª"
            : `Mostrar empresas da 6ª à 20ª${preenchidasOcultas ? ` (${preenchidasOcultas} preenchida(s))` : ""}`}
        </Button>
      </div>

      <Button size="sm" className="h-8" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
        {salvar.isPending ? "Salvando…" : "Salvar resultado"}
      </Button>
    </div>
  );
}
