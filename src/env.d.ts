/// <reference types="astro/client" />

// Minimal hand-written binding types. `wrangler types` generates the full
// Cloudflare runtime declarations, but those also replace the global fetch and
// DOM types, which turns every `res.json()` into `unknown` and breaks the
// client-side scripts. Only the surfaces actually called are declared here.

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface R2Bucket {
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, value: ArrayBuffer | ReadableStream | string): Promise<unknown>;
  delete(key: string): Promise<void>;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: {
        DB: D1Database;
        IMAGES: R2Bucket;
        DISCOGS_CACHE: KVNamespace;
        [key: string]: unknown;
      };
    };
  }
}

declare module 'masonry-layout';
declare module 'imagesloaded';
