"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { brand } from "@/config/brand";
import { GEO_COOKIE } from "@/lib/geo";
import type { Application, Cv, Fact, Profile, Purchase } from "@/lib/model";
import { LocalRepo } from "@/lib/repo/local";
import { RemoteRepo } from "@/lib/repo/remote";
import type { Repo } from "@/lib/repo/types";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Status = "loading" | "signed_out" | "ready";
export const GUEST_FLAG = `${brand.slug}_mode`;

interface AppState {
  status: Status;
  repo: Repo | null;
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  facts: Fact[];
  cvs: Cv[];
  applications: Application[];
  purchases: Purchase[];
  /** CVs with a paid download. */
  paidCvIds: Set<string>;
  refreshPurchases(): Promise<void>;
  stale: boolean;
  online: boolean;
  detectedCountry: string | null;
  startGuest(): Promise<void>;
  signOut(): Promise<void>;
  reload(): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  saveFacts(facts: Fact[]): Promise<void>;
  deleteFacts(ids: string[]): Promise<void>;
  saveCv(cv: Cv, opts?: { snapshot?: boolean }): Promise<void>;
  deleteCv(id: string): Promise<void>;
  saveApplication(app: Application): Promise<void>;
  deleteApplication(id: string): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [user, setUser] = useState<AppState["user"]>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [cvs, setCvs] = useState<Cv[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stale, setStale] = useState(false);
  const [online, setOnline] = useState(true);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const lastSnapshot = useRef(new Map<string, number>());
  // The active repo, readable by callbacks created before a session started
  // (e.g. a flow that starts a guest session and then saves straight away).
  const repoRef = useRef<Repo | null>(null);

  const load = useCallback(async (r: Repo) => {
    setStale(false);
    const [p, f, c, a, pu] = await Promise.all([r.getProfile(), r.listFacts(), r.listCvs(), r.listApplications(), r.listPurchases().catch(() => [])]);
    setProfile(p);
    setFacts(f);
    setCvs(c);
    setApplications(a);
    setPurchases(pu);
    repoRef.current = r;
    setRepo(r);
    setStatus("ready");
  }, []);

  const init = useCallback(async () => {
    const supabase = getBrowserSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session) {
        setUser({ id: session.user.id, email: session.user.email ?? null });
        await load(new RemoteRepo(supabase, session.user.id, () => setStale(true)));
        return;
      }
    }
    setUser(null);
    if (localStorage.getItem(GUEST_FLAG) === "guest") {
      await load(new LocalRepo());
      return;
    }
    repoRef.current = null;
    setRepo(null);
    setProfile(null);
    setFacts([]);
    setCvs([]);
    setApplications([]);
    setPurchases([]);
    setStatus("signed_out");
  }, [load]);

  useEffect(() => {
    // Initial load runs once on mount, reading browser-only values (cookie, navigator).
    const cached = readCookie(GEO_COOKIE);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setDetectedCountry(cached);
    else {
      fetch("/api/geo")
        .then((r) => (r.ok ? (r.json() as Promise<{ country: string | null }>) : { country: null }))
        .then(({ country }) => setDetectedCountry(country))
        .catch(() => {
          // Detection is only a hint; the user picks their country anyway.
        });
    }
    setOnline(navigator.onLine);
    void init();
    const supabase = getBrowserSupabase();
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void init();
    });
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      sub?.data.subscription.unsubscribe();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [init]);

  const need = useCallback(() => {
    if (!repoRef.current) throw new Error("No active session");
    return repoRef.current;
  }, []);

  const value = useMemo<AppState>(
    () => ({
      status,
      repo,
      user,
      profile,
      facts,
      cvs,
      applications,
      purchases,
      paidCvIds: new Set(purchases.filter((p) => p.status === "paid" && p.cv_id).map((p) => p.cv_id!)),
      async refreshPurchases() {
        if (repoRef.current) setPurchases(await repoRef.current.listPurchases());
      },
      stale,
      online,
      detectedCountry,
      async startGuest() {
        localStorage.setItem(GUEST_FLAG, "guest");
        await init();
      },
      async signOut() {
        const supabase = getBrowserSupabase();
        if (user) await RemoteRepo.clearCache(user.id);
        await supabase?.auth.signOut();
        localStorage.removeItem(GUEST_FLAG);
        await init();
      },
      async reload() {
        await load(need());
      },
      async updateProfile(patch) {
        setProfile(await need().saveProfile(patch));
      },
      async saveFacts(next) {
        await need().saveFacts(next);
        setFacts((prev) => {
          const byId = new Map(prev.map((f) => [f.id, f]));
          for (const f of next) byId.set(f.id, f);
          return [...byId.values()];
        });
      },
      async deleteFacts(ids) {
        // Deleting a role also deletes the bullets that belong to it.
        const drop = new Set(ids);
        for (const f of facts) if (f.type === "achievement" && f.data.work_id && drop.has(f.data.work_id)) drop.add(f.id);
        await need().deleteFacts([...drop]);
        setFacts((prev) => prev.filter((f) => !drop.has(f.id)));
      },
      async saveCv(cv, opts) {
        const r = need();
        await r.saveCv(cv);
        const last = lastSnapshot.current.get(cv.id) ?? 0;
        if (opts?.snapshot || Date.now() - last > SNAPSHOT_EVERY_MS) {
          await r.addVersion(cv);
          lastSnapshot.current.set(cv.id, Date.now());
        }
        setCvs((prev) => [cv, ...prev.filter((c) => c.id !== cv.id)]);
      },
      async deleteCv(id) {
        await need().deleteCv(id);
        setCvs((prev) => prev.filter((c) => c.id !== id).map((c) => (c.base_cv_id === id ? { ...c, base_cv_id: null } : c)));
        setApplications((prev) => prev.map((a) => (a.cv_id === id ? { ...a, cv_id: null } : a)));
      },
      async saveApplication(app) {
        await need().saveApplication(app);
        setApplications((prev) => [app, ...prev.filter((a) => a.id !== app.id)]);
      },
      async deleteApplication(id) {
        await need().deleteApplication(id);
        setApplications((prev) => prev.filter((a) => a.id !== id));
      },
    }),
    [status, repo, user, profile, facts, cvs, applications, purchases, stale, online, detectedCountry, init, load, need],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
