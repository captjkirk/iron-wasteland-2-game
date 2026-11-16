// Procedural legs for the built creatures (slice 19). A foot that bears weight stays planted on the ground where it
// landed (so it never slides), and when its turn comes it lifts and swings in an arc to the next foothold, placed ahead
// along the way the body is going; a two-bone IK bends each leg between hip and foot. The gait's phase advances with
// the distance travelled (stride by stride), not with time, so the step rate always matches the ground speed. At rest,
// feet left out of place step back under the body one by one.
//
// Every joint is an Object3D with no rotation at rest (a segment's rest direction is its child's offset); the leg is
// { upper (hip joint), lower (knee joint, a child of upper), end (Vector3: the ankle in lower's space), foot? (Object3D
// at the ankle, kept level), home (Vector3: the ankle's rest point in creature space), pole (Vector3: the way the knee
// points, creature space), off (phase offset 0..1), lift (step height, m) }.
import * as THREE from 'three';

const V = () => new THREE.Vector3(),
  Qt = () => new THREE.Quaternion(),
  _e = new THREE.Euler();
const _a = V(),
  _b = V(),
  _c = V(),
  _d = V(),
  _h = V(),
  _k = V(),
  _t = V(),
  _p = V(),
  _q0 = Qt(),
  _q1 = Qt(),
  _q2 = Qt(),
  _q3 = Qt(),
  _m = new THREE.Matrix4();

export class Legs {
  // root: the creature's top Object3D (the one the game places); body: the Object3D the legs hang from (for the scale)
  constructor(root, legs, { stride = 1.2, duty = 0.65, settle = 1.6, ground = null } = {}) {
    Object.assign(this, {
      root,
      legs,
      stride,
      duty,
      settle,
      ph: Math.random(),
      vel: V(),
      last: null,
      ground,
      moving: 0,
      planted: true,
    });
    for (const L of legs) {
      L.a = L.lower.position.length();
      L.b = L.end.length();
      L.plant = V();
      L.from = V();
      L.cur = V();
      L.swing = false;
      L.liftT = 0;
      L.pitch = 0;
      L.fresh = true;
      L.contact = 1;
    }
  }
  gy(x, z, fallback) {
    return this.ground ? this.ground(x, z) : fallback;
  }
  // the world point a leg's foot rests at with the body where it is now, led by `lead` seconds of travel
  homeW(L, out, lead = 0) {
    out.copy(L.home).applyMatrix4(this.root.matrixWorld);
    out.addScaledVector(this.vel, lead);
    out.y = this.gy(out.x, out.z, this.root.position.y) + L.home.y * this.sc;
    return out;
  }
  // advance the gait: speed in m/s (world), gait { stride, duty, offs } may change with speed
  step(dt, speed, gait = null) {
    const root = this.root;
    root.updateMatrixWorld(true);
    this.sc = root.getWorldScale(_a).x;
    const p = root.getWorldPosition(_b);
    if (this.last) {
      _c.copy(p).sub(this.last).divideScalar(Math.max(dt, 1e-4));
      _c.y = 0;
      this.vel.lerp(_c, Math.min(1, dt * 8));
    }
    this.last = (this.last || V()).copy(p);
    if (this.legs[0].fresh)
      for (const L of this.legs) {
        this.homeW(L, L.plant);
        L.cur.copy(L.plant);
        L.fresh = false;
      }
    const duty = gait?.duty ?? this.duty,
      stride = (gait?.stride ?? this.stride) * this.sc;
    // feet out of place (after a turn or a stop) step home at rest; the phase stops only with every foot down
    let far = false;
    for (const L of this.legs)
      if (L.swing || this.homeW(L, _d).distanceTo(L.plant) > 0.09 * this.sc * (this.stride / 1.2)) far = true;
    const rate = speed > 0.05 * this.sc ? speed / stride : far ? this.settle : 0;
    this.moving += ((speed > 0.05 * this.sc ? 1 : 0) - this.moving) * Math.min(1, dt * 4);
    this.ph = (this.ph + rate * dt) % 1;
    this.rate = rate;
    this.dutyNow = duty;
    const cyc = rate > 0 ? 1 / rate : 1;
    for (const [i, L] of this.legs.entries()) {
      const off = (L.offNow = gait?.offs ? gait.offs[i] : L.off),
        u = (this.ph + off) % 1,
        swing = rate > 0 && u >= duty,
        pu = L.u ?? u;
      L.u = u;
      const lead = rate > this.settle * 1.01 || speed > 0.05 * this.sc; // (moving, not settling: feet land half a stance ahead)
      // a catch-up step: a planted foot the hip is about to outreach (a turn, or the walk's footfall pattern sliding into
      // the gallop's mid-stance) lifts and steps to where it should be now, as an animal does, instead of being dragged
      if (L.catchT > 0) {
        L.catchT = Math.min(1, L.catchT + dt / 0.2);
        const s = L.catchT,
          e = s * s * (3 - 2 * s);
        this.homeW(L, _d, lead ? duty * cyc * 0.5 * (1 - s) : 0);
        L.cur.lerpVectors(L.from, _d, e);
        L.cur.y += Math.sin(Math.PI * s) * L.lift * this.sc * 0.7;
        L.contact = 0;
        L.swing = true;
        if (s >= 1) {
          L.catchT = 0;
          L.plant.copy(_d);
          L.cur.copy(_d);
          L.from.copy(_d);
          L.swing = swing;
          L.contact = swing ? 0 : 1;
          L.liftT = 0.12;
        }
        continue;
      } // (in its swing window already: the regular swing carries on from here)
      if (
        !swing &&
        !L.swing &&
        rate > 0 &&
        L.upper.getWorldPosition(_h).distanceTo(L.plant) > 0.95 * (L.a + L.b) * L.upper.parent.getWorldScale(_a).x
      ) {
        L.catchT = 1e-3;
        L.from.copy(L.plant);
        L.swing = true;
        continue;
      }
      if (swing && !L.swing) {
        L.swing = true;
        L.from.copy(L.plant);
      }
      // touchdown, or a slow frame that jumped over a whole swing: the foot lands where its swing was aiming, less the
      // stance time already gone, so footfalls do not depend on the frame rate (a half-finished swing outreaches the leg)
      if ((!swing && L.swing) || (!swing && rate > 0 && u < pu - 0.5)) {
        L.swing = false;
        this.homeW(L, L.plant, lead ? Math.max(0, duty * cyc * 0.5 - u * cyc) : 0);
        this.reachable(L, L.plant);
        L.cur.copy(L.plant);
        L.liftT = 0.12;
      }
      if (L.swing) {
        const s = (u - duty) / (1 - duty),
          e = s * s * (3 - 2 * s),
          left = (1 - s) * (1 - duty) * cyc;
        this.homeW(L, _d, rate > this.settle * 1.01 || speed > 0.05 * this.sc ? left + duty * cyc * 0.5 : 0);
        this.reachable(L, _d); // (the swing aims where it will land: no jump on touchdown) // land ahead by half a stance, so the foot passes under the hip mid-stance
        L.cur.lerpVectors(L.from, _d, e);
        L.cur.y += Math.sin(Math.PI * s) * (L.lift * this.sc) * Math.min(1, 0.4 + speed / Math.max(0.3, stride));
        L.pitch = Math.sin(Math.PI * Math.min(1, s * 1.3)) * 0.7;
        L.contact = 0;
      } else {
        L.cur.copy(L.plant);
        L.pitch *= Math.exp(-dt * 12);
        L.liftT = Math.max(0, L.liftT - dt);
        L.contact = 1;
        if (rate > 0) {
          const r = u / duty;
          L.pitch = Math.max(0, r - 0.8) * 1.5;
        }
      } // the heel peels up at the end of a stance (toes down)
    }
  }
  // a foot's target can be overridden (an attack swipe, a death sprawl): set L.over = world Vector3 (or null)
  // a foothold the leg can reach: a fast short stride (the ice crawler's ten a second) put the landing half a stance ahead,
  // past the leg's reach, so the foot landed short and snapped 7 cm onto its foothold a frame later; pulled back toward the hip,
  // only when it truly is out of reach (99%: the bear's and lurker's ordinary landings, near 95%, keep their stride)
  reachable(L, P) {
    const H = L.upper.getWorldPosition(_h),
      R = 0.99 * (L.a + L.b) * L.upper.parent.getWorldScale(_a).x,
      dy = P.y - H.y,
      dx = P.x - H.x,
      dz = P.z - H.z;
    const h = Math.hypot(dx, dz),
      m = Math.sqrt(Math.max(0, R * R - dy * dy));
    if (h > m && h > 0) {
      const g0 = this.gy(P.x, P.z, P.y);
      P.x = H.x + (dx * m) / h;
      P.z = H.z + (dz * m) / h;
      P.y += this.gy(P.x, P.z, g0) - g0;
    }
    return P;
  }
  solve() {
    this.root.updateMatrixWorld(true);
    for (const L of this.legs) {
      const T = _t.copy(L.over || L.cur),
        H = L.upper.getWorldPosition(_h),
        ls = L.upper.parent.getWorldScale(_a).x,
        a = L.a * ls,
        b = L.b * ls; // (the leg's own world scale)
      const parentQ = L.upper.parent.getWorldQuaternion(_q0);
      _d.copy(T).sub(H);
      let d = _d.length();
      const dir = _d.normalize();
      d = Math.max(Math.abs(a - b) + 1e-3, Math.min(a + b - 1e-3, d));
      const pole = _p.copy(L.pole).applyQuaternion(this.root.getWorldQuaternion(_q3));
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const ca = (a * a + d * d - b * b) / (2 * a * d),
        sa = Math.sqrt(Math.max(0, 1 - ca * ca));
      const K = _k
          .copy(H)
          .addScaledVector(dir, a * ca)
          .addScaledVector(pole, a * sa),
        Tc = _c.copy(H).addScaledVector(dir, d);
      // the upper segment: from its rest direction (under the parent) to hip->knee
      _a.copy(L.lower.position).normalize().applyQuaternion(parentQ);
      _b.copy(K).sub(H).normalize();
      const Qu = _q1.setFromUnitVectors(_a, _b).multiply(parentQ);
      L.upper.quaternion.copy(parentQ).invert().multiply(Qu);
      _a.copy(L.end).normalize().applyQuaternion(Qu);
      _b.copy(Tc).sub(K).normalize();
      const Ql = _q2.setFromUnitVectors(_a, _b).multiply(Qu);
      L.lower.quaternion.copy(Qu).invert().multiply(Ql);
      if (L.foot) {
        const rq = this.root.getWorldQuaternion(_q3),
          yaw = Math.atan2(2 * (rq.w * rq.y + rq.x * rq.z), 1 - 2 * (rq.y * rq.y + rq.x * rq.x));
        _q0.setFromEuler(_e.set(L.over ? 0.4 : -L.pitch * (L.pitchK ?? 1), yaw, 0, 'YXZ'));
        L.foot.quaternion.copy(Ql).invert().multiply(_q0);
      }
    }
  }
  // the ground height under the front and back of the body (for pitching the spine on slopes)
  slope(frontZ, backZ) {
    const m = this.root.matrixWorld;
    _a.set(0, 0, frontZ).applyMatrix4(m);
    _b.set(0, 0, backZ).applyMatrix4(m);
    const y0 = this.root.position.y;
    return {
      front: this.gy(_a.x, _a.z, y0),
      back: this.gy(_b.x, _b.z, y0),
      mid: this.gy(this.root.position.x, this.root.position.z, this.root.position.y),
    };
  }
  // how far each foot is through its swing, 0 planted .. 1 top of the arc (for the body's bob and roll)
  swingOf(i) {
    const L = this.legs[i];
    if (!L.swing) return 0;
    const u = (this.ph + (L.offNow ?? L.off)) % 1;
    return Math.sin(Math.PI * Math.max(0, (u - this.dutyNow) / (1 - this.dutyNow)));
  }
}

// turn an Object3D (a neck or head joint) toward a world point, within limits, smoothed; k blends it in (0..1)
export function lookAt(obj, at, k, st, { yaw = 0.7, pitch = 0.35, rate = 6, dt = 0.016 } = {}) {
  const pq = obj.parent.getWorldQuaternion(_q0),
    p = obj.getWorldPosition(_a);
  _b.copy(at).sub(p).applyQuaternion(_q1.copy(pq).invert()); // the target in the parent's space (rest forward is -Z)
  const ty = Math.max(-yaw, Math.min(yaw, Math.atan2(-_b.x, -_b.z))) * k,
    tp = Math.max(-pitch, Math.min(pitch, Math.atan2(_b.y, Math.hypot(_b.x, _b.z)))) * k;
  st.y = (st.y || 0) + (ty - (st.y || 0)) * Math.min(1, dt * rate);
  st.p = (st.p || 0) + (tp - (st.p || 0)) * Math.min(1, dt * rate);
  obj.quaternion.premultiply(_q2.setFromEuler(_e.set(st.p, st.y, 0, 'YXZ')));
}
export const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
