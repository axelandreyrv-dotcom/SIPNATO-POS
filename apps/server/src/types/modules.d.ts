declare module '*.sql' {
  const sql: string;
  export default sql;
}
declare module '*.wasm' {
  const mod: WebAssembly.Module;
  export default mod;
}
declare module 'argon2id/lib/setup.js' {
  const setup: (simd: unknown, noSimd: unknown) => Promise<unknown>;
  export default setup;
}
