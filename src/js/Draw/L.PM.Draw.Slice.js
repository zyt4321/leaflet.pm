import lineIntersect from 'turf/src/line-intersect';
import lineSegment from 'turf/src/line-segment';
import transformScale from 'turf/src/transform-scale'
import cleanCoords from 'turf/src/clean-coords'

import cut from '../../assets/cut/index';
import Draw from './L.PM.Draw';

Draw.Slice = Draw.Line.extend({
    initialize(map) {
        this._map = map
        this._shape = 'Slice'
        this.toolbarButtonName = 'slicePolygon'
    },
    _cut(layer) {
        const all = this._map._layers

        // 延长线
        const extendedLineGeoJSON = this.extendLine(layer.toGeoJSON(12))

        // L.polyline(L.GeoJSON.coordsToLatLngs(extendedLineGeoJSON.geometry.coordinates, 0),
        //     {color: 'red'}).addTo(this._map);

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
                    return lineIntersect(extendedLineGeoJSON, l.toGeoJSON(12)).features.length
                } catch (e) {
                    // console.error('You cant cut polygons with self-intersections')
                    // console.error(e)
                    return false
                }
            })


        // loop through all layers that intersect with the drawn (cutting) layer
        layers.forEach((l) => {
            // the resulting layers after the cut
            const resultingLayers = []
            // find layer difference
            try {
                const split = cut(l.toGeoJSON(12), extendedLineGeoJSON)

                // add new layer to map
                for(const geo of split.features){
                    const polygonLayer = L.polygon(
                        L.GeoJSON.coordsToLatLngs(geo.geometry.coordinates, 1),
                        this.options.pathOptions,
                    ).addTo(this._map);
                    resultingLayers.push(polygonLayer);
                }

                // fire pm:slice on the cutted layer
                l.fire('pm:slice', {
                    shape: this._shape,
                    layer: l,
                    resultingLayers,
                })

                // fire pm:slice on the map for each cutted layer
                this._map.fire('pm:slice', {
                    shape: this._shape,
                    cuttedLayer: l,
                    resultingLayers,
                })

                // add templayer prop so pm:remove isn't fired
                l._pmTempLayer = true
                layer._pmTempLayer = true

                // remove old layer and cutting layer
                l.remove()
                layer.remove()
            } catch (e) {
                this._map.fire('pm:slice-error', {
                    shape: this._shape,
                    cuttedLayer: l,
                    error: e,
                })
            }
        })
    },
    _finishShape() {
        // if self intersection is not allowed, do not finish the shape!
        if (!this.options.allowSelfIntersection && this._doesSelfIntersect) {
            return
        }

        // get coordinates, create the leaflet shape and add it to the map
        const coords = this._layer.getLatLngs()
        // if (event && event.type === 'dblclick') {
        //     // Leaflet creates an extra node with double click
        //     coords.splice(coords.length - 1, 1);
        // }
        const polylineLayer = L.polyline(coords, this.options.pathOptions)
        this._cut(polylineLayer)

        // disable drawing
        this.disable()
        // clean up snapping states
        this._cleanupSnapping()

        // remove the first vertex from "other snapping layers"
        this._otherSnapLayers.splice(this._tempSnapLayerIndex, 1)
        delete this._tempSnapLayerIndex

        if(this.options.forever){
            this.enable(this.options)
        }
    },
    extendLine(line) {
        line = cleanCoords(line)
        const segments = lineSegment(line)
        const line1 = segments.features[0]
        const line2 = segments.features[segments.features.length - 1]
        const line1_e = transformScale(line1, 1.03, { origin: 'center' });
        const line2_e = transformScale(line2, 1.03, { origin: 'center' });
        const coord1 = line1_e.geometry.coordinates[0]
        const coord2 = line2_e.geometry.coordinates[1]
        line.geometry.coordinates[0] = coord1
        line.geometry.coordinates[line.geometry.coordinates.length - 1] = coord2
        return line
    }
})
