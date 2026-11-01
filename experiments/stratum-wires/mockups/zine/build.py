# Inline the shots (local/*.webp) into page.html -> local/spall-zine.html, one self-contained file.
import base64, re, pathlib
here = pathlib.Path(__file__).parent
src = (here / 'page.html').read_text()
def sub(m):
    p = here / 'local' / m.group(1)
    return 'data:image/webp;base64,' + base64.b64encode(p.read_bytes()).decode()
out = re.sub(r'IMG:([\w.]+)', sub, src)
(here / 'local' / 'spall-zine.html').write_text(out)
print(len(out) // 1024, 'KB')
