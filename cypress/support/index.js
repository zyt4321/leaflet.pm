// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';

// Alternatively you can use CommonJS syntax:
// require('./commands')

const accessToken = 'pk.eyJ1IjoibWFwc29mc3VtaXQiLCJhIjoiY2l1ZDF3dHE5MDAxZDMwbjA0cTR3dG50eSJ9.63Xci-GKFikhAobboF0DVQ';

beforeEach(() => {
    // create the map
    cy.visit('/index.html', {
        onLoad: (contentWindow) => {
            const { L } = contentWindow;

            // mapbox tiles
            const mapboxTiles = L.tileLayer(
                `https://api.mapbox.com/styles/v1/mapbox/streets-v9/tiles/{z}/{x}/{y}?access_token=${accessToken}`,
                {
                    attribution:
                        '&copy; <a href="https://www.mapbox.com/feedback/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                },
            );

            // create the map
            contentWindow.map = L.map('map')
                .setView([51.505, -0.09], 13)
                .addLayer(mapboxTiles);

            // add leaflet.pm toolbar
            contentWindow.map.pm.addControls();
        },
    });
});
