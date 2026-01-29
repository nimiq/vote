import { createApp } from 'vue';
import App from './App.vue';
import { testnet } from './lib/const';

// On browser warning stop further execution.
if (window.hasBrowserWarning) {
    throw new Error('Execution aborted due to browser warning');
}

// Specify where the svg asset for the Nimiq identicons is located. The file gets copied to this location via
// the vite-plugin-static-copy as specified in vite.config.ts
window.NIMIQ_IQONS_SVG_PATH = `${import.meta.env.BASE_URL}img/iqons.min.svg`;

// Display testnet warning
const $testnetWarning = document.getElementById('testnet-warning')!;
if (testnet) {
    $testnetWarning.style.display = 'block';
    const $closeButton = $testnetWarning.querySelector('.close')!;
    $closeButton.addEventListener('click', () => $testnetWarning.remove());
} else {
    $testnetWarning.remove();
}

createApp(App).mount('#app');
