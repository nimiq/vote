/// <reference types="vite/client" />

declare module '@nimiq/vue3-components/css'

declare module 'distinct-colors' {
    type ColorOptions = {
        count?: number,
        hueMin?: number,
        hueMax?: number,
        chromaMin?: number,
        chromaMax?: number,
        lightMin?: number,
        lightMax?: number,
        quality?: number,
        samples?: number,
    };

    type Color = {
        hex: () => string,
        rgb: () => [number, number, number],
        hsl: () => [number, number, number],
    };

    export default function distinctColors(options?: ColorOptions): Color[];
}

// eslint-disable-next-line ts/consistent-type-definitions
interface Window {
    hasBrowserWarning?: boolean,
    NIMIQ_IQONS_SVG_PATH: string,
}
