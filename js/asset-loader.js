const PORTRAITS = Object.freeze({
  kitty: Object.freeze({ url: "../assets/portraits/kittykaki.webp", minWidth: 256, minHeight: 256 }),
  soder: Object.freeze({ url: "../assets/portraits/soder.png", width: 409, height: 424 }),
});

let promise = null;

export function preloadVisualAssets() {
  if (!promise) promise = loadVisualAssets();
  return promise;
}

async function loadVisualAssets() {
  const portraits = {};
  const missing = [];
  for (const [id, definition] of Object.entries(PORTRAITS)) {
    const image = await loadImage(definition);
    portraits[id] = image;
    if (!image) missing.push(`portrait:${id}`);
  }
  return Object.freeze({
    portraits: Object.freeze(portraits),
    missing: Object.freeze(missing),
  });
}

async function loadImage(definition) {
  if (typeof Image !== "function") return null;
  const image = new Image();
  image.decoding = "async";
  const url = new URL(definition.url, import.meta.url);
  try {
    await waitForImageLoad(image, url.href);
    try {
      await image.decode?.();
    } catch {
      // A loaded image remains usable without eager decode.
    }
    const exact = definition.width
      ? image.naturalWidth === definition.width && image.naturalHeight === definition.height
      : image.naturalWidth >= definition.minWidth && image.naturalHeight >= definition.minHeight;
    return exact ? image : null;
  } catch {
    return null;
  }
}

export function waitForImageLoad(image, url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.removeEventListener?.("load", onLoad);
      image.removeEventListener?.("error", onError);
      callback(value);
    };
    const onLoad = () => finish(resolve);
    const onError = () => finish(reject, new Error(`Image failed to load: ${url}`));
    const timeout = setTimeout(() => finish(reject, new Error(`Image load timed out: ${url}`)), timeoutMs);
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.src = url;
  });
}
