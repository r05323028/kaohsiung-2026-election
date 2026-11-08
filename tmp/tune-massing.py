
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace(
"  urban: ['#f0e2c6', '#e8d2ae', '#d7dfc9', '#ecc9a7', '#d9d4c8'],\n  coastal: ['#eadcc1', '#d8d1bc', '#cfd9cf', '#e2c9b0'],\n  hill: ['#d8d8c1', '#c8d2b8', '#dfd2b9'],\n  mountain: ['#b9c6a8', '#c7cfb4'],",
"  urban: ['#dbc7a2', '#c9b48f', '#b7c4a5', '#d8b48e', '#c7c0ae'],\n  coastal: ['#d2c3a4', '#bfb9a3', '#b8c6b8', '#c9ad94'],\n  hill: ['#c3c4a9', '#b1bfa0', '#c9bda2'],\n  mountain: ['#a8b797', '#b5c0a0'],",
)
s = s.replace(
"          ? overview\n            ? 26\n            : 48\n          : district.terrain === 'coastal'\n            ? overview\n              ? 16\n              : 26\n            : district.terrain === 'hill'\n              ? overview\n                ? 10\n                : 16\n              : overview\n                ? 4\n                : 8;",
"          ? overview\n            ? 96\n            : 48\n          : district.terrain === 'coastal'\n            ? overview\n              ? 42\n              : 26\n            : district.terrain === 'hill'\n              ? overview\n                ? 22\n                : 16\n              : overview\n                ? 7\n                : 8;",
)
p.write_text(s)
print('world massing tuned')
