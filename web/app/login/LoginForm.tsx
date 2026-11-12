"use client";

import { useActionState, useSyncExternalStore } from "react";
import { login, type LoginState } from "./actions";

const T = {
  ms: {
    sub: "Log masuk untuk lihat saringan saham Bursa.",
    email: "Emel",
    password: "Kata laluan",
    submit: "Log masuk",
    busy: "Sedang log masuk…",
    invalid: "Emel atau kata laluan salah.",
    missing: "Isi emel dan kata laluan.",
    other: "Log masuk gagal. Cuba lagi sebentar.",
    foot: "Akses terhad kepada pengguna yang didaftarkan sahaja. Lupa kata laluan atau perlukan akaun? Hubungi pentadbir.",
  },
  en: {
    sub: "Sign in to see the Bursa stock screener.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    busy: "Signing in…",
    invalid: "Wrong email or password.",
    missing: "Enter your email and password.",
    other: "Sign-in failed. Try again shortly.",
    foot: "Access is limited to registered users. Forgot your password or need an account? Contact the administrator.",
  },
};

// Bahasa dikongsi dengan halaman utama melalui localStorage "pb_lang".
const LANG_EVENT = "pb-lang";
function subscribe(cb: () => void) {
  window.addEventListener(LANG_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LANG_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function readLang(): "ms" | "en" {
  try {
    return localStorage.getItem("pb_lang") === "en" ? "en" : "ms";
  } catch {
    return "ms";
  }
}

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: "" });
  const lang = useSyncExternalStore(subscribe, readLang, () => "ms" as const);
  const pick = (v: "ms" | "en") => {
    document.documentElement.lang = v;
    try {
      localStorage.setItem("pb_lang", v);
    } catch {}
    window.dispatchEvent(new Event(LANG_EVENT));
  };
  const t = T[lang];

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="auth-top">
          <div className="theme" role="group" aria-label={lang === "en" ? "Language" : "Bahasa"}>
            <button type="button" aria-pressed={lang === "ms"} onClick={() => pick("ms")} lang="ms">BM</button>
            <button type="button" aria-pressed={lang === "en"} onClick={() => pick("en")} lang="en">EN</button>
          </div>
        </div>
        <h1>Penapis Bursa</h1>
        <p className="sub">{t.sub}</p>
        <form action={action}>
          {state.error && <p className="err" role="alert">{t[state.error]}</p>}
          <label>
            {t.email}
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            {t.password}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="submit" type="submit" disabled={pending}>
            {pending ? t.busy : t.submit}
          </button>
        </form>
        <p className="foot">{t.foot}</p>
      </div>
    </main>
  );
}
