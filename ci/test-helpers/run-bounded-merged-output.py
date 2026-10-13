"""Exercise native merged sinks and independent regular-file open descriptions."""
import json
import os
import socket
import subprocess
import sys
import tempfile

script, mode = sys.argv[1:]
command = 'import os; os.write(1, b"a" * 1048576); os.write(2, b"Z"); raise SystemExit(3)'
with tempfile.TemporaryDirectory(prefix='bounded-merged-') as directory:
    if mode == 'independent-files':
        path = directory + '/output'
        with open(path, 'w+b') as out, open(path, 'r+b') as err:
            err.seek(1048576)
            proc = subprocess.Popen([sys.executable, script, '5', sys.executable, '-c', command],
                                    stdout=out, stderr=err)
            status = proc.wait()
            positions = [out.tell(), err.tell()]
        data = open(path, 'rb').read()
    elif mode == 'regular':
        path = directory + '/output'
        with open(path, 'w+b') as target:
            proc = subprocess.Popen([sys.executable, script, '5', sys.executable, '-c', command],
                                    stdout=target, stderr=target)
            status = proc.wait()
        data = open(path, 'rb').read()
        positions = None
    else:
        if mode == 'socket':
            reader, writer = socket.socketpair()
            writer.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1024)
            read_fd, write_fd = reader.fileno(), writer.fileno()
        else:
            read_fd, write_fd = os.pipe()
        proc = None
        try:
            proc = subprocess.Popen([sys.executable, script, '5', sys.executable, '-c', command],
                                    stdout=write_fd, stderr=write_fd)
            if mode == 'socket':
                writer.close()
            else:
                os.close(write_fd)
            chunks = []
            while chunk := os.read(read_fd, 128):
                chunks.append(chunk)
            data = b''.join(chunks)
            status = proc.wait()
            positions = None
        finally:
            if mode == 'socket':
                reader.close()
                writer.close()
            else:
                os.close(read_fd)
            if proc is not None:
                proc.wait()
    print(json.dumps(dict(status=status, length=len(data), marker=data.find(b'Z'),
                          allBytes=data == b'a' * 1048576 + b'Z', positions=positions)))
