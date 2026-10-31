from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'minigame'/'dist'
html=Path(__file__).with_name('network-mini-bridge.html').read_text().replace('127.0.0.1:18080/ws','127.0.0.1:18086/ws')
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(root),**kw)
 def do_GET(self):
  if self.path=='/':
   self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(html.encode())
  elif self.path=='/main.js':
   self.send_response(200);self.send_header('Content-Type','application/javascript');self.end_headers();self.wfile.write(b'(function(){'+(root/'main.js').read_bytes()+b'\n})();')
  else:super().do_GET()
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',18088),Handler).serve_forever()
