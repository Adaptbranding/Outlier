#!/usr/bin/env python3
"""Put a page behind a password, or open a locked page for editing.

The repository is public, so a private page is published only in encrypted form: its HTML and script are
encrypted with AES-256-GCM under a key derived from the password (PBKDF2-SHA256), and the page decrypts
them in the browser when the right password is entered. Never commit the plaintext.

Lock (build the page):
  python3 tools/lock_page.py lock --html SRC/content.html --js SRC/app.js \
      --title "Page title | Outlier" --password PASSWORD --out flip/index.html

Unlock (get the plaintext back to edit it, outside the repository):
  python3 tools/lock_page.py unlock flip/index.html --password PASSWORD --out-dir /tmp/flip-src

Changing the password: unlock with the old one, lock again with the new one.
Needs: pip install cryptography
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITERATIONS = 600_000
HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, 'locked_page_template.html')
PAYLOAD_RE = re.compile(r'(<script type="application/json" id="locked">)(.*?)(</script>)', re.S)


def b64(b):
    return base64.b64encode(b).decode('ascii')


def derive(password, salt, iterations):
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen=32)


def lock(args):
    with open(args.html, encoding='utf-8') as f:
        html = f.read()
    with open(args.js, encoding='utf-8') as f:
        js = f.read()
    plain = json.dumps({'title': args.title, 'html': html, 'js': js}, ensure_ascii=False).encode('utf-8')
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(derive(args.password, salt, ITERATIONS)).encrypt(iv, plain, None)
    box = json.dumps({'v': 1, 'kdf': 'PBKDF2-SHA256', 'iter': ITERATIONS, 'salt': b64(salt), 'iv': b64(iv), 'ct': b64(ct)})
    with open(TEMPLATE, encoding='utf-8') as f:
        page = f.read()
    if page.count('__PAYLOAD__') != 1:
        sys.exit('template must contain __PAYLOAD__ exactly once')
    page = page.replace('__PAYLOAD__', box)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        f.write(page)
    # Check the result opens with the password before reporting success.
    got = open_page(args.out, args.password)
    assert got['html'] == html and got['js'] == js
    print(f'locked {args.out}: {len(plain):,} bytes of content, {len(page):,} bytes written')


def open_page(path, password):
    with open(path, encoding='utf-8') as f:
        m = PAYLOAD_RE.search(f.read())
    if not m:
        sys.exit(f'{path}: no locked payload found')
    box = json.loads(m.group(2))
    key = derive(password, base64.b64decode(box['salt']), int(box['iter']))
    try:
        plain = AESGCM(key).decrypt(base64.b64decode(box['iv']), base64.b64decode(box['ct']), None)
    except Exception:
        sys.exit('wrong password')
    return json.loads(plain)


def unlock(args):
    page = open_page(args.page, args.password)
    os.makedirs(args.out_dir, exist_ok=True)
    for name, key in (('content.html', 'html'), ('app.js', 'js')):
        with open(os.path.join(args.out_dir, name), 'w', encoding='utf-8') as f:
            f.write(page[key])
    with open(os.path.join(args.out_dir, 'title.txt'), 'w', encoding='utf-8') as f:
        f.write(page.get('title', '') + '\n')
    print(f'unlocked into {args.out_dir}: content.html, app.js, title.txt')


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('lock')
    a.add_argument('--html', required=True)
    a.add_argument('--js', required=True)
    a.add_argument('--title', required=True)
    a.add_argument('--password', required=True)
    a.add_argument('--out', required=True)
    a.set_defaults(fn=lock)
    b = sub.add_parser('unlock')
    b.add_argument('page')
    b.add_argument('--password', required=True)
    b.add_argument('--out-dir', required=True)
    b.set_defaults(fn=unlock)
    args = p.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
