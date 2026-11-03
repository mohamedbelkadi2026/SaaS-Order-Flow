import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat,mkdir,rename,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';

const run=promisify(execFile);
const MB=1024*1024;
export class MetaMediaError extends Error {}
const pending=new Map<string,Promise<string>>();
let tail:Promise<unknown>=Promise.resolve();
/** Local, store-owned files only. Conversion is cached by original file version,
 * serialized and bounded so a burst of orders cannot launch unbounded encoders. */
export async function prepareMetaMedia(file:string,kind:string,mime:string):Promise<{file:string;mime:string}> {
  const info=await stat(file).catch(()=>{throw new MetaMediaError('Fichier introuvable. Téléversez-le à nouveau dans Produits WhatsApp.');});
  const limit=kind==='image'?5*MB:kind==='document'?100*MB:16*MB;
  if(!info.isFile() || info.size===0)throw new MetaMediaError('Fichier vide ou invalide.');
  if(kind==='document') {
    if(info.size>limit)throw new MetaMediaError('Document trop volumineux (100 Mo maximum).');
    return {file,mime};
  }
  const ext=path.extname(file).toLowerCase();
  const convert=kind==='video' || (kind==='image' && (!['.jpg','.jpeg','.png'].includes(ext) || info.size>limit)) || (kind==='audio' && (!['.mp3','.aac','.m4a','.amr','.ogg','.opus'].includes(ext) || info.size>limit));
  if(!convert)return {file,mime};
  const outExt=kind==='image'?'.jpg':kind==='audio'?'.mp3':'.mp4';
  const outMime=kind==='image'?'image/jpeg':kind==='audio'?'audio/mpeg':'video/mp4';
  const key=createHash('sha256').update(JSON.stringify([file,info.size,info.mtimeMs,'meta-v1'])).digest('hex');
  const dir=path.join(path.dirname(file),'.meta-ready'),output=path.join(dir,key+outExt);
  const cached=await stat(output).catch(()=>null);
  if(cached?.size && cached.size<=limit)return {file:output,mime:outMime};
  let work=pending.get(key);
  if(!work){
    if(pending.size>=8)throw new MetaMediaError('Préparation des médias occupée. Réessayez plus tard.');
    work=tail.catch(()=>{}).then(async()=>{
      await mkdir(dir,{recursive:true});
      const temp=path.join(dir,key+'-'+randomUUID()+outExt);
      const common=['-nostdin','-hide_banner','-loglevel','error','-y','-protocol_whitelist','file,pipe','-i',file];
      try {
        let args:string[];
        if(kind==='image')args=['-frames:v','1','-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-q:v','3','-threads','1'];
        else if(kind==='audio')args=['-vn','-ac','1','-ar','44100','-c:a','libmp3lame','-b:a','64k'];
        else {
          const probe=await run('ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_entries','format=duration','-of','json',file],{timeout:15000,maxBuffer:65536});
          const seconds=Number(JSON.parse(probe.stdout).format?.duration);
          if(!Number.isFinite(seconds)||seconds<=0)throw new MetaMediaError('Durée vidéo invalide. Téléversez un MP4 valide.');
          const rate=Math.min(1800000,Math.floor((14*MB*8)/seconds)-96000);
          if(rate<64000)throw new MetaMediaError('Vidéo trop longue. Réduisez sa durée pour WhatsApp.');
          args=['-map','0:v:0','-map','0:a:0?','-vf','scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-threads','1','-preset','veryfast','-profile:v','baseline','-pix_fmt','yuv420p','-b:v',String(rate),'-maxrate',String(rate),'-bufsize',String(rate*2),'-c:a','aac','-ac','1','-b:a','96k','-movflags','+faststart'];
        }
        await run('ffmpeg',[...common,...args,temp],{timeout:120000,maxBuffer:65536});
        const size=(await stat(temp)).size;
        if(!size || size>limit)throw new MetaMediaError(`Média trop volumineux après préparation (${limit/MB} Mo maximum).`);
        await rename(temp,output);return output;
      }catch(error){
        if(error instanceof MetaMediaError)throw error;
        throw new MetaMediaError('Préparation du média impossible. Téléversez un JPG/PNG, MP4 ou MP3 valide.');
      }finally{await unlink(temp).catch(()=>{});}
    });
    pending.set(key,work);tail=work;
    void work.finally(()=>pending.delete(key)).catch(()=>{});
  }
  return {file:await work,mime:outMime};
}
