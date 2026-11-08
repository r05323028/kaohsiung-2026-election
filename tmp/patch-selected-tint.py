
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace("                  ? '#e7bda3'", "                  ? '#f1d5b0'")
s = s.replace("opacity={selected ? 0.24 : hovered ? 0.38 : districtsOpacity}", "opacity={selected ? 0.18 : hovered ? 0.35 : districtsOpacity}")
p.write_text(s)
print('patched selected tint')
