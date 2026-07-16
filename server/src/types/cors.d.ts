declare module 'cors' {
  import type { RequestHandler } from 'express';

  function cors(options?: unknown): RequestHandler;
  export default cors;
}
