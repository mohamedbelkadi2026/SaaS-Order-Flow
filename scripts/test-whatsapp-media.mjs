// Node 24: node --test scripts/test-whatsapp-media.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';

const require = createRequire(import.meta.url);
const asModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const read = p => readFile(new URL('../' + p, import.meta.url),'utf8');
const code = stripTypeScriptTypes(await read('server/whatsapp-media-routes.ts'), {mode:'transform'})
  .replace('"multer"', JSON.stringify(pathToFileURL(require.resolve('multer')).href));
const { registerWhatsappMediaRoutes } = await import(asModule(code));
const { uploadWhatsappMedia } = await import(asModule(stripTypeScriptTypes(await read('client/src/lib/whatsapp-media.ts'), {mode:'transform'})));
let server, root, base;
before(async()=>{
  root=await mkdtemp(path.join(tmpdir(),'wa-media-'));
  const app=express();
  const auth=(req,res,next)=>{
    if(!req.get('x-store-id')) return res.status(401).json({message:'Unauthorized'});
    req.user={storeId:Number(req.get('x-store-id'))};next();
  };
  registerWhatsappMediaRoutes(app,auth,root);
  app.use('/uploads',express.static(root));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{
  if(server) await new Promise(resolve=>server.close(resolve));
  if(root) await rm(root,{recursive:true,force:true});
});
async function upload(kind, {mime='video/mp4',name='video.mp4',bytes=Buffer.from('0000ftypmp42-example'),store='91',field='file',extra=false,emptyForm=false}={}){
  const form=new FormData();
  if(!emptyForm) form.append(field,new Blob([bytes],{type:mime}),name);
  if(extra) form.append('file',new Blob([bytes],{type:mime}),name);
  const response=await fetch(base+`/api/upload/whatsapp-${kind}`,{method:'POST',headers:store?{'x-store-id':store}:{},body:form});
  return {response,body:await response.json()};
}

test('MP4 upload returns an accessible absolute video URL and stores it in the correct store directory',async()=>{
  const {response,body}=await upload('video',{name:'WhatsApp Video 2026-10-23 at 20.59.53.mp4'});
  assert.equal(response.status,200,JSON.stringify(body));
  assert.match(body.url,/\/uploads\/whatsapp\/91\/video_[\w-]+\.mp4$/);
  assert.equal(body.localPath,undefined);
  const file=await fetch(body.url);assert.equal(file.status,200);assert.match(file.headers.get('content-type'),/video\/mp4/);
  assert.equal(await file.text(),'0000ftypmp42-example');
});
test('image and voice uploads use their own formats and do not trust path segments in filenames',async()=>{
  for(const [kind,mime,name,ext] of [['image','image/png','../../danger.html','png'],['audio','audio/ogg','voice.ogg','ogg'],['video','video/quicktime','clip.mov','mov']]){
    const {response,body}=await upload(kind,{mime,name,store:'92'});
    assert.equal(response.status,200,JSON.stringify(body));
    assert.match(body.url,new RegExp('/whatsapp/92/'+kind+'_[\\w-]+\\.'+ext+'$'));
  }
});
test('unsupported formats and the wrong media category return a clear 415 JSON error',async()=>{
  for(const [kind,mime] of [['video','text/html'],['video','image/png'],['image','image/svg+xml']]){
    const {response,body}=await upload(kind,{mime});
    assert.equal(response.status,415);assert.match(body.message,/Format non pris/);
  }
});
test('empty, absent, unexpected field and multiple files return 400 JSON errors',async()=>{
  for(const options of [{bytes:Buffer.alloc(0)},{emptyForm:true},{field:'image'},{extra:true}]){
    const {response,body}=await upload('video',options);
    assert.equal(response.status,400,JSON.stringify(body));assert.equal(typeof body.message,'string');
  }
});
test('oversized media returns 413 and does not leave a partial file',async()=>{
  const beforeFiles=await readdir(path.join(root,'whatsapp','91'));
  const {response,body}=await upload('image',{mime:'image/png',bytes:Buffer.alloc(10*1024*1024+1)});
  assert.equal(response.status,413,JSON.stringify(body));assert.match(body.message,/10 Mo/);
  assert.deepEqual(await readdir(path.join(root,'whatsapp','91')),beforeFiles);
});
test('authentication and valid store membership are required before writing files',async()=>{
  assert.equal((await upload('video',{store:''})).response.status,401);
  assert.equal((await upload('video',{store:'-2'})).response.status,403);
  assert.equal((await upload('video',{store:'../../92'})).response.status,403);
});
test('frontend checks the video size before uploading and shows JSON or non-JSON errors clearly',async()=>{
  const originalFetch=globalThis.fetch;
  try{
    let fetched=false;
    globalThis.fetch=async()=>{fetched=true;return Response.json({});};
    await assert.rejects(uploadWhatsappMedia({size:64*1024*1024+1},'video'),/64 Mo/);assert.equal(fetched,false);
    const file=new File(['video'],'clip.mp4',{type:'video/mp4'});
    globalThis.fetch=async()=>Response.json({message:'Format non pris en charge.'},{status:415});
    await assert.rejects(uploadWhatsappMedia(file,'video'),/Format non pris/);
    globalThis.fetch=async()=>new Response('<html>too large',{status:413});
    await assert.rejects(uploadWhatsappMedia(file,'video'),/64 Mo/);
    globalThis.fetch=async()=>new Response('<!DOCTYPE html>',{status:404});
    await assert.rejects(uploadWhatsappMedia(file,'video'),/service d'envoi/);
    globalThis.fetch=async()=>Response.json({});
    await assert.rejects(uploadWhatsappMedia(file,'video'),/lien valide/);
    globalThis.fetch=async()=>Response.json({url:'https://shop.example/uploads/whatsapp/91/test.mp4'});
    assert.equal(await uploadWhatsappMedia(file,'video'),'https://shop.example/uploads/whatsapp/91/test.mp4');
  } finally{globalThis.fetch=originalFetch;}
});
