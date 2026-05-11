/**
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2024 - 2026 Waldiez & contributors
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  VS_PATH?: string;
  USE_DEV_SERVER?: string;
  DEV_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare const __WALDIEZ_VERSION__: string;
declare const __HUB_API_URL__: string;
