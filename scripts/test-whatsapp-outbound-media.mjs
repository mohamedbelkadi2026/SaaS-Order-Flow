import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source = await readFile('server/whatsapp-service.ts','utf8');
const clean = stripTypeScriptTypes(source.split('\n').filter(l=>!l.startsWith('import ')).join('\n'),{mode:'transform'}).replaceAll('export ','');
test('uploaded images, audio and video use multipart media host with own credentials; foreign/missing files fail closed',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'wa-media-'));
 try {
  await mkdir(path.join(root,'uploads/whatsapp/91'),{recursive:true});
  const requests=[];
  const api=vm.runInNewContext(clean+'\n({sendWhatsAppFile})',{
   readFile,stat,path,URL,FormData,Blob,AbortSignal,Date,process:{env:{DATA_DIR:root}},setInterval(){},console:{log(){},warn(){},error(){}},
   getStoreGreenCredentials:async id=>id===91?{instanceId:'7107000091',apiToken:'own-token'}:null,
   greenApiUrl:(id,method,token)=>`https://7107.api.greenapi.com/waInstance${id}/${method}/${token}`,
   fetch:async(url,options)=>{requests.push({url,body:options.body});return Response.json({idMessage:'accepted'});},
  });
  for(const ext of ['png','mp3','mp4']) {
   await writeFile(path.join(root,`uploads/whatsapp/91/file.${ext}`),'file-bytes');
   assert.equal(await api.sendWhatsAppFile('0661112233',`/uploads/whatsapp/91/file.${ext}`,'wrong.opus','caption',91),true);
   const r=requests.at(-1);
   assert.match(r.url,/7107.media.greenapi.com.*sendFileByUpload\/own-token$/);
   assert.equal(r.body.get('fileName'),`wrong.${ext}`);
   assert.equal(await r.body.get('file').text(),'file-bytes');
  }
  assert.equal(await api.sendWhatsAppFile('0661112233','/uploads/whatsapp/92/file.png','p.png','',91),false);
  assert.equal(await api.sendWhatsAppFile('0661112233','/uploads/whatsapp/91/missing.png','p.png','',91),false);
  assert.equal(requests.length,3);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('requested media failures cannot create an assistant image log',async()=>{
 const agent=await readFile('server/ai-agent.ts','utf8');
 const start=agent.indexOf('    if (intent === "image" && conv.orderId)');
 const end=agent.indexOf('    if (intent === "confirm"',start);
 const block=stripTypeScriptTypes('(async()=>{'+agent.slice(start,end)+'})()',{mode:'transform'});
 for(const intent of ['image','video','audio']) for(const success of [false,true]) {
  const logs=[];
  await vm.runInNewContext(block,{
   intent,conv:{id:1,orderId:1},storeId:91,customerPhone:'test',
   getOrderContext:async()=>({productImageUrls:['image'],productVideoUrls:['video'],productAudioUrls:['audio']}),
   sendWhatsAppImage:async()=>success,sendWhatsAppFile:async()=>success,
   storage:{createAiLog:async v=>logs.push(v)},broadcastToStore(){},Date,
  });
  assert.equal(logs.length,1);assert.equal(logs[0].role,success?'assistant':'system');
 }
});
