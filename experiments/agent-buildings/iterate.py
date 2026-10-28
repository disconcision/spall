"""
iterate.py - the authoring loop, with an append-only log (log/iterations.jsonl).

    python3 iterate.py check  <id> <draft>                  # validate specs/drafts/<id>.<draft>.json (+ logic/<id>.json)
    python3 iterate.py render <id> <draft>                  # quick concept + sprite r0/r1 -> out/iter/
    python3 iterate.py look   <id> <draft> "<what I saw>" --issues a,b --verdict accept|revise
    python3 iterate.py final  <id> <draft>                  # copy an accepted draft to specs/<id>.json

Every call appends one JSON line, so validator iterations, visual iterations and mistake categories can be counted
afterwards (stats.py).
"""
import json, os, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, 'log', 'iterations.jsonl')
BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'


def append(rec):
    rec['t'] = time.strftime('%Y-%m-%d %H:%M:%S')
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, 'a') as fh:
        fh.write(json.dumps(rec) + '\n')


def draft_path(bid, draft):
    return os.path.join(HERE, 'specs', 'drafts', '%s.%s.json' % (bid, draft))


def do_check(bid, draft):
    import check
    lp = os.path.join(HERE, 'logic', bid + '.json')
    res = check.run(draft_path(bid, draft), lp if os.path.exists(lp) else None)
    txt = check.fmt(res)
    print(txt)
    with open(os.path.join(HERE, 'log', '%s.%s.check.txt' % (bid, draft)), 'w') as fh:
        fh.write(txt + '\n')
    spec = json.load(open(draft_path(bid, draft)))
    append(dict(kind='check', id=bid, draft=draft, n_parts=len(spec['parts']), pass_=res['pass_'],
                stock_pass=res['stock']['pass_'], stock_errors=len(res['stock']['errors']),
                stock_context_errors=res['stock']['context_errors'], errors=len(res['errors']), warnings=len(res['warnings']),
                categories=res['categories'], error_text=res['errors'], warning_text=res['warnings']))
    return res['pass_']


def do_render(bid, draft):
    subprocess.run([sys.executable, 'make_jobs.py', 'iter', bid, draft], cwd=HERE, check=True)
    t0 = time.time()
    p = subprocess.run([BLENDER, '--background', '--factory-startup', '--python', 'kitx.py', '--', '--jobs',
                        'jobs/iter_%s.json' % bid], cwd=HERE, capture_output=True, text=True)
    lines = [l for l in p.stdout.splitlines() if 'rendered' in l or 'Error' in l or 'Traceback' in l or 'failed' in l]
    print('\n'.join(lines))
    if p.returncode:
        print(p.stdout[-3000:], p.stderr[-3000:])
    append(dict(kind='render', id=bid, draft=draft, seconds=round(time.time() - t0, 1), ok=p.returncode == 0))


def do_look(bid, draft, text, issues, verdict):
    append(dict(kind='look', id=bid, draft=draft, text=text, issues=issues, verdict=verdict))
    print('logged look:', bid, draft, verdict, issues)


if __name__ == '__main__':
    cmd, bid, draft = sys.argv[1], sys.argv[2], sys.argv[3]
    if cmd == 'check':
        sys.exit(0 if do_check(bid, draft) else 1)
    elif cmd == 'render':
        do_render(bid, draft)
    elif cmd == 'look':
        text = sys.argv[4]
        a = sys.argv[5:]
        issues = a[a.index('--issues') + 1].split(',') if '--issues' in a else []
        verdict = a[a.index('--verdict') + 1] if '--verdict' in a else 'revise'
        do_look(bid, draft, text, issues, verdict)
    elif cmd == 'final':
        src = draft_path(bid, draft)
        dst = os.path.join(HERE, 'specs', bid + '.json')
        spec = json.load(open(src))
        spec['meta']['accepted_from'] = '%s.%s' % (bid, draft)
        with open(dst, 'w') as fh:
            json.dump(spec, fh, indent=1)
        append(dict(kind='final', id=bid, draft=draft))
        print('accepted', src, '->', dst)
