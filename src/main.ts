import Vue from 'vue';
import App from './App.vue';
import { testnet } from './lib/const';

// On browser warning stop further execution.
if (window.hasBrowserWarning) {
    throw new Error('Execution aborted due to browser warning');
}

// Specify where the svg asset for the Nimiq identicons is located. The file gets copied to this location via
// the copy-webpack-plugin as specified in vue.config.js
window.NIMIQ_IQONS_SVG_PATH = `${process.env.BASE_URL}img/iqons.min.svg`;

Vue.config.productionTip = false;

// Display testnet warning
const $testnetWarning = document.getElementById('testnet-warning')!;
if (testnet) {
    $testnetWarning.style.display = 'block';
    const $closeButton = $testnetWarning.querySelector('.close')!;
    $closeButton.addEventListener('click', () => $testnetWarning.remove());
} else {
    $testnetWarning.remove();
}

new Vue({
    render: (h) => h(App),
}).$mount('#app');
