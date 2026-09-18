import { useState } from "react";
import { Input } from "@/components/ui/input";
import { aoDigitarMoeda, numeroDaMoeda } from "@/lib/formato";

/** Número -> texto mascarado em R$. */
export function textoMoeda(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "";
  return aoDigitarMoeda(String(Math.round(v * 100)));
}

/**
 * Campo de valor com máscara em R$ aplicada conforme o usuário digita.
 * - modo controlado: passe `value` + `onChangeTexto`
 * - modo local: passe `valorInicial` + `onConfirmar` (dispara no blur)
 */
export function InputMoeda({
  valorInicial,
  onConfirmar,
  value,
  onChangeTexto,
  className,
  placeholder = "R$ 0,00",
  disabled,
  "aria-label": ariaLabel,
}: {
  valorInicial?: number | null;
  onConfirmar?: (valor: number | null) => void;
  value?: string;
  onChangeTexto?: (texto: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [local, setLocal] = useState(textoMoeda(valorInicial));
  const controlado = value !== undefined;
  const texto = controlado ? value! : local;

  return (
    <Input
      type="text"
      inputMode="numeric"
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      value={texto}
      onChange={(e) => {
        const mascarado = aoDigitarMoeda(e.target.value);
        if (controlado) onChangeTexto?.(mascarado);
        else setLocal(mascarado);
      }}
      onBlur={() => onConfirmar?.(numeroDaMoeda(texto))}
    />
  );
}
