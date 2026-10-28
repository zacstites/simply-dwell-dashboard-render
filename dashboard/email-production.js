"use strict";
const policy = require("./production-policy.json");
const lower = value => String(value || "").trim().toLowerCase();
const internal = address => /@(stagewithdwell\.com|steadypace\.ai)$/.test(address);
// Only independently verified, post-cutover journal evidence can enter the email view.
// No interaction CSV, legacy collector event, queued attempt, or unknown result proves a send.
function journalEvent(journal, key, now = Date.now()) {
 const message = journal.message || {};
 const to = (journal.to || []).map(lower);
 const actual = (message.toRecipients || []).map(row => lower(row.emailAddress?.address));
 const sentAt = message.sentDateTime;
 const sentMs = Date.parse(sentAt);
 if (journal.deliveryPolicy !== policy.id || journal.state !== "sent-items-verified" ||
     !message.id || !Number.isFinite(sentMs) || sentMs < Date.parse(policy.firstDirectSendAt) ||
     sentMs < Date.parse(policy.routingEffectiveAt) || sentMs > now ||
     to.length !== 1 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to[0]) || internal(to[0]) ||
     actual.length !== 1 || actual[0] !== to[0] ||
     (message.ccRecipients || []).length || (message.bccRecipients || []).length ||
     lower(message.from?.emailAddress?.address) !== lower(policy.sender)) return null;
 return {eventType:"sent",eventAt:sentAt,sentAt,segment:"real",deliveryPolicy:policy.id,
   bot:journal.sourceBot || journal.bot || "not recorded",campaign:journal.campaign || "not recorded",
   propertyAddress:journal.address || "",agentName:message.toRecipients[0].emailAddress.name || "",
   source:"verified Sent Items",evidence:key,messageId:message.id,to,
   verification:{state:journal.state,sentAt,from:lower(message.from.emailAddress.address),to:actual,cc:[],bcc:[]}};
}
function verifiedEvents(snapshot, now = Date.now()) {
 const seen = new Set();
 return (Array.isArray(snapshot?.events) ? snapshot.events : []).filter(event => {
  const v=event.verification || {};
  const journal={deliveryPolicy:event.deliveryPolicy,state:v.state,to:event.to,
   message:{id:event.messageId,sentDateTime:v.sentAt,from:{emailAddress:{address:v.from}},
   toRecipients:(v.to || []).map(address=>({emailAddress:{address}})),ccRecipients:v.cc,bccRecipients:v.bcc}};
  if(event.eventType !== "sent" || event.segment !== "real" || event.sentAt !== v.sentAt || event.eventAt !== v.sentAt || !journalEvent(journal,event.evidence,now) || seen.has(event.messageId)) return false;
  seen.add(event.messageId);return true;
 });
}
function buildProductionTelemetry(snapshot, now = Date.now()) {
 const events=verifiedEvents(snapshot,now).sort((a,b)=>b.eventAt.localeCompare(a.eventAt));
 return {generatedAt:new Date(now).toISOString(),mode:"production-only",policy,
  coverage:{sends:snapshot ? "verified-journal-snapshot" : "unavailable",replies:"unavailable",opens:"unavailable",notes:["Only verified direct-to-listing-agent production deliveries are shown. Historical tests and uncertain sends remain private; no resend is authorized by this view.","Replies and recipient opens require independent evidence."]},
  metrics:{sent:events.length,queued:0,failures:0,confirmedReplies:0,replyRate:null,medianTimeToReplyHours:null,opens:0},
  engagement:{replied:0,noRecordedReply:events.length},events:events.slice(0,200)};
}
module.exports={policy,journalEvent,verifiedEvents,buildProductionTelemetry};
