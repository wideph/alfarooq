/** Polyfills for older mobile browsers used by pdf.js 5.x */
export function installPdfPolyfills() {
  if (typeof Promise.withResolvers === "undefined") {
    Promise.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  const proto = Uint8Array.prototype as Uint8Array & { toHex?: () => string };
  if (!proto.toHex) {
    Object.defineProperty(proto, "toHex", {
      value: function toHex(this: Uint8Array) {
        return Array.from(this, (byte) => byte.toString(16).padStart(2, "0")).join("");
      },
      writable: true,
      configurable: true,
    });
  }
}
