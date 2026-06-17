/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUI_NETWORK?: string;
    readonly VITE_SUI_RPC_URL?: string;
    readonly VITE_HASHI_OBJECT_ID?: string;
    readonly VITE_HASHI_PACKAGE_ID?: string;
    readonly VITE_BITCOIN_NETWORK?: string;
    readonly VITE_BTC_RPC_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
