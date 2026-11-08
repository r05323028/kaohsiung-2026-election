
from pathlib import Path
p = Path('src/city/layout.ts')
s = p.read_text()
needle = "  plaza(b, { x: 0.6, z: 5.3, width: 5.2, depth: 4.6, detail });"
assert needle in s
s = s.replace(
    needle,
    needle + "\n\n  // Candidate walking loop: plaza, pond east shore, park edge, then back.\n  footpath(\n    b,\n    [\n      [0.6, 5.8],\n      [-2.3, 5.8],\n      [-2.3, -8.8],\n      [2.0, -8.8],\n      [2.0, -1.0],\n      [0.6, 1.0],\n      [0.6, 5.8],\n    ],\n    0.34,\n    'stone',\n  );",
)
p.write_text(s)
print('walking loop path')
