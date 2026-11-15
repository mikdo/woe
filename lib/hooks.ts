"use client";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/browser";

export type Kid = {
  id: string;
  family_id: string;
  name: string;
  name_say_as: string | null;
  age: number;
  colour: string;
  avatar: string;
};
export type FamilyRow = { id: string; name: string; monthly_new_limit: number; is_admin: boolean };

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
    const { data } = supabase().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, loading };
}

export function useFamily(enabled: boolean) {
  const [family, setFamily] = useState<FamilyRow | null>(null);
  const [kids, setKids] = useState<Kid[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const [{ data: fam }, { data: k }] = await Promise.all([
      supabase().from("families").select("*").maybeSingle(),
      supabase().from("kids").select("*").order("created_at"),
    ]);
    setFamily(fam as FamilyRow | null);
    setKids((k ?? []) as Kid[]);
    setLoading(false);
  }, [enabled]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);
  return { family, kids, loading, reload };
}
