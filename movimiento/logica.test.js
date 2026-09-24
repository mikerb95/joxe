// Pruebas de la lógica pura del motion del home. Correr con: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

// logica.js es un script suelto que se cuelga de window, como en el navegador.
globalThis.window = globalThis;
await import("./logica.js");
const M = window.JoxeMovimiento;

const sinNaN = d => !/NaN|undefined|Infinity/.test(d);
const largos = d => [...d.matchAll(/l(-?[\d.]+) (-?[\d.]+)/g)].map(m => Math.hypot(+m[1], +m[2]));

test("el ángulo del cursor queda siempre entre 0 y 90 grados", () => {
  for (let x = -100; x <= 800; x += 37) {
    for (let y = -100; y <= 800; y += 41) {
      const g = M.anguloDesde(x, y);
      assert.ok(g >= 0 && g <= 90, `(${x}, ${y}) dio ${g}`);
    }
  }
});

test("la guía apunta a donde está el cursor", () => {
  for (const grados of [0, 20, 45, 70, 90]) {
    const g = M.guia(grados);
    assert.ok(Math.abs(M.anguloDesde(g.x2, g.y2) - grados) < 1.5, `guía de ${grados}°`);
    assert.ok(sinNaN(g.arco));
  }
});

test("a más elevación, la línea de peso sube hacia la coronilla", () => {
  const u = [0, 30, 60, 90].map(g => M.puntoPeso(g).u);
  for (let i = 1; i < u.length; i++) assert.ok(u[i] <= u[i - 1], u.join(" > "));
  assert.ok(u[0] - u[3] > 0.1);
});

test("debajo del degradado el pelo va al ras y en la frente nace fino", () => {
  for (const grados of [0, 45, 90]) {
    assert.ok(M.grosorPelo(1, grados) < 2);
    assert.ok(M.grosorPelo(M.CROQUIS.uDegradado + 0.05, grados) < 2);
    assert.ok(M.grosorPelo(0, grados) < 8);
    assert.ok(M.grosorPelo(0.3, grados) > 20);
  }
});

test("la silueta y los mechones son trazos válidos en todo el rango", () => {
  for (let g = 0; g <= 90; g += 15) {
    const s = M.siluetaPelo(g);
    assert.ok(sinNaN(s.borde) && sinNaN(s.forma) && s.forma.endsWith("Z"));
    assert.ok(sinNaN(M.mechones(g)));
  }
});

test("las hebras salen iguales con la misma semilla y más cortas bajo el degradado", () => {
  const a = M.hebras(), b = M.hebras();
  assert.deepEqual(a, b);
  assert.equal(a.length, 6);
  a.forEach(d => assert.ok(d.length > 0 && sinNaN(d)));
  assert.ok(Math.max(...largos(a[0])) < 4, "la banda más corta es casi un punto");
  assert.ok(Math.min(...largos(a[5])) > 7, "la banda más larga es pelo largo");
});

test("el odómetro separa dígitos de símbolos y rueda hasta la segunda vuelta", () => {
  const p = M.partesOdometro("$27.000");
  assert.deepEqual(p.map(x => x.v), ["$", 2, 7, ".", 0, 0, 0]);
  assert.deepEqual(p.map(x => x.tipo).join(""), "sddsddd");
  assert.equal(M.desplazamientoDigito(0), -50);
  assert.equal(M.desplazamientoDigito(9), -95);
  assert.equal(M.desplazamientoDigito(12), -95);
});

test("la fila activa es la que cruza la línea de lectura o la más cercana", () => {
  const filas = [{ top: 0, bottom: 100 }, { top: 100, bottom: 200 }, { top: 200, bottom: 300 }];
  assert.equal(M.filaActiva(filas, 150), 1);
  assert.equal(M.filaActiva(filas, -50), 0);
  assert.equal(M.filaActiva(filas, 900), 2);
  assert.equal(M.filaActiva([], 10), -1);
});

test("el día se cuenta en hora de Colombia", () => {
  // Martes 22 de septiembre de 2026 a las 03:00 UTC todavía es lunes en Bogotá.
  assert.equal(M.diaBogota(new Date("2026-09-22T03:00:00Z")), "lun");
  assert.equal(M.diaBogota(new Date("2026-09-22T15:00:00Z")), "mar");
  assert.equal(M.diaBogota(new Date("2026-09-27T12:00:00Z")), "dom");
});
