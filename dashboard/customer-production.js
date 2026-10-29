'use strict';
const {verifiedEvents, botAttribution} = require('./email-production');
const id = value => require('node:crypto').createHash('sha256').update(value).digest('hex').slice(0,24);
function project(snapshot, now=Date.now()) {
 const events=verifiedEvents(snapshot,now);
 const agents=new Map(), properties=new Map(), backlog=new Map();
 const interactions=[];
 for(const event of events) {
  const email=event.to[0], agentId='production-agent-'+id(email);
  const propertyId='production-property-'+id(event.propertyAddress || event.messageId);
  const bot=botAttribution({sourceBot:event.botProvenance?.source==='transport-journal'?event.botProvenance.sourceBot:''});
  const source=({'cortona':'MLS Backlog','lead-generation':'New MLS Listing','campaigns':'Zip Code Blast'})[bot.botId] || 'Source not recorded';
  agents.set(agentId,{agent_id:agentId,agent_name:event.agentName || '',email,review_status:'verified_recipient',outreach_status:'production_sent',data_confidence:'verified Sent Items'});
  properties.set(propertyId,{property_id:propertyId,property_address:event.propertyAddress || '',listing_agent:event.agentName || '',agent_id:agentId,agent_email:email,outreach_status:'production_sent',lead_source:source,last_contact_date:event.sentAt});
  interactions.push({interaction_id:event.messageId,agent_id:agentId,agent_name:event.agentName || '',date:event.sentAt,property_address:event.propertyAddress || '',draft_type:'production_direct',message_status:'production_sent',next_action:'Await response',lead_source:source});
  if(bot.botId==='cortona')backlog.set(propertyId,{backlog_row:propertyId,address:event.propertyAddress || '',listing_agent:event.agentName || '',processing_status:'processed_sent',customer_batch_status:'customer_sent',status_note:'Verified direct production send',source_file:'Verified production Sent Items'});
 }
 return {agents:[...agents.values()],properties:[...properties.values()],interactions,mlsBacklog:[...backlog.values()]};
}
module.exports={project};
