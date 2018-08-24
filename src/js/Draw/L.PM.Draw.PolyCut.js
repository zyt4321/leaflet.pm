import difference from 'turf/src/difference';
import Draw from './L.PM.Draw';

Draw.PolyCut = Draw.Poly.extend({
    initialize(map) {
        this._map = map;
        this._shape = 'PolyCut';
        this.toolbarButtonName = 'drawPolyCut';
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
            .filter(l => l !== layer);

        layer = layer.toGeoJSON(15)
        for(let l of layers) {
            try {
                // 用l切layer，获得layer的剩余部分
                const diff = difference(layer, l.toGeoJSON(15));
                layer = diff
                if(layer === null){
                    break
                }
                // const newL = L.geoJSON(diff, layer.options)
            } catch (e) {
                // console.error('You cant cut polygons with self-intersections');
                console.error(e);
                return false;
            }
        }
        if(!layer) {
            return false;
        }

        // console.log(resLayer)
        const featureCollection = { features:[], type: 'FeatureCollection' };

        const geom1 = layer.geometry;
        const props1 = layer.properties;
        if(geom1.type === 'MultiPolygon') {
            for (let i = 0; i < geom1.coordinates.length; i++) {
                const feature = {
                    geometry:{
                        type: 'Polygon',
                        coordinates: geom1.coordinates[i],
                    },
                    properties: props1,
                    type: 'Feature',
                };
                featureCollection.features.push(feature);
            }
        }else if(geom1.type === 'Polygon') {
            featureCollection.features.push(layer);
        }
        for(const geo of featureCollection.features) {
            const polygonLayer = L.polygon(
                L.GeoJSON.coordsToLatLngs(geo.geometry.coordinates, 1),
                this.options.pathOptions,
            ).addTo(this._map);
            // fire the pm:create event and pass shape and layer
            this._map.fire('pm:create', {
                shape: this._shape,
                layer: polygonLayer,
            });
        }
        return true;
    },
    _finishShape(event) {
        // if self intersection is not allowed, do not finish the shape!
        if (!this.options.allowSelfIntersection && this._doesSelfIntersect) {
            return;
        }

        // get coordinates, create the leaflet shape and add it to the map
        const coords = this._layer.getLatLngs();
        if (event && event.type === 'dblclick') {
            // Leaflet creates an extra node with double click
            coords.splice(coords.length - 1, 1);
        }
        // 双击第一个点结束绘制时，会生成一个顶点数为0的空多边形，要删除
        if(coords.length <= 1) {
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
            return;
        }
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
