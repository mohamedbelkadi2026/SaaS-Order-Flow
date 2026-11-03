import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const helper=stripTypeScriptTypes(await readFile(new URL('../shared/inventory-stock.ts',import.meta.url),'utf8'),{mode:'transform'}).replace('export function','function');
const stockWithVariants=vm.runInNewContext(helper+';stockWithVariants');
const variants=[1,21,9,14,33,35,31].map((stock,i)=>({name:`variant ${i}`,sku:`SKU${i}`,stock:String(stock),costPrice:'0',sellingPrice:'0'}));
test('variant form displays total including unallocated departures and updates when quantities change',()=>{
 assert.equal(stockWithVariants('-2',variants),142);
 assert.equal(stockWithVariants('-2',variants.map((v,i)=>i===6?{...v,stock:'32'}:v)),143);
 assert.equal(stockWithVariants('3',[{stock:'5'},{stock:''}]),8);
});
test('actual edit handler submits parent balance and variant quantities separately, avoiding double count',async()=>{
 const source=await readFile(new URL('../client/src/pages/inventory.tsx',import.meta.url),'utf8');
 const start=source.indexOf('  const handleEdit = async () =>'),end=source.indexOf('  const handleDelete =',start);
 let payload;
 const form={stock:'-2',name:'trench ref207',sku:'207',imageUrl:'',aiFeatures:'',ameexProductId:''};
 const context={form,variants,hasVariants:true,editingProduct:{id:2374,stock:142},
  clearFile(){},toast(message){if(message.title==='Erreur')throw Error(message.description);},
  updateProduct:{async mutateAsync(value){payload=value;}},setEditOpen(){},setEditingProduct(){},resetForm(){},manualStockReason:''};
 const edit=vm.runInNewContext(stripTypeScriptTypes(source.slice(start,end),{mode:'transform'})+';handleEdit',context);
 await edit();
 assert.equal(payload.stock,-2);
 assert.equal(payload.variants.reduce((sum,v)=>sum+v.stock,0),144);
 assert.equal(stockWithVariants(payload.stock,payload.variants),142);
 assert.equal(payload.variants[6].stock,31);
});
