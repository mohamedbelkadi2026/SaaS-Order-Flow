import { useState, useRef } from 'react';
import { Search, Upload, Video, Copy, Loader2, RefreshCw } from 'lucide-react';

const PLATFORMS = (kw: string) => [
  { name: 'AliExpress', icon: '🛒', url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(kw)}` },
  { name: '1688', icon: '🇨🇳', url: `https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(kw)}` },
  { name: 'TikTok', icon: '🎵', url: `https://www.tiktok.com/search?q=${encodeURIComponent(kw)}` },
  { name: 'TikTok Ads', icon: '📱', url: `https://library.tiktok.com/ads/?region=MA&search=${encodeURIComponent(kw)}` },
  { name: 'Meta Ads', icon: '📘', url: `https://www.facebook.com/ads/library/?country=MA&search_terms=${encodeURIComponent(kw)}&ad_type=ALL&media_type=video` },
  { name: 'YouTube', icon: '▶️', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(kw + ' review')}` },
  { name: 'Pinterest', icon: '📌', url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(kw)}` },
  { name: 'Minea', icon: '📊', url: `https://minea.com/search?q=${encodeURIComponent(kw)}` },
];

export default function ProductResearch() {
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [manualKeyword, setManualKeyword] = useState('');
  const [keywords, setKeywords] = useState('');
  const [aliResults, setAliResults] = useState<any[]>([]);
  const [tiktokVideos, setTiktokVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imageBase64 && !manualKeyword) return;
    setLoading(true);
    setKeywords('');
    setAliResults([]);
    setTiktokVideos([]);
    try {
      const r = await fetch('/api/product-research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keyword: manualKeyword, imageBase64 }),
      });
      const data = await r.json();
      setKeywords(data.keywords || manualKeyword);
      setAliResults(data.aliResults || []);
      setTiktokVideos(data.tiktokVideos || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const copy = (kw: string) => {
    navigator.clipboard.writeText(kw);
    setCopied(kw);
    setTimeout(() => setCopied(''), 2000);
  };

  const kwList = keywords.split(',').map(k => k.trim()).filter(Boolean);
  const mainKw = kwList[0] || manualKeyword;
  const platforms = PLATFORMS(mainKw);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-6xl mx-auto animate-in fade-in duration-300" data-testid="page-product-research">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Video className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Product Research</h1>
          <p className="text-xs text-muted-foreground">Image → AI Keywords → Videos & Ads sur toutes les plateformes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 rounded-2xl border bg-white dark:bg-card p-4 space-y-3">
          <p className="font-semibold text-sm">📸 Image produit</p>
          <div
            className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/20 transition-all"
            onClick={() => inputRef.current?.click()}
            data-testid="dropzone-image"
          >
            {imagePreview ? (
              <img src={imagePreview} className="h-full object-contain rounded-lg p-1" alt="preview" data-testid="img-preview" />
            ) : (
              <div className="text-center space-y-2">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground opacity-40" />
                <p className="text-xs text-muted-foreground">Cliquez pour uploader</p>
                <p className="text-[10px] text-muted-foreground opacity-60">JPG, PNG, WEBP</p>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleImage} data-testid="input-image-file" />

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <input
            type="text"
            placeholder="Ex: coupe légume électrique..."
            value={manualKeyword}
            onChange={e => setManualKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze()}
            className="w-full h-9 px-3 text-sm border rounded-lg bg-white dark:bg-card focus:outline-none focus:ring-2 focus:ring-purple-400"
            data-testid="input-manual-keyword"
          />

          <button
            onClick={analyze}
            disabled={loading || (!imageBase64 && !manualKeyword)}
            className="w-full h-10 rounded-xl font-semibold text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            data-testid="button-analyze"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analyse en cours...</>
              : <><Search className="w-4 h-4" />Analyser & Rechercher</>
            }
          </button>
        </div>

        <div className="lg:col-span-3 rounded-2xl border bg-white dark:bg-card p-4 space-y-3">
          <p className="font-semibold text-sm">🔍 Mots-clés détectés par IA</p>
          {kwList.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {kwList.map((k, i) => (
                  <button
                    key={i}
                    onClick={() => copy(k)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 text-xs font-medium border border-purple-200 hover:bg-purple-100 transition-all"
                    data-testid={`button-keyword-${i}`}
                  >
                    {k}
                    {copied === k ? <span className="text-green-500 text-[10px]">✓</span> : <Copy className="w-2.5 h-2.5 opacity-40" />}
                  </button>
                ))}
              </div>
              <button onClick={analyze} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary" data-testid="button-rerun">
                <RefreshCw className="w-3 h-3" /> Relancer l'analyse
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Search className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm text-center opacity-60">
                {loading ? 'Analyse en cours...' : 'Uploadez une image ou tapez un mot-clé'}
              </p>
            </div>
          )}

          {mainKw && (
            <div>
              <p className="text-[11px] font-bold uppercase text-muted-foreground mb-2">Rechercher sur:</p>
              <div className="grid grid-cols-4 gap-2">
                {platforms.map(p => (
                  <a
                    key={p.name}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-1 p-2 rounded-xl border hover:shadow-sm hover:border-purple-200 transition-all group"
                    data-testid={`link-platform-${p.name.replace(/\s+/g, '-').toLowerCase()}`}
                  >
                    <span className="text-xl">{p.icon}</span>
                    <span className="text-[10px] font-medium text-center leading-tight">{p.name}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {aliResults.length > 0 && (
        <div className="rounded-2xl border bg-white dark:bg-card p-4" data-testid="section-ali-results">
          <p className="font-semibold text-sm mb-3">🛒 Produits AliExpress ({aliResults.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {aliResults.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border overflow-hidden hover:shadow-md transition-all group"
                data-testid={`card-ali-${i}`}
              >
                {r.image && (
                  <div className="aspect-square overflow-hidden bg-muted">
                    <img src={r.image} alt={r.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs line-clamp-2 font-medium">{r.title}</p>
                  {r.price && <p className="text-xs text-emerald-600 font-bold mt-1">${r.price}</p>}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {tiktokVideos.length > 0 && (
        <div className="rounded-2xl border bg-white dark:bg-card p-4" data-testid="section-tiktok-videos">
          <p className="font-semibold text-sm mb-3">🎵 TikTok Videos ({tiktokVideos.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiktokVideos.map((v, i) => (
              <a
                key={i}
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border overflow-hidden hover:shadow-md transition-all group"
                data-testid={`card-tiktok-${i}`}
              >
                <div className="relative aspect-[9/16] overflow-hidden bg-black">
                  {v.cover && <img src={v.cover} alt={v.title} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-all" />}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                      <span className="text-white text-lg">▶</span>
                    </div>
                  </div>
                  <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {v.views > 1000000 ? `${(v.views / 1000000).toFixed(1)}M` : v.views > 1000 ? `${(v.views / 1000).toFixed(0)}K` : v.views} views
                  </div>
                </div>
                <div className="p-2">
                  <p className="text-[10px] line-clamp-2">{v.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">@{v.author}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-[10px] text-red-500">❤️ {v.likes > 1000 ? `${(v.likes / 1000).toFixed(0)}K` : v.likes}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
