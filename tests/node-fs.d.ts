// 测试里读本机 ROM 用到的两个 Node 函数（项目没装 @types/node）。
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string): Uint8Array;
}
