import pypdf, io, sys

r = pypdf.PdfReader(r'src\The False Knight\The False Knight Script.pdf')
out = []
for i, p in enumerate(r.pages):
    try:
        t = p.extract_text() or ''
    except Exception as e:
        t = '[ERROR: %s]' % e
    out.append('===== PAGE %d =====\n%s' % (i + 1, t))

with io.open(r'src\The False Knight\_script.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out))
print('done', len(r.pages))
