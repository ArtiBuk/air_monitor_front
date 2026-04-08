/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AIR_MAP_STYLE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "swiper/css";
