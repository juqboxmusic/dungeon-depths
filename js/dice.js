// ============================================================
//  DICE — rolls + animated overlay
// ============================================================

export function roll(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

const overlay = () => document.getElementById('dice-overlay');
const shape = () => document.getElementById('dice-shape');
const valueEl = () => document.getElementById('dice-value');
const captionEl = () => document.getElementById('dice-caption');

/**
 * Show the dice overlay, animate a roll, resolve with the result.
 * sides: 6 or 20. caption: e.g. "Aria attacks!"
 */
export function animateRoll(sides, caption, fixedResult = null) {
  return new Promise((resolve) => {
    const result = fixedResult ?? roll(sides);
    const ov = overlay();
    const sh = shape();
    sh.className = `dice-shape ${sides === 20 ? 'd20' : 'd6'} rolling`;
    captionEl().textContent = caption || '';
    ov.hidden = false;

    let ticks = 0;
    const spin = setInterval(() => {
      valueEl().textContent = roll(sides);
      ticks++;
      if (ticks >= 11) {
        clearInterval(spin);
        valueEl().textContent = result;
        sh.classList.remove('rolling');
        if (sides === 20 && result === 20) sh.classList.add('crit');
        else if (sides === 20 && result === 1) sh.classList.add('fumble');
        setTimeout(() => {
          ov.hidden = true;
          sh.classList.remove('crit', 'fumble');
          resolve(result);
        }, 950);
      }
    }, 75);
  });
}
