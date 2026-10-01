#!/usr/bin/env python3
"""Download Debian packages from an apt repository and extract them into a directory (no root needed)."""
import argparse
import lzma
import os
import subprocess
import sys
import urllib.request


def fetch(url, path):
    if os.path.exists(path):
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    print(f'  downloading {url}', flush=True)
    with urllib.request.urlopen(url, timeout=120) as response, open(path + '.part', 'wb') as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
    os.replace(path + '.part', path)
    return path


def parse_index(data):
    packages = {}
    for stanza in data.split('\n\n'):
        fields = dict(line.split(': ', 1) for line in stanza.splitlines() if ': ' in line and not line.startswith(' '))
        if 'Package' in fields and 'Filename' in fields:
            packages[fields['Package']] = fields
    return packages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True, help='repository base URL, e.g. https://deb.debian.org/debian')
    parser.add_argument('--index', required=True, help='index path below the repo, e.g. dists/trixie/main/binary-amd64/Packages.xz')
    parser.add_argument('--cache', required=True)
    parser.add_argument('--dest', required=True)
    parser.add_argument('packages', nargs='+')
    args = parser.parse_args()

    index_path = fetch(f'{args.repo}/{args.index}', os.path.join(args.cache, args.repo.split('//')[1].replace('/', '_') + '_' + os.path.basename(args.index)))
    raw = open(index_path, 'rb').read()
    packages = parse_index((lzma.decompress(raw) if index_path.endswith('.xz') else raw).decode())
    missing = [name for name in args.packages if name not in packages]
    if missing:
        sys.exit(f'Packages not found in {args.repo}: {", ".join(missing)}')
    os.makedirs(args.dest, exist_ok=True)
    for name in args.packages:
        info = packages[name]
        deb = fetch(f'{args.repo}/{info["Filename"]}', os.path.join(args.cache, os.path.basename(info['Filename'])))
        print(f'  extracting {name} {info["Version"]}', flush=True)
        subprocess.run(['dpkg-deb', '-x', deb, args.dest], check=True)


if __name__ == '__main__':
    main()
