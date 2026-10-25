import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {z} from 'zod';

const source=await readFile(new URL('../server/routes.ts',import.meta.url),'utf8');
function setup(){
  const handlers=new Map(),rows=new Map();let nextId=1;
  const storage={
    async createProduct(data){const p={id:nextId++,ameexProductId:null,...data};rows.set(p.id,p);return p;},
    async createProductWithVariants(data,variants){return this.createProduct({...data,variants});},
    async getProduct(id){return rows.get(id);},
    async updateProduct(id,data){const p={...rows.get(id),...data};rows.set(id,p);return p;},
  };
  const db={select:()=>({from:()=>({where:()=>({limit:async()=>[]})})})};
  const context={app:{post:(path,...args)=>handlers.set('POST '+path,args.at(-1)),patch:(path,...args)=>handlers.set('PATCH '+path,args.at(-1))},requireAuth:()=>{},z,storage,db,products:{storeId:1,sku:2},eq:()=>{},and:()=>{}};
  for(const [start,end] of [['  app.post("/api/products",','  // POST /api/products/import'],['  app.patch("/api/products/:id",','  // GET /api/products/cleanup-suggestions']]){
    const a=source.indexOf(start),b=source.indexOf(end,a);
    vm.runInNewContext(stripTypeScriptTypes(source.slice(a,b),{mode:'transform'}),context);
  }
  async function request(method,body,id,storeId=91){
    let status=200,result;
    const res={status(code){status=code;return this;},json(value){result=value;return this;}};
    await handlers.get(method)({body,params:{id:String(id)},user:{id:7,storeId}},res);
    return {status,result};
  }
  return {request,storage};
}
const key='4d082136-e941-4dab-bd8f-9dccfef24e47';
test('create and reopen retains Ameex ID for simple products and variants',async()=>{
  const {request,storage}=setup();
  for(const variants of [undefined,[{name:'Large',sku:'L',stock:0}]]){
    const response=await request('POST /api/products',{name:'Product',sku:'P',ameexProductId:`  ${key}  `,variants});
    assert.equal(response.status,201);
    assert.equal(response.result.ameexProductId,key);
    assert.equal((await storage.getProduct(response.result.id)).ameexProductId,key);
  }
});
test('edit persists ID, unrelated edits preserve it, explicit clearing removes it',async()=>{
  const {request,storage}=setup();
  const p=await storage.createProduct({name:'Product',sku:'P',stock:0,storeId:91});
  const edit=body=>request('PATCH /api/products/:id',body,p.id);
  assert.equal((await edit({ameexProductId:` ${key} `})).result.ameexProductId,key);
  await edit({description:'Unrelated edit'});
  assert.equal((await storage.getProduct(p.id)).ameexProductId,key);
  for(const clear of [null,'','   ']){
    await edit({ameexProductId:key});await edit({ameexProductId:clear});
    assert.equal((await storage.getProduct(p.id)).ameexProductId,null);
  }
});
test('invalid values and cross-store edits cannot overwrite the saved ID',async()=>{
  const {request,storage}=setup();
  const p=await storage.createProduct({name:'Product',sku:'P',stock:0,storeId:91,ameexProductId:key});
  assert.equal((await request('PATCH /api/products/:id',{ameexProductId:42},p.id)).status,400);
  assert.equal((await request('PATCH /api/products/:id',{ameexProductId:'other'},p.id,92)).status,403);
  assert.equal((await storage.getProduct(p.id)).ameexProductId,key);
});
