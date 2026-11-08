
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
old = """  }, [massing]);

  useEffect(
    () => () => {
      for (const item of districtMeshes) item.geometry.dispose();"""
new = """  }, [massing]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__worldMassing = massingRef.current;
    (window as unknown as Record<string, unknown>).__worldMassingData = massing;
  }, [massing]);

  useEffect(
    () => () => {
      for (const item of districtMeshes) item.geometry.dispose();"""
assert old in s
p.write_text(s.replace(old,new))
print('patched')
