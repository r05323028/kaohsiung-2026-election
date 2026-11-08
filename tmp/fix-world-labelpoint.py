
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace('lonLatToWorld(district.labelPoint)', 'lonLatToWorld(district.labelPoint[0], district.labelPoint[1])')
p.write_text(s)
print('patched')
