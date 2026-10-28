"""Read-only local HTTP boundary checks; synthetic fixtures, no worker or sends."""
import base64,json,os,pathlib,socket,subprocess,tempfile,time,urllib.request,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='dwell-cutover-test-') as tmp:
 p=pathlib.Path(tmp)
 (p/'interactions.csv').write_text('interaction_id,agent_id,agent_name,date,property_address,draft_type,message_status,next_action\nold,a,Example,2026-10-28,10 Example St,email,sent,\n')
 (p/'email-production.json').write_text(json.dumps({'events':[]}))
 (p/'run-state').mkdir()
 for instant,mode,expected in [('2026-10-28T23:59:59Z',None,1),('2026-10-29T00:00:00Z','production-only',0),('2026-10-29T13:00:00Z','production-only',0)]:
  (p/'clock.cjs').write_text('Date.now = () => Date.parse('+json.dumps(instant)+');')
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  env={**os.environ,'PORT':str(port),'NODE_ENV':'production','DASHBOARD_USERNAME':'cutover-test','DASHBOARD_PASSWORD':'synthetic-only','DATA_DIR':tmp,'RUN_STATE_DIR':str(p/'run-state'),'PRESTAGE_STORAGE_DIR':str(p/'intakes')}
  child=subprocess.Popen(['node','--require',str(p/'clock.cjs'),'server.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  auth='Basic '+base64.b64encode(b'cutover-test:synthetic-only').decode()
  def get(route,authenticated=True):
   req=urllib.request.Request('http://127.0.0.1:'+str(port)+route,headers={'Authorization':auth} if authenticated else {})
   return opener.open(req,timeout=2)
  try:
   for _ in range(50):
    try:
     response=get('/api/email-operations');break
    except (OSError,urllib.error.URLError):
     if child.poll() is not None:raise RuntimeError('Local server exited: '+child.stderr.read().decode()[:1000])
     time.sleep(.1)
   result=json.load(response)
   assert result.get('mode')==mode,result
   assert result['metrics']['sent']==expected,result
   if mode:assert result['events']==[],result
   for route in ['/api/email-operations','/api/downloads/email-production.json']:
    try:get(route,False);raise AssertionError('Missing auth gate')
    except urllib.error.HTTPError as e:assert e.code==401
   assert get('/api/downloads/email-production.json').read()==(p/'email-production.json').read_bytes()
   assert get('/campaigns.html').status==200
   assert get('/api/prestage/health').status==200
   print(instant,mode or 'legacy','sent='+str(expected),'auth/download/prestage/campaigns PASS')
  finally:child.terminate();child.wait(timeout=10)
