import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './neuro.js';
function response() { return { headers:{}, code:200, setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;} }; }
test('proxy denies an unrelated browser origin',async()=>{
  const res=response();await handler({headers:{origin:'https://other.invalid'},method:'POST',query:{action:'login'}},res);assert.equal(res.code,403);
});
test('proxy cannot expose internal worker or arbitrary URLs',async()=>{
  for(const action of ['renew','diagnostics','webhook','https://other.invalid']) {
    const res=response();await handler({headers:{},method:'POST',query:{action}},res);assert.equal(res.code,404);
  }
});
test('proxy forwards only caller session and fixed upstream',async()=>{
  const saved=globalThis.fetch;let sent;
  globalThis.fetch=async(url,options)=>{sent={url,options};return new Response(JSON.stringify({active:true}));};
  try {
    const res=response();await handler({headers:{origin:'https://plotnikovprod.ru',authorization:'Bearer test-session'},method:'POST',query:{action:'status'},body:{}},res);
    assert.equal(sent.url,'https://qucwykwlhipjnbeljuvq.supabase.co/functions/v1/neuro-billing/status');
    assert.equal(sent.options.headers.Authorization,'Bearer test-session');assert.equal(res.body.active,true);
  } finally {globalThis.fetch=saved;}
});
