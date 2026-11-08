
from pathlib import Path
p=Path('astro.config.mjs')
s=p.read_text()
s=s.replace("""  integrations: [react()],""","""  integrations: [react()],
  // The immersive HUD occupies the bottom of the viewport; the dev toolbar
  // overlaps its controls and intercepts pointer events in end-to-end tests.
  devToolbar: { enabled: false },""")
p.write_text(s)
print(s)
