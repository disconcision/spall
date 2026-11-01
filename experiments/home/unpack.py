#!/usr/bin/env python3
"""Unpack a built report page (one file, media inlined as base64 data: URIs) into a page plus media files,
so it can live in git and on the published site: <dest>/<name>.html with its media in <dest>/media/.

    python3 home/unpack.py <page.html> <dest dir>

Media files are named by content hash, so pages unpacked into the same folder share identical images.
Built pages stay in local/; this is how they reach the repo. Re-run it after rebuilding a page.
"""
import base64, hashlib, pathlib, re, sys

EXT = {'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg',
       'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'font/woff2': 'woff2'}
DATA = re.compile(r'data:([a-z]+/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)')


def main(src, dest):
    src, dest = pathlib.Path(src), pathlib.Path(dest)
    (dest / 'media').mkdir(parents=True, exist_ok=True)
    seen = {}

    def sub(m):
        mime, payload = m.groups()
        if mime not in EXT:
            return m.group(0)
        raw = base64.b64decode(payload)
        name = 'media/%s.%s' % (hashlib.sha1(raw).hexdigest()[:12], EXT[mime])
        if name not in seen:
            (dest / name).write_bytes(raw)
            seen[name] = len(raw)
        return name

    page = DATA.sub(sub, src.read_text(encoding='utf-8'))
    # pages written as claude.ai artifacts are fragments (no doctype or charset); a browser would read them as Latin-1
    if not re.match(r'\s*<!doctype', page, re.I):
        page = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
                '</head><body style="margin:0">\n' + page + '\n</body></html>\n')
    (dest / src.name).write_text(page, encoding='utf-8')
    print('%s: %d KB page, %d media files, %d KB' % (dest / src.name, len(page) // 1024, len(seen), sum(seen.values()) // 1024))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(*sys.argv[1:])
