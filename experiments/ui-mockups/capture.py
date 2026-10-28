"""capture.py - screenshot every src/m*.html with headless Google Chrome into out/ (2560 x 1440).

    python3 capture.py            # all mock-ups
    python3 capture.py m1 m4      # just these
"""
import glob, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 2560, 1440


def shoot(html):
    name = os.path.splitext(os.path.basename(html))[0]
    out = os.path.join(HERE, 'out', name + '.png')
    cmd = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
           '--allow-file-access-from-files', '--window-size=%d,%d' % (W, H), '--virtual-time-budget=6000',
           '--screenshot=' + out, 'file://' + html]
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok = os.path.exists(out) and 'written' in (r.stdout + r.stderr)
    print(('ok   ' if ok else 'FAIL ') + out)
    return out


if __name__ == '__main__':
    want = sys.argv[1:]
    for f in sorted(glob.glob(os.path.join(HERE, 'src', 'm*.html'))):
        base = os.path.basename(f)
        if want and not any(base.startswith(w) for w in want):
            continue
        shoot(f)
