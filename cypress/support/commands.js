// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This is will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })

Cypress.Commands.add('hasLayers', (map, count) => {
    const layerCount = Object.keys(map._layers).length;

    cy.wrap(layerCount).should('eq', count);
});

Cypress.Commands.add('hasMiddleMarkers', (count) => {
    cy.get('.marker-icon-middle').should(($p) => {
        expect($p).to.have.length(count);
    });
});

Cypress.Commands.add('hasVertexMarkers', (count) => {
    cy.get('.marker-icon:not(.marker-icon-middle)').should(($p) => {
        expect($p).to.have.length(count);
    });
});

Cypress.Commands.add('toolbarButton', name => cy.get(`.leaflet-pm-icon-${name}`));

Cypress.Commands.add('drawShape', (shape) => {
    cy.window().then(({ map, L }) => {
        if (shape === 'MultiPolygon') {
            cy.fixture(shape)
                .as('poly')
                .then((json) => {
                    const layer = L.geoJson(json).addTo(map);
                    const bounds = layer.getBounds();
                    map.fitBounds(bounds);
                });
        }
    });
});
