import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,stat,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const run=promisify(execFile);
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const {prepareMetaMedia,MetaMediaError}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(await read('server/meta-media.ts'),{mode:'transform'})).toString('base64'));

test('real encoder converts saved WEBP, MOV and WAV to Cloud API formats and reuses cached files',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'meta-media-'));
 try {
  const fixtures=[
   ['image','.webp',['-f','lavfi','-i','color=c=red:s=100x80','-frames:v','1','-threads','1'],'image/webp','.jpg','image/jpeg'],
   ['video','.mov',['-f','lavfi','-i','color=c=red:s=160x120:d=1','-c:v','mpeg4'],'video/quicktime','.mp4','video/mp4'],
   ['audio','.wav',['-f','lavfi','-i','sine=frequency=500:duration=1'],'audio/wav','.mp3','audio/mpeg'],
  ];
  for(const [kind,ext,args,mime,outExt,outMime] of fixtures){
   const original=path.join(root,kind+ext);
   await run('ffmpeg',['-hide_banner','-loglevel','error','-y',...args,original]);
   const [a,b]=await Promise.all([prepareMetaMedia(original,kind,mime),prepareMetaMedia(original,kind,mime)]);
   assert.equal(a.file,b.file);assert.equal(a.mime,outMime);assert.ok(a.file.endsWith(outExt));assert.notEqual(a.file,original);
   const size=(await stat(a.file)).size;assert.ok(size>0&&size<5*1024*1024);
   const before=(await stat(a.file)).mtimeMs;assert.equal((await prepareMetaMedia(original,kind,mime)).file,a.file);assert.equal((await stat(a.file)).mtimeMs,before);
   const probe=JSON.parse((await run('ffprobe',['-v','error','-show_streams','-of','json',a.file])).stdout);
   if(kind==='video')assert.equal(probe.streams[0].codec_name,'h264');
   if(kind==='audio')assert.equal(probe.streams[0].codec_name,'mp3');
  }
  await assert.rejects(()=>prepareMetaMedia(path.join(root,'missing.webp'),'image','image/webp'),e=>e instanceof MetaMediaError&&!e.message.includes(root));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('new-order outreach sends all saved media without asking; closed Meta windows queue them instead',async()=>{
 const source=await read('server/ai-agent.ts');
 const a=source.indexOf('    console.log(`[WHATSAPP]: Attempting to send message'),b=source.indexOf('    console.log(`[SUCCESS]: Outreach sent',a);
 const body=stripTypeScriptTypes('(async()=>{'+source.slice(a,b)+'})()',{mode:'transform'});
 for(const needsTemplate of [true,false]){
  const sent=[],queued=[],logs=[];
  const ctx={descriptionDarija:'description',productImageUrls:['image1','image2'],productVideoUrls:['video'],productAudioUrls:['voice']};
  await vm.runInNewContext(body,{ctx,needsTemplate,storeId:37,orderId:56134,customerPhone:'test',console:{log(){}},storage:{createAiLog:async log=>logs.push(log)},
   queueMetaContent:async(...args)=>queued.push(args),sendWhatsAppMessage:async(...args)=>{sent.push(['text',...args]);return true;},sendWhatsAppImage:async(...args)=>{sent.push(['image',...args]);return true;},sendWhatsAppFile:async(...args)=>{sent.push(['file',...args]);return true;}});
  assert.equal(needsTemplate?sent.length:queued.length,0);assert.equal(needsTemplate?queued.length:sent.length,5);assert.equal(logs.length,0);
 }
});

test('failure reason reaches Live Monitoring log instead of a misleading Green API message',async()=>{
 const source=await read('server/ai-agent.ts');
 const a=source.indexOf('    const mediaFailures: string[] = []',source.indexOf('export async function triggerAIForNewOrder')),b=source.indexOf('    console.log(`[SUCCESS]: Outreach sent',a);
 const logs=[];
 await vm.runInNewContext(stripTypeScriptTypes('(async()=>{'+source.slice(a,b)+'})()',{mode:'transform'}),{ctx:{productImageUrls:['x'],productVideoUrls:[],productAudioUrls:[]},storeId:37,orderId:1,customerPhone:'test',sendWhatsAppImage:async(_p,_url,_caption,_store,outcome)=>{outcome.error='Fichier introuvable';return false;},storage:{createAiLog:async row=>logs.push(row)}});
 assert.match(logs[0].message,/Fichier introuvable/);assert.doesNotMatch(logs[0].message,/Green API/);
});
