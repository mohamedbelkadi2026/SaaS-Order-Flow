import { useState, useRef } from 'react';
import { Search, Upload, Loader2, Youtube, Music2, RefreshCw, Eye, Heart } from 'lucide-react';

export default function ProductResearch() {
  const [imagePreview, setImagePreview] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [manualKeyword, setManualKeyword] = useState('');
  const [keywords, setKeywords] = useState('');
  const [youtubeVideos, setYoutubeVideos] = useState<any[]>([]);
  const [tiktokVideos, setTiktokVideos] = useState<any[]>([]);
  const [lensResults, setLensResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tiktok' | 'youtube'>('tiktok');
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
    setYoutubeVideos([]);
    setTiktokVideos([]);
    setLensResults([]);
    try {
      const r = await fetch('/api/product-research/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ keyword: manualKeyword, imageBase64 }),
      });
      const data = await r.json();
      setKeywords(data.keywords || '');
      setYoutubeVideos(data.youtubeVideos || []);
      setTiktokVideos(data.tiktokVideos || []);
      setLensResults(data.lensResults || []);
      if ((data.tiktokVideos || []).length > 0) setActiveTab('tiktok');
      else if ((data.youtubeVideos || []).length > 0) setActiveTab('youtube');
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fmtNum = (n: number) =>
    n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n > 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n);
  const kwList = keywords.split(',').map(k => k.trim()).filter(Boolean);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-5xl mx-auto" data-testid="page-product-research">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
          🎬 Product Research
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Upload image → AI détecte le produit → vidéos TikTok & YouTube
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white dark:bg-card p-4 space-y-3">
          <p className="font-semibold text-sm">📸 Image produit</p>
          <div
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/20 transition-all"
            data-testid="dropzone-image"
          >
            {imagePreview ? (
              <img src={imagePreview} className="h-full object-contain rounded-lg p-1" alt="preview" data-testid="img-preview" />
            ) : (
              <div className="text-center space-y-2">
                <Upload className="w-7 h-7 mx-auto text-muted-foreground opacity-40" />
                <p className="text-xs text-muted-foreground">Cliquez pour uploader</p>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleImage} data-testid="input-image-file" />

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground">ou mot-clé</span>
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
              ? <><Loader2 className="w-4 h-4 animate-spin" />Recherche en cours...</>
              : <><Search className="w-4 h-4" />Trouver les vidéos</>
            }
          </button>
        </div>

        <div className="rounded-2xl border bg-white dark:bg-card p-4 space-y-3">
          <p className="font-semibold text-sm">🤖 Produit détecté par IA</p>
          {kwList.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {kwList.map((k, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      i === 0
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 border-purple-200'
                    }`}
                    data-testid={`badge-keyword-${i}`}
                  >
                    {i === 0 ? '🎯 ' : ''}{k}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="rounded-xl bg-muted/20 p-3 text-center">
                  <p className="text-lg font-bold text-pink-500" data-testid="count-tiktok">{tiktokVideos.length}</p>
                  <p className="text-[10px] text-muted-foreground">TikTok vidéos</p>
                </div>
                <div className="rounded-xl bg-muted/20 p-3 text-center">
                  <p className="text-lg font-bold text-red-500" data-testid="count-youtube">{youtubeVideos.length}</p>
                  <p className="text-[10px] text-muted-foreground">YouTube vidéos</p>
                </div>
              </div>
              <button
                onClick={analyze}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                data-testid="button-rerun"
              >
                <RefreshCw className="w-3 h-3" /> Relancer
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 opacity-40">
              <Search className="w-8 h-8 mb-2" />
              <p className="text-xs text-center">
                {loading ? 'Analyse en cours...' : 'Les résultats apparaîtront ici'}
              </p>
            </div>
          )}
        </div>
      </div>

      {lensResults.length > 0 && (
        <div className="rounded-2xl border bg-white dark:bg-card p-4" data-testid="section-lens-results">
          <p className="font-semibold text-sm mb-3">🔍 Produits similaires trouvés ({lensResults.length})</p>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {lensResults.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border overflow-hidden hover:shadow-md transition-all group"
                data-testid={`card-lens-${i}`}
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  {r.thumbnail && (
                    <img
                      src={r.thumbnail}
                      alt={r.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-all"
                      onError={e => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                    />
                  )}
                </div>
                <div className="p-1.5">
                  <p className="text-[10px] line-clamp-2 font-medium">{r.title}</p>
                  {r.price && <p className="text-[10px] text-emerald-600 font-bold">{r.price}</p>}
                  <p className="text-[10px] text-muted-foreground truncate">{r.source}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {(tiktokVideos.length > 0 || youtubeVideos.length > 0) && (
        <div className="rounded-2xl border bg-white dark:bg-card overflow-hidden" data-testid="section-videos">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('tiktok')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
                activeTab === 'tiktok' ? 'bg-black text-white' : 'text-muted-foreground hover:bg-muted/20'
              }`}
              data-testid="tab-tiktok"
            >
              <Music2 className="w-4 h-4" />
              TikTok ({tiktokVideos.length})
            </button>
            <button
              onClick={() => setActiveTab('youtube')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
                activeTab === 'youtube' ? 'bg-red-600 text-white' : 'text-muted-foreground hover:bg-muted/20'
              }`}
              data-testid="tab-youtube"
            >
              <Youtube className="w-4 h-4" />
              YouTube ({youtubeVideos.length})
            </button>
          </div>

          <div className="p-4">
            {activeTab === 'tiktok' && (
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
                    <div className="relative bg-black" style={{ aspectRatio: '9/16' }}>
                      {v.thumbnail && (
                        <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/40 transition-all">
                          <span className="text-white text-base ml-0.5">▶</span>
                        </div>
                      </div>
                      {v.views > 0 && (
                        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                          <Eye className="w-2.5 h-2.5 text-white" />
                          <span className="text-white text-[10px]">{fmtNum(v.views)}</span>
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-[10px] line-clamp-2 font-medium">{v.title || 'TikTok Video'}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">@{v.author}</p>
                      {v.likes > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <Heart className="w-2.5 h-2.5 text-red-500" />
                          <span className="text-[10px] text-muted-foreground">{fmtNum(v.likes)}</span>
                        </div>
                      )}
                    </div>
                  </a>
                ))}
                {tiktokVideos.length === 0 && (
                  <div className="col-span-4 text-center py-8 text-muted-foreground text-sm">
                    Aucune vidéo TikTok trouvée
                  </div>
                )}
              </div>
            )}

            {activeTab === 'youtube' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {youtubeVideos.map((v, i) => (
                  <a
                    key={i}
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border overflow-hidden hover:shadow-md transition-all group"
                    data-testid={`card-youtube-${i}`}
                  >
                    <div className="relative aspect-video overflow-hidden bg-black">
                      {v.thumbnail && (
                        <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-red-600/80 flex items-center justify-center group-hover:bg-red-600 transition-all">
                          <span className="text-white text-base ml-0.5">▶</span>
                        </div>
                      </div>
                      {v.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded">
                          {v.duration}
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium line-clamp-2">{v.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{v.channel}</p>
                      {v.views && (
                        <div className="flex items-center gap-1 mt-1">
                          <Eye className="w-2.5 h-2.5 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{v.views}</span>
                        </div>
                      )}
                    </div>
                  </a>
                ))}
                {youtubeVideos.length === 0 && (
                  <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">
                    Aucune vidéo YouTube trouvée
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
