# Lector de Overture Maps por HTTP con pedidos de rango (sin DuckDB).
import io, os, re, sys, json, threading
import requests
import pyarrow.parquet as pq
from concurrent.futures import ThreadPoolExecutor

BASE = "https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com"
REL = "release/2026-09-23.1"
S = requests.Session()

def list_keys(prefix):
    keys, token = [], None
    while True:
        url = f"{BASE}/?list-type=2&prefix={prefix}" + (f"&continuation-token={requests.utils.quote(token)}" if token else "")
        t = S.get(url, timeout=60).text
        keys += re.findall(r"<Key>([^<]*)</Key>", t)
        m = re.search(r"<NextContinuationToken>([^<]*)</NextContinuationToken>", t)
        if not m: break
        token = m.group(1)
    return [k for k in keys if k.endswith('.parquet') or 'part-' in k]

class HttpFile(io.RawIOBase):
    BLOCK = 1 << 20
    def __init__(self, key):
        self.url = f"{BASE}/{key}"
        r = S.head(self.url, timeout=60)
        self.size = int(r.headers['Content-Length'])
        self.pos = 0
        self.cache = {}
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def _get(self, start, end):
        r = S.get(self.url, headers={"Range": f"bytes={start}-{end-1}"}, timeout=120)
        return r.content
    def read(self, n=-1):
        if n < 0: n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        if n == 0: return b""
        data = self._get(self.pos, self.pos + n) if n > self.BLOCK else self._cached(self.pos, n)
        self.pos += n
        return data
    def _cached(self, pos, n):
        out = b""
        while n > 0:
            b = pos // self.BLOCK
            if b not in self.cache:
                s = b * self.BLOCK
                self.cache[b] = self._get(s, min(self.size, s + self.BLOCK))
            chunk = self.cache[b][pos - b * self.BLOCK: pos - b * self.BLOCK + n]
            out += chunk
            pos += len(chunk)
            n -= len(chunk)
        return out
    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)

def stats_ok(md, rg, bbox):
    xmin, ymin, xmax, ymax = bbox
    r = md.row_group(rg)
    cols = {r.column(j).path_in_schema: r.column(j).statistics for j in range(r.num_columns)}
    try:
        return not (cols['bbox.xmin'].min > xmax or cols['bbox.xmax'].max < xmin or cols['bbox.ymin'].min > ymax or cols['bbox.ymax'].max < ymin)
    except Exception:
        return True

def query(theme_type, bbox, columns, workers=16):
    keys = list_keys(f"{REL}/{theme_type}/")
    print(theme_type, len(keys), 'archivos', file=sys.stderr)
    hits = []
    lock = threading.Lock()
    def scan(key):
        f = HttpFile(key)
        pf = pq.ParquetFile(f)
        md = pf.metadata
        rgs = [i for i in range(md.num_row_groups) if stats_ok(md, i, bbox)]
        if rgs:
            with lock: hits.append((key, rgs))
    with ThreadPoolExecutor(workers) as ex: list(ex.map(scan, keys))
    print('coinciden', [(k.split('/')[-1][:30], r) for k, r in hits], file=sys.stderr)
    rows = []
    for key, rgs in hits:
        pf = pq.ParquetFile(HttpFile(key))
        for i in rgs:
            t = pf.read_row_group(i, columns=columns + ['bbox'])
            for row in t.to_pylist():
                b = row['bbox']
                if b['xmin'] > bbox[2] or b['xmax'] < bbox[0] or b['ymin'] > bbox[3] or b['ymax'] < bbox[1]: continue
                rows.append(row)
    return rows
