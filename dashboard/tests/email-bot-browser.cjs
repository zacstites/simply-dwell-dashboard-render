// Read-only live-asset interaction check. Credentials arrive only through stdin.
const {chromium}=require('/opt/homebrew/lib/node_modules/openclaw/node_modules/playwright-core');
const assert=require('node:assert/strict');
const {journalEvent,buildProductionTelemetry}=require('../email-production');
(async()=>{
 let input='';for await(const c of process.stdin)input+=c;const config=JSON.parse(input);
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
 const context=await browser.newContext({httpCredentials:config.credentials});
 const page=await context.newPage();await page.goto(config.host);await page.locator('[data-view="email-operations"].tab').click();
 await page.waitForFunction(()=>document.getElementById('emailScope').textContent.includes('Historical') || document.getElementById('emailScope').textContent.includes('Production only'));
 const liveScope=await page.locator('#emailScope').textContent();
 const fixtures=['cortona','lead-generation','campaigns',null].map((sourceBot,i)=>journalEvent({deliveryPolicy:'simply-dwell-production-v1',sourceBot,state:'sent-items-verified',address:'Fictional '+i,to:['agent@example.com'],message:{id:'fixture-'+i,sentDateTime:'2026-10-29T13:00:00Z',from:{emailAddress:{address:require('../production-policy.json').sender}},toRecipients:[{emailAddress:{address:'agent@example.com'}}]}},'fixture',Date.parse('2026-10-29T14:00:00Z')));
 const telemetry=buildProductionTelemetry({events:fixtures},Date.parse('2026-10-29T14:00:00Z'));
 await page.route('**/api/email-operations',route=>route.fulfill({json:telemetry}));
 await page.evaluate(()=>refreshEmailOperations());
 assert.equal(await page.locator('#emailBotCounts article').count(),4);
 assert.equal(await page.locator('#emailOperationRows tr').count(),4);
 for(const [id,label] of [['cortona','Backlog / Cortona'],['lead-generation','Daily MLS Email'],['campaigns','ZIP Campaign'],['unknown','Unknown']]){
  await page.selectOption('#emailBotFilter',id);
  assert.equal(await page.locator('#emailOperationRows tr').count(),1);
  assert.equal(await page.locator('#emailOperationRows tr td').nth(2).textContent(),label);
 }
 await page.route('**/api/email-operations',route=>route.fulfill({json:buildProductionTelemetry({events:[]},Date.parse('2026-10-29T14:00:00Z'))}));
 await page.evaluate(()=>refreshEmailOperations());assert.match(await page.locator('#emailBotResult').textContent(),/No verified production/);
 console.log(JSON.stringify({liveScope,hostedInteraction:'all three bots and Unknown filters passed; zero-state passed',fixtureScope:'browser response interception only; no hosted data writes or emails'}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exit(1)});
