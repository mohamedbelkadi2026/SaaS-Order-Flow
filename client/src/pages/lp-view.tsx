import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";

/* ── Countdown hook ─────────────────────────────────────── */
function useCountdown(endTs: number) {
  const calc = () => {
    const diff = Math.max(0, endTs - Date.now());
    return { h: Math.floor(diff / 3_600_000), m: Math.floor((diff % 3_600_000) / 60_000), s: Math.floor((diff % 60_000) / 1_000) };
  };
  const [t, setT] = useState(calc());
  useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id); }, [endTs]);
  return t;
}
function pad(n: number) { return String(n).padStart(2, "0"); }

/* ── Theme ──────────────────────────────────────────────── */
interface Th { bg: string; bg2: string; accent: string; text: string; muted: string; btn: string; btnTxt: string; card: string; border: string; }
function getTheme(theme: string, custom: string): Th {
  if (theme === "gold") return { bg: "#C5A059", bg2: "#b8934e", accent: "#0F1F3D", text: "#0F1F3D", muted: "rgba(15,31,61,.65)", btn: "#0F1F3D", btnTxt: "#fff", card: "rgba(0,0,0,.12)", border: "rgba(0,0,0,.15)" };
  if (theme === "custom" && custom) return { bg: custom, bg2: custom, accent: "#fff", text: "#fff", muted: "rgba(255,255,255,.7)", btn: "#fff", btnTxt: custom, card: "rgba(255,255,255,.1)", border: "rgba(255,255,255,.2)" };
  return { bg: "#0F1F3D", bg2: "#152540", accent: "#C5A059", text: "#fff", muted: "rgba(255,255,255,.7)", btn: "#C5A059", btnTxt: "#0F1F3D", card: "rgba(255,255,255,.07)", border: "rgba(255,255,255,.12)" };
}

/* ── Floating CTA ───────────────────────────────────────── */
function FloatingCTA({ label, T, onClick }: { label: string; T: Th; onClick(): void }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999, padding: "12px 16px", background: "rgba(0,0,0,.88)", backdropFilter: "blur(12px)", borderTop: `2px solid ${T.accent}` }}>
      <button onClick={onClick} style={{ width: "100%", padding: "16px", borderRadius: 14, background: T.btn, color: T.btnTxt, fontWeight: 900, fontSize: 18, border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".06em", boxShadow: `0 4px 24px ${T.accent}60` }}>
        🛒 {label}
      </button>
    </div>
  );
}

/* ── Reel Section ──────────────────────────────────────── */
function ReelSection({ img, bg, children, minH = "100svh" }: { img?: string; bg: string; children: React.ReactNode; minH?: string }) {
  return (
    <section style={{ position: "relative", minHeight: minH, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
      {img ? (
        <div style={{ position: "absolute", inset: 0 }}>
          <img src={img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(0,0,0,.05) 0%, rgba(0,0,0,.35) 35%, ${bg}dd 70%, ${bg} 100%)` }} />
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: bg }} />
      )}
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 520, margin: "0 auto", padding: "28px 20px 48px" }}>
        {children}
      </div>
    </section>
  );
}

/* ── Stars ─────────────────────────────────────────────── */
function Stars({ n = 5 }: { n?: number }) {
  return <span style={{ color: "#f59e0b", fontSize: 14, letterSpacing: 1 }}>{"★".repeat(n)}</span>;
}

/* ── Counter box ────────────────────────────────────────── */
function CdBox({ val, label, accent, btnTxt }: { val: number; label: string; accent: string; btnTxt: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ background: accent, color: btnTxt, borderRadius: 14, padding: "14px 16px", fontSize: 34, fontWeight: 900, minWidth: 68, lineHeight: 1, boxShadow: `0 4px 20px ${accent}55` }}>{pad(val)}</div>
      <div style={{ color: "rgba(255,255,255,.5)", fontSize: 9, marginTop: 5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main LP View
═══════════════════════════════════════════════════════════ */
export default function LpView() {
  const { slug } = useParams<{ slug: string }>();
  const orderRef = useRef<HTMLDivElement>(null);

  // Persist countdown in sessionStorage
  const cdKey = `lp_cd_${slug}`;
  const endTs = (() => {
    const s = sessionStorage.getItem(cdKey);
    if (s) return parseInt(s);
    const ts = Date.now() + 24 * 3_600_000;
    sessionStorage.setItem(cdKey, String(ts));
    return ts;
  })();
  const { h, m, s } = useCountdown(endTs);

  const { data: page, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/lp/${slug}`],
    queryFn: () => fetch(`/api/lp/${slug}`).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    retry: false,
  });

  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerCity: "", customerAddress: "" });
  const [qty, setQty] = useState(1);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: (body: any) => fetch(`/api/lp/${slug}/order`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => { if (!r.ok) return r.json().then(j => Promise.reject(j.message)); return r.json(); }),
    onSuccess: () => setDone(true),
  });

  const scrollToOrder = () => orderRef.current?.scrollIntoView({ behavior: "smooth" });

  /* ── Loading ── */
  if (isLoading) return (
    <div style={{ minHeight: "100svh", background: "#0F1F3D", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: "3px solid #C5A059", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: "#C5A059", fontWeight: 700 }}>Chargement…</p>
      </div>
    </div>
  );

  /* ── Not found ── */
  if (isError || !page) return (
    <div style={{ minHeight: "100svh", background: "#0F1F3D", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 72 }}>🔍</div>
      <h2 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>Page introuvable</h2>
      <p style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>Ce lien n'existe pas ou a été désactivé.</p>
    </div>
  );

  const copy: any = page.copy || {};
  const T = getTheme(page.theme, page.customColor);

  const headline    = copy.headline    || page.productName;
  const subheadline = copy.subheadline || "";
  const hook        = copy.hook        || "";
  const problem     = copy.problem     || "";
  const solution    = (copy.solution   || []) as string[];
  const scarcity    = copy.scarcity    || "Stock limité — commandez maintenant !";
  const cta         = copy.cta         || "Commander Maintenant";
  const guarantee   = copy.guarantee   || "Livraison rapide • Paiement à la livraison";
  const testimonials = (copy.testimonials || []) as any[];
  const totalPrice  = page.priceDH * qty;

  const font = `'Segoe UI', -apple-system, Arial, sans-serif`;

  return (
    <div style={{ fontFamily: font, background: T.bg, minHeight: "100svh", overflowX: "hidden", paddingBottom: 80 }}>

      {/* ═══════════════════════════════════════
          REEL 1 — HERO
      ═══════════════════════════════════════ */}
      <ReelSection img={page.heroImageUrl} bg={T.bg}>
        {/* Live badge */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#ef4444", padding: "5px 12px", borderRadius: 100, fontSize: 11, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 18 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff", display: "inline-block", animation: "pulse 1.5s infinite" }} />
          🔥 Offre Limitée
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </div>

        <h1 style={{ color: T.text, fontSize: "clamp(30px,8vw,48px)", fontWeight: 900, lineHeight: 1.1, margin: "0 0 10px", textShadow: "0 2px 16px rgba(0,0,0,.5)" }}>
          {headline}
        </h1>

        {subheadline && (
          <p style={{ color: T.muted, fontSize: 17, lineHeight: 1.55, margin: "0 0 12px", textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>{subheadline}</p>
        )}

        {hook && (
          <div style={{ borderLeft: `3px solid ${T.accent}`, paddingLeft: 14, marginBottom: 20 }}>
            <p style={{ color: T.text, fontStyle: "italic", fontSize: 15, lineHeight: 1.65, margin: 0, textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>"{hook}"</p>
          </div>
        )}

        {/* Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
          <span style={{ color: T.accent, fontSize: 44, fontWeight: 900, lineHeight: 1, textShadow: `0 2px 20px ${T.accent}80` }}>{page.priceDH} DH</span>
          <span style={{ color: T.muted, fontSize: 16, textDecoration: "line-through" }}>{Math.round(page.priceDH * 1.4)} DH</span>
          <span style={{ background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 100 }}>-30%</span>
        </div>

        <button onClick={scrollToOrder}
          style={{ width: "100%", padding: "18px", borderRadius: 14, background: T.btn, color: T.btnTxt, fontWeight: 900, fontSize: 18, border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".06em", boxShadow: `0 8px 32px ${T.accent}55`, marginBottom: 12 }}>
          {cta} →
        </button>

        <p style={{ color: T.muted, fontSize: 12, textAlign: "center", margin: 0 }}>🚚 {guarantee}</p>
      </ReelSection>

      {/* ═══════════════════════════════════════
          REEL 2 — FEATURES / BENEFITS
      ═══════════════════════════════════════ */}
      {(problem || solution.length > 0) && (
        <ReelSection img={page.featuresImageUrl} bg={T.bg2} minH={page.featuresImageUrl ? "100svh" : "auto"}>
          {problem && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ width: 40, height: 4, background: T.accent, borderRadius: 2, marginBottom: 14 }} />
              <p style={{ color: T.text, fontSize: 16, lineHeight: 1.7, margin: 0, textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>{problem}</p>
            </div>
          )}

          {solution.length > 0 && (
            <>
              <h2 style={{ color: T.accent, fontSize: 22, fontWeight: 800, margin: "0 0 18px", textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>
                Pourquoi ce produit ? 💡
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {solution.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(0,0,0,.35)", backdropFilter: "blur(8px)", borderRadius: 14, padding: "14px 16px", border: `1px solid rgba(255,255,255,.12)` }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>{["✅", "⚡", "💪", "🎯", "🔥", "💎"][i % 6]}</span>
                    <span style={{ color: "#fff", fontSize: 15, lineHeight: 1.5, fontWeight: 500 }}>{b}</span>
                  </div>
                ))}
              </div>

              <button onClick={scrollToOrder}
                style={{ width: "100%", padding: "16px", borderRadius: 14, background: T.btn, color: T.btnTxt, fontWeight: 900, fontSize: 16, border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 24 }}>
                {cta} →
              </button>
            </>
          )}
        </ReelSection>
      )}

      {/* ═══════════════════════════════════════
          REEL 3 — SOCIAL PROOF
      ═══════════════════════════════════════ */}
      {(page.proofImageUrl || testimonials.length > 0) && (
        <ReelSection img={page.proofImageUrl} bg={T.bg} minH={page.proofImageUrl && testimonials.length > 0 ? "100svh" : "auto"}>
          {testimonials.length > 0 && (
            <>
              <h2 style={{ color: T.accent, fontSize: 22, fontWeight: 800, margin: "0 0 18px", textShadow: "0 1px 8px rgba(0,0,0,.4)" }}>
                Avis clients 🌟
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {testimonials.map((t: any, i: number) => (
                  <div key={i} style={{ background: "rgba(0,0,0,.4)", backdropFilter: "blur(12px)", borderRadius: 16, padding: 16, border: "1px solid rgba(255,255,255,.12)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: T.btnTxt, flexShrink: 0 }}>
                        {(t.name || "C")[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                        <div style={{ color: "rgba(255,255,255,.5)", fontSize: 12 }}>{t.city}</div>
                      </div>
                      <div style={{ marginLeft: "auto" }}><Stars n={t.rating || 5} /></div>
                    </div>
                    <p style={{ color: "rgba(255,255,255,.88)", fontSize: 14, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>"{t.text}"</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </ReelSection>
      )}

      {/* ═══════════════════════════════════════
          REEL 4 — URGENCY + ORDER FORM
      ═══════════════════════════════════════ */}
      <section ref={orderRef} style={{ padding: "48px 20px 100px", background: T.bg2 }}>
        <div style={{ maxWidth: 520, margin: "0 auto" }}>

          {/* Scarcity */}
          <div style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", borderRadius: 16, padding: "18px 20px", marginBottom: 28, textAlign: "center" }}>
            <p style={{ color: "#fff", fontWeight: 900, fontSize: 16, margin: "0 0 4px" }}>⚠️ {scarcity}</p>
            <p style={{ color: "rgba(255,255,255,.8)", fontSize: 13, margin: 0 }}>L'offre expire dans :</p>
          </div>

          {/* Countdown */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 36 }}>
            <CdBox val={h} label="HH" accent={T.accent} btnTxt={T.btnTxt} />
            <CdBox val={m} label="MM" accent={T.accent} btnTxt={T.btnTxt} />
            <CdBox val={s} label="SS" accent={T.accent} btnTxt={T.btnTxt} />
          </div>

          {!done ? (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 24, padding: 28, backdropFilter: "blur(12px)" }}>
              <h2 style={{ color: T.text, fontSize: 22, fontWeight: 900, margin: "0 0 6px" }}>🛒 Commander Maintenant</h2>
              <p style={{ color: T.muted, fontSize: 14, margin: "0 0 24px" }}>Livraison 48–72h · Paiement à la livraison</p>

              {/* Quantity */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ color: T.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Quantité</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[1, 2, 3].map(n => (
                    <button key={n} onClick={() => setQty(n)}
                      style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: `2px solid ${qty === n ? T.accent : T.border}`, background: qty === n ? `${T.accent}22` : "transparent", color: qty === n ? T.accent : T.text, fontWeight: 800, fontSize: 16, cursor: "pointer", transition: "all .15s" }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price summary */}
              <div style={{ background: `${T.accent}15`, border: `1px solid ${T.accent}35`, borderRadius: 14, padding: "14px 18px", marginBottom: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: T.muted, fontSize: 14 }}>{qty} × {page.priceDH} DH</span>
                <span style={{ color: T.accent, fontSize: 26, fontWeight: 900 }}>{totalPrice} DH</span>
              </div>

              {/* Fields */}
              {[
                { key: "customerName", label: "Prénom et Nom *", placeholder: "Ex: Ahmed Benali", type: "text", required: true },
                { key: "customerPhone", label: "Téléphone / WhatsApp *", placeholder: "Ex: 0612345678", type: "tel", required: true },
                { key: "customerCity", label: "Ville", placeholder: "Ex: Casablanca", type: "text", required: false },
                { key: "customerAddress", label: "Adresse (optionnel)", placeholder: "Ex: Rue Hassan II, Appt 5", type: "text", required: false },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", color: T.muted, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    data-testid={`input-lp-${f.key}`}
                    style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: `1.5px solid ${T.border}`, background: "rgba(255,255,255,.07)", color: T.text, fontSize: 15, outline: "none", boxSizing: "border-box", transition: "border-color .15s" }}
                    onFocus={e => (e.target.style.borderColor = T.accent)}
                    onBlur={e => (e.target.style.borderColor = T.border)}
                  />
                </div>
              ))}

              {submit.isError && (
                <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{(submit.error as any)?.toString() || "Erreur."}</p>
              )}

              <button
                onClick={() => { if (!form.customerName || !form.customerPhone) return; submit.mutate({ ...form, quantity: qty }); }}
                disabled={submit.isPending || !form.customerName || !form.customerPhone}
                data-testid="button-lp-submit-order"
                style={{ width: "100%", padding: "18px", border: "none", borderRadius: 14, background: submit.isPending ? "#555" : T.btn, color: T.btnTxt, fontWeight: 900, fontSize: 18, cursor: submit.isPending || !form.customerName || !form.customerPhone ? "not-allowed" : "pointer", textTransform: "uppercase", letterSpacing: ".06em", boxShadow: `0 8px 32px ${T.accent}55`, marginBottom: 12, transition: "background .2s" }}>
                {submit.isPending ? "⏳ Envoi en cours…" : `✅ Confirmer — ${totalPrice} DH`}
              </button>

              <p style={{ color: T.muted, fontSize: 12, textAlign: "center", margin: 0 }}>🔒 Paiement à la livraison · Livraison 48–72h · Satisfait ou remboursé</p>
            </div>
          ) : (
            <div style={{ background: "rgba(16,185,129,.12)", border: "2px solid #10b981", borderRadius: 24, padding: 36, textAlign: "center" }}>
              <div style={{ fontSize: 72, marginBottom: 18 }}>🎉</div>
              <h2 style={{ color: "#10b981", fontSize: 26, fontWeight: 900, margin: "0 0 10px" }}>Commande Confirmée !</h2>
              <p style={{ color: T.text, fontSize: 15, lineHeight: 1.65, margin: "0 0 12px" }}>
                Shukran bzzaf ! Notre équipe va vous contacter sur WhatsApp pour confirmer la livraison.
              </p>
              <p style={{ color: T.muted, fontSize: 13, margin: 0 }}>📞 Gardez votre téléphone à portée de main.</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <div style={{ padding: "20px", textAlign: "center", borderTop: `1px solid ${T.border}` }}>
        <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>Powered by TajerGrow · Maroc 🇲🇦</p>
      </div>

      <FloatingCTA label={cta} T={T} onClick={scrollToOrder} />
    </div>
  );
}
