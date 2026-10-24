'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode});};
function filters(body){
 const zip=String(body.zip||''); if(!/^\d{5}$/.test(zip))fail('Enter a five-digit ZIP code.');
 const limits={minPrice:[200000,100000000],maxPrice:[200000,100000000],minDays:[0,10000],maxDays:[0,10000],maxLeads:[1,25]};
 const out={zip}; for(const [k,[min,max]] of Object.entries(limits)){const v=body[k];if(v===''||v==null||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)fail('Invalid '+k);out[k]=Number(v);}
 if(out.minPrice>out.maxPrice||out.minDays>out.maxDays)fail('Minimum cannot exceed maximum.');return out;
}
function createStore(dir){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 function file(id){if(!/^[a-f0-9-]{36}$/.test(id))fail('Unknown campaign.',404);return path.join(dir,id+'.json');}
 function read(id){try{return JSON.parse(fs.readFileSync(file(id),'utf8'));}catch(e){if(e.code==='ENOENT')fail('Unknown campaign.',404);throw e;}}
 function save(c){c.updatedAt=new Date().toISOString();const p=file(c.id),t=p+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(t,JSON.stringify(c),{mode:0o600});fs.renameSync(t,p);return c;}
 function list(){return fs.readdirSync(dir).filter(x=>/^[a-f0-9-]{36}\.json$/.test(x)).map(x=>read(x.slice(0,-5))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
 function create(body){const f=filters(body);const prior=list().find(c=>['queued','running'].includes(c.status)&&JSON.stringify(c.filters)===JSON.stringify(f));if(prior)return prior;if(list().filter(c=>['queued','running'].includes(c.status)).length>=10)fail('Ten campaigns are already active. Wait or cancel one.',409);return save({id:crypto.randomUUID(),createdAt:new Date().toISOString(),filters:f,status:'queued',mode:'reviewer',recipient:'zacstites@gmail.com',summary:'Waiting for the campaign research bot.',results:[]});}
 function next(){return list().reverse().find(c=>c.status==='queued'||c.status==='running'&&Date.parse(c.leaseUntil||0)<Date.now())||null;}
 function claim(id){const c=read(id);if(c.status!=='queued'&&!(c.status==='running'&&Date.parse(c.leaseUntil||0)<Date.now()))fail('Campaign is not available.',409);c.status='running';c.leaseToken=crypto.randomUUID();c.leaseUntil=new Date(Date.now()+25*60000).toISOString();return save(c);}
 function update(id,b){const c=read(id);if(c.status!=='running'||!b.leaseToken||b.leaseToken!==c.leaseToken||Date.parse(c.leaseUntil)<Date.now())fail('Inactive or expired campaign lease.',409);if(!['queued','running','completed','blocked'].includes(b.status))fail('Invalid status.');if(!Array.isArray(b.results)||b.results.length>500)fail('Invalid results.');
 const keys=['address','mls','price','daysOnMarket','status','reason','agentName','agentEmail','agentPhone','listingUrl','emailSent','sentItemsMessageId'];
 const results=b.results.map(r=>{if(!r||typeof r!=='object'||Array.isArray(r))fail('Invalid result.');const o={};for(const k of keys)if(r[k]!==undefined){if(k==='emailSent'){if(typeof r[k]!=='boolean')fail('Invalid send status.');}else if(['price','daysOnMarket'].includes(k)){if(r[k]!==null&&(!Number.isFinite(r[k])||r[k]<0))fail('Invalid listing number.');}else if(typeof r[k]!=='string'||r[k].length>3000)fail('Invalid result text.');o[k]=r[k];}if(o.emailSent&&!o.sentItemsMessageId)fail('Sent Items evidence is required.');return o;});
 const sent=results.filter(r=>r.emailSent);if(sent.length>c.filters.maxLeads)fail('Campaign send limit exceeded.');for(const old of c.results.filter(r=>r.emailSent))if(!sent.some(r=>r.sentItemsMessageId===old.sentItemsMessageId))fail('Cannot discard send audit history.');
 if(typeof b.summary!=='string'||b.summary.length>5000)fail('Invalid summary.');c.results=results;c.summary=b.summary;c.status=b.status;if(c.status==='running')c.leaseUntil=new Date(Date.now()+25*60000).toISOString();else{delete c.leaseToken;delete c.leaseUntil;}return save(c);}
 function cancel(id){const c=read(id);if(['queued','running','blocked'].includes(c.status)){c.status='cancelled';c.summary='Cancelled. An email already submitted cannot be recalled.';delete c.leaseToken;delete c.leaseUntil;save(c);}return c;}
 return {list,create,read,next,claim,update,cancel};
}
function publicCampaign(c){if(!c)return null;const {leaseToken,leaseUntil,...out}=c;return out;}
async function body(req){if(!String(req.headers['content-type']||'').startsWith('application/json'))fail('JSON required.',415);let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>1024*1024)fail('Request too large.',413);}try{return JSON.parse(s);}catch{fail('Invalid JSON.');}}
function tokenValid(req,token){const v=req.headers.authorization||'';if(!token)return false;const a=Buffer.from(v),b=Buffer.from('Bearer '+token);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function createHandler({dir,token,sendJson}){const store=createStore(dir);return async function(req,res,url,worker=false){
 if(worker&&!tokenValid(req,token)){sendJson(res,401,{error:'Worker authentication required.'});return;}
 if(req.method==='POST'&&!worker){const origin=req.headers.origin;if(req.headers['sec-fetch-site']==='cross-site'||origin&&new URL(origin).host!==req.headers.host)fail('Cross-site request denied.',403);}
 const p=url.pathname;
 if(worker){if(req.method==='GET'&&p==='/api/campaign-worker/next')return sendJson(res,200,{campaign:publicCampaign(store.next())});if(req.method==='POST'&&p==='/api/campaign-worker/claim'){const b=await body(req);return sendJson(res,200,store.claim(b.id));}const m=p.match(/^\/api\/campaign-worker\/([a-f0-9-]{36})(\/update)?$/);if(m){if(req.method==='GET'&&!m[2])return sendJson(res,200,publicCampaign(store.read(m[1])));if(req.method==='POST'&&m[2])return sendJson(res,200,store.update(m[1],await body(req)));}}
 else {if(p==='/api/campaigns'){if(req.method==='GET')return sendJson(res,200,{campaigns:store.list().map(publicCampaign)});if(req.method==='POST')return sendJson(res,201,publicCampaign(store.create(await body(req))));}const m=p.match(/^\/api\/campaigns\/([a-f0-9-]{36})(\/cancel)?$/);if(m){if(req.method==='GET'&&!m[2])return sendJson(res,200,publicCampaign(store.read(m[1])));if(req.method==='POST'&&m[2]){await body(req);return sendJson(res,200,publicCampaign(store.cancel(m[1])));}}}
 sendJson(res,404,{error:'Campaign endpoint not found.'});};}
module.exports={filters,createStore,createHandler,publicCampaign};
