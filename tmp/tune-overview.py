
from pathlib import Path
p = Path('src/world/summary.ts')
s = p.read_text()
s = s.replace("    radius: Math.max(width, height) * 0.56,", "    radius: Math.max(width, height) * 0.28,")
p.write_text(s)
p = Path('src/components/CityScene.tsx')
s = p.read_text()
s = s.replace("    const endZoom = Math.max(\n      10,\n", "    const endZoom = Math.max(\n      3.2,\n")
p.write_text(s)
print('overview framing tuned')
