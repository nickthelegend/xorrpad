#!/usr/bin/env python3
"""A real raw PTY pair for serialport tests; relays bytes without parsing them."""
import json
import os
import pty
import selectors
import tty

masters = []
slaves = []
for _ in range(2):
    master, slave = pty.openpty()
    tty.setraw(slave)
    masters.append(master)
    slaves.append(slave)
print(json.dumps([os.ttyname(s) for s in slaves]), flush=True)
selector = selectors.DefaultSelector()
for i, master in enumerate(masters):
    selector.register(master, selectors.EVENT_READ, masters[1-i])
while True:
    for key, _ in selector.select():
        data = os.read(key.fd, 4096)
        if not data:
            raise SystemExit(0)
        while data:
            written = os.write(key.data, data)
            data = data[written:]
