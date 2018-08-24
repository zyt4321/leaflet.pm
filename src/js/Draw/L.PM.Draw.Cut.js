import intersect from 'turf/src/intersect';
import difference from 'turf/src/difference';
import Draw from './L.PM.Draw';

Draw.Cut = Draw.Poly.extend({
    initialize(map) {
        this._map = map;
        this._shape = 'Cut';
        this.toolbarButtonName = 'cutPolygon';
    },
    _cut(layer) {
        const all = this._map._layers;

        // find all layers that intersect with `layer`, the just drawn cutting layer
        const layers = Object.keys(all)
            // convert object to array
            .map(l => all[l])
            // only layers handled by leaflet.pm
            .filter(l => l.pm)
            // only polygons
            .filter(l => l instanceof L.Polygon)
            // exclude the drawn one
            .filter(l => l !== layer)
            // only layers with intersections
            .filter((l) => {
                try {
                    return !!intersect(layer.toGeoJSON(12), l.toGeoJSON(12));
                } catch (e) {
                    // console.error('You cant cut polygons with self-intersections');
                    // console.error(e);
                    return false;
                }
            });


        // loop through all layers that intersect with the drawn (cutting) layer
        layers.forEach((l) => {
            try {
                // 用layer切l，获得l的剩余部分
                const diff = difference(l.toGeoJSON(12), layer.toGeoJSON(12));
                // 求layer与l的公共部分
                const intersection = intersect(l.toGeoJSON(12), layer.toGeoJSON(12));
                // 若得到的是multipolygon，则转换为单独的polygon
                const featureCollection = { features: [], type: 'FeatureCollection' };
                const geom1 = diff.geometry;
                const props1 = diff.properties;
                if(geom1.type === 'MultiPolygon') {
                    for (let i = 0; i < geom1.coordinates.length; i++) {
                        const feature = {
                            geometry: {
                                type: 'Polygon',
                                coordinates: geom1.coordinates[i],
                            },
                            properties: props1,
                            type: 'Feature',
                            _temp: 'diff',
                        };
                        featureCollection.features.push(feature);
                    }
                }else if(geom1.type === 'Polygon') {
                    geom1._temp = 'diff';
                    featureCollection.features.push(diff);
                }

                const geom2 = intersection.geometry;
                const props2 = intersection.properties;
                if(geom2.type === 'MultiPolygon') {
                    for (let i = 0; i < geom2.coordinates.length; i++) {
                        const feature = {
                            geometry: {
                                type: 'Polygon',
                                coordinates: geom2.coordinates[i],
                            },
                            properties: props2,
                            type: 'Feature',
                            _temp: 'intersect',
                        };
                        featureCollection.features.push(feature);
                    }
                }else if(geom2.type === 'Polygon') {
                    geom2._temp = 'intersect';
                    featureCollection.features.push(intersection);
                }
                // the resulting layers after the cut
                const resultingLayersDiff = [];
                const resultingLayersIntersect = [];
                // add new layer to map
                for(const geo of featureCollection.features) {
                    const polygonLayer = L.polygon(
                        L.GeoJSON.coordsToLatLngs(geo.geometry.coordinates, 1),
                        this.options.pathOptions,
                    ).addTo(this._map);
                    if (geo._temp === 'diff') {
                        resultingLayersDiff.push(polygonLayer);
                    }else if(geo._temp === 'intersect') {
                        resultingLayersIntersect.push(polygonLayer);
                    }
                }
                // fire pm:cut on the cutted layer
                l.fire('pm:cut', {
                    shape: this._shape,
                    cuttedLayer: l,
                    resultingLayersDiff,
                    resultingLayersIntersect,
                });

                // fire pm:cut on the map for each cutted layer
                this._map.fire('pm:cut', {
                    shape: this._shape,
                    cuttedLayer: l,
                    resultingLayersDiff,
                    resultingLayersIntersect,
                });
                // add templayer prop so pm:remove isn't fired
                l._pmTempLayer = true;
                layer._pmTempLayer = true;

                // remove old layer and cutting layer
                l.remove();
                layer.remove();
            } catch (e) {
                // console.error('You cant cut polygons with self-intersections');
                // console.log(e)
            }
        });
    },
    _finishShape() {
        const coords = this._layer.getLatLngs();
        const polygonLayer = L.polygon(coords, this.options.pathOptions);
        this._cut(polygonLayer);

        // disable drawing
        this.disable();

        // clean up snapping states
        this._cleanupSnapping();

        // remove the first vertex from "other snapping layers"
        this._otherSnapLayers.splice(this._tempSnapLayerIndex, 1);
        delete this._tempSnapLayerIndex;

        if(this.options.forever){
            this.enable(this.options)
        }
    },
});
