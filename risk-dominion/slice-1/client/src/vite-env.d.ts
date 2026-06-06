/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** SpacetimeDB websocket URI, e.g. ws://localhost:3000. Written by setup.sh. */
  readonly VITE_SPACETIMEDB_URI?: string;
  /** Published SpacetimeDB module name. */
  readonly VITE_MODULE_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
