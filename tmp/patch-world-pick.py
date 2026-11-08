
from pathlib import Path
p = Path('src/components/WorldLayer.tsx')
s = p.read_text()
s = s.replace("  const { scene } = useThree();", "  const { scene, camera, size } = useThree();")
old = """    (window as unknown as Record<string, unknown>).__worldScene = scene;"""
new = """    (window as unknown as Record<string, unknown>).__worldScene = scene;
    (window as unknown as Record<string, unknown>).__worldPick = (x: number, y: number) => {
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(
        new THREE.Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1),
        camera,
      );
      return raycaster.intersectObjects(scene.children, true).slice(0, 10).map((hit) => {
        const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
        return {
          name: hit.object.name,
          type: hit.object.type,
          geometry: hit.object.geometry?.type,
          color: material?.color?.getHexString?.(),
          point: hit.point.toArray(),
          distance: hit.distance,
          instanceId: hit.instanceId,
        };
      });
    };"""
assert old in s
p.write_text(s.replace(old,new))
print('patched pick')
