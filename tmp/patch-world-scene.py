
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
old = """  const cursor = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);"""
new = """  const { scene } = useThree();
  const cursor = useRef(false);
  const drag = useRef<{ x: number; y: number } | null>(null);"""
assert old in s
s = s.replace(old,new)
old2 = """    (window as unknown as Record<string, unknown>).__worldMassing = massingRef.current;
    (window as unknown as Record<string, unknown>).__worldMassingData = massing;"""
new2 = """    (window as unknown as Record<string, unknown>).__worldMassing = massingRef.current;
    (window as unknown as Record<string, unknown>).__worldMassingData = massing;
    (window as unknown as Record<string, unknown>).__worldScene = scene;"""
assert old2 in s
p.write_text(s.replace(old2,new2))
print('patched scene')
