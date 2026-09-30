#!/usr/bin/env python3
"""Minimal standard-library static server for the portable viewer."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.gz': 'application/octet-stream', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

def main():
    p=argparse.ArgumentParser(); p.add_argument('--port',type=int,default=8879); p.add_argument('--host',default='127.0.0.1'); p.add_argument('--open',action='store_true'); a=p.parse_args()
    root=Path(__file__).resolve().parent
    import os; os.chdir(root)
    try:
        server=ThreadingHTTPServer((a.host,a.port),Handler)
    except OSError as exc:
        raise SystemExit(f'Cannot listen on {a.host}:{a.port}: {exc}. Try --port 8880.')
    print(f'Open http://{a.host}:{server.server_port}',flush=True)
    print('Static files only. Keep this terminal open; Ctrl+C stops the server.',flush=True)
    if a.open:
        import webbrowser
        webbrowser.open(f'http://{a.host}:{server.server_port}')
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
if __name__=='__main__': main()
