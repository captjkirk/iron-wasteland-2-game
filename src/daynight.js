// Day and night (slice 13), IW1's cycle in 3D: a 10-minute day (IW1's was 2.5 minutes of a top-down map) whose sun
// rises in the east, crosses the south and sets in the west; dusk, about three minutes of night under the moon, dawn.
// Nights are harder (IW1 multiplies its animals' reach and speed by 1.35 at night): see nightK's users in game.js.
// The host's game owns the clock and sends it in its world message (co-op); everyone asleep in a bed at night (IW1)
// runs it 12 times as fast to the morning.
export const DAY_S = 600,
  SUNSET = 0.62; // the sun is up from t = 0 to SUNSET, a fraction of the day
export const day = { t: 0.1, n: 1, speed: 1, g: 0 }; // t: how far through the day; n: which day; speed: 12 while everyone sleeps at night; g: which game (each new game counts one up)
const smooth = (a, b, x) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
// the sun's and the moon's height above the horizon (degrees) and bearing (radians from north, clockwise)
export const sunElev = (t = day.t) =>
  t < SUNSET ? 62 * Math.sin((Math.PI * t) / SUNSET) : -40 * Math.sin((Math.PI * (t - SUNSET)) / (1 - SUNSET));
export const sunAz = (t = day.t) =>
  ((100 + 160 * (t < SUNSET ? t / SUNSET : 1 + (t - SUNSET) / (1 - SUNSET))) * Math.PI) / 180;
export const moonElev = (t = day.t) => (t < SUNSET ? -10 : 48 * Math.sin((Math.PI * (t - SUNSET)) / (1 - SUNSET)));
export const moonAz = (t = day.t) => ((110 + 150 * (t < SUNSET ? 0 : (t - SUNSET) / (1 - SUNSET))) * Math.PI) / 180;
// 0 by day, 1 at full night (from the sun 6 degrees up to 8 degrees down)
export const nightK = (t = day.t) => 1 - smooth(-8, 6, sunElev(t));
export const isNight = () => nightK() > 0.5;
export function phase(t = day.t) {
  const e = sunElev(t);
  return nightK(t) > 0.5 ? 'Night' : e > 12 ? 'Day' : t < 0.3 ? 'Dawn' : 'Dusk';
}
// a new game is said outright (the host's resetDay; a joined game hears the host's game count change), never guessed from the
// clock going back: near midnight a joined game's day count can be a day off for a moment (slice 26: it restarted the stumps)
const newGame = [];
export const onNewGame = (f) => newGame.push(f);
export function resetDay() {
  Object.assign(day, { t: 0.1, n: 1, speed: 1, g: day.g + 1 });
  for (const f of newGame) f();
}
// one frame of the clock; returns 'night' or 'day' on the frame either begins (for the hint and the log)
export function tickDay(dt, asleep, follow = false) {
  const was = isNight();
  if (!follow) day.speed = asleep && (was || day.t > SUNSET) ? 12 : 1; // (follow: a joined game keeps the host's speed)
  day.t += (dt * day.speed) / DAY_S;
  if (day.t >= 1) {
    day.t -= 1;
    day.n++;
  }
  const now = isNight();
  return now === was ? null : now ? 'night' : 'day';
}
// co-op: a joined game takes the host's clock (small differences are eased out, a jump is taken at once)
export function setDay(t, n, speed, g) {
  let d = t - day.t;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  const jump = Math.abs(d) > 0.01;
  day.t = jump ? t : (day.t + d * 0.2 + 1) % 1;
  day.speed = speed;
  day.n = jump ? n : day.t - t > 0.5 ? n - 1 : t - day.t > 0.5 ? n + 1 : n; // (eased across midnight from the host's time: the day count goes with the eased time)
  if (g !== undefined && g !== day.g) {
    day.g = g;
    for (const f of newGame) f();
  }
}
