export type WhatsappMediaKind = "image" | "audio" | "video";
const limitsMb = { image: 10, audio: 16, video: 64 };

export async function uploadWhatsappMedia(file: File, kind: WhatsappMediaKind): Promise<string> {
  if (!file.size) throw new Error("Le fichier est vide.");
  if (file.size > limitsMb[kind] * 1024 * 1024) throw new Error(`Fichier trop volumineux. Taille maximale : ${limitsMb[kind]} Mo.`);
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`/api/upload/whatsapp-${kind}`, { method: "POST", credentials: "include", body: form });
  const data = await response.json().catch(() => {
    throw new Error(response.status === 413
      ? `Fichier trop volumineux. Taille maximale : ${limitsMb[kind]} Mo.`
      : "Le service d'envoi des médias WhatsApp est indisponible. Actualisez la page puis réessayez.");
  });
  if (!response.ok) throw new Error(data.message || `Échec de l'envoi (HTTP ${response.status}).`);
  if (typeof data.url !== "string" || !/^https?:\/\//.test(data.url)) throw new Error("Le serveur n'a pas retourné de lien valide pour le fichier.");
  return data.url;
}
