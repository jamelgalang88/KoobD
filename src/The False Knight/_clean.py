import io, re

with io.open(r'src\The False Knight\_script.txt', 'r', encoding='utf-8') as f:
    raw = f.read()

pages = re.split(r'===== PAGE (\d+) =====', raw)
# pages: ['', '1', content1, '2', content2, ...]
out = []
i = 1
while i < len(pages):
    num = pages[i]
    body = pages[i + 1]
    words = [w for w in body.split('\n')]
    joined = ' '.join(w.strip() for w in words if w.strip())
    joined = re.sub(r'\s+', ' ', joined)
    out.append('===== PAGE %s =====\n%s\n' % (num, joined))
    i += 2

with io.open(r'src\The False Knight\_script_clean.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done')
