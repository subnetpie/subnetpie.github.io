"""Serve the viewer locally, optionally preloading one PAL/FSQ pair without copying it."""
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--pal', type=Path)
parser.add_argument('--fsq', type=Path)
parser.add_argument('--port', type=int, default=8767)
args = parser.parse_args()
pair = {'pal': args.pal, 'fsq': args.fsq}
for path in pair.values():
    if path and not path.is_file():
        parser.error('Input file does not exist: ' + str(path))

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/__local__/manifest.json':
            if not all(pair.values()):
                return self.send_error(404)
            data = json.dumps([{'name': 'pin2dmd.'+ext, 'url': '/__local__/'+ext} for ext in pair]).encode()
            return self.reply(data, 'application/json')
        if path.startswith('/__local__/'):
            file = pair.get(path.rsplit('/', 1)[-1])
            if not file:
                return self.send_error(404)
            return self.reply(file.read_bytes(), 'application/octet-stream')
        return super().do_GET()

    def reply(self, data, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

root = Path(__file__).resolve().parent / 'dist'
print(f'Local: http://127.0.0.1:{args.port}/' + ('?localPair=1' if all(pair.values()) else ''), flush=True)
ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root))).serve_forever()
