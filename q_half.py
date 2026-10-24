# -*- coding: utf-8 -*-
# 分段法：mundaneScore 函数体（97-328）切 8 段，每段前后补完整上下文试编译
# 每段 = 提取行 [s, e)，包进 function __t(){ <段> } 补 } 使独立可编译；OK 段=配平，FAIL 段=问题区
import subprocess
src = open(r'D:\一个电脑软件\星盘引擎子件\engine\core\mundane.js', encoding='utf-8').read().split('\n')
body = src[96:328]  # 97-328 行（0-index 96-327）
segs = [(0, 40), (40, 80), (80, 120), (120, 160), (160, 200), (200, 232), (232, 232+45), (232+45, len(body))]
for si, (a, b) in enumerate(segs):
    chunk = body[a:b]
    # 补 } 数量 = 段内未闭 { 数（粗算：数 { } 差）
    code = 'function __t() {\n' + '\n'.join(chunk) + '\n}'
    open(r'D:\一个电脑软件\星盘引擎子件\_tmp.js', 'w', encoding='utf-8').write(code)
    r = subprocess.run(['node', '--check', r'D:\一个电脑软件\星盘引擎子件\_tmp.js'], capture_output=True, text=True)
    err = ''
    if r.returncode:
        # 尝试补更多 } 直到 OK 或 10 个
        for k in range(1, 15):
            open(r'D:\一个电脑软件\星盘引擎子件\_tmp.js', 'w', encoding='utf-8').write(code + '}' * k)
            r2 = subprocess.run(['node', '--check', r'D:\一个电脑软件\星盘引擎子件\_tmp.js'], capture_output=True, text=True)
            if r2.returncode == 0:
                err = f'补{k}个右花括号OK'
                break
        else:
            err = '补15个}仍FAIL'
    else:
        err = '直接OK'
    print(f'seg{si} 行{97+a}-{97+b-1} {err}')
