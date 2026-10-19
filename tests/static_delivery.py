"""Verify built assets via the real Skynet HTTP handler, not browser rendering."""
import pathlib, subprocess, time, urllib.request, json, socket
root=pathlib.Path(__file__).resolve().parents[1]
with socket.socket() as s:
    s.settimeout(.2)
    if s.connect_ex(('127.0.0.1',18080))==0:
        raise SystemExit('Stop existing 18080 service before isolated test')
log=open('/tmp/rover-static-test.log','w')
p=subprocess.Popen([str(root/'server/run.sh')],stdout=log,stderr=subprocess.STDOUT)
rows=[]
try:
    for _ in range(60):
        try:
            urllib.request.urlopen('http://127.0.0.1:18080/',timeout=1).read();break
        except Exception:time.sleep(.1)
    for f in sorted((root/'client/dist').rglob('*')):
        if not f.is_file():continue
        rel=f.relative_to(root/'client/dist').as_posix()
        with urllib.request.urlopen('http://127.0.0.1:18080/'+rel,timeout=3) as r:
            data=r.read();assert data==f.read_bytes(),rel
            if f.suffix=='.png':assert r.headers.get_content_type()=='image/png'
            if f.suffix=='.wav':assert r.headers.get_content_type()=='audio/wav'
            rows.append({'path':rel,'bytes':len(data),'status':r.status,'mime':r.headers.get_content_type()})
    assert any(x['path'].endswith('rover.png') for x in rows)
    assert any(x['path'].endswith('pickup.wav') for x in rows)
    out={'status':'passed','scope':'Actual Skynet HTTP byte/MIME delivery; not browser visual or audio playback test','files':rows}
    (root/'verification/static-delivery.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print('PASS Skynet HTTP assets',len(rows))
finally:
    p.terminate()
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:p.kill();p.wait()
    log.close()
