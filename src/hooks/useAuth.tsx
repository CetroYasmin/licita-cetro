import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Perfil = {
  id: string;
  email: string;
  nome: string | null;
  empresa_nome: string | null;
  empresa_cnpj: string | null;
  telefone: string | null;
  status: "pendente" | "aprovado" | "bloqueado";
  equipe_id: string | null;
};

export type Papel = "admin" | "diretor" | "membro";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  perfil: Perfil | null;
  isAdmin: boolean;
  isDiretor: boolean;
  papel: Papel;
  equipeId: string | null;
  aprovado: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const carregarPerfil = useCallback(async (userId: string) => {
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setPerfil((p as Perfil) ?? null);
    setIsAdmin(Boolean(roles?.some((r) => r.role === "admin")));
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    if (data.session?.user) await carregarPerfil(data.session.user.id);
    else {
      setPerfil(null);
      setIsAdmin(false);
      setIsDiretor(false);
    }
    setLoading(false);
  }, [carregarPerfil]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        void carregarPerfil(newSession.user.id);
      } else {
        setPerfil(null);
        setIsAdmin(false);
      setIsDiretor(false);
      }
      setLoading(false);
    });
    void refresh();
    return () => sub.subscription.unsubscribe();
  }, [carregarPerfil, refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setPerfil(null);
    setIsAdmin(false);
      setIsDiretor(false);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user: session?.user ?? null,
        perfil,
        isAdmin,
        equipeId: perfil?.equipe_id ?? null,
        aprovado: perfil?.status === "aprovado",
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return ctx;
}
