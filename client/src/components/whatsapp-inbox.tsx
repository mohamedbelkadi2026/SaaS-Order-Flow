import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, MessageCircle, RefreshCw, Send, Users } from "lucide-react";

type Chat = { id: string; name: string; type: string; unreadCount: number; archive: boolean };
type Message = { id: string; timestamp: number; outgoing: boolean; type: string; text: string; senderName: string; mediaUrl: string | null; fileName: string; status: string | null };

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...options });
  const data = await response.json().catch(() => { throw new Error("Le service WhatsApp est indisponible. Réessayez."); });
  if (!response.ok) throw new Error(data.message || "Impossible de charger WhatsApp.");
  return data;
}

export default function WhatsappInbox() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Chat | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const chats = useQuery({
    queryKey: ["/api/automation/whatsapp/chats"],
    queryFn: () => request<{ chats: Chat[] }>("/api/automation/whatsapp/chats"),
    refetchInterval: 60_000,
    retry: 1,
  });
  const messages = useQuery({
    queryKey: ["/api/automation/whatsapp/messages", selected?.id],
    queryFn: () => request<{ messages: Message[] }>(`/api/automation/whatsapp/messages?chatId=${encodeURIComponent(selected!.id)}`),
    enabled: !!selected,
    refetchInterval: 15_000,
    retry: 1,
  });
  const sync = useMutation({
    mutationFn: () => request("/api/automation/whatsapp/sync", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/whatsapp/chats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/whatsapp/messages"] });
    },
  });
  const send = useMutation({
    mutationFn: (input: { chatId: string; message: string }) => request("/api/automation/whatsapp/messages", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }),
    onSuccess: (_, input) => {
      setDraft(current => current === input.message ? "" : current);
      queryClient.invalidateQueries({ queryKey: ["/api/automation/whatsapp/messages", input.chatId] });
      queryClient.invalidateQueries({ queryKey: ["/api/automation/whatsapp/chats"] });
    },
  });
  useEffect(() => { setDraft(""); send.reset(); }, [selected?.id]);
  const lastId = messages.data?.messages.at(-1)?.id;
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [selected?.id, lastId]);
  const filtered = (chats.data?.chats ?? []).filter(chat => `${chat.name} ${chat.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const errorBox = (error: Error, retry: () => void) => (
    <div role="alert" className="m-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
      <AlertCircle className="mb-2 h-5 w-5" />{error.message}
      <button type="button" onClick={retry} className="mt-3 block font-semibold underline">Réessayer</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
        <p>Discussions du numéro WhatsApp enregistré dans IA Confirmation. L'historique disponible dépend de la synchronisation Green API et peut apparaître avec un délai.</p>
        <button type="button" onClick={() => sync.mutate()} disabled={sync.isPending} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-700 disabled:opacity-50">{sync.isPending ? "Activation…" : "Activer la synchronisation du téléphone"}</button>
      </div>
      {sync.isSuccess && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">Synchronisation activée. Les réglages peuvent prendre jusqu'à 5 minutes. Pour récupérer les anciens messages, Green API peut nécessiter une nouvelle connexion par QR code.</p>}
      {sync.isError && errorBox(sync.error, () => sync.mutate())}
      <div className="grid h-[72vh] min-h-[480px] grid-cols-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white md:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${selected ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-zinc-100`}>
          <div className="flex items-center justify-between bg-emerald-50 p-4">
            <h3 className="flex items-center gap-2 font-bold text-emerald-900"><MessageCircle className="h-5 w-5" /> Mon WhatsApp</h3>
            <button type="button" aria-label="Actualiser les discussions" disabled={chats.isFetching} onClick={() => chats.refetch()} className="rounded-lg p-2 hover:bg-emerald-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${chats.isFetching ? "animate-spin" : ""}`} /></button>
          </div>
          <div className="p-3"><input aria-label="Rechercher une discussion" value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un nom ou numéro…" className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm" /></div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {chats.isLoading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
            {chats.isError && errorBox(chats.error, () => chats.refetch())}
            {!chats.isLoading && !chats.isError && !filtered.length && <p className="p-6 text-center text-sm text-zinc-400">{search ? "Aucune discussion correspondante." : "Aucune discussion disponible dans Green API pour ce numéro."}</p>}
            {filtered.map(chat => <button type="button" key={chat.id} onClick={() => setSelected(chat)} className={`flex w-full items-center gap-3 border-b border-zinc-50 p-4 text-left hover:bg-zinc-50 ${selected?.id === chat.id ? "bg-emerald-50" : ""}`}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">{chat.type === "group" ? <Users className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-800">{chat.name || chat.id.split("@")[0]}</p><p className="truncate text-xs text-zinc-400">{chat.type === "group" ? "Groupe" : chat.id.split("@")[0]}{chat.archive ? " · Archivée" : ""}</p></div>
              {chat.unreadCount > 0 && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs text-white">{chat.unreadCount}</span>}
            </button>)}
          </div>
        </aside>
        <section className={`${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col bg-[#f0f2ef]`}>
          {!selected ? <div className="m-auto p-8 text-center text-zinc-400"><MessageCircle className="mx-auto mb-4 h-12 w-12" /><p>Sélectionnez une discussion WhatsApp.</p></div> : <>
            <div className="flex items-center gap-3 border-b border-zinc-100 bg-white p-4">
              <button type="button" aria-label="Retour aux discussions" onClick={() => setSelected(null)} className="md:hidden"><ArrowLeft className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold text-zinc-800">{selected.name}</p><p className="text-xs text-zinc-400">{selected.id.split("@")[0]}</p></div>
              <button type="button" aria-label="Actualiser les messages" disabled={messages.isFetching} onClick={() => messages.refetch()} className="p-2 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${messages.isFetching ? "animate-spin" : ""}`} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
              {messages.isError && errorBox(messages.error, () => messages.refetch())}
              {!messages.isLoading && !messages.isError && !messages.data?.messages.length && <p className="p-8 text-center text-sm text-zinc-500">Aucun message synchronisé pour cette discussion. Vérifiez les réglages de réception dans Green API puis actualisez.</p>}
              {(messages.data?.messages ?? []).map((message, index) => <div key={message.id || index} className={`flex ${message.outgoing ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[88%] rounded-xl p-3 shadow-sm sm:max-w-[75%] ${message.outgoing ? "bg-[#d9fdd3]" : "bg-white"}`}>
                  {!message.outgoing && selected.type === "group" && <p className="mb-1 text-xs font-semibold text-emerald-700">{message.senderName}</p>}
                  {message.mediaUrl && <div className="mb-2">{message.type === "imageMessage" || message.type === "stickerMessage" ? <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer"><img src={message.mediaUrl} alt={message.fileName} loading="lazy" className="max-h-64 max-w-full rounded-lg object-contain" /></a> : message.type === "audioMessage" ? <audio src={message.mediaUrl} controls preload="none" className="max-w-full" /> : message.type === "videoMessage" ? <video src={message.mediaUrl} controls preload="none" className="max-h-64 max-w-full rounded-lg" /> : <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-700 underline">{message.fileName}</a>}</div>}
                  <p dir="auto" className="whitespace-pre-wrap break-words text-sm text-zinc-800">{message.text || (!message.mediaUrl ? `[${message.type || "Message"}]` : "")}</p>
                  <p className="mt-1 text-right text-[10px] text-zinc-400">{new Date(message.timestamp * 1000).toLocaleString("fr-MA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} {message.outgoing && <span className={message.status === "read" ? "text-sky-500" : ""}>{message.status === "failed" ? "Échec" : message.status === "read" || message.status === "delivered" ? "✓✓" : "✓"}</span>}</p>
                </div>
              </div>)}
              <div ref={bottom} />
            </div>
            {send.isError && <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-600">{send.error.message}</p>}
            <form onSubmit={e => { e.preventDefault(); if (draft.trim() && !send.isPending) send.mutate({ chatId: selected.id, message: draft }); }} className="flex items-end gap-2 border-t border-zinc-100 bg-white p-3">
              <textarea aria-label="Message WhatsApp" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Écrire un message…" maxLength={20000} rows={2} className="min-w-0 flex-1 resize-none rounded-xl border border-zinc-200 p-3 text-sm" />
              <button type="submit" aria-label="Envoyer le message" disabled={!draft.trim() || send.isPending} className="rounded-xl bg-emerald-600 p-3 text-white disabled:opacity-50">{send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}
