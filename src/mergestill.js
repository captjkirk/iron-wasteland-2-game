// Fewer draws for things that never move (lane E, November 16, 2026: a frame in the Bog asked the graphics chip for up to
// 3,600 separate draws, and each cave mouth, tent and fire ring was ten to twenty of them). mergeStill(group) joins the
// group's still meshes that share one solid material and the same shadow settings into a single mesh: the same triangles in
// the same places, drawn at once. Left as they are: see-through or glowing-additive materials (each is sorted by its own
// distance, and a merge would change their order), anything with a name (something may look it up), anything with
// children, and nested groups other than plain unnamed holders of meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(),
  _c = new THREE.Vector3();
const plainDraw = THREE.Object3D.prototype.onBeforeRender;

// a solid, single-material, childless mesh with nothing else hanging on it
function isStill(o) {
  const m = o.material;
  return (
    o.isMesh &&
    !o.isSkinnedMesh &&
    !o.isInstancedMesh &&
    !o.name &&
    o.visible &&
    !o.children.length &&
    o.onBeforeRender === plainDraw &&
    !Array.isArray(m) &&
    !m.transparent &&
    m.depthWrite &&
    m.blending === THREE.NormalBlending &&
    !Object.keys(o.geometry.morphAttributes).length
  );
}

// a plain unnamed group (as a log's holder is), whose meshes may join the merge
function isHolder(o) {
  return o.type === 'Group' && !o.name && o.visible && !Object.keys(o.userData).length && o.children.every(isStill);
}

// what must match for two meshes to share one draw
function bucketOf(o) {
  const g = o.geometry;
  return [
    o.material.uuid,
    o.castShadow,
    o.receiveShadow,
    o.renderOrder,
    o.frustumCulled,
    o.layers.mask,
    o.customDepthMaterial?.uuid,
    o.customDistanceMaterial?.uuid,
    JSON.stringify(o.userData),
    Object.keys(g.attributes)
      .sort()
      .map((n) => n + g.attributes[n].itemSize + g.attributes[n].normalized + g.attributes[n].array.constructor.name)
      .join(','),
  ].join('|');
}

// the mesh's place relative to the group (through a holder when it has one)
function placeIn(o, group) {
  if (o.matrixAutoUpdate) o.updateMatrix();
  _m.copy(o.matrix);
  if (o.parent !== group) {
    if (o.parent.matrixAutoUpdate) o.parent.updateMatrix();
    _m.premultiply(o.parent.matrix);
  }
  return _m;
}

// one mesh from many: each geometry copied into the group's frame, less the pieces' middle (so the numbers stay small)
function join(group, list) {
  const indexed = list.every((o) => o.geometry.index);
  _c.set(0, 0, 0);
  for (const o of list) _c.add(new THREE.Vector3().setFromMatrixPosition(placeIn(o, group)));
  _c.divideScalar(list.length);
  const back = new THREE.Matrix4().makeTranslation(-_c.x, -_c.y, -_c.z);
  const geos = list.map((o) => {
    const g = indexed || !o.geometry.index ? o.geometry.clone() : o.geometry.toNonIndexed();
    return g.applyMatrix4(placeIn(o, group).premultiply(back));
  });
  const geo = mergeGeometries(geos);
  if (!geo) return;
  const first = list[0],
    mesh = new THREE.Mesh(geo, first.material);
  mesh.position.copy(_c);
  for (const k of [
    'castShadow',
    'receiveShadow',
    'renderOrder',
    'frustumCulled',
    'customDepthMaterial',
    'customDistanceMaterial',
  ])
    mesh[k] = first[k];
  mesh.layers.mask = first.layers.mask;
  mesh.userData = { ...first.userData };
  for (const o of list) {
    const holder = o.parent;
    o.removeFromParent();
    if (holder !== group && !holder.children.length) holder.removeFromParent();
  }
  group.add(mesh);
}

export function mergeStill(group) {
  const buckets = new Map();
  const take = (o) => {
    const k = bucketOf(o);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(o);
  };
  for (const o of group.children)
    if (isStill(o)) take(o);
    else if (isHolder(o)) o.children.forEach(take);
  for (const list of buckets.values()) if (list.length > 1) join(group, list);
  return group;
}
