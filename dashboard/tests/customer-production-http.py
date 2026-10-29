"""Customer surfaces exclude old rows; archive hash verification stays intact."""
import base64,json,os,pathlib,socket,subprocess,tempfile,time,urllib.request,urllib.error
ROOT=pathlib.Path(__file__).resolve().parents[1]
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp)
 for name in ['agents','properties','interactions','mls-backlog']:
  (p/(name+'.csv')).write_text('legacy_field\nHISTORICAL_TEST_SENTINEL\n')
 (p/'email-production.json').write_text(json.dumps({'events':[]}))
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 env={**os.environ,'PORT':str(port),'NODE_ENV':'production','DASHBOARD_USERNAME':'test','DASHBOARD_PASSWORD':'test','DATA_DIR':tmp}
 child=subprocess.Popen(['node','server.js'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 auth='Basic '+base64.b64encode(b'test:test').decode()
 def get(route,authorized=True):return opener.open(urllib.request.Request('http://127.0.0.1:'+str(port)+route,headers={'Authorization':auth} if authorized else {}),timeout=3)
 try:
  for _ in range(50):
   try:get('/api/summary');break
   except OSError:time.sleep(.1)
  routes=['overview','summary','properties','agents','interactions','mls-backlog','repository','agent-drilldown','exceptions','run-state','downloads/agents.csv','downloads/properties.csv','downloads/interactions.csv','downloads/mls-backlog.csv','downloads/simply-dwell-data.xls']
  for route in routes:
   raw=get('/api/'+route).read();assert b'HISTORICAL_TEST_SENTINEL' not in raw,route
  overview=json.load(get('/api/overview'));assert overview['source']['mode']=='production-only'
  for field in ['agentCount','propertyCount','interactionCount','backlogCount']:assert overview['metrics'][field]==0
  manifest=json.load(get('/api/snapshot-hashes'));assert manifest['files']['agents.csv']['rows']==1
  try:get('/api/snapshot-hashes',False);raise AssertionError('Auth missing')
  except urllib.error.HTTPError as e:assert e.code==401
  assert 'HISTORICAL_TEST_SENTINEL' in (p/'agents.csv').read_text()
  print('PASS: 15 customer APIs/exports exclude historical records; zero metrics; archive unchanged; authenticated publisher hashes')
 finally:child.terminate();child.wait(timeout=10)
