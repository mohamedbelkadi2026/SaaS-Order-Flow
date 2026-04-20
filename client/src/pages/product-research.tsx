import { useState, useRef } from 'react';
import { Search, Upload, ExternalLink, Video, Copy, Loader2 } from 'lucide-react';

export default function ProductResearch() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [manualKeyword, setManualKeyword] = useState('');
  const [keywords, setKeywords] = useState('');
  const [metaAds, setMetaAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      setImageBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!image && !manualKeyword) return;
    setLoading(true);
    setKeywords('');
    setMetaAds([]);
    try {
      const r = await fetch('/api/product-research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keyword: manualKeyword, imageBase64 }),
      });
      const data = await r.json();
      setKeywords(data.keywords || manualKeyword);
      setMetaAds(data.metaAds || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const copyKw = (kw: string) => {
    navigator.clipboard.writeText(kw);
    setCopied(kw);
    setTimeout(() => setCopied(''), 2000);
  };

  const kwList = keywords.split(',').map(k => k.trim()).filter(Boolean);
  const mainKw = kwList[0] || manualKeyword;

  const platforms = [
    { name: 'AliExpress', icon: '🛒', color: 'text-orange-600', url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(mainKw)}` },
    { name: '1688', icon: '🇨🇳', color: 'text-red-600', url: `https://s.1688.com/selloffer/offerlist.htm?keywords=${encodeURIComponent(mainKw)}` },
    { name: 'TikTok', icon: '🎵', color: 'text-black dark:text-white', url: `https://www.tiktok.com/search?q=${encodeURIComponent(mainKw)}` },
    { name: 'TikTok Ads', icon: '📱', color: 'text-pink-600', url: `https://library.tiktok.com/ads?search=${encodeURIComponent(mainKw)}&countryCode=MA` },
    { name: 'YouTube', icon: '▶️', color: 'text-red-600', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(mainKw + ' review')}` },
    { name: 'Meta Ad Library', icon: '📘', color: 'text-blue-600', url: `https://www.facebook.com/ads/library/?country=MA&search_terms=${encodeURIComponent(mainKw)}&ad_type=ALL&media_type=video` },
    { name: 'Pinterest', icon: '📌', color: 'text-red-500', url: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(mainKw)}` },
    { name: 'Dropship Spy', icon: '🔍', color: 'text-purple-600', url: `https://www.dropship-spy.com/?s=${encodeURIComponent(mainKw)}` },
    { name: 'Minea', icon: '📊', color: 'text-indigo-600', url: `https://minea.com/search?q=${encodeURIComponent(mainKw)}` },
    { name: 'AdSpy', icon: '🕵️', color: 'text-gray-700', url: `https://www.adspy.com/?keyword=${encodeURIComponent(mainKw)}` },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-5xl mx-auto" data-testid="page-product-research">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
          <Video className="w-6 h-6 text-purple-500" />
          Product Research
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload une image produit ou tapez un mot-clé → trouvez vidéos & ads sur toutes les plateformes
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white dark:bg-card p-5 space-y-3">
          <p className="font-bold text-sm">📸 Image du produit</p>
          <label
            className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/20 transition-all"
            onClick={() => inputRef.current?.click()}
            data-testid="label-upload-image"
          >
            {imagePreview ? (
              <img src={imagePreview} className="h-full object-contain rounded-xl p-1" alt="preview" data-testid="img-preview" />
            ) : (
              <div className="text-center">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">Cliquez pour uploader une image</p>
                <p className="text-[10px] text-muted-foreground mt-1">JPG, PNG, WEBP</p>
              </div>
            )}
          </label>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} data-testid="input-image-file" />

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">ou tapez directement</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <input
            type="text"
            placeholder="Ex: electric lemon juicer, coupe légume..."
            value={manualKeyword}
            onChange={e => setManualKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze()}
            className="w-full h-9 px-3 text-sm border rounded-lg bg-white dark:bg-card focus:outline-none focus:ring-2 focus:ring-purple-400"
            data-testid="input-manual-keyword"
          />

          <button
            onClick={analyze}
            disabled={loading || (!image && !manualKeyword)}
            className="w-full h-10 rounded-xl font-semibold text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
            data-testid="button-analyze"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Analyse en cours...</>
            ) : (
              <><Search className="w-4 h-4" />Rechercher des vidéos & ads</>
            )}
          </button>
        </div>

        <div className="rounded-2xl border bg-white dark:bg-card p-5 space-y-3">
          <p className="font-bold text-sm">🔍 Mots-clés détectés</p>
          {kwList.length > 0 ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {kwList.map((k, i) => (
                  <button
                    key={i}
                    onClick={() => copyKw(k)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-medium border border-purple-200 hover:bg-purple-100 transition-all"
                    data-testid={`button-keyword-${i}`}
                  >
                    {k}
                    {copied === k ? <span className="text-green-500">✓</span> : <Copy className="w-3 h-3 opacity-50" />}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Cliquez sur un mot-clé pour le copier</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Search className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-sm text-center">Les mots-clés apparaîtront ici<br />après analyse</p>
            </div>
          )}
        </div>
      </div>

      {(kwList.length > 0 || manualKeyword) && (
        <div className="rounded-2xl border bg-white dark:bg-card p-5">
          <p className="font-bold text-sm mb-4">🚀 Rechercher sur les plateformes</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {platforms.map(p => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-2 p-3 rounded-xl border hover:shadow-md hover:border-purple-200 transition-all group text-center"
                data-testid={`link-platform-${p.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <span className="text-2xl">{p.icon}</span>
                <span className={`text-xs font-semibold ${p.color}`}>{p.name}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-purple-500" />
              </a>
            ))}
          </div>

          {kwList.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground mb-2 font-semibold">Rechercher avec tous les mots-clés:</p>
              <div className="flex flex-wrap gap-2">
                {kwList.map((kw, i) => (
                  <a
                    key={i}
                    href={`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(kw)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-all"
                    data-testid={`link-aliexpress-${i}`}
                  >
                    🛒 {kw}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {metaAds.length > 0 && (
        <div className="rounded-2xl border bg-white dark:bg-card p-5" data-testid="section-meta-ads">
          <p className="font-bold text-sm mb-4">📘 Facebook Video Ads trouvées ({metaAds.length})</p>
          <div className="space-y-3">
            {metaAds.map((ad: any, i: number) => (
              <div key={i} className="rounded-xl border p-3 flex items-start gap-3 hover:bg-muted/10" data-testid={`card-meta-ad-${i}`}>
                <span className="text-2xl">📘</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" data-testid={`text-ad-page-${i}`}>{ad.pageName}</p>
                  {ad.body && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ad.body}</p>}
                  {ad.title && <p className="text-xs font-medium mt-1">{ad.title}</p>}
                </div>
                {ad.snapshotUrl && (
                  <a
                    href={ad.snapshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                    data-testid={`link-ad-snapshot-${i}`}
                  >
                    Voir l'ad
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
