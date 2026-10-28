/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `'false'` switches the dashboard from contract fixtures to the live API. */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
