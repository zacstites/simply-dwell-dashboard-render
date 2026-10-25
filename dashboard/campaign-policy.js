
'use strict';
function identity(r){return r.mls ? 'mls:'+r.mls : 'address:'+String(r.address||'').trim().toLowerCase();}
function visible(r,f,now=Date.now()){
 const checked=Date.parse(r.statusCheckedAt||'');
 const url=v=>{try{return ['https:','http:'].includes(new URL(v).protocol);}catch{return false;}};
 return r.status!=='excluded' && r.listingStatus==='Active' && r.propertyType==='Residential' && r.zipCode===f.zip &&
 url(r.statusSource)&&url(r.priceSource)&&url(r.domSource)&&url(r.listingUrl)&&Number.isFinite(checked)&&checked<=now&&now-checked<=86400000&&
 typeof r.price==='number'&&r.price>=f.minPrice&&r.price<=f.maxPrice&&Number.isInteger(r.daysOnMarket)&&r.daysOnMarket>=f.minDays&&r.daysOnMarket<=f.maxDays&&!!r.agentName;
}
function sameProperty(a,b){return (!!a.mls&&a.mls===b.mls)||(!!a.address&&String(a.address).trim().toLowerCase()===String(b.address||'').trim().toLowerCase());}
module.exports={identity,visible,sameProperty};
