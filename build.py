# Junta src/index.html + src/js/*.js num único index.html (o app inteiro, pronto pro Cloudflare Pages).
import re, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
order = ['state', 'media', 'layouts', 'compositor', 'background', 'recorder', 'highlights', 'pip', 'settings', 'ui', 'main']
out = []
for m in order:
    src = open(f'src/js/{m}.js').read()
    names = re.findall(r'^export (?:async )?(?:function|class|const|let) ([\w$]+)', src, re.M)
    def imp(mm):
        what, mod = mm.group(1).strip(), mm.group(2)
        if what.startswith('* as'):
            return f'const {what[5:].strip()} = mod_{mod};'
        return f'const {what} = mod_{mod};'
    src = re.sub(r"^import (.+?) from '\./(\w+)\.js';", imp, src, flags=re.M)
    src = re.sub(r'^export ', '', src, flags=re.M)
    if m == 'main':
        out.append(f'(() => {{\n{src}\n}})();')
    else:
        out.append(f'const mod_{m} = (() => {{\n{src}\nreturn {{ {", ".join(names)} }};\n}})();')
h = open('src/index.html').read().replace('<script type="module" src="js/main.js"></script>', '<script>\n' + '\n\n'.join(out) + '\n</script>')
open('index.html', 'w').write(h)
