// Loads one of the original app's script libraries (served from /Assets) once, on first use.
const loaded = new Map();

export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      }),
    );
  }
  return loaded.get(src);
}
