declare module "../lib/lame.esm.js" {
  export var Mp3Encoder: {
    new (channels: number, sampleRate: number, kbps: number): {
      encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
      flush(): Int8Array;
    };
  };
}
