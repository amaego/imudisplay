"""Serve this folder on http://127.0.0.1:<port> and open it in the browser.

    python serve.py          # port 8000
    python serve.py 8001     # another port
    python serve.py --demo   # open with simulated data
"""
import functools
import http.server
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".obj": "text/plain"}

    def log_message(self, fmt, *args):   # keep the console quiet, only show errors
        if args and str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


def main():
    args = sys.argv[1:]
    port = next((int(a) for a in args if a.isdigit()), 8000)
    url = f"http://127.0.0.1:{port}/" + ("?demo" if "--demo" in args else "")

    socketserver.TCPServer.allow_reuse_address = False
    try:
        httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(HERE)))
    except OSError as e:
        sys.exit(f"Port {port} is not available ({e}). Try another one: python serve.py {port + 1}")

    print(f"IMU Display running at {url}")
    print("Open it in Chrome or Edge. Press Ctrl+C to stop.")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    with httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
