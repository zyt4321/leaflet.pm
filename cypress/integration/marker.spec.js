describe('Draw Marker', () => {
    const mapSelector = '#map';

    it('removes markers without error', () => {
        cy.window().then(({ map, L }) => {
            const markerLayer = L.geoJson().addTo(map);

            console.log(markerLayer);

            map.pm.enableDraw('Marker', {
                snappable: false,
            });

            cy.get(mapSelector)
                .click(150, 250)
                .then(() => {
                    let l;
                    let m;
                    map.eachLayer((layer) => {
                        if (layer._leaflet_id === markerLayer._leaflet_id) {
                            l = layer;
                        } else if (layer instanceof L.Marker) {
                            m = layer;
                        }
                    });

                    l.addLayer(m);
                    map.pm.disableDraw();
                    l.removeLayer(m);

                    return m;
                })
                .as('markerLayer');
        });

        cy.get('@markerLayer').then((markerLayer) => {
            markerLayer.pm.disable();
        });
    });

    it('places markers', () => {
        cy.toolbarButton('marker').click();

        cy.get(mapSelector)
            .click(90, 250)
            .click(150, 50)
            .click(500, 50)
            .click(500, 300);

        cy.get('.leaflet-marker-icon').should(($p) => {
            expect($p).to.have.length(5);
        });

        cy.toolbarButton('marker').click();

        cy.get('.leaflet-marker-icon').should(($p) => {
            expect($p).to.have.length(4);
        });
    });
});
