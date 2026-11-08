
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace(
    "function WorldLabels({",
    "const OVERVIEW_LABELS = new Set([\n  '左營',\n  '楠梓',\n  '鼓山',\n  '三民',\n  '鳳山',\n  '小港',\n  '岡山',\n  '旗山',\n  '美濃',\n]);\n\nfunction WorldLabels({",
)
s = s.replace(
    "  if (size.width < 600 || focusRadius > 34 || focusRadius < 8) return null;",
    "  if (size.width < 600 || focusRadius < 8) return null;\n  const overview = focusRadius > 34;",
)
s = s.replace(
    "        const active =\n          district.id === selectedAdminId || district.id === hoveredAdminId;\n        if (!active && focusRadius > 10 && (district.areaKm2 ?? 0) < 6) {\n          return null;\n        }",
    "        const active =\n          district.id === selectedAdminId || district.id === hoveredAdminId;\n        if (overview && !active && !OVERVIEW_LABELS.has(district.shortName)) {\n          return null;\n        }\n        if (!active && focusRadius > 10 && (district.areaKm2 ?? 0) < 6) {\n          return null;\n        }",
)
p.write_text(s)
print('overview labels')
