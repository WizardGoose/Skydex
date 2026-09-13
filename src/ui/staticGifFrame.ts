const staticFrames = new Map<string, Promise<string>>();

export const isGifImageUrl = (src: string): boolean => {
  try {
    return new URL(src, globalThis.location?.href).pathname.toLowerCase().endsWith(".gif");
  } catch {
    return /\.gif(?:$|[?#])/i.test(src);
  }
};

export const firstGifFrame = (src: string): Promise<string> => {
  const cached = staticFrames.get(src);
  if (cached) return cached;

  const pending = (async () => {
    const response = await fetch(src, {
      cache: "force-cache",
      credentials: "omit",
      mode: "cors",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error(`GIF request failed with ${response.status}`);

    const [{ parseGIF, decompressFrame }, buffer] = await Promise.all([
      import("gifuct-js"),
      response.arrayBuffer(),
    ]);
    const gif = parseGIF(buffer);
    const frame = gif.frames.find((candidate) => "image" in candidate);
    if (!frame || !("image" in frame)) throw new Error("GIF has no image frame");

    const decoded = decompressFrame(frame, gif.gct, true);
    const canvas = document.createElement("canvas");
    canvas.width = gif.lsd.width;
    canvas.height = gif.lsd.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable");

    const image = context.createImageData(decoded.dims.width, decoded.dims.height);
    image.data.set(decoded.patch);
    context.putImageData(image, decoded.dims.left, decoded.dims.top);
    return canvas.toDataURL("image/png");
  })();

  staticFrames.set(src, pending);
  pending.catch(() => staticFrames.delete(src));
  return pending;
};
