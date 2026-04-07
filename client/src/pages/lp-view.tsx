import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";

/* ── Helpers ───────────────────────────────────── */
function useCountdown(endTs: number) {
  const calc = () => {
    const diff = Math.max(0, endTs - Date.now());
    return {
      h: Math.floor(diff / 3_600_000),
      m: Math.floor((diff % 3_600_000) / 60_000),
      s: Math.floor((diff % 60_000) / 1_000),
    };
  };
  const [t, setT] = useState(calc());
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, [endTs]);
  return t;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

/* ── Theme ────────────────────────────────────── */
interface Theme { bg: string; bg2: string; accent: string; text: string; textMuted: string; btnBg: string; btnText: string; card: string; border: string; }
function getTheme(theme: string, customColor: string): Theme {
  if (theme === "gold") return {
    bg: "#C5A059", bg2: "#b8934e", accent: "#0F1F3D", text: "#0F1F3D", textMuted: "#2a3f5e",
    btnBg: "#0F1F3D", btnText: "#ffffff", card: "rgba(255,255,255,0.25)", border: "rgba(15,31,61,0.2)",
  };
  if (theme === "custom" && customColor) return {
    bg: customColor, bg2: customColor, accent: "#ffffff", text: "#ffffff", textMuted: "rgba(255,255,255,0.75)",
    btnBg: "#ffffff", btnText: customColor, card: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.2)",
  };
  return {
    bg: "#0F1F3D", bg2: "#1A2F4E", accent: "#C5A059", text: "#ffffff", textMuted: "rgba(255,255,255,0.7)",
    btnBg: "#C5A059", btnText: "#0F1F3D", card: "rgba(255,255,255,0.07)", border: "rgba(255,255,255,0.12)",
  };
}

/* ── Star rating ──────────────────────────────── */
function Stars({ n = 5 }: { n?: number }) {
  return <span style={{ color: "#f59e0b", fontSize: 14 }}>{"★".repeat(n)}</span>;
}

/* ── Floating CTA ─────────────────────────────── */
function FloatingCTA({ label, accent, btnBg, btnText, onClick }: {
  label: string; accent: string; btnBg: string; btnText: string; onClick(): void;
}) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999,
      padding: "12px 16px",
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)",
      borderTop: `2px solid ${accent}`,
    }}>
      <button onClick={onClick}
        style={{
          width: "100%", padding: "16px", borderRadius: 12,
          background: btnBg, color: btnText,
          fontWeight: 900, fontSize: 18, border: "none", cursor: "pointer",
          boxShadow: `0 4px 24px ${btnBg}60`,
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
        🛒 {label}
      </button>
    </div>
  );
}

/* ── Main ─────────────────────────────────────── */
export default function LpView() {
  const { slug } = useParams<{ slug: string }>();
  const orderFormRef = useRef<HTMLDivElement>(null);

  // Countdown: 24h from first visit, persisted in sessionStorage
  const countdownKey = `lp_cd_${slug}`;
  const endTs = (() => {
    const saved = sessionStorage.getItem(countdownKey);
    if (saved) return parseInt(saved);
    const ts = Date.now() + 24 * 3_600_000;
    sessionStorage.setItem(countdownKey, String(ts));
    return ts;
  })();
  const { h, m, s } = useCountdown(endTs);

  const { data: page, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/lp/${slug}`],
    queryFn: () => fetch(`/api/lp/${slug}`).then(r => { if (!r.ok) throw new Error("Page introuvable."); return r.json(); }),
    retry: false,
  });

  const [form, setForm] = useState({ customerName: "", customerPhone: "", customerCity: "", customerAddress: "" });
  const [submitted, setSubmitted] = useState(false);
  const [qty, setQty] = useState(1);

  const submitOrder = useMutation({
    mutationFn: (body: any) => fetch(`/api/lp/${slug}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => { if (!r.ok) return r.json().then(j => Promise.reject(j.message)); return r.json(); }),
    onSuccess: () => setSubmitted(true),
  });

  const scrollToForm = () => orderFormRef.current?.scrollIntoView({ behavior: "smooth" });

  if (isLoading) return (
    <div style={{ minHeight: "100vh", background: "#0F1F3D", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#C5A059", fontSize: 18, fontWeight: 700 }}>Chargement...</div>
    </div>
  );
  if (isError || !page) return (
    <div style={{ minHeight: "100vh", background: "#0F1F3D", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 64 }}>🔍</div>
      <div style={{ color: "#ffffff", fontSize: 20, fontWeight: 700 }}>Page introuvable</div>
    </div>
  );

  const copy: any = page.copy || {};
  const T = getTheme(page.theme, page.customColor);

  const headline     = copy.headline     || page.productName;
  const subheadline  = copy.subheadline  || "";
  const hook         = copy.hook         || "";
  const problem      = copy.problem      || "";
  const solution     = copy.solution     || [];
  const scarcity     = copy.scarcity     || "Stock limité — commandez maintenant !";
  const cta          = copy.cta          || "Commander Maintenant";
  const guarantee    = copy.guarantee    || "Livraison rapide dans tout le Maroc";
  const testimonials = copy.testimonials || [];

  const totalPrice = page.priceDH * qty;

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: T.bg, minHeight: "100vh", paddingBottom: 80, maxWidth: "100vw", overflowX: "hidden" }}>

      {/* ── Section 1: HERO ─────────────────────────── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        {page.heroImageUrl ? (
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <img src={page.heroImageUrl} alt={page.productName} loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(to bottom, ${T.bg}bb 0%, ${T.bg}66 40%, ${T.bg}ee 85%, ${T.bg} 100%)`,
            }} />
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bg2} 100%)` }} />
        )}

        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "24px 20px 40px" }}>
          {/* Badge */}
          <div style={{ display: "inline-block", marginBottom: 16, alignSelf: "flex-start" }}>
            <span style={{ background: T.accent, color: T.btnText, padding: "6px 14px", borderRadius: 100, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              🔥 Offre Limitée
            </span>
          </div>

          <h1 style={{ color: T.text, fontSize: "clamp(28px, 8vw, 42px)", fontWeight: 900, lineHeight: 1.15, margin: "0 0 12px" }}>
            {headline}
          </h1>
          {subheadline && (
            <p style={{ color: T.textMuted, fontSize: 17, lineHeight: 1.5, margin: "0 0 16px" }}>{subheadline}</p>
          )}
          {hook && (
            <p style={{ color: T.text, fontSize: 15, lineHeight: 1.6, margin: "0 0 24px", fontStyle: "italic", opacity: 0.9 }}>
              "{hook}"
            </p>
          )}

          <div style={{ marginBottom: 20 }}>
            <span style={{ color: T.accent, fontSize: 36, fontWeight: 900 }}>{page.priceDH} DH</span>
            <span style={{ color: T.textMuted, fontSize: 14, marginLeft: 8, textDecoration: "line-through" }}>
              {Math.round(page.priceDH * 1.4)} DH
            </span>
          </div>

          <button onClick={scrollToForm}
            style={{
              background: T.btnBg, color: T.btnText, border: "none",
              padding: "18px 32px", borderRadius: 14, fontSize: 18,
              fontWeight: 900, cursor: "pointer", width: "100%",
              textTransform: "uppercase", letterSpacing: "0.06em",
              boxShadow: `0 8px 32px ${T.accent}55`,
            }}>
            {cta} →
          </button>

          <p style={{ color: T.textMuted, fontSize: 12, textAlign: "center", marginTop: 10 }}>
            🚚 {guarantee}
          </p>
        </div>
      </section>

      {/* ── Section 2: BENEFITS ─────────────────────── */}
      {(problem || solution.length > 0) && (
        <section style={{ padding: "48px 20px", background: T.bg2 }}>
          {problem && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ width: 48, height: 4, background: T.accent, borderRadius: 2, marginBottom: 16 }} />
              <p style={{ color: T.text, fontSize: 16, lineHeight: 1.7, margin: 0 }}>{problem}</p>
            </div>
          )}

          {solution.length > 0 && (
            <>
              <h2 style={{ color: T.accent, fontSize: 22, fontWeight: 800, margin: "0 0 20px" }}>
                Pourquoi choisir ce produit ?
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(solution as string[]).map((b, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    background: T.card, borderRadius: 12, padding: "14px 16px",
                    border: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: 22, flexShrink: 0 }}>
                      {["✅", "⚡", "💪", "🎯", "🔥", "💎"][i % 6]}
                    </span>
                    <span style={{ color: T.text, fontSize: 15, lineHeight: 1.5 }}>{b}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Section 3: SOCIAL PROOF ─────────────────── */}
      {(page.proofImageUrl || testimonials.length > 0) && (
        <section style={{ padding: "48px 20px", background: T.bg }}>
          {page.featuresImageUrl && (
            <div style={{ marginBottom: 32, borderRadius: 16, overflow: "hidden", boxShadow: `0 8px 40px rgba(0,0,0,0.4)` }}>
              <img src={page.featuresImageUrl} alt="Produit en action" loading="lazy"
                style={{ width: "100%", display: "block", maxHeight: 320, objectFit: "cover" }} />
            </div>
          )}

          {testimonials.length > 0 && (
            <>
              <h2 style={{ color: T.accent, fontSize: 22, fontWeight: 800, margin: "0 0 20px" }}>
                Ce que disent nos clients 🌟
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {testimonials.map((t: any, i: number) => (
                  <div key={i} style={{
                    background: T.card, borderRadius: 14, padding: "16px",
                    border: `1px solid ${T.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: T.accent, display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 900, fontSize: 16, color: T.btnText, flexShrink: 0,
                      }}>
                        {(t.name || "C")[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ color: T.text, fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                        <div style={{ color: T.textMuted, fontSize: 12 }}>{t.city}</div>
                      </div>
                      <div style={{ marginLeft: "auto" }}><Stars n={t.rating || 5} /></div>
                    </div>
                    <p style={{ color: T.text, fontSize: 14, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                      "{t.text}"
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Section 4: URGENCY + ORDER FORM ─────────── */}
      <section ref={orderFormRef} style={{ padding: "48px 20px 40px", background: T.bg2 }}>
        {/* Scarcity banner */}
        <div style={{
          background: `linear-gradient(135deg, #ef4444 0%, #dc2626 100%)`,
          borderRadius: 14, padding: "16px 20px", marginBottom: 32, textAlign: "center",
        }}>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 15, margin: "0 0 4px" }}>⚠️ {scarcity}</p>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, margin: 0 }}>L'offre expire dans :</p>
        </div>

        {/* Countdown */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 36 }}>
          {[{ label: "HH", val: h }, { label: "MM", val: m }, { label: "SS", val: s }].map(({ label, val }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{
                background: T.accent, color: T.btnText, borderRadius: 12,
                padding: "16px 20px", fontSize: 36, fontWeight: 900, minWidth: 72, lineHeight: 1,
                boxShadow: `0 4px 20px ${T.accent}55`,
              }}>
                {pad(val)}
              </div>
              <div style={{ color: T.textMuted, fontSize: 10, marginTop: 4, fontWeight: 600, letterSpacing: "0.1em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Proof image */}
        {page.proofImageUrl && (
          <div style={{ marginBottom: 32, borderRadius: 16, overflow: "hidden", boxShadow: `0 8px 40px rgba(0,0,0,0.5)` }}>
            <img src={page.proofImageUrl} alt="Preuve" loading="lazy"
              style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
          </div>
        )}

        {!submitted ? (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: 24 }}>
            <h2 style={{ color: T.text, fontSize: 22, fontWeight: 800, margin: "0 0 6px" }}>
              🛒 Commander Maintenant
            </h2>
            <p style={{ color: T.textMuted, fontSize: 14, margin: "0 0 24px" }}>
              Remplissez le formulaire — livraison dans 48–72h
            </p>

            {/* Quantity selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: T.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                Quantité
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => setQty(n)}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 10, border: `2px solid ${qty === n ? T.accent : T.border}`,
                      background: qty === n ? `${T.accent}22` : "transparent",
                      color: qty === n ? T.accent : T.text, fontWeight: 700, fontSize: 15, cursor: "pointer",
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Price display */}
            <div style={{
              background: `${T.accent}18`, border: `1px solid ${T.accent}40`, borderRadius: 12,
              padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ color: T.textMuted, fontSize: 14 }}>{qty} × {page.priceDH} DH</span>
              <span style={{ color: T.accent, fontSize: 22, fontWeight: 900 }}>{totalPrice} DH</span>
            </div>

            {/* Form fields */}
            {[
              { key: "customerName", label: "Votre Prénom et Nom", placeholder: "Ex: Ahmed Benali", type: "text" },
              { key: "customerPhone", label: "Numéro WhatsApp / Téléphone", placeholder: "Ex: 0612345678", type: "tel" },
              { key: "customerCity", label: "Ville", placeholder: "Ex: Casablanca", type: "text" },
              { key: "customerAddress", label: "Adresse (optionnel)", placeholder: "Ex: Rue Hassan II, Appt 5", type: "text" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ color: T.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                  {f.label}
                </label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  data-testid={`input-lp-${f.key}`}
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: 10, border: `1px solid ${T.border}`,
                    background: `${T.card}`, color: T.text, fontSize: 15, boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            ))}

            {submitOrder.isError && (
              <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>
                {(submitOrder.error as any)?.toString() || "Erreur lors de la commande."}
              </p>
            )}

            <button
              onClick={() => {
                if (!form.customerName || !form.customerPhone) return;
                submitOrder.mutate({ ...form, quantity: qty });
              }}
              disabled={submitOrder.isPending || !form.customerName || !form.customerPhone}
              data-testid="button-lp-submit-order"
              style={{
                width: "100%", padding: "18px", border: "none",
                background: submitOrder.isPending ? "#666" : T.btnBg,
                color: T.btnText, borderRadius: 14, fontSize: 18, fontWeight: 900,
                cursor: submitOrder.isPending ? "not-allowed" : "pointer",
                textTransform: "uppercase", letterSpacing: "0.06em",
                boxShadow: `0 8px 32px ${T.accent}55`,
                marginBottom: 12,
              }}>
              {submitOrder.isPending ? "⏳ Envoi en cours..." : `✅ Confirmer ma commande — ${totalPrice} DH`}
            </button>

            <p style={{ color: T.textMuted, fontSize: 12, textAlign: "center", margin: 0 }}>
              🔒 Paiement à la livraison · Livraison 48–72h · Satisfait ou remboursé
            </p>
          </div>
        ) : (
          <div style={{
            background: "rgba(16,185,129,0.12)", border: "2px solid #10b981",
            borderRadius: 20, padding: 32, textAlign: "center",
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={{ color: "#10b981", fontSize: 24, fontWeight: 900, margin: "0 0 8px" }}>
              Commande Confirmée !
            </h2>
            <p style={{ color: T.text, fontSize: 15, lineHeight: 1.6, margin: "0 0 12px" }}>
              Shukran bzzaf ! Notre équipe va vous contacter bientôt sur WhatsApp pour confirmer la livraison.
            </p>
            <p style={{ color: T.textMuted, fontSize: 13, margin: 0 }}>
              📞 Gardez votre téléphone à portée de main.
            </p>
          </div>
        )}
      </section>

      {/* Footer */}
      <div style={{ padding: "24px 20px", textAlign: "center", borderTop: `1px solid ${T.border}` }}>
        <p style={{ color: T.textMuted, fontSize: 12, margin: 0 }}>
          Powered by TajerGrow · Maroc 🇲🇦
        </p>
      </div>

      <FloatingCTA label={cta} accent={T.accent} btnBg={T.btnBg} btnText={T.btnText} onClick={scrollToForm} />
    </div>
  );
}
