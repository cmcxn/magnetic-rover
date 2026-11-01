/** Full-buffer UTF-8 subset needed by Three's texture-free GLB parser.
 * Native TextDecoder always wins; this is not a general encoding/streaming shim.
 */
export class MiniTextDecoder {
  constructor(label = "utf-8", options = {}) {
    if (
      !["utf-8", "utf8", "unicode-1-1-utf-8"].includes(
        String(label).trim().toLowerCase(),
      )
    )
      throw new RangeError("Only UTF-8 is supported");
    this.encoding = "utf-8";
    this.fatal = !!options.fatal;
    this.ignoreBOM = !!options.ignoreBOM;
  }
  decode(input = new Uint8Array(0), options = {}) {
    if (options.stream) throw new TypeError("Streaming UTF-8 is not supported");
    const bytes = ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);
    const result = [];
    const invalid = () => {
      if (this.fatal) throw new TypeError("Invalid UTF-8");
      result.push("\ufffd");
    };
    for (let i = 0; i < bytes.length;) {
      const first = bytes[i++];
      if (first < 0x80) {
        result.push(String.fromCharCode(first));
        continue;
      }
      let count, code;
      if (first >= 0xc2 && first <= 0xdf) {
        count = 1;
        code = first & 31;
      } else if (first >= 0xe0 && first <= 0xef) {
        count = 2;
        code = first & 15;
      } else if (first >= 0xf0 && first <= 0xf4) {
        count = 3;
        code = first & 7;
      } else {
        invalid();
        continue;
      }
      let valid = true;
      for (let j = 0; j < count; j++) {
        const next = bytes[i];
        let min = 0x80,
          max = 0xbf;
        if (j === 0) {
          if (first === 0xe0) min = 0xa0;
          if (first === 0xed) max = 0x9f;
          if (first === 0xf0) min = 0x90;
          if (first === 0xf4) max = 0x8f;
        }
        if (next === undefined || next < min || next > max) {
          valid = false;
          break;
        }
        code = (code << 6) | (next & 63);
        i++;
      }
      if (!valid) {
        invalid();
        continue;
      }
      result.push(String.fromCodePoint(code));
    }
    let value = result.join("");
    if (!this.ignoreBOM && value.charCodeAt(0) === 0xfeff)
      value = value.slice(1);
    return value;
  }
}
export function installMiniTextDecoder(...hosts) {
  const native = hosts.find(
    (host) => typeof host?.TextDecoder === "function",
  )?.TextDecoder;
  for (const host of hosts)
    if (host && typeof host.TextDecoder !== "function")
      host.TextDecoder = native ?? MiniTextDecoder;
}
